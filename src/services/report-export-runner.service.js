import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import {
  expireReportExportArtifact,
  heartbeatExportJob,
  leaseNextExportJob,
  markExportJobCompleted,
  markExportJobFailed,
  prepareQueuedExportJob,
  updateExportJobProgress,
  writeExportJobCheckpoint
} from "./report-export-job.service.js";
import {
  deleteReportArtifactFile,
  generateReportExportArtifact
} from "./report-export.service.js";
import { getReportDocument } from "./reporting.service.js";

let workerState = null;
let cleanupState = null;
let schedulerState = null;

function buildWorkerId(prefix) {
  return `${prefix}:${process.pid}:${Date.now().toString(36)}`;
}

function buildScheduleWindowKey(schedule, asOf = new Date()) {
  return `${asOf.toISOString().slice(0, 10)}:${schedule.runHourUtc}:${schedule.runMinuteUtc}`;
}

function buildNextScheduleRunAt(schedule, from = new Date()) {
  const next = new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
    schedule.runHourUtc,
    schedule.runMinuteUtc,
    0,
    0
  ));

  if (next <= from) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

function isScheduleDue(schedule, asOf = new Date()) {
  const windowKey = buildScheduleWindowKey(schedule, asOf);
  const dueAt = new Date(Date.UTC(
    asOf.getUTCFullYear(),
    asOf.getUTCMonth(),
    asOf.getUTCDate(),
    schedule.runHourUtc,
    schedule.runMinuteUtc,
    0,
    0
  ));

  return {
    due: asOf >= dueAt && schedule.lastWindowKey !== windowKey,
    windowKey,
    dueAt
  };
}

async function hydrateReportFromJob(job) {
  if (job?.checkpointState?.reportDocument) {
    return job.checkpointState.reportDocument;
  }

  const executionContext = job?.workerMetadata?.executionContext;
  if (!executionContext) {
    throw new Error("Pinned export execution context is missing");
  }

  return getReportDocument(executionContext);
}

async function executeReportExportJob(job, { workerId, loggerOverride = logger } = {}) {
  const certificationConfig = job?.workerMetadata?.certification || null;

  await writeExportJobCheckpoint(job.id, {
    lastPhase: "HYDRATING_REPORT",
    workerId,
    certification: certificationConfig,
    resumeEligible: true
  });

  await heartbeatExportJob(job.id, {
    workerId,
    progressPhase: "HYDRATING_REPORT",
    progressPercent: 10
  });

  const executionContext = job?.workerMetadata?.executionContext;
  const report = await hydrateReportFromJob(job);

  await writeExportJobCheckpoint(job.id, {
    lastPhase: "REPORT_HYDRATED",
    snapshotReferenceId: report?.metadata?.snapshot?.referenceId || null,
    reportKey: report?.reportKey || job.reportKey,
    resumeEligible: true
  });

  await updateExportJobProgress(job.id, {
    phase: "GENERATING_ARTIFACT",
    percent: 35
  });

  await writeExportJobCheckpoint(job.id, {
    lastPhase: "GENERATING_ARTIFACT",
    resumeEligible: true
  });

  const artifact = await generateReportExportArtifact({
    job,
    format: job.exportFormat,
    report,
    reportContext: executionContext
  });

  await updateExportJobProgress(job.id, {
    phase: "FINALIZING",
    percent: 90,
    completedUnits: artifact.rowCount,
    totalUnits: artifact.rowCount
  });

  await writeExportJobCheckpoint(job.id, {
    lastPhase: "FINALIZING",
    artifactPreview: {
      rowCount: artifact.rowCount,
      tableCount: artifact.tableCount,
      byteLength: artifact.byteLength
    },
    resumeEligible: true
  });

  const completedJob = await markExportJobCompleted(job.id, {
    artifact,
    report,
    auditMetadata: {
      completedAt: new Date().toISOString(),
      workerId,
      snapshotReferenceId: report.metadata?.snapshot?.referenceId || null,
      artifactFileName: artifact.fileName
    }
  });

  loggerOverride.info("report_export_job_completed", {
    jobId: completedJob.id,
    reportKey: completedJob.reportKey,
    format: completedJob.exportFormat,
    byteLength: completedJob.byteLength,
    rowCount: completedJob.rowCount,
    queueName: completedJob.queueName
  });

  return completedJob;
}

async function runReportExportWorkerPass({
  limit = env.reportExportWorkerBatchSize,
  workerId = buildWorkerId("report-export-worker"),
  loggerOverride = logger
} = {}) {
  const summary = {
    leased: 0,
    completed: 0,
    failed: 0,
    retried: 0,
    skipped: 0
  };

  for (let index = 0; index < limit; index += 1) {
    const leasedJob = await leaseNextExportJob({ workerId });
    if (!leasedJob) {
      summary.skipped += 1;
      break;
    }

    summary.leased += 1;

    try {
      await executeReportExportJob(leasedJob, { workerId, loggerOverride });
      summary.completed += 1;
    } catch (error) {
      const failedJob = await markExportJobFailed(leasedJob.id, error, {
        auditMetadata: {
          failedAt: new Date().toISOString(),
          workerId,
          lastKnownPhase: leasedJob.progressPhase || null
        }
      });

      if (failedJob?.status === "RETRY_WAIT") {
        summary.retried += 1;
      } else {
        summary.failed += 1;
      }

      loggerOverride.error("report_export_job_failed", {
        jobId: leasedJob.id,
        reportKey: leasedJob.reportKey,
        format: leasedJob.exportFormat,
        error: error.message,
        terminal: failedJob?.status === "FAILED"
      });
    }
  }

  return summary;
}

async function runReportExportCleanupPass({ loggerOverride = logger } = {}) {
  const now = new Date();
  const summary = {
    expired: 0,
    deleted: 0
  };

  const expiringArtifacts = await prisma.reportExportArtifact.findMany({
    where: {
      status: "AVAILABLE",
      expiresAt: { lte: now }
    },
    take: 25,
    orderBy: [{ expiresAt: "asc" }]
  });

  for (const artifact of expiringArtifacts) {
    await expireReportExportArtifact(artifact.jobId, { reason: "retention_expired" });
    summary.expired += 1;
  }

  const deletableArtifacts = await prisma.reportExportArtifact.findMany({
    where: {
      status: "EXPIRED"
    },
    take: 25,
    orderBy: [{ updatedAt: "asc" }]
  });

  for (const artifact of deletableArtifacts) {
    const deleted = await deleteReportArtifactFile(artifact.filePath);
    await prisma.reportExportArtifact.update({
      where: { id: artifact.id },
      data: {
        status: deleted ? "DELETED" : artifact.status,
        deletedAt: artifact.deletedAt || now,
        deleteReason: artifact.deleteReason || "retention_expired"
      }
    });
    if (deleted) {
      summary.deleted += 1;
    }
  }

  if (summary.expired || summary.deleted) {
    loggerOverride.info("report_export_cleanup_completed", summary);
  }

  return summary;
}

async function runScheduledReportExportPass({ asOf = new Date(), loggerOverride = logger } = {}) {
  const schedules = await prisma.reportExportSchedule.findMany({
    where: {
      status: "ACTIVE"
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    take: 20
  });

  const summary = {
    evaluated: schedules.length,
    queued: 0,
    skipped: 0
  };

  for (const schedule of schedules) {
    const { due, windowKey } = isScheduleDue(schedule, asOf);
    if (!due || !schedule.executionContext) {
      summary.skipped += 1;
      continue;
    }

    const executionContext = {
      ...(schedule.executionContext || {}),
      reportKey: schedule.reportKey,
      query: schedule.filters || schedule.executionContext?.query || {}
    };
    const auth = executionContext.auth || {};
    const scope = schedule.executionContext?.bpScope?.businessPartner?.id
      || schedule.executionContext?.franchiseScope?.franchise?.id
      || schedule.executionContext?.student?.id
      || schedule.executionContext?.parent?.id
      || null;

    const requestFingerprint = `${schedule.id}:${windowKey}`;

    await prepareQueuedExportJob({
      tenantId: schedule.tenantId,
      reportKey: schedule.reportKey,
      format: schedule.exportFormat,
      requestFingerprint,
      lockKey: `export:schedule:${schedule.id}:${windowKey}`,
      auth,
      executionContext,
      filters: executionContext.query,
      reportFactory: () => getReportDocument(executionContext),
      triggerSource: "SCHEDULED",
      scheduleId: schedule.id,
      queueName: schedule.queueName,
      priority: schedule.priority,
      maxAttempts: schedule.maxAttempts,
      retryBackoffMs: schedule.retryBackoffMs,
      scheduledWindowKey: windowKey,
      retentionHours: Math.max(1, Math.trunc((schedule.maxRetentionHours || 24) / 1))
    });

    await prisma.reportExportSchedule.update({
      where: { id: schedule.id },
      data: {
        lastWindowKey: windowKey,
        lastQueuedAt: asOf,
        nextRunAt: buildNextScheduleRunAt(schedule, asOf),
        metadata: {
          ...(schedule.metadata || {}),
          lastQueuedScopeId: scope,
          lastQueuedWindowKey: windowKey
        }
      }
    });

    summary.queued += 1;
  }

  if (summary.queued) {
    loggerOverride.info("report_export_scheduler_completed", summary);
  }

  return summary;
}

function startReportExportWorker({
  runner = runReportExportWorkerPass,
  loggerOverride = logger
} = {}) {
  if (!env.reportExportWorkerEnabled) {
    loggerOverride.info("report_export_worker_disabled", {});
    return null;
  }

  if (workerState) {
    return workerState;
  }

  let running = false;

  const tick = async () => {
    if (running) {
      return;
    }

    running = true;
    try {
      await runner({ loggerOverride });
    } catch (error) {
      loggerOverride.error("report_export_worker_tick_failed", {
        error: error.message
      });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, env.reportExportWorkerPollMs);
  timer.unref?.();

  if (env.reportExportWorkerRunOnStartup) {
    void tick();
  }

  workerState = {
    stop() {
      clearInterval(timer);
      workerState = null;
    }
  };

  loggerOverride.info("report_export_worker_started", {
    pollMs: env.reportExportWorkerPollMs,
    batchSize: env.reportExportWorkerBatchSize,
    leaseMs: env.reportExportWorkerLeaseMs
  });

  return workerState;
}

function startReportExportCleanup({
  runner = runReportExportCleanupPass,
  loggerOverride = logger
} = {}) {
  if (!env.reportExportCleanupEnabled) {
    loggerOverride.info("report_export_cleanup_disabled", {});
    return null;
  }

  if (cleanupState) {
    return cleanupState;
  }

  let running = false;

  const tick = async () => {
    if (running) {
      return;
    }

    running = true;
    try {
      await runner({ loggerOverride });
    } catch (error) {
      loggerOverride.error("report_export_cleanup_tick_failed", {
        error: error.message
      });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, env.reportExportCleanupPollMs);
  timer.unref?.();

  if (env.reportExportCleanupRunOnStartup) {
    void tick();
  }

  cleanupState = {
    stop() {
      clearInterval(timer);
      cleanupState = null;
    }
  };

  loggerOverride.info("report_export_cleanup_started", {
    pollMs: env.reportExportCleanupPollMs
  });

  return cleanupState;
}

function startReportExportScheduler({
  runner = runScheduledReportExportPass,
  loggerOverride = logger
} = {}) {
  if (!env.reportExportSchedulerEnabled) {
    loggerOverride.info("report_export_scheduler_disabled", {});
    return null;
  }

  if (schedulerState) {
    return schedulerState;
  }

  let running = false;

  const tick = async () => {
    if (running) {
      return;
    }

    running = true;
    try {
      await runner({ loggerOverride });
    } catch (error) {
      loggerOverride.error("report_export_scheduler_tick_failed", {
        error: error.message
      });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, env.reportExportSchedulerPollMs);
  timer.unref?.();

  if (env.reportExportSchedulerRunOnStartup) {
    void tick();
  }

  schedulerState = {
    stop() {
      clearInterval(timer);
      schedulerState = null;
    }
  };

  loggerOverride.info("report_export_scheduler_started", {
    pollMs: env.reportExportSchedulerPollMs
  });

  return schedulerState;
}

function startReportExportInfrastructure({ loggerOverride = logger } = {}) {
  const worker = startReportExportWorker({ loggerOverride });
  const cleanup = startReportExportCleanup({ loggerOverride });
  const scheduler = startReportExportScheduler({ loggerOverride });

  return {
    stop() {
      worker?.stop?.();
      cleanup?.stop?.();
      scheduler?.stop?.();
    }
  };
}

export {
  buildNextScheduleRunAt,
  buildScheduleWindowKey,
  executeReportExportJob,
  isScheduleDue,
  runReportExportCleanupPass,
  runReportExportWorkerPass,
  runScheduledReportExportPass,
  startReportExportCleanup,
  startReportExportInfrastructure,
  startReportExportScheduler,
  startReportExportWorker
};