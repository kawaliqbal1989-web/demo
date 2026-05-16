import { constants as fsConstants, promises as fs } from "node:fs";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import {
  prepareQueuedExportJob,
  recordReportExportAuditEvent,
  recoverStalledReportExportJobs,
  serializeExportJob,
  sha256
} from "./report-export-job.service.js";
import { runReportExportCleanupPass, runReportExportWorkerPass } from "./report-export-runner.service.js";

const CERTIFICATION_SCENARIO_CONFIG = Object.freeze({
  "large-dataset": {
    label: "Large Dataset Certification",
    workload: [
      { reportKey: "governance-audit", format: "XLSX", count: 3, priority: 20 },
      { reportKey: "workflow-lifecycle", format: "XLSX", count: 2, priority: 24 },
      { reportKey: "governance-audit", format: "PDF", count: 1, priority: 28 }
    ]
  },
  "queue-saturation": {
    label: "Queue Saturation Validation",
    workload: [
      { reportKey: "governance-audit", format: "XLSX", count: 8, priority: 18 },
      { reportKey: "workflow-lifecycle", format: "XLSX", count: 8, priority: 22 }
    ]
  },
  "retry-storm": {
    label: "Retry Storm Validation",
    workload: [
      { reportKey: "governance-audit", format: "XLSX", count: 3, priority: 16, certification: { failAfterArtifactWriteOnce: true } },
      { reportKey: "workflow-lifecycle", format: "PDF", count: 2, priority: 20, certification: { failAfterArtifactWriteOnce: true } }
    ]
  },
  "long-duration": {
    label: "Long Duration Reliability",
    workload: [
      { reportKey: "governance-audit", format: "XLSX", count: 2, priority: 18, certification: { perBatchDelayMs: 4 } },
      { reportKey: "workflow-lifecycle", format: "XLSX", count: 2, priority: 22, certification: { perBatchDelayMs: 6, failAfterArtifactWriteOnce: true } }
    ]
  },
  "recovery-certification": {
    label: "Recovery Certification",
    workload: [
      { reportKey: "governance-audit", format: "XLSX", count: 2, priority: 20, certification: { failAfterArtifactWriteOnce: true } },
      { reportKey: "workflow-lifecycle", format: "XLSX", count: 2, priority: 24 }
    ]
  }
});

function clampPositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function average(values = []) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) {
    return 0;
  }
  return Math.round(valid.reduce((total, value) => total + value, 0) / valid.length);
}

function toMilliseconds(start, end) {
  const startAt = start ? new Date(start) : null;
  const endAt = end ? new Date(end) : null;
  if (!startAt || !endAt || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return null;
  }
  return Math.max(0, endAt.getTime() - startAt.getTime());
}

function buildCertificationRunId(scenarioKey) {
  return `cert:${scenarioKey}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeCounts(items = [], field) {
  return items.reduce((accumulator, item) => {
    const key = item?.[field] || "UNKNOWN";
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
}

function buildTimeSeries({ jobs = [], windowHours = 24, now = new Date(), valueFactory = () => 1 }) {
  const normalizedWindowHours = clampPositiveInteger(windowHours, 24, 24 * 30);
  const startAt = new Date(now.getTime() - normalizedWindowHours * 60 * 60 * 1000);
  const buckets = Array.from({ length: normalizedWindowHours }, (_, index) => {
    const bucketStart = new Date(startAt.getTime() + index * 60 * 60 * 1000);
    return {
      label: bucketStart.toISOString().slice(11, 16),
      startAt: bucketStart.toISOString(),
      value: 0
    };
  });

  for (const job of jobs) {
    const date = job?.completedAt || job?.updatedAt || job?.createdAt || null;
    if (!date) {
      continue;
    }

    const jobTime = new Date(date);
    if (Number.isNaN(jobTime.getTime()) || jobTime < startAt || jobTime > now) {
      continue;
    }

    const bucketIndex = Math.min(
      buckets.length - 1,
      Math.max(0, Math.floor((jobTime.getTime() - startAt.getTime()) / (60 * 60 * 1000)))
    );
    buckets[bucketIndex].value += valueFactory(job);
  }

  return buckets;
}

function buildDurationDistribution(jobs = []) {
  const distribution = {
    underMinute: 0,
    oneToFiveMinutes: 0,
    fiveToFifteenMinutes: 0,
    overFifteenMinutes: 0
  };

  for (const job of jobs) {
    const durationMs = toMilliseconds(job.queuedAt, job.completedAt || job.failedAt || job.updatedAt);
    if (!Number.isFinite(durationMs)) {
      continue;
    }

    if (durationMs < 60 * 1000) {
      distribution.underMinute += 1;
    } else if (durationMs < 5 * 60 * 1000) {
      distribution.oneToFiveMinutes += 1;
    } else if (durationMs < 15 * 60 * 1000) {
      distribution.fiveToFifteenMinutes += 1;
    } else {
      distribution.overFifteenMinutes += 1;
    }
  }

  return distribution;
}

function buildRetryHeatmap(jobs = []) {
  return jobs.reduce((accumulator, job) => {
    const reportKey = job?.reportKey || "unknown";
    accumulator[reportKey] = accumulator[reportKey] || { total: 0, retried: 0, failed: 0 };
    accumulator[reportKey].total += 1;
    if ((job?.retryCount || 0) > 0) {
      accumulator[reportKey].retried += 1;
    }
    if (job?.status === "FAILED") {
      accumulator[reportKey].failed += 1;
    }
    return accumulator;
  }, {});
}

function evaluateCertificationRun(run, jobs = []) {
  const completedJobs = jobs.filter((job) => job.status === "COMPLETED");
  const failedJobs = jobs.filter((job) => job.status === "FAILED");
  const activeJobs = jobs.filter((job) => ["QUEUED", "PROCESSING", "RETRY_WAIT"].includes(job.status));
  const streamedArtifacts = completedJobs.filter((job) => job.artifact?.metadata?.artifactTelemetry?.streamMode === "xlsx_stream_writer");
  const certificationRetries = jobs.filter((job) => (job.retryCount || 0) > 0);
  const digestsBySignature = new Map();

  for (const job of completedJobs) {
    const signature = `${job.reportKey}:${job.exportFormat}`;
    const current = digestsBySignature.get(signature) || new Set();
    if (job.integrityDigest) {
      current.add(job.integrityDigest);
    }
    digestsBySignature.set(signature, current);
  }

  const reproducible = Array.from(digestsBySignature.values()).every((digests) => digests.size <= 1);
  const memorySafe = streamedArtifacts.every(
    (job) => Number(job.artifact?.metadata?.artifactTelemetry?.peakBatchRows || 0) <= 500
  );
  const recoverySafe = run.scenarioKey !== "retry-storm" && run.scenarioKey !== "recovery-certification"
    ? true
    : certificationRetries.length > 0 && failedJobs.length === 0;
  const passed = activeJobs.length === 0 && failedJobs.length === 0 && reproducible && memorySafe && recoverySafe;

  return {
    passed,
    checks: {
      drainedQueue: activeJobs.length === 0,
      noTerminalFailures: failedJobs.length === 0,
      reproducible,
      memorySafe,
      recoverySafe
    }
  };
}

function resolveCertificationScenarioWorkload({
  scenarioKey,
  viewer,
  resolveReportContext,
  resolveExecutionContext,
  overrides = {}
} = {}) {
  const scenario = CERTIFICATION_SCENARIO_CONFIG[scenarioKey];
  if (!scenario) {
    throw new Error(`Unsupported certification scenario: ${scenarioKey}`);
  }

  return scenario.workload.map((entry, index) => {
    const filters = entry.filters || overrides.filters || {};
    return {
      index,
      count: entry.count,
      tenantId: viewer?.tenantId,
      auth: viewer,
      reportKey: entry.reportKey,
      format: entry.format,
      queueName: overrides.queueName || "certification",
      priority: entry.priority,
      filters,
      reportContext: resolveReportContext(entry.reportKey, filters),
      executionContext: resolveExecutionContext(entry.reportKey, filters),
      certification: {
        scenarioKey,
        scenarioLabel: scenario.label,
        ...(entry.certification || {})
      }
    };
  });
}

async function queueReportExportCertificationScenario({
  viewer,
  scenarioKey,
  workload,
  executeNow = false,
  workerPassLimit = null
} = {}) {
  const runId = buildCertificationRunId(scenarioKey);
  const queuedJobs = [];

  for (const workloadItem of workload) {
    const normalizedCount = clampPositiveInteger(workloadItem.count, 1, env.reportExportSimulationMaxJobs);

    for (let index = 0; index < normalizedCount; index += 1) {
      const requestFingerprint = sha256({
        runId,
        scenarioKey,
        workloadIndex: workloadItem.index,
        queueIndex: index,
        tenantId: workloadItem.tenantId,
        reportKey: workloadItem.reportKey,
        format: workloadItem.format,
        filters: workloadItem.filters,
        role: workloadItem.auth?.role || null,
        userId: workloadItem.auth?.userId || null
      });

      const prepared = await prepareQueuedExportJob({
        tenantId: workloadItem.tenantId,
        reportKey: workloadItem.reportKey,
        format: workloadItem.format,
        requestFingerprint,
        lockKey: `export:certification:${runId}:${workloadItem.index}:${index}`,
        auth: workloadItem.auth,
        executionContext: workloadItem.executionContext,
        filters: workloadItem.filters,
        reportFactory: () => Promise.resolve(workloadItem.reportContext),
        triggerSource: "USER",
        queueName: workloadItem.queueName || "certification",
        priority: workloadItem.priority || 20,
        maxAttempts: workloadItem.certification?.maxAttempts || 3,
        retryBackoffMs: workloadItem.certification?.retryBackoffMs || 50,
        workerMetadataOverrides: {
          certification: {
            runId,
            scenarioKey,
            scenarioLabel: workloadItem.certification?.scenarioLabel || scenarioKey,
            workloadIndex: workloadItem.index,
            queueIndex: index,
            perBatchDelayMs: workloadItem.certification?.perBatchDelayMs || 0,
            preWriteDelayMs: workloadItem.certification?.preWriteDelayMs || 0,
            failAfterArtifactWriteOnce: Boolean(workloadItem.certification?.failAfterArtifactWriteOnce),
            retryBackoffMs: workloadItem.certification?.retryBackoffMs || 50
          }
        },
        auditMetadataOverrides: {
          certificationRunId: runId,
          certificationScenarioKey: scenarioKey
        },
        checkpointStateOverrides: {
          certificationRunId: runId,
          certificationScenarioKey: scenarioKey,
          resumeEligible: true
        }
      });

      if (!prepared?.job) {
        continue;
      }

      queuedJobs.push(prepared.job);
    }
  }

  const auditMetadata = {
    runId,
    scenarioKey,
    queuedCount: queuedJobs.length,
    jobIds: queuedJobs.map((job) => job.id),
    queueNames: Array.from(new Set(queuedJobs.map((job) => job.queueName))),
    reportKeys: Array.from(new Set(queuedJobs.map((job) => job.reportKey)))
  };

  await recordReportExportAuditEvent({
    tenantId: viewer?.tenantId,
    userId: viewer?.userId,
    role: viewer?.role,
    action: "REPORT_EXPORT_CERTIFICATION_SCENARIO_QUEUED",
    entityId: runId,
    metadata: auditMetadata
  });

  let workerSummary = null;
  if (executeNow && queuedJobs.length) {
    workerSummary = await runReportExportWorkerPass({
      limit: clampPositiveInteger(workerPassLimit, queuedJobs.length, Math.max(queuedJobs.length, env.reportExportSimulationMaxJobs))
    });
  }

  return {
    runId,
    scenarioKey,
    queuedCount: queuedJobs.length,
    workerSummary,
    items: queuedJobs.map((job) => serializeExportJob(job))
  };
}

async function getReportExportCertificationReport({ viewer, windowHours = env.reportExportOperationsWindowHours, runId = null } = {}) {
  const now = new Date();
  const normalizedWindowHours = clampPositiveInteger(windowHours, env.reportExportOperationsWindowHours, 24 * 30);
  const windowStart = new Date(now.getTime() - normalizedWindowHours * 60 * 60 * 1000);

  const runAuditEntries = await prisma.auditLog.findMany({
    where: {
      tenantId: viewer?.tenantId || null,
      action: "REPORT_EXPORT_CERTIFICATION_SCENARIO_QUEUED",
      createdAt: { gte: windowStart },
      ...(runId ? { entityId: runId } : {})
    },
    orderBy: [{ createdAt: "desc" }],
    take: 10
  });

  const runs = [];

  for (const entry of runAuditEntries) {
    const jobIds = Array.isArray(entry.metadata?.jobIds) ? entry.metadata.jobIds : [];
    const jobs = jobIds.length
      ? await prisma.reportExportJob.findMany({
        where: { id: { in: jobIds } },
        include: { artifact: true },
        orderBy: [{ createdAt: "asc" }]
      })
      : [];

    const evaluation = evaluateCertificationRun({
      runId: entry.entityId,
      scenarioKey: entry.metadata?.scenarioKey || "unknown"
    }, jobs);
    const completedJobs = jobs.filter((job) => job.status === "COMPLETED");
    const queueDurations = completedJobs.map((job) => toMilliseconds(job.queuedAt, job.startedAt)).filter(Number.isFinite);
    const endToEndDurations = completedJobs.map((job) => toMilliseconds(job.queuedAt, job.completedAt)).filter(Number.isFinite);

    runs.push({
      runId: entry.entityId,
      scenarioKey: entry.metadata?.scenarioKey || "unknown",
      createdAt: entry.createdAt,
      queuedCount: jobIds.length,
      statusCounts: summarizeCounts(jobs, "status"),
      reportDistribution: summarizeCounts(jobs, "reportKey"),
      formatDistribution: summarizeCounts(jobs, "exportFormat"),
      retryHeatmap: buildRetryHeatmap(jobs),
      durationDistribution: buildDurationDistribution(jobs),
      averageQueueMs: average(queueDurations),
      averageEndToEndMs: average(endToEndDurations),
      totalCompletedBytes: completedJobs.reduce((total, job) => total + (Number(job.byteLength) || 0), 0),
      tenantDistribution: summarizeCounts(jobs, "tenantId"),
      evaluation,
      jobs: jobs.map((job) => serializeExportJob(job))
    });
  }

  const flattenedJobs = runs.flatMap((run) => run.jobs);

  return {
    generatedAt: now,
    windowHours: normalizedWindowHours,
    runs,
    charts: {
      throughput: buildTimeSeries({
        jobs: flattenedJobs,
        windowHours: normalizedWindowHours,
        now,
        valueFactory: () => 1
      }),
      saturation: buildTimeSeries({
        jobs: flattenedJobs.filter((job) => ["QUEUED", "PROCESSING", "RETRY_WAIT"].includes(job.status)),
        windowHours: normalizedWindowHours,
        now,
        valueFactory: () => 1
      }),
      workerUtilization: buildTimeSeries({
        jobs: flattenedJobs.filter((job) => job.status === "COMPLETED"),
        windowHours: normalizedWindowHours,
        now,
        valueFactory: (job) => Math.max(1, Math.round((toMilliseconds(job.startedAt, job.completedAt) || 0) / 60000))
      })
    }
  };
}

async function reconcileReportExportState({ viewer, dryRun = true, limit = env.reportExportRecoveryBatchSize } = {}) {
  const normalizedLimit = clampPositiveInteger(limit, env.reportExportRecoveryBatchSize, 50);
  const tenantId = viewer?.tenantId || null;

  const [completedWithoutArtifact, availableArtifacts] = await Promise.all([
    prisma.reportExportJob.findMany({
      where: {
        tenantId,
        status: "COMPLETED",
        artifact: { is: null }
      },
      include: { artifact: true },
      orderBy: [{ updatedAt: "asc" }],
      take: normalizedLimit
    }),
    prisma.reportExportArtifact.findMany({
      where: {
        tenantId,
        status: "AVAILABLE"
      },
      include: {
        job: true
      },
      orderBy: [{ updatedAt: "asc" }],
      take: normalizedLimit
    })
  ]);

  const staleFileArtifacts = [];
  for (const artifact of availableArtifacts) {
    try {
      await fs.access(artifact.filePath, fsConstants.F_OK);
    } catch {
      staleFileArtifacts.push(artifact);
    }
  }

  const recovery = dryRun
    ? {
      recoveredCount: 0,
      items: []
    }
    : await recoverStalledReportExportJobs({
      viewer,
      reason: "certification_reconcile",
      limit: normalizedLimit
    });

  const fixedArtifacts = [];
  const repairedJobs = [];

  if (!dryRun) {
    for (const artifact of staleFileArtifacts) {
      const updatedArtifact = await prisma.reportExportArtifact.update({
        where: { id: artifact.id },
        data: {
          status: "EXPIRED",
          deleteReason: "missing_artifact_file",
          deletedAt: new Date()
        }
      });
      fixedArtifacts.push(updatedArtifact.id);
    }

    for (const job of completedWithoutArtifact) {
      const repairedJob = await prisma.reportExportJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          lastErrorCode: "ARTIFACT_MISSING_AFTER_COMPLETION",
          lastErrorMessage: "Completed export had no persisted artifact",
          failedAt: new Date(),
          activeLockKey: null
        }
      });
      repairedJobs.push(repairedJob.id);
    }

    await runReportExportCleanupPass();
  }

  const summary = {
    dryRun,
    completedWithoutArtifact: completedWithoutArtifact.map((job) => serializeExportJob(job)),
    missingArtifactFiles: staleFileArtifacts.map((artifact) => ({
      id: artifact.id,
      jobId: artifact.jobId,
      filePath: artifact.filePath,
      reportKey: artifact.reportKey,
      exportFormat: artifact.exportFormat
    })),
    staleRecovery: recovery,
    fixedArtifacts,
    repairedJobs
  };

  await recordReportExportAuditEvent({
    tenantId,
    userId: viewer?.userId,
    role: viewer?.role,
    action: "REPORT_EXPORT_RECOVERY_RECONCILED",
    entityId: `reconcile:${Date.now().toString(36)}`,
    metadata: {
      dryRun,
      missingArtifactFiles: staleFileArtifacts.length,
      completedWithoutArtifact: completedWithoutArtifact.length,
      recoveredCount: recovery.recoveredCount || 0
    }
  });

  return summary;
}

export {
  getReportExportCertificationReport,
  queueReportExportCertificationScenario,
  reconcileReportExportState,
  resolveCertificationScenarioWorkload
};