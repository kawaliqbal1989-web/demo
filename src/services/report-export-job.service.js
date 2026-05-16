import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { withAnalyticsJobLock } from "./analytics-job-runner.service.js";

const inflightExports = new Map();

const ACTIVE_EXPORT_JOB_STATUSES = Object.freeze(["QUEUED", "PROCESSING", "RETRY_WAIT"]);
const REUSABLE_EXPORT_ARTIFACT_STATUSES = Object.freeze(["AVAILABLE"]);

function stableSerialize(value) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function normalizeFilters(filters = {}) {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function normalizeExecutionContext(executionContext = {}) {
  return {
    reportKey: executionContext.reportKey || null,
    auth: executionContext.auth
      ? {
        tenantId: executionContext.auth.tenantId || null,
        userId: executionContext.auth.userId || null,
        role: executionContext.auth.role || null,
        hierarchyNodeId: executionContext.auth.hierarchyNodeId || null,
        studentId: executionContext.auth.studentId || null
      }
      : null,
    query: normalizeFilters(executionContext.query || {}),
    bpScope: executionContext.bpScope || null,
    franchiseScope: executionContext.franchiseScope || null,
    student: executionContext.student || null,
    parent: executionContext.parent || null
  };
}

function buildScopeMetadataFromExecutionContext(executionContext = {}) {
  const authRole = executionContext?.auth?.role || null;
  const bp = executionContext?.bpScope?.businessPartner || null;
  const franchise = executionContext?.franchiseScope?.franchise || null;

  if (bp) {
    return {
      tenantId: executionContext?.auth?.tenantId || null,
      role: authRole,
      entityId: bp.id || null,
      label: bp.displayName || bp.name || bp.code || null
    };
  }

  if (franchise) {
    return {
      tenantId: executionContext?.auth?.tenantId || null,
      role: authRole,
      entityId: franchise.id || null,
      label: franchise.displayName || franchise.name || franchise.code || null
    };
  }

  if (executionContext?.student?.id) {
    return {
      tenantId: executionContext?.auth?.tenantId || null,
      role: authRole,
      entityId: executionContext.student.id,
      label: executionContext.student.label || null
    };
  }

  if (executionContext?.parent?.id) {
    return {
      tenantId: executionContext?.auth?.tenantId || null,
      role: authRole,
      entityId: executionContext.parent.id,
      label: executionContext.parent.label || null
    };
  }

  return {
    tenantId: executionContext?.auth?.tenantId || null,
    role: authRole,
    entityId: null,
    label: null
  };
}

function buildExportRequestFingerprint({ tenantId, reportKey, format, auth, scope, filters }) {
  return sha256({
    tenantId,
    reportKey,
    format,
    auth: {
      role: auth?.role || null,
      userId: auth?.userId || null,
      hierarchyNodeId: auth?.hierarchyNodeId || null
    },
    scope,
    filters: normalizeFilters(filters)
  });
}

function buildReportExportEnqueueLockName(lockKey) {
  return `report_export_enqueue:${sha256(String(lockKey || "")).slice(0, 42)}`;
}

function buildExportLockKey(fingerprint) {
  return `export:${fingerprint}`;
}

function buildRetentionDates(retentionHours = env.reportExportArtifactRetentionHours) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + retentionHours * 60 * 60 * 1000);
  return {
    retentionUntil: expiresAt,
    artifactExpiresAt: expiresAt
  };
}

function buildViewerWhere(viewer) {
  const where = {
    tenantId: viewer?.tenantId || null
  };

  if (viewer?.role !== "SUPERADMIN") {
    where.requestedByUserId = viewer?.userId || null;
  }

  return where;
}

function clampPositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(max, parsed);
}

function toMilliseconds(start, end) {
  const startAt = start ? new Date(start) : null;
  const endAt = end ? new Date(end) : null;

  if (!startAt || !endAt || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return null;
  }

  return Math.max(0, endAt.getTime() - startAt.getTime());
}

function averageNumbers(values = []) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) {
    return 0;
  }
  return Math.round(valid.reduce((total, value) => total + value, 0) / valid.length);
}

function summarizeCounts(entries = [], keyField = "status") {
  return Object.fromEntries(entries.map((entry) => [entry[keyField], entry._count?._all || 0]));
}

function serializeOperationalActivity(entry) {
  if (!entry) {
    return null;
  }

  return {
    id: entry.id,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    role: entry.role,
    userId: entry.userId,
    createdAt: entry.createdAt,
    metadata: entry.metadata || null
  };
}

function buildOperationalIncident({ type, severity, message, job, metadata = null, detectedAt = new Date() }) {
  return {
    id: `${type}:${job?.id || String(detectedAt.getTime())}`,
    type,
    severity,
    message,
    detectedAt,
    jobId: job?.id || null,
    reportKey: job?.reportKey || null,
    exportFormat: job?.exportFormat || null,
    queueName: job?.queueName || null,
    status: job?.status || null,
    metadata
  };
}

function rankLeaseableJobStatus(status) {
  if (status === "PROCESSING") {
    return 0;
  }
  if (status === "RETRY_WAIT") {
    return 1;
  }
  return 2;
}

function selectFairLeaseCandidate(candidates, activeTenantCounts = new Map()) {
  if (!Array.isArray(candidates) || !candidates.length) {
    return null;
  }

  const sorted = [...candidates].sort((left, right) => {
    const leftActiveCount = activeTenantCounts.get(left.tenantId) || 0;
    const rightActiveCount = activeTenantCounts.get(right.tenantId) || 0;
    const leftOverSoftLimit = leftActiveCount >= env.reportExportTenantConcurrencySoftLimit ? 1 : 0;
    const rightOverSoftLimit = rightActiveCount >= env.reportExportTenantConcurrencySoftLimit ? 1 : 0;

    if (leftOverSoftLimit !== rightOverSoftLimit) {
      return leftOverSoftLimit - rightOverSoftLimit;
    }

    if (leftActiveCount !== rightActiveCount) {
      return leftActiveCount - rightActiveCount;
    }

    const leftStatusRank = rankLeaseableJobStatus(left.status);
    const rightStatusRank = rankLeaseableJobStatus(right.status);
    if (leftStatusRank !== rightStatusRank) {
      return leftStatusRank - rightStatusRank;
    }

    if ((left.priority || 0) !== (right.priority || 0)) {
      return (left.priority || 0) - (right.priority || 0);
    }

    const leftQueuedAt = new Date(left.queuedAt || left.createdAt || 0).getTime();
    const rightQueuedAt = new Date(right.queuedAt || right.createdAt || 0).getTime();
    if (leftQueuedAt !== rightQueuedAt) {
      return leftQueuedAt - rightQueuedAt;
    }

    return new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
  });

  const selected = sorted[0] || null;
  if (!selected) {
    return null;
  }

  return {
    job: selected,
    fairness: {
      activeTenantCount: activeTenantCounts.get(selected.tenantId) || 0,
      candidateCount: candidates.length,
      candidateTenantCount: new Set(candidates.map((candidate) => candidate.tenantId)).size,
      softLimit: env.reportExportTenantConcurrencySoftLimit,
      strategy: "tenant_fairness_soft_limit"
    }
  };
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
    const timeValue = job?.completedAt || job?.updatedAt || job?.createdAt || null;
    if (!timeValue) {
      continue;
    }

    const at = new Date(timeValue);
    if (Number.isNaN(at.getTime()) || at < startAt || at > now) {
      continue;
    }

    const bucketIndex = Math.min(
      buckets.length - 1,
      Math.max(0, Math.floor((at.getTime() - startAt.getTime()) / (60 * 60 * 1000)))
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

function buildGroupedDistribution(items = [], field) {
  return items.reduce((accumulator, item) => {
    const key = item?.[field] || "UNKNOWN";
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
}

function buildRetryHeatmap(jobs = []) {
  return jobs.reduce((accumulator, job) => {
    const key = job?.reportKey || "unknown";
    accumulator[key] = accumulator[key] || { total: 0, retried: 0, failed: 0 };
    accumulator[key].total += 1;
    if ((job?.retryCount || 0) > 0) {
      accumulator[key].retried += 1;
    }
    if (job?.status === "FAILED") {
      accumulator[key].failed += 1;
    }
    return accumulator;
  }, {});
}

function buildExportJobLinks(jobId, artifactAvailable) {
  return {
    statusUrl: `/api/reports/exports/jobs/${jobId}`,
    downloadUrl: artifactAvailable ? `/api/reports/exports/jobs/${jobId}/download` : null,
    retryUrl: `/api/reports/exports/jobs/${jobId}/retry`
  };
}

function serializeExportArtifact(artifact, jobId) {
  if (!artifact) {
    return null;
  }

  const isAvailable = artifact.status === "AVAILABLE";

  return {
    id: artifact.id,
    status: artifact.status,
    fileName: artifact.fileName,
    mimeType: artifact.mimeType,
    byteLength: artifact.byteLength,
    rowCount: artifact.rowCount,
    tableCount: artifact.tableCount,
    availableAt: artifact.availableAt,
    expiresAt: artifact.expiresAt,
    deletedAt: artifact.deletedAt,
    downloadUrl: isAvailable ? `/api/reports/exports/jobs/${jobId}/download` : null
  };
}

function serializeExportJob(job) {
  if (!job) {
    return null;
  }

  const artifactAvailable = job.artifact?.status === "AVAILABLE";

  return {
    id: job.id,
    scheduleId: job.scheduleId,
    reportKey: job.reportKey,
    exportFormat: job.exportFormat,
    triggerSource: job.triggerSource,
    status: job.status,
    queueName: job.queueName,
    priority: job.priority,
    requestedByUserId: job.requestedByUserId,
    requestedByRole: job.requestedByRole,
    scopeRole: job.scopeRole,
    scopeEntityId: job.scopeEntityId,
    scopeLabel: job.scopeLabel,
    snapshotReferenceId: job.snapshotReferenceId,
    snapshotCapturedAt: job.snapshotCapturedAt,
    snapshotLineageFrom: job.snapshotLineageFrom,
    snapshotLineageTo: job.snapshotLineageTo,
    integrityDigest: job.integrityDigest,
    exportFileName: job.exportFileName,
    rowCount: job.rowCount,
    tableCount: job.tableCount,
    byteLength: job.byteLength,
    retryCount: job.retryCount,
    maxAttempts: job.maxAttempts,
    nextRetryAt: job.nextRetryAt,
    lastErrorCode: job.lastErrorCode,
    lastErrorMessage: job.lastErrorMessage,
    progress: {
      phase: job.progressPhase,
      percent: job.progressPercent,
      completedUnits: job.progressCompletedUnits,
      totalUnits: job.progressTotalUnits
    },
    retentionUntil: job.retentionUntil,
    artifactExpiresAt: job.artifactExpiresAt,
    queuedAt: job.queuedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    failedAt: job.failedAt,
    cancelledAt: job.cancelledAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    artifact: serializeExportArtifact(job.artifact, job.id),
    links: buildExportJobLinks(job.id, artifactAvailable)
  };
}

async function createLifecycleAuditLog({ tenantId, userId, role, action, entityId, metadata }) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: userId || null,
        role: role || null,
        action,
        entityType: "REPORT_EXPORT_JOB",
        entityId: entityId || null,
        metadata: metadata || null
      }
    });
  } catch {
    // Export lifecycle audit logging should not break export delivery.
  }
}

async function recordReportExportAuditEvent({ tenantId, userId, role, action, entityId, metadata }) {
  await createLifecycleAuditLog({ tenantId, userId, role, action, entityId, metadata });
}

async function findActiveExportJob({ tenantId, lockKey }) {
  return prisma.reportExportJob.findFirst({
    where: {
      tenantId,
      activeLockKey: lockKey,
      status: { in: ACTIVE_EXPORT_JOB_STATUSES }
    },
    include: {
      artifact: true
    },
    orderBy: [{ queuedAt: "desc" }, { createdAt: "desc" }]
  });
}

async function findReusableCompletedExportJob({ tenantId, requestFingerprint }) {
  return prisma.reportExportJob.findFirst({
    where: {
      tenantId,
      requestFingerprint,
      status: "COMPLETED",
      artifact: {
        is: {
          status: { in: REUSABLE_EXPORT_ARTIFACT_STATUSES },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        }
      }
    },
    include: {
      artifact: true
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }]
  });
}

async function prepareQueuedExportJob({
  tenantId,
  reportKey,
  format,
  requestFingerprint,
  lockKey,
  auth,
  executionContext,
  filters,
  reportFactory,
  triggerSource = "USER",
  scheduleId = null,
  queueName = "interactive",
  priority = 100,
  maxAttempts = env.reportExportWorkerMaxAttempts,
  retryBackoffMs = env.reportExportWorkerRetryBackoffMs,
  scheduledWindowKey = null,
  retentionHours = env.reportExportArtifactRetentionHours,
  workerMetadataOverrides = null,
  auditMetadataOverrides = null,
  checkpointStateOverrides = null
}) {
  const reusable = await findReusableCompletedExportJob({ tenantId, requestFingerprint });
  if (reusable) {
    return {
      disposition: "completed_reuse",
      created: false,
      report: reusable.checkpointState?.reportDocument || null,
      job: reusable
    };
  }

  const active = await findActiveExportJob({ tenantId, lockKey });
  if (active) {
    return {
      disposition: "active",
      created: false,
      report: active.checkpointState?.reportDocument || null,
      job: active
    };
  }

  const normalizedExecutionContext = normalizeExecutionContext(executionContext);

  return withAnalyticsJobLock(
    {
      lockName: `report_export_enqueue:${lockKey.slice(0, 40)}`
    },
    async () => {
      const reusableInsideLock = await findReusableCompletedExportJob({ tenantId, requestFingerprint });
      if (reusableInsideLock) {
        return {
          disposition: "completed_reuse",
          created: false,
          report: reusableInsideLock.checkpointState?.reportDocument || null,
          job: reusableInsideLock
        };
      }

      const activeInsideLock = await findActiveExportJob({ tenantId, lockKey });
      if (activeInsideLock) {
        return {
          disposition: "active",
          created: false,
          report: activeInsideLock.checkpointState?.reportDocument || null,
          job: activeInsideLock
        };
      }

      const report = await reportFactory();
      const scopeMetadata = buildScopeMetadataFromExecutionContext(normalizedExecutionContext);
      const snapshotMetadata = report?.metadata?.snapshot || {};
      const integrityMetadata = report?.metadata?.integrity || {};
      const filterMetadata = normalizeFilters(filters);
      const retention = buildRetentionDates(retentionHours);
      const now = new Date();

      const job = await prisma.reportExportJob.create({
        data: {
          tenantId,
          requestedByUserId: auth?.userId || null,
          requestedByRole: auth?.role || null,
          scheduleId,
          reportKey,
          exportFormat: format,
          triggerSource,
          status: "QUEUED",
          scopeRole: scopeMetadata.role || null,
          scopeEntityId: scopeMetadata.entityId || null,
          scopeLabel: scopeMetadata.label || null,
          requestFingerprint,
          activeLockKey: lockKey,
          queueName,
          priority,
          maxAttempts,
          retryBackoffMs,
          scheduledWindowKey,
          snapshotReferenceId: snapshotMetadata.referenceId || `snapshot:${requestFingerprint.slice(0, 24)}`,
          snapshotCapturedAt: snapshotMetadata.capturedAt ? new Date(snapshotMetadata.capturedAt) : now,
          snapshotLineageFrom: snapshotMetadata.lineage?.firstTimestamp ? new Date(snapshotMetadata.lineage.firstTimestamp) : null,
          snapshotLineageTo: snapshotMetadata.lineage?.lastTimestamp ? new Date(snapshotMetadata.lineage.lastTimestamp) : null,
          integrityAlgorithm: integrityMetadata.algorithm || "sha256",
          integrityDigest: integrityMetadata.digest || sha256({ reportKey, scopeMetadata, filterMetadata }),
          filterHash: sha256(filterMetadata),
          scopeHash: sha256(scopeMetadata),
          scopeMetadata,
          filterMetadata,
          snapshotMetadata,
          checkpointState: {
            reportDocument: report,
            lastPhase: "QUEUED",
            queuedAt: now.toISOString(),
            executionAttempt: 0,
            ...(checkpointStateOverrides || {})
          },
          workerMetadata: {
            executionContext: normalizedExecutionContext,
            queueName,
            triggerSource,
            scheduledWindowKey,
            requestedAt: now.toISOString(),
            ...(workerMetadataOverrides || {})
          },
          auditMetadata: {
            queuedByRole: auth?.role || null,
            queuedByUserId: auth?.userId || null,
            queuedAt: now.toISOString(),
            ...(auditMetadataOverrides || {})
          },
          retentionUntil: retention.retentionUntil,
          artifactExpiresAt: retention.artifactExpiresAt,
          queuedAt: now
        },
        include: {
          artifact: true
        }
      });

      await createLifecycleAuditLog({
        tenantId,
        userId: auth?.userId,
        role: auth?.role,
        action: triggerSource === "SCHEDULED" ? "REPORT_EXPORT_JOB_SCHEDULED" : "REPORT_EXPORT_JOB_QUEUED",
        entityId: job.id,
        metadata: {
          reportKey,
          format,
          scopeRole: scopeMetadata.role,
          scopeEntityId: scopeMetadata.entityId,
          snapshotReferenceId: job.snapshotReferenceId,
          triggerSource,
          queueName,
          priority
        }
      });

      return {
        disposition: "queued",
        created: true,
        report,
        job
      };
    }
  );
}

async function getReportExportJobForViewer({ jobId, viewer }) {
  return prisma.reportExportJob.findFirst({
    where: {
      id: jobId,
      ...buildViewerWhere(viewer)
    },
    include: {
      artifact: true
    }
  });
}

async function listReportExportJobs({ viewer, filters = {} }) {
  const limit = Math.max(1, Math.min(50, Number.parseInt(filters.limit, 10) || 20));

  return prisma.reportExportJob.findMany({
    where: {
      ...buildViewerWhere(viewer),
      ...(filters.reportKey ? { reportKey: String(filters.reportKey) } : {}),
      ...(filters.status ? { status: String(filters.status).toUpperCase() } : {}),
      ...(filters.format ? { exportFormat: String(filters.format).toUpperCase() } : {})
    },
    include: {
      artifact: true
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit
  });
}

async function getReportExportOperationalSummary({ viewer }) {
  const where = buildViewerWhere(viewer);
  const now = new Date();
  const queuedBefore = new Date(now.getTime() - env.reportExportSlaQueuedMs);
  const processingBefore = new Date(now.getTime() - env.reportExportSlaProcessingMs);

  const [statusCounts, queuedSlaBreaches, processingSlaBreaches, retryWaitCount, expiredArtifacts] = await Promise.all([
    prisma.reportExportJob.groupBy({
      by: ["status"],
      where,
      _count: { _all: true }
    }),
    prisma.reportExportJob.count({
      where: {
        ...where,
        status: "QUEUED",
        queuedAt: { lte: queuedBefore }
      }
    }),
    prisma.reportExportJob.count({
      where: {
        ...where,
        status: "PROCESSING",
        startedAt: { lte: processingBefore }
      }
    }),
    prisma.reportExportJob.count({
      where: {
        ...where,
        status: "RETRY_WAIT"
      }
    }),
    prisma.reportExportArtifact.count({
      where: {
        tenantId: viewer.tenantId,
        status: "EXPIRED"
      }
    })
  ]);

  return {
    statusCounts: Object.fromEntries(statusCounts.map((entry) => [entry.status, entry._count._all])),
    queuedSlaBreaches,
    processingSlaBreaches,
    retryWaitCount,
    expiredArtifacts,
    thresholds: {
      queuedMs: env.reportExportSlaQueuedMs,
      processingMs: env.reportExportSlaProcessingMs
    }
  };
}

async function getReportExportOperationsDashboard({
  viewer,
  windowHours = env.reportExportOperationsWindowHours,
  recentLimit = env.reportExportOperationsRecentLimit
} = {}) {
  const tenantId = viewer?.tenantId || null;
  const now = new Date();
  const normalizedWindowHours = clampPositiveInteger(windowHours, env.reportExportOperationsWindowHours, 24 * 30);
  const normalizedRecentLimit = clampPositiveInteger(recentLimit, env.reportExportOperationsRecentLimit, 50);
  const windowStart = new Date(now.getTime() - normalizedWindowHours * 60 * 60 * 1000);
  const queuedBefore = new Date(now.getTime() - env.reportExportSlaQueuedMs);
  const processingBefore = new Date(now.getTime() - env.reportExportSlaProcessingMs);
  const staleHeartbeatBefore = new Date(now.getTime() - env.reportExportWorkerHeartbeatStaleMs);
  const expiringSoonBefore = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const [
    statusCounts,
    formatCounts,
    queueCounts,
    artifactStatusCounts,
    availableArtifactAggregate,
    oldestQueuedJob,
    oldestRetryJob,
    recentJobs,
    recentCompletedJobs,
    recentFailedJobs,
    recentRetriedJobs,
    activeProcessingJobs,
    queuedBreachJobs,
    processingBreachJobs,
    staleProcessingJobs,
    expiringSoonArtifacts,
    overdueExpiredArtifacts,
    scheduleStatusCounts,
    dueSoonSchedules,
    recentActivity,
    recentDownloads
  ] = await Promise.all([
    prisma.reportExportJob.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { _all: true }
    }),
    prisma.reportExportJob.groupBy({
      by: ["exportFormat"],
      where: { tenantId },
      _count: { _all: true }
    }),
    prisma.reportExportJob.groupBy({
      by: ["queueName"],
      where: { tenantId },
      _count: { _all: true }
    }),
    prisma.reportExportArtifact.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { _all: true }
    }),
    prisma.reportExportArtifact.aggregate({
      where: {
        tenantId,
        status: "AVAILABLE"
      },
      _count: { _all: true },
      _sum: { byteLength: true }
    }),
    prisma.reportExportJob.findFirst({
      where: {
        tenantId,
        status: "QUEUED"
      },
      include: { artifact: true },
      orderBy: [{ queuedAt: "asc" }, { createdAt: "asc" }]
    }),
    prisma.reportExportJob.findFirst({
      where: {
        tenantId,
        status: "RETRY_WAIT"
      },
      include: { artifact: true },
      orderBy: [{ nextRetryAt: "asc" }, { createdAt: "asc" }]
    }),
    prisma.reportExportJob.findMany({
      where: { tenantId },
      include: { artifact: true },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: normalizedRecentLimit
    }),
    prisma.reportExportJob.findMany({
      where: {
        tenantId,
        status: "COMPLETED",
        completedAt: { gte: windowStart }
      },
      select: {
        id: true,
        queuedAt: true,
        startedAt: true,
        completedAt: true,
        byteLength: true,
        reportKey: true,
        exportFormat: true,
        queueName: true,
        status: true,
        retryCount: true
      },
      orderBy: [{ completedAt: "desc" }],
      take: 250
    }),
    prisma.reportExportJob.findMany({
      where: {
        tenantId,
        status: "FAILED",
        failedAt: { gte: windowStart }
      },
      include: { artifact: true },
      orderBy: [{ failedAt: "desc" }],
      take: normalizedRecentLimit
    }),
    prisma.reportExportJob.findMany({
      where: {
        tenantId,
        retryCount: { gt: 0 },
        updatedAt: { gte: windowStart }
      },
      include: { artifact: true },
      orderBy: [{ updatedAt: "desc" }],
      take: normalizedRecentLimit
    }),
    prisma.reportExportJob.findMany({
      where: {
        tenantId,
        status: "PROCESSING"
      },
      include: { artifact: true },
      orderBy: [{ lastHeartbeatAt: "asc" }, { queuedAt: "asc" }]
    }),
    prisma.reportExportJob.findMany({
      where: {
        tenantId,
        status: "QUEUED",
        queuedAt: { lte: queuedBefore }
      },
      include: { artifact: true },
      orderBy: [{ queuedAt: "asc" }],
      take: normalizedRecentLimit
    }),
    prisma.reportExportJob.findMany({
      where: {
        tenantId,
        status: "PROCESSING",
        startedAt: { lte: processingBefore }
      },
      include: { artifact: true },
      orderBy: [{ startedAt: "asc" }],
      take: normalizedRecentLimit
    }),
    prisma.reportExportJob.findMany({
      where: {
        tenantId,
        status: "PROCESSING",
        OR: [
          { leaseExpiresAt: { lte: now } },
          { lastHeartbeatAt: { lte: staleHeartbeatBefore } }
        ]
      },
      include: { artifact: true },
      orderBy: [{ leaseExpiresAt: "asc" }, { lastHeartbeatAt: "asc" }],
      take: normalizedRecentLimit
    }),
    prisma.reportExportArtifact.findMany({
      where: {
        tenantId,
        status: "AVAILABLE",
        expiresAt: { lte: expiringSoonBefore, gt: now }
      },
      orderBy: [{ expiresAt: "asc" }],
      take: normalizedRecentLimit
    }),
    prisma.reportExportArtifact.findMany({
      where: {
        tenantId,
        status: "EXPIRED"
      },
      orderBy: [{ updatedAt: "asc" }],
      take: normalizedRecentLimit
    }),
    prisma.reportExportSchedule.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { _all: true }
    }),
    prisma.reportExportSchedule.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        nextRunAt: { lte: expiringSoonBefore }
      },
      orderBy: [{ nextRunAt: "asc" }],
      take: normalizedRecentLimit
    }),
    prisma.auditLog.findMany({
      where: {
        tenantId,
        action: {
          startsWith: "REPORT_EXPORT_"
        },
        createdAt: { gte: windowStart }
      },
      orderBy: [{ createdAt: "desc" }],
      take: normalizedRecentLimit
    }),
    prisma.auditLog.findMany({
      where: {
        tenantId,
        action: "REPORT_EXPORT_ARTIFACT_DOWNLOADED",
        createdAt: { gte: windowStart }
      },
      orderBy: [{ createdAt: "desc" }],
      take: normalizedRecentLimit
    })
  ]);

  const workerMap = new Map();
  for (const job of activeProcessingJobs) {
    const workerId = job.leaseOwner || "unassigned";
    const heartbeatAt = job.lastHeartbeatAt || job.startedAt || job.queuedAt || null;
    const leaseExpiresAt = job.leaseExpiresAt || null;
    const current = workerMap.get(workerId) || {
      workerId,
      activeJobs: 0,
      lastHeartbeatAt: heartbeatAt,
      leaseExpiresAt,
      oldestQueuedAt: job.queuedAt || null,
      stale: false
    };

    current.activeJobs += 1;
    if (!current.lastHeartbeatAt || (heartbeatAt && new Date(heartbeatAt) > new Date(current.lastHeartbeatAt))) {
      current.lastHeartbeatAt = heartbeatAt;
    }
    if (!current.leaseExpiresAt || (leaseExpiresAt && new Date(leaseExpiresAt) > new Date(current.leaseExpiresAt))) {
      current.leaseExpiresAt = leaseExpiresAt;
    }
    if (!current.oldestQueuedAt || (job.queuedAt && new Date(job.queuedAt) < new Date(current.oldestQueuedAt))) {
      current.oldestQueuedAt = job.queuedAt;
    }
    current.stale = current.stale || Boolean(
      (current.leaseExpiresAt && new Date(current.leaseExpiresAt) <= now)
      || (current.lastHeartbeatAt && new Date(current.lastHeartbeatAt) <= staleHeartbeatBefore)
    );

    workerMap.set(workerId, current);
  }

  const completedQueueDurations = recentCompletedJobs.map((job) => toMilliseconds(job.queuedAt, job.startedAt)).filter(Number.isFinite);
  const completedProcessingDurations = recentCompletedJobs.map((job) => toMilliseconds(job.startedAt, job.completedAt)).filter(Number.isFinite);
  const completedEndToEndDurations = recentCompletedJobs.map((job) => toMilliseconds(job.queuedAt, job.completedAt)).filter(Number.isFinite);
  const queueSlaBreachesCompleted = completedQueueDurations.filter((value) => value > env.reportExportSlaQueuedMs).length;
  const processingSlaBreachesCompleted = completedProcessingDurations.filter((value) => value > env.reportExportSlaProcessingMs).length;
  const totalCompletedBytes = recentCompletedJobs.reduce((total, job) => total + (Number(job.byteLength) || 0), 0);

  const incidents = [
    ...queuedBreachJobs.map((job) => buildOperationalIncident({
      type: "QUEUE_SLA_BREACH",
      severity: "warning",
      message: `Queued export exceeded ${env.reportExportSlaQueuedMs}ms SLA`,
      job,
      metadata: {
        ageMs: toMilliseconds(job.queuedAt, now)
      },
      detectedAt: now
    })),
    ...processingBreachJobs.map((job) => buildOperationalIncident({
      type: "PROCESSING_SLA_BREACH",
      severity: "warning",
      message: `Processing export exceeded ${env.reportExportSlaProcessingMs}ms SLA`,
      job,
      metadata: {
        runtimeMs: toMilliseconds(job.startedAt, now),
        lastHeartbeatAt: job.lastHeartbeatAt || null
      },
      detectedAt: now
    })),
    ...staleProcessingJobs.map((job) => buildOperationalIncident({
      type: "STALE_WORKER_LEASE",
      severity: "critical",
      message: "Processing export lease is stale or heartbeat is overdue",
      job,
      metadata: {
        leaseOwner: job.leaseOwner || null,
        leaseExpiresAt: job.leaseExpiresAt || null,
        lastHeartbeatAt: job.lastHeartbeatAt || null
      },
      detectedAt: now
    })),
    ...recentFailedJobs.map((job) => buildOperationalIncident({
      type: "FAILED_EXPORT",
      severity: job.retryCount >= job.maxAttempts ? "critical" : "warning",
      message: job.lastErrorMessage || "Export failed",
      job,
      metadata: {
        retryCount: job.retryCount,
        maxAttempts: job.maxAttempts,
        lastErrorCode: job.lastErrorCode || null
      },
      detectedAt: job.failedAt || now
    }))
  ]
    .sort((left, right) => new Date(right.detectedAt) - new Date(left.detectedAt))
    .slice(0, normalizedRecentLimit);

  return {
    generatedAt: now,
    windowHours: normalizedWindowHours,
    thresholds: {
      queuedMs: env.reportExportSlaQueuedMs,
      processingMs: env.reportExportSlaProcessingMs,
      staleHeartbeatMs: env.reportExportWorkerHeartbeatStaleMs
    },
    backlog: {
      statusCounts: summarizeCounts(statusCounts),
      formatCounts: summarizeCounts(formatCounts, "exportFormat"),
      queueCounts: summarizeCounts(queueCounts, "queueName"),
      oldestQueuedAt: oldestQueuedJob?.queuedAt || null,
      oldestQueuedAgeMs: oldestQueuedJob ? toMilliseconds(oldestQueuedJob.queuedAt, now) : 0,
      nextRetryAt: oldestRetryJob?.nextRetryAt || null,
      retryWaitCount: summarizeCounts(statusCounts).RETRY_WAIT || 0
    },
    throughput: {
      completedCount: recentCompletedJobs.length,
      failedCount: recentFailedJobs.length,
      retriedCount: recentRetriedJobs.length,
      averageQueueMs: averageNumbers(completedQueueDurations),
      averageProcessingMs: averageNumbers(completedProcessingDurations),
      averageEndToEndMs: averageNumbers(completedEndToEndDurations),
      totalCompletedBytes,
      averageCompletedBytes: recentCompletedJobs.length ? Math.round(totalCompletedBytes / recentCompletedJobs.length) : 0,
      queueSlaBreachesCompleted,
      processingSlaBreachesCompleted
    },
    charts: {
      throughput: buildTimeSeries({
        jobs: recentCompletedJobs,
        windowHours: normalizedWindowHours,
        now,
        valueFactory: () => 1
      }),
      saturation: buildTimeSeries({
        jobs: [...queuedBreachJobs, ...processingBreachJobs, ...staleProcessingJobs],
        windowHours: normalizedWindowHours,
        now,
        valueFactory: () => 1
      }),
      workerUtilization: buildTimeSeries({
        jobs: recentCompletedJobs,
        windowHours: normalizedWindowHours,
        now,
        valueFactory: (job) => Math.max(1, Math.round((toMilliseconds(job.startedAt, job.completedAt) || 0) / 60000))
      })
    },
    distributions: {
      duration: buildDurationDistribution(recentJobs),
      queueNames: buildGroupedDistribution(recentJobs, "queueName"),
      reportKeys: buildGroupedDistribution(recentJobs, "reportKey"),
      scopeRoles: buildGroupedDistribution(recentJobs, "scopeRole"),
      retryHeatmap: buildRetryHeatmap(recentJobs)
    },
    workers: {
      active: Array.from(workerMap.values()).sort((left, right) => {
        if (left.stale !== right.stale) {
          return left.stale ? -1 : 1;
        }
        return right.activeJobs - left.activeJobs;
      }),
      counts: {
        activeWorkers: workerMap.size,
        staleWorkers: Array.from(workerMap.values()).filter((worker) => worker.stale).length,
        staleProcessingJobs: staleProcessingJobs.length
      }
    },
    artifacts: {
      statusCounts: summarizeCounts(artifactStatusCounts),
      availableCount: availableArtifactAggregate._count?._all || 0,
      availableBytes: Number(availableArtifactAggregate._sum?.byteLength) || 0,
      expiringSoonCount: expiringSoonArtifacts.length,
      overdueExpiredCount: overdueExpiredArtifacts.length,
      expiringSoon: expiringSoonArtifacts,
      overdueExpired: overdueExpiredArtifacts
    },
    schedules: {
      statusCounts: summarizeCounts(scheduleStatusCounts),
      dueSoonCount: dueSoonSchedules.length,
      dueSoon: dueSoonSchedules
    },
    sla: {
      queuedBreaches: queuedBreachJobs.length,
      processingBreaches: processingBreachJobs.length,
      staleLeaseBreaches: staleProcessingJobs.length,
      incidents
    },
    recent: {
      jobs: recentJobs.map((job) => serializeExportJob(job)),
      activity: recentActivity.map((entry) => serializeOperationalActivity(entry)).filter(Boolean),
      downloads: recentDownloads.map((entry) => serializeOperationalActivity(entry)).filter(Boolean)
    }
  };
}

async function markExportJobProcessing(jobId, { workerId, leaseMs = env.reportExportWorkerLeaseMs } = {}) {
  const startedAt = new Date();
  return prisma.reportExportJob.update({
    where: { id: jobId },
    data: {
      status: "PROCESSING",
      startedAt,
      failedAt: null,
      nextRetryAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      leaseOwner: workerId || null,
      leaseExpiresAt: new Date(startedAt.getTime() + leaseMs),
      lastHeartbeatAt: startedAt,
      progressPhase: "RENDERING",
      progressPercent: 5,
      checkpointState: {
        lastPhase: "PROCESSING",
        startedAt: startedAt.toISOString(),
        workerId: workerId || null
      }
    },
    include: {
      artifact: true
    }
  });
}

async function writeExportJobCheckpoint(jobId, checkpoint = {}) {
  const existingJob = await prisma.reportExportJob.findUnique({
    where: { id: jobId },
    select: {
      checkpointState: true,
      retryCount: true
    }
  });

  if (!existingJob) {
    return null;
  }

  const nextCheckpointState = {
    ...(existingJob.checkpointState || {}),
    ...checkpoint,
    executionAttempt: existingJob.retryCount || 0,
    lastCheckpointAt: new Date().toISOString()
  };

  return prisma.reportExportJob.update({
    where: { id: jobId },
    data: {
      checkpointState: nextCheckpointState
    },
    include: {
      artifact: true
    }
  });
}

async function heartbeatExportJob(jobId, { workerId, leaseMs = env.reportExportWorkerLeaseMs, progressPhase = null, progressPercent = null } = {}) {
  const heartbeatAt = new Date();
  return prisma.reportExportJob.update({
    where: { id: jobId },
    data: {
      leaseOwner: workerId || null,
      lastHeartbeatAt: heartbeatAt,
      leaseExpiresAt: new Date(heartbeatAt.getTime() + leaseMs),
      ...(progressPhase ? { progressPhase } : {}),
      ...(Number.isFinite(progressPercent) ? { progressPercent: Math.max(0, Math.min(99, Math.trunc(progressPercent))) } : {})
    },
    include: {
      artifact: true
    }
  });
}

async function updateExportJobProgress(jobId, progress = {}) {
  return prisma.reportExportJob.update({
    where: { id: jobId },
    data: {
      ...(progress.phase ? { progressPhase: progress.phase } : {}),
      ...(Number.isFinite(progress.percent) ? { progressPercent: Math.max(0, Math.min(100, Math.trunc(progress.percent))) } : {}),
      ...(Number.isFinite(progress.completedUnits) ? { progressCompletedUnits: Math.max(0, Math.trunc(progress.completedUnits)) } : {}),
      ...(Number.isFinite(progress.totalUnits) ? { progressTotalUnits: Math.max(0, Math.trunc(progress.totalUnits)) } : {})
    },
    include: {
      artifact: true
    }
  });
}

async function markExportJobCompleted(jobId, { artifact, auditMetadata, report }) {
  const completedAt = new Date();
  const retention = buildRetentionDates();

  const completedJob = await prisma.$transaction(async (tx) => {
    await tx.reportExportArtifact.upsert({
      where: { jobId },
      update: {
        reportKey: artifact.reportKey,
        exportFormat: artifact.exportFormat,
        status: "AVAILABLE",
        snapshotReferenceId: artifact.snapshotReferenceId,
        fileName: artifact.fileName,
        filePath: artifact.filePath,
        fileHash: artifact.fileHash || null,
        mimeType: artifact.mimeType,
        byteLength: Number.isFinite(artifact.byteLength) ? artifact.byteLength : null,
        rowCount: Number(artifact.rowCount) || 0,
        tableCount: Number(artifact.tableCount) || 0,
        retentionUntil: retention.retentionUntil,
        expiresAt: retention.artifactExpiresAt,
        availableAt: completedAt,
        deletedAt: null,
        deleteReason: null,
        metadata: artifact.metadata || null
      },
      create: {
        tenantId: artifact.tenantId,
        jobId,
        reportKey: artifact.reportKey,
        exportFormat: artifact.exportFormat,
        status: "AVAILABLE",
        snapshotReferenceId: artifact.snapshotReferenceId,
        fileName: artifact.fileName,
        filePath: artifact.filePath,
        fileHash: artifact.fileHash || null,
        mimeType: artifact.mimeType,
        byteLength: Number.isFinite(artifact.byteLength) ? artifact.byteLength : null,
        rowCount: Number(artifact.rowCount) || 0,
        tableCount: Number(artifact.tableCount) || 0,
        retentionUntil: retention.retentionUntil,
        expiresAt: retention.artifactExpiresAt,
        availableAt: completedAt,
        metadata: artifact.metadata || null
      }
    });

    return tx.reportExportJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        exportFileName: artifact.fileName || null,
        rowCount: Number(artifact.rowCount) || 0,
        tableCount: Number(artifact.tableCount) || 0,
        byteLength: Number.isFinite(artifact.byteLength) ? artifact.byteLength : null,
        completedAt,
        failedAt: null,
        nextRetryAt: null,
        activeLockKey: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastHeartbeatAt: completedAt,
        progressPhase: "COMPLETED",
        progressPercent: 100,
        progressCompletedUnits: Number(artifact.rowCount) || 0,
        progressTotalUnits: Number(artifact.rowCount) || 0,
        retentionUntil: retention.retentionUntil,
        artifactExpiresAt: retention.artifactExpiresAt,
        checkpointState: {
          reportDocument: report,
          lastPhase: "COMPLETED",
          completedAt: completedAt.toISOString()
        },
        auditMetadata: auditMetadata || undefined
      },
      include: {
        artifact: true
      }
    });
  });

  await createLifecycleAuditLog({
    tenantId: completedJob.tenantId,
    userId: completedJob.requestedByUserId,
    role: completedJob.requestedByRole,
    action: "REPORT_EXPORT_JOB_COMPLETED",
    entityId: completedJob.id,
    metadata: {
      reportKey: completedJob.reportKey,
      format: completedJob.exportFormat,
      snapshotReferenceId: completedJob.snapshotReferenceId,
      rowCount: completedJob.rowCount,
      tableCount: completedJob.tableCount,
      byteLength: completedJob.byteLength
    }
  });

  return completedJob;
}

async function markExportJobFailed(jobId, error, { auditMetadata } = {}) {
  const existingJob = await prisma.reportExportJob.findUnique({
    where: { id: jobId },
    include: {
      artifact: true
    }
  });

  if (!existingJob) {
    return null;
  }

  const failureAt = new Date();
  const nextRetryCount = existingJob.retryCount + 1;
  const terminalFailure = nextRetryCount >= existingJob.maxAttempts;
  const nextRetryAt = terminalFailure
    ? null
    : new Date(failureAt.getTime() + Math.max(0, existingJob.retryBackoffMs || 0));

  const failedJob = await prisma.reportExportJob.update({
    where: { id: jobId },
    data: {
      status: terminalFailure ? "FAILED" : "RETRY_WAIT",
      failedAt: failureAt,
      retryCount: nextRetryCount,
      nextRetryAt,
      activeLockKey: terminalFailure ? null : existingJob.activeLockKey,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastHeartbeatAt: failureAt,
      lastErrorCode: error?.errorCode || error?.code || "EXPORT_FAILED",
      lastErrorMessage: error?.message || "Export failed",
      progressPhase: terminalFailure ? "FAILED" : "RETRY_WAIT",
      progressPercent: Math.max(0, Math.min(99, existingJob.progressPercent || 0)),
      checkpointState: {
        ...(existingJob.checkpointState || {}),
        lastPhase: terminalFailure ? "FAILED" : "RETRY_WAIT",
        failedAt: failureAt.toISOString(),
        executionAttempt: nextRetryCount,
        resumeEligible: !terminalFailure
      },
      auditMetadata: auditMetadata || undefined
    },
    include: {
      artifact: true
    }
  });

  await createLifecycleAuditLog({
    tenantId: failedJob.tenantId,
    userId: failedJob.requestedByUserId,
    role: failedJob.requestedByRole,
    action: terminalFailure ? "REPORT_EXPORT_JOB_FAILED" : "REPORT_EXPORT_JOB_RETRY_SCHEDULED",
    entityId: failedJob.id,
    metadata: {
      reportKey: failedJob.reportKey,
      format: failedJob.exportFormat,
      snapshotReferenceId: failedJob.snapshotReferenceId,
      errorCode: failedJob.lastErrorCode,
      message: failedJob.lastErrorMessage,
      retryCount: failedJob.retryCount,
      nextRetryAt: failedJob.nextRetryAt
    }
  });

  return failedJob;
}

async function leaseNextExportJob({ workerId, queueNames = null, leaseMs = env.reportExportWorkerLeaseMs } = {}) {
  const now = new Date();

  const leaseResult = await withAnalyticsJobLock(
    {
      lockName: "report_export_queue_lease"
    },
    async () => {
      const candidates = await prisma.reportExportJob.findMany({
        where: {
          status: {
            in: ["QUEUED", "RETRY_WAIT", "PROCESSING"]
          },
          ...(Array.isArray(queueNames) && queueNames.length ? { queueName: { in: queueNames } } : {}),
          OR: [
            { status: "QUEUED" },
            { status: "RETRY_WAIT", nextRetryAt: { lte: now } },
            { status: "PROCESSING", leaseExpiresAt: { lte: now } }
          ]
        },
        include: {
          artifact: true
        },
        orderBy: [{ priority: "asc" }, { queuedAt: "asc" }, { createdAt: "asc" }]
        ,take: env.reportExportLeaseCandidateWindow
      });

      if (!candidates.length) {
        return null;
      }

      const activeTenantRows = await prisma.reportExportJob.groupBy({
        by: ["tenantId"],
        where: {
          status: "PROCESSING",
          leaseExpiresAt: { gt: now }
        },
        _count: { _all: true }
      });

      const activeTenantCounts = new Map(
        activeTenantRows.map((row) => [row.tenantId, row._count._all])
      );

      const selection = selectFairLeaseCandidate(candidates, activeTenantCounts);
      if (!selection?.job) {
        return null;
      }

      const job = selection.job;

      const processingJob = await prisma.reportExportJob.update({
        where: { id: job.id },
        data: {
          status: "PROCESSING",
          startedAt: job.startedAt || now,
          failedAt: null,
          nextRetryAt: null,
          leaseOwner: workerId || null,
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
          lastHeartbeatAt: now,
          progressPhase: job.progressPhase || "RENDERING",
          progressPercent: Math.max(5, job.progressPercent || 0),
          workerMetadata: {
            ...(job.workerMetadata || {}),
            lastLeaseFairness: {
              ...(selection.fairness || {}),
              leasedAt: now.toISOString(),
              workerId: workerId || null
            }
          }
        },
        include: {
          artifact: true
        }
      });

      await createLifecycleAuditLog({
        tenantId: processingJob.tenantId,
        userId: processingJob.requestedByUserId,
        role: processingJob.requestedByRole,
        action: "REPORT_EXPORT_JOB_LEASED",
        entityId: processingJob.id,
        metadata: {
          workerId,
          queueName: processingJob.queueName,
          retryCount: processingJob.retryCount,
          leasedAt: now.toISOString(),
          fairness: selection.fairness
        }
      });

      return processingJob;
    }
  );

  return leaseResult?.skipped ? null : leaseResult;
}

async function requeueReportExportJob(jobId, { auth, reason = "manual_retry" } = {}) {
  const existingJob = await prisma.reportExportJob.findUnique({
    where: { id: jobId },
    include: {
      artifact: true
    }
  });

  if (!existingJob) {
    return null;
  }

  const queuedAt = new Date();
  const activeLockKey = existingJob.activeLockKey || buildExportLockKey(existingJob.requestFingerprint);

  const job = await prisma.reportExportJob.update({
    where: { id: jobId },
    data: {
      status: "QUEUED",
      queuedAt,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      cancelledAt: null,
      nextRetryAt: null,
      activeLockKey,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastHeartbeatAt: null,
      progressPhase: "QUEUED",
      progressPercent: 0,
      progressCompletedUnits: 0,
      progressTotalUnits: 0,
      lastErrorCode: null,
      lastErrorMessage: null,
      workerMetadata: {
        ...(existingJob.workerMetadata || {}),
        manualRetryRequestedAt: queuedAt.toISOString(),
        manualRetryRequestedBy: auth?.userId || null,
        manualRetryReason: reason
      },
      auditMetadata: {
        ...(existingJob.auditMetadata || {}),
        manualRetryRequestedAt: queuedAt.toISOString(),
        manualRetryRequestedBy: auth?.userId || null,
        manualRetryReason: reason
      }
    },
    include: {
      artifact: true
    }
  });

  await createLifecycleAuditLog({
    tenantId: job.tenantId,
    userId: auth?.userId || job.requestedByUserId,
    role: auth?.role || job.requestedByRole,
    action: "REPORT_EXPORT_JOB_REQUEUED",
    entityId: job.id,
    metadata: {
      reason,
      retryCount: job.retryCount,
      queuedAt: queuedAt.toISOString()
    }
  });

  return job;
}

async function recordReportExportArtifactDownload({ job, viewer, source = "http_download" } = {}) {
  if (!job?.id || !job?.tenantId) {
    return;
  }

  await recordReportExportAuditEvent({
    tenantId: job.tenantId,
    userId: viewer?.userId || job.requestedByUserId || null,
    role: viewer?.role || job.requestedByRole || null,
    action: "REPORT_EXPORT_ARTIFACT_DOWNLOADED",
    entityId: job.id,
    metadata: {
      source,
      artifactId: job.artifact?.id || null,
      reportKey: job.reportKey,
      format: job.exportFormat,
      fileName: job.artifact?.fileName || null,
      byteLength: job.artifact?.byteLength || null,
      viewerRole: viewer?.role || null,
      viewerUserId: viewer?.userId || null
    }
  });
}

async function recoverStalledReportExportJobs({
  viewer,
  reason = "manual_recovery",
  limit = env.reportExportRecoveryBatchSize
} = {}) {
  const now = new Date();
  const staleHeartbeatBefore = new Date(now.getTime() - env.reportExportWorkerHeartbeatStaleMs);
  const normalizedLimit = clampPositiveInteger(limit, env.reportExportRecoveryBatchSize, 50);

  const staleJobs = await prisma.reportExportJob.findMany({
    where: {
      tenantId: viewer?.tenantId || null,
      status: "PROCESSING",
      OR: [
        { leaseExpiresAt: { lte: now } },
        { lastHeartbeatAt: { lte: staleHeartbeatBefore } }
      ]
    },
    include: { artifact: true },
    orderBy: [{ leaseExpiresAt: "asc" }, { lastHeartbeatAt: "asc" }, { queuedAt: "asc" }],
    take: normalizedLimit
  });

  const recoveredItems = [];

  for (const staleJob of staleJobs) {
    const recoveredJob = await prisma.reportExportJob.update({
      where: { id: staleJob.id },
      data: {
        status: "QUEUED",
        startedAt: null,
        failedAt: null,
        nextRetryAt: null,
        activeLockKey: staleJob.activeLockKey || buildExportLockKey(staleJob.requestFingerprint),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastHeartbeatAt: now,
        progressPhase: "RECOVERED",
        progressPercent: 0,
        progressCompletedUnits: 0,
        progressTotalUnits: 0,
        lastErrorCode: "STALE_LEASE_RECOVERED",
        lastErrorMessage: `Recovered stalled export job (${reason})`,
        workerMetadata: {
          ...(staleJob.workerMetadata || {}),
          recoveredAt: now.toISOString(),
          recoveredBy: viewer?.userId || null,
          recoveredReason: reason,
          previousLeaseOwner: staleJob.leaseOwner || null
        },
        auditMetadata: {
          ...(staleJob.auditMetadata || {}),
          recoveredAt: now.toISOString(),
          recoveredBy: viewer?.userId || null,
          recoveredReason: reason
        }
      },
      include: { artifact: true }
    });

    await recordReportExportAuditEvent({
      tenantId: recoveredJob.tenantId,
      userId: viewer?.userId || recoveredJob.requestedByUserId || null,
      role: viewer?.role || recoveredJob.requestedByRole || null,
      action: "REPORT_EXPORT_JOB_RECOVERED",
      entityId: recoveredJob.id,
      metadata: {
        reason,
        previousLeaseOwner: staleJob.leaseOwner || null,
        previousLeaseExpiresAt: staleJob.leaseExpiresAt || null,
        previousLastHeartbeatAt: staleJob.lastHeartbeatAt || null
      }
    });

    recoveredItems.push(recoveredJob);
  }

  return {
    recoveredCount: recoveredItems.length,
    items: recoveredItems.map((job) => serializeExportJob(job))
  };
}

async function queueReportExportSimulationJobs({
  tenantId,
  reportKey,
  format,
  auth,
  executionContext,
  filters = {},
  reportFactory,
  count = 1,
  queueName = "simulation",
  priority = 25,
  maxAttempts = env.reportExportWorkerMaxAttempts,
  retryBackoffMs = env.reportExportWorkerRetryBackoffMs
} = {}) {
  const normalizedCount = clampPositiveInteger(count, 1, env.reportExportSimulationMaxJobs);
  const simulationId = `simulation:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  const queuedJobs = [];
  const reportDocument = await reportFactory();

  for (let index = 0; index < normalizedCount; index += 1) {
    const requestFingerprint = sha256({
      simulationId,
      index,
      tenantId,
      reportKey,
      format,
      filters: normalizeFilters(filters),
      role: auth?.role || null,
      userId: auth?.userId || null
    });

    const prepared = await prepareQueuedExportJob({
      tenantId,
      reportKey,
      format,
      requestFingerprint,
      lockKey: `export:simulation:${simulationId}:${index}`,
      auth,
      executionContext,
      filters,
      reportFactory: () => Promise.resolve(reportDocument),
      triggerSource: "USER",
      queueName,
      priority,
      maxAttempts,
      retryBackoffMs
    });

    queuedJobs.push(prepared.job);
  }

  await recordReportExportAuditEvent({
    tenantId,
    userId: auth?.userId || null,
    role: auth?.role || null,
    action: "REPORT_EXPORT_SIMULATION_QUEUED",
    entityId: simulationId,
    metadata: {
      reportKey,
      format,
      count: normalizedCount,
      queueName,
      priority,
      jobIds: queuedJobs.map((job) => job.id)
    }
  });

  return {
    simulationId,
    count: normalizedCount,
    items: queuedJobs.map((job) => serializeExportJob(job))
  };
}

async function expireReportExportArtifact(jobId, { reason = "retention_expired" } = {}) {
  const now = new Date();
  const artifact = await prisma.reportExportArtifact.findUnique({
    where: { jobId }
  });

  if (!artifact) {
    return null;
  }

  const updatedArtifact = await prisma.reportExportArtifact.update({
    where: { jobId },
    data: {
      status: "EXPIRED",
      deletedAt: now,
      deleteReason: reason
    }
  });

  await prisma.reportExportJob.updateMany({
    where: {
      id: jobId,
      status: "COMPLETED"
    },
    data: {
      status: "EXPIRED",
      activeLockKey: null
    }
  });

  return updatedArtifact;
}

async function runCoalescedExport(lockKey, factory) {
  const existing = inflightExports.get(lockKey);
  if (existing) {
    return {
      coalesced: true,
      result: await existing
    };
  }

  const pending = Promise.resolve().then(factory);
  inflightExports.set(lockKey, pending);

  try {
    return {
      coalesced: false,
      result: await pending
    };
  } finally {
    inflightExports.delete(lockKey);
  }
}

export {
  buildExportLockKey,
  buildExportRequestFingerprint,
  buildScopeMetadataFromExecutionContext,
  expireReportExportArtifact,
  findActiveExportJob,
  getReportExportJobForViewer,
  getReportExportOperationsDashboard,
  getReportExportOperationalSummary,
  heartbeatExportJob,
  leaseNextExportJob,
  listReportExportJobs,
  markExportJobCompleted,
  markExportJobFailed,
  markExportJobProcessing,
  normalizeExecutionContext,
  prepareQueuedExportJob,
  writeExportJobCheckpoint,
  queueReportExportSimulationJobs,
  recordReportExportArtifactDownload,
  recordReportExportAuditEvent,
  recoverStalledReportExportJobs,
  requeueReportExportJob,
  runCoalescedExport,
  serializeExportJob,
  sha256,
  stableSerialize,
  updateExportJobProgress
};