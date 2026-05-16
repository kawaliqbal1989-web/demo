import { constants as fsConstants, promises as fs } from "node:fs";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { recordAudit } from "../utils/audit.js";
import {
  getReportExportOperationalSummary,
  getReportExportOperationsDashboard,
  requeueReportExportJob,
  recoverStalledReportExportJobs,
  serializeExportJob,
  sha256
} from "./report-export-job.service.js";
import { reconcileReportExportState } from "./report-export-certification.service.js";
import { runReportExportCleanupPass, runReportExportWorkerPass } from "./report-export-runner.service.js";

const DEPLOYMENT_ENTITY_TYPE = "DEPLOYMENT_RELEASE";
const BACKUP_ENTITY_TYPE = "BACKUP_SNAPSHOT";
const RECOVERY_ENTITY_TYPE = "DISASTER_RECOVERY_RUN";
const FAILOVER_ENTITY_TYPE = "PRODUCTION_FAILOVER_CERTIFICATION";

const DEPLOYMENT_CHECKPOINTS = Object.freeze([
  "STAGED",
  "PRECHECKS_PASSED",
  "ROLLOUT_STARTED",
  "ROLLOUT_VERIFIED",
  "COMPLETED",
  "ROLLBACK_STARTED",
  "ROLLED_BACK"
]);

const DEPLOYMENT_TRANSITIONS = Object.freeze({
  STAGED: ["PRECHECKS_PASSED"],
  PRECHECKS_PASSED: ["ROLLOUT_STARTED"],
  ROLLOUT_STARTED: ["ROLLOUT_VERIFIED", "ROLLBACK_STARTED"],
  ROLLOUT_VERIFIED: ["COMPLETED", "ROLLBACK_STARTED"],
  COMPLETED: ["ROLLBACK_STARTED"],
  ROLLBACK_STARTED: ["ROLLED_BACK"],
  ROLLED_BACK: []
});

const DEPLOYMENT_ACTIONS = Object.freeze({
  STAGED: "DEPLOYMENT_RELEASE_STAGED",
  PRECHECKS_PASSED: "DEPLOYMENT_RELEASE_PRECHECKS_PASSED",
  ROLLOUT_STARTED: "DEPLOYMENT_RELEASE_ROLLOUT_STARTED",
  ROLLOUT_VERIFIED: "DEPLOYMENT_RELEASE_ROLLOUT_VERIFIED",
  COMPLETED: "DEPLOYMENT_RELEASE_COMPLETED",
  ROLLBACK_STARTED: "DEPLOYMENT_RELEASE_ROLLBACK_STARTED",
  ROLLED_BACK: "DEPLOYMENT_RELEASE_ROLLED_BACK"
});

const ALLOWED_ENVIRONMENTS = new Set(["development", "staging", "production"]);

function clampPositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function normalizeString(value, fallback = null) {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value).trim();
  return normalized || fallback;
}

function normalizeEnvironment(value) {
  const normalized = normalizeString(value, "production")?.toLowerCase() || "production";
  if (!ALLOWED_ENVIRONMENTS.has(normalized)) {
    const error = new Error("Unsupported environment");
    error.statusCode = 400;
    error.errorCode = "DEPLOYMENT_ENVIRONMENT_INVALID";
    throw error;
  }

  return normalized;
}

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

function slugify(value, fallback = "item") {
  return normalizeString(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function averageNumbers(values = []) {
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

function buildSecurityDiagnostics() {
  const accessSecretLength = env.jwtAccessSecret.length;
  const refreshSecretLength = env.jwtRefreshSecret.length;
  const explicitCorsOrigins = env.corsAllowedOrigins.filter((origin) => origin && origin !== "*");
  const checks = [
    {
      key: "distinctJwtSecrets",
      label: "JWT secrets are distinct",
      passed: env.jwtAccessSecret !== env.jwtRefreshSecret,
      severity: "critical"
    },
    {
      key: "accessSecretLength",
      label: `Access secret length >= ${env.productionSecurityMinSecretLength}`,
      passed: !env.isProduction || accessSecretLength >= env.productionSecurityMinSecretLength,
      severity: "critical"
    },
    {
      key: "refreshSecretLength",
      label: `Refresh secret length >= ${env.productionSecurityMinSecretLength}`,
      passed: !env.isProduction || refreshSecretLength >= env.productionSecurityMinSecretLength,
      severity: "critical"
    },
    {
      key: "corsOriginsExplicit",
      label: "Production CORS origins are explicit",
      passed: !env.isProduction || (explicitCorsOrigins.length > 0 && !env.corsAllowedOrigins.includes("*")),
      severity: "warning"
    },
    {
      key: "workerEnabled",
      label: "Export worker is enabled",
      passed: env.reportExportWorkerEnabled,
      severity: "warning"
    },
    {
      key: "cleanupEnabled",
      label: "Export cleanup is enabled",
      passed: env.reportExportCleanupEnabled,
      severity: "warning"
    },
    {
      key: "schedulerEnabled",
      label: "Export scheduler is enabled",
      passed: env.reportExportSchedulerEnabled,
      severity: "info"
    }
  ];

  let score = 100;
  for (const check of checks) {
    if (check.passed) {
      continue;
    }
    if (check.severity === "critical") {
      score -= 20;
      continue;
    }
    if (check.severity === "warning") {
      score -= 10;
      continue;
    }
    score -= 5;
  }

  const recommendations = checks
    .filter((check) => !check.passed)
    .map((check) => {
      if (check.key === "distinctJwtSecrets") {
        return "Use different access and refresh JWT secrets before production rollout.";
      }
      if (check.key === "accessSecretLength" || check.key === "refreshSecretLength") {
        return `Increase JWT secret length to at least ${env.productionSecurityMinSecretLength} characters.`;
      }
      if (check.key === "corsOriginsExplicit") {
        return "Set explicit CORS_ALLOWED_ORIGINS values for production instead of wildcard access.";
      }
      if (check.key === "workerEnabled") {
        return "Enable REPORT_EXPORT_WORKER_ENABLED to preserve export continuity during production rollout.";
      }
      if (check.key === "cleanupEnabled") {
        return "Enable REPORT_EXPORT_CLEANUP_ENABLED so expired artifacts and stale files are governed automatically.";
      }
      if (check.key === "schedulerEnabled") {
        return "Enable REPORT_EXPORT_SCHEDULER_ENABLED if scheduled exports are part of the release baseline.";
      }
      return check.label;
    });

  return {
    score: Math.max(0, score),
    status: score >= 90 ? "READY" : score >= 75 ? "REVIEW" : "BLOCKED",
    checks,
    recommendations,
    config: {
      nodeEnv: env.nodeEnv,
      isProduction: env.isProduction,
      corsOriginsConfigured: explicitCorsOrigins.length,
      requestBodyLimit: env.requestBodyLimit,
      accessSecretLength,
      refreshSecretLength,
      workerEnabled: env.reportExportWorkerEnabled,
      cleanupEnabled: env.reportExportCleanupEnabled,
      schedulerEnabled: env.reportExportSchedulerEnabled
    }
  };
}

function buildReleaseEntityId(metadata = {}) {
  const environment = normalizeEnvironment(metadata.environment);
  const versionTag = normalizeString(metadata.versionTag, "unversioned");
  const buildId = normalizeString(metadata.buildId) || sha256({
    versionTag,
    commitSha: normalizeString(metadata.commitSha),
    rolloutStrategy: normalizeString(metadata.rolloutStrategy, "rolling")
  }).slice(0, 12);

  return `release:${environment}:${slugify(versionTag, "release")}:${slugify(buildId, "build")}`;
}

function buildBackupEntityId(metadata = {}) {
  const environment = normalizeEnvironment(metadata.environment);
  const snapshotLabel = normalizeString(metadata.snapshotLabel, "snapshot");
  const signature = sha256({
    snapshotLabel,
    backupType: normalizeString(metadata.backupType, "FULL"),
    snapshotReference: normalizeString(metadata.database?.snapshotReference)
  }).slice(0, 12);

  return `backup:${environment}:${slugify(snapshotLabel, "snapshot")}:${signature}`;
}

function buildRecoveryEntityId(prefix) {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function serializeAuditEntry(entry) {
  return {
    id: entry.id,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    role: entry.role,
    userId: entry.userId,
    metadata: entry.metadata || null,
    createdAt: entry.createdAt
  };
}

function summarizeCounts(items = [], field = "status") {
  return items.reduce((accumulator, item) => {
    const key = item?.[field] || "UNKNOWN";
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
}

function getCheckpointFromAction(action) {
  return Object.entries(DEPLOYMENT_ACTIONS).find(([, candidate]) => candidate === action)?.[0] || null;
}

function buildDeploymentReadiness({ security, operationalSummary, checkpoint, environment }) {
  const queuedBreaches = operationalSummary?.queuedSlaBreaches || 0;
  const processingBreaches = operationalSummary?.processingSlaBreaches || 0;
  const retryWaitCount = operationalSummary?.retryWaitCount || 0;
  const ready = security.score >= 75 && queuedBreaches === 0 && processingBreaches === 0;

  return {
    environment,
    checkpoint,
    deploymentReady: ready,
    securityScore: security.score,
    queuedBreaches,
    processingBreaches,
    retryWaitCount,
    checkedAt: new Date().toISOString()
  };
}

async function recordGovernanceAuditEvent({
  tenantId,
  userId,
  role,
  action,
  entityType,
  entityId,
  metadata
}) {
  await recordAudit({
    tenantId,
    userId,
    role,
    action,
    entityType,
    entityId,
    metadata
  }, { strict: true });
}

async function listAuditLogs({ tenantId, entityType, entityId = null, windowStart = null, limit = 100 }) {
  return prisma.auditLog.findMany({
    where: {
      tenantId,
      entityType,
      ...(entityId ? { entityId } : {}),
      ...(windowStart ? { createdAt: { gte: windowStart } } : {})
    },
    orderBy: [{ createdAt: "asc" }],
    take: limit
  });
}

function buildReleaseSummary(entries = []) {
  if (!entries.length) {
    return null;
  }

  const stageEntry = entries.find((entry) => entry.action === DEPLOYMENT_ACTIONS.STAGED) || entries[0];
  const latestEntry = entries[entries.length - 1];
  const stageMetadata = stageEntry.metadata || {};
  const latestMetadata = latestEntry.metadata || {};

  return {
    releaseId: stageEntry.entityId,
    releaseKey: stageMetadata.releaseKey || null,
    releaseLabel: stageMetadata.releaseLabel || null,
    versionTag: stageMetadata.versionTag || null,
    buildId: stageMetadata.buildId || null,
    commitSha: stageMetadata.commitSha || null,
    rollbackVersionTag: stageMetadata.rollbackVersionTag || null,
    environment: stageMetadata.environment || "production",
    rolloutStrategy: stageMetadata.rolloutStrategy || "rolling",
    currentCheckpoint: getCheckpointFromAction(latestEntry.action) || latestMetadata.checkpoint || "STAGED",
    stagedAt: stageEntry.createdAt,
    updatedAt: latestEntry.createdAt,
    healthValidation: latestMetadata.healthValidation || stageMetadata.healthValidation || null,
    verification: latestMetadata.verification || null,
    history: entries.map((entry) => ({
      action: entry.action,
      checkpoint: getCheckpointFromAction(entry.action),
      role: entry.role,
      userId: entry.userId,
      metadata: entry.metadata || null,
      createdAt: entry.createdAt
    }))
  };
}

function buildBackupSummary(entries = []) {
  if (!entries.length) {
    return null;
  }

  const recordedEntry = entries.find((entry) => entry.action === "BACKUP_SNAPSHOT_RECORDED") || entries[0];
  const validationEntry = [...entries].reverse().find((entry) => entry.action === "BACKUP_RESTORE_VALIDATED") || null;
  const metadata = recordedEntry.metadata || {};

  return {
    backupId: recordedEntry.entityId,
    backupKey: metadata.backupKey || null,
    snapshotLabel: metadata.snapshotLabel || null,
    environment: metadata.environment || "production",
    backupType: metadata.backupType || "FULL",
    retentionDays: metadata.retentionDays || env.productionBackupRetentionDays,
    retentionUntil: metadata.retentionUntil || null,
    createdAt: recordedEntry.createdAt,
    database: metadata.database || null,
    artifacts: metadata.artifacts || null,
    integrity: metadata.integrity || null,
    restoreValidation: validationEntry?.metadata?.restoreValidation || null,
    history: entries.map((entry) => ({
      action: entry.action,
      metadata: entry.metadata || null,
      role: entry.role,
      userId: entry.userId,
      createdAt: entry.createdAt
    }))
  };
}

function buildRecoverySummary(entries = []) {
  if (!entries.length) {
    return null;
  }

  const latestEntry = entries[entries.length - 1];
  const metadata = latestEntry.metadata || {};
  return {
    runId: latestEntry.entityId,
    dryRun: Boolean(metadata.dryRun),
    mode: metadata.mode || "recovery",
    continuityScore: metadata.continuityScore || 0,
    recommendations: metadata.recommendations || [],
    staleJobsDetected: metadata.staleJobsDetected || 0,
    staleJobsRecovered: metadata.staleJobsRecovered || 0,
    replayCandidates: metadata.replayCandidates || 0,
    replayQueued: metadata.replayQueued || 0,
    missingArtifactFiles: metadata.missingArtifactFiles || 0,
    createdAt: latestEntry.createdAt,
    history: entries.map((entry) => ({
      action: entry.action,
      metadata: entry.metadata || null,
      role: entry.role,
      userId: entry.userId,
      createdAt: entry.createdAt
    }))
  };
}

function buildFailoverSummary(entries = []) {
  if (!entries.length) {
    return null;
  }

  const latestEntry = entries[entries.length - 1];
  const metadata = latestEntry.metadata || {};
  return {
    runId: latestEntry.entityId,
    passed: Boolean(metadata.passed),
    dryRun: Boolean(metadata.dryRun),
    continuityScore: metadata.continuityScore || 0,
    interruptedJobs: metadata.interruptedJobs || 0,
    recoverableJobs: metadata.recoverableJobs || 0,
    missingArtifactFiles: metadata.missingArtifactFiles || 0,
    rollbackReady: Boolean(metadata.rollbackReady),
    recommendations: metadata.recommendations || [],
    createdAt: latestEntry.createdAt,
    history: entries.map((entry) => ({
      action: entry.action,
      metadata: entry.metadata || null,
      role: entry.role,
      userId: entry.userId,
      createdAt: entry.createdAt
    }))
  };
}

async function loadEntitySummaries({ tenantId, entityType, windowStart, limit, summaryBuilder }) {
  const entries = await listAuditLogs({ tenantId, entityType, windowStart, limit: limit * 10 });
  const grouped = new Map();
  for (const entry of entries) {
    const key = entry.entityId || entry.id;
    const current = grouped.get(key) || [];
    current.push(entry);
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .map((group) => summaryBuilder(group))
    .filter(Boolean)
    .sort((left, right) => new Date(right.updatedAt || right.createdAt) - new Date(left.updatedAt || left.createdAt))
    .slice(0, limit);
}

async function loadReleaseForMutation({ tenantId, releaseId }) {
  const entries = await listAuditLogs({ tenantId, entityType: DEPLOYMENT_ENTITY_TYPE, entityId: releaseId, limit: 50 });
  if (!entries.length) {
    const error = new Error("Deployment release not found");
    error.statusCode = 404;
    error.errorCode = "DEPLOYMENT_RELEASE_NOT_FOUND";
    throw error;
  }
  return entries;
}

async function stageDeploymentRelease({ viewer, input = {} }) {
  const tenantId = viewer?.tenantId || null;
  const environment = normalizeEnvironment(input.environment);
  const versionTag = normalizeString(input.versionTag);
  if (!versionTag) {
    const error = new Error("versionTag is required");
    error.statusCode = 400;
    error.errorCode = "DEPLOYMENT_VERSION_REQUIRED";
    throw error;
  }

  const buildId = normalizeString(input.buildId) || sha256({ versionTag, commitSha: normalizeString(input.commitSha) }).slice(0, 12);
  const releaseId = normalizeString(input.releaseId) || buildReleaseEntityId({
    environment,
    versionTag,
    buildId,
    commitSha: input.commitSha,
    rolloutStrategy: input.rolloutStrategy
  });
  const existing = await prisma.auditLog.findFirst({
    where: {
      tenantId,
      entityType: DEPLOYMENT_ENTITY_TYPE,
      entityId: releaseId,
      action: DEPLOYMENT_ACTIONS.STAGED
    }
  });

  if (existing) {
    const error = new Error("Deployment release already staged");
    error.statusCode = 409;
    error.errorCode = "DEPLOYMENT_RELEASE_EXISTS";
    throw error;
  }

  const security = buildSecurityDiagnostics();
  const operationalSummary = await getReportExportOperationalSummary({ viewer });
  const healthValidation = buildDeploymentReadiness({
    security,
    operationalSummary,
    checkpoint: "STAGED",
    environment
  });

  const metadata = {
    releaseId,
    releaseKey: sha256({ environment, versionTag, buildId, commitSha: normalizeString(input.commitSha) }),
    releaseLabel: normalizeString(input.releaseLabel, `${environment}:${versionTag}`),
    environment,
    versionTag,
    buildId,
    commitSha: normalizeString(input.commitSha),
    rolloutStrategy: normalizeString(input.rolloutStrategy, "rolling"),
    rollbackVersionTag: normalizeString(input.rollbackVersionTag),
    checkpoint: "STAGED",
    deploymentNotes: normalizeString(input.deploymentNotes),
    verificationWindowMinutes: clampPositiveInteger(input.verificationWindowMinutes, 30, 240),
    healthValidation,
    requestedBy: {
      userId: viewer?.userId || null,
      role: viewer?.role || null
    }
  };

  await recordGovernanceAuditEvent({
    tenantId,
    userId: viewer?.userId,
    role: viewer?.role,
    action: DEPLOYMENT_ACTIONS.STAGED,
    entityType: DEPLOYMENT_ENTITY_TYPE,
    entityId: releaseId,
    metadata
  });

  return buildReleaseSummary(await loadReleaseForMutation({ tenantId, releaseId }));
}

async function advanceDeploymentRelease({ viewer, releaseId, input = {} }) {
  const tenantId = viewer?.tenantId || null;
  const targetCheckpoint = normalizeString(input.checkpoint)?.toUpperCase();
  if (!DEPLOYMENT_CHECKPOINTS.includes(targetCheckpoint)) {
    const error = new Error("Invalid deployment checkpoint");
    error.statusCode = 400;
    error.errorCode = "DEPLOYMENT_CHECKPOINT_INVALID";
    throw error;
  }

  const entries = await loadReleaseForMutation({ tenantId, releaseId });
  const release = buildReleaseSummary(entries);
  const currentCheckpoint = release?.currentCheckpoint || "STAGED";
  if (!DEPLOYMENT_TRANSITIONS[currentCheckpoint]?.includes(targetCheckpoint)) {
    const error = new Error(`Cannot transition deployment from ${currentCheckpoint} to ${targetCheckpoint}`);
    error.statusCode = 409;
    error.errorCode = "DEPLOYMENT_CHECKPOINT_CONFLICT";
    throw error;
  }

  const security = buildSecurityDiagnostics();
  const operationalSummary = await getReportExportOperationalSummary({ viewer });
  const healthValidation = buildDeploymentReadiness({
    security,
    operationalSummary,
    checkpoint: targetCheckpoint,
    environment: release.environment
  });

  if (env.isProduction && targetCheckpoint === "COMPLETED" && !healthValidation.deploymentReady && input.force !== true) {
    const error = new Error("Deployment health validation failed for the requested checkpoint");
    error.statusCode = 409;
    error.errorCode = "DEPLOYMENT_HEALTH_VALIDATION_FAILED";
    throw error;
  }

  await recordGovernanceAuditEvent({
    tenantId,
    userId: viewer?.userId,
    role: viewer?.role,
    action: DEPLOYMENT_ACTIONS[targetCheckpoint],
    entityType: DEPLOYMENT_ENTITY_TYPE,
    entityId: releaseId,
    metadata: {
      ...entries[0].metadata,
      checkpoint: targetCheckpoint,
      transitionNotes: normalizeString(input.transitionNotes),
      verification: {
        deploymentReady: healthValidation.deploymentReady,
        securityScore: security.score,
        queuedBreaches: operationalSummary.queuedSlaBreaches,
        processingBreaches: operationalSummary.processingSlaBreaches,
        retryWaitCount: operationalSummary.retryWaitCount
      },
      healthValidation
    }
  });

  return buildReleaseSummary(await loadReleaseForMutation({ tenantId, releaseId }));
}

async function rollbackDeploymentRelease({ viewer, releaseId, input = {} }) {
  const tenantId = viewer?.tenantId || null;
  const entries = await loadReleaseForMutation({ tenantId, releaseId });
  const release = buildReleaseSummary(entries);
  if (!["ROLLOUT_STARTED", "ROLLOUT_VERIFIED", "COMPLETED"].includes(release.currentCheckpoint)) {
    const error = new Error("Deployment release is not rollback eligible");
    error.statusCode = 409;
    error.errorCode = "DEPLOYMENT_ROLLBACK_NOT_ALLOWED";
    throw error;
  }

  const rollbackTargetVersion = normalizeString(input.rollbackVersionTag, release.rollbackVersionTag);
  if (!rollbackTargetVersion) {
    const error = new Error("rollbackVersionTag is required to orchestrate rollback");
    error.statusCode = 400;
    error.errorCode = "DEPLOYMENT_ROLLBACK_VERSION_REQUIRED";
    throw error;
  }

  const baseMetadata = entries[0].metadata || {};
  await recordGovernanceAuditEvent({
    tenantId,
    userId: viewer?.userId,
    role: viewer?.role,
    action: DEPLOYMENT_ACTIONS.ROLLBACK_STARTED,
    entityType: DEPLOYMENT_ENTITY_TYPE,
    entityId: releaseId,
    metadata: {
      ...baseMetadata,
      checkpoint: "ROLLBACK_STARTED",
      rollbackTargetVersion,
      rollbackReason: normalizeString(input.rollbackReason, "manual_rollback")
    }
  });

  await recordGovernanceAuditEvent({
    tenantId,
    userId: viewer?.userId,
    role: viewer?.role,
    action: DEPLOYMENT_ACTIONS.ROLLED_BACK,
    entityType: DEPLOYMENT_ENTITY_TYPE,
    entityId: releaseId,
    metadata: {
      ...baseMetadata,
      checkpoint: "ROLLED_BACK",
      rollbackTargetVersion,
      rollbackReason: normalizeString(input.rollbackReason, "manual_rollback"),
      rollbackCompletedAt: new Date().toISOString()
    }
  });

  return buildReleaseSummary(await loadReleaseForMutation({ tenantId, releaseId }));
}

async function recordBackupSnapshot({ viewer, input = {} }) {
  const tenantId = viewer?.tenantId || null;
  const environment = normalizeEnvironment(input.environment);
  const snapshotLabel = normalizeString(input.snapshotLabel);
  if (!snapshotLabel) {
    const error = new Error("snapshotLabel is required");
    error.statusCode = 400;
    error.errorCode = "BACKUP_SNAPSHOT_LABEL_REQUIRED";
    throw error;
  }

  const retentionDays = clampPositiveInteger(input.retentionDays, env.productionBackupRetentionDays, 365);
  const retentionUntil = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
  const includeArtifacts = input.includeArtifacts !== false;
  const artifactCount = includeArtifacts
    ? await prisma.reportExportArtifact.count({
      where: {
        tenantId,
        status: "AVAILABLE"
      }
    })
    : 0;

  const sampleArtifacts = includeArtifacts
    ? await prisma.reportExportArtifact.findMany({
      where: {
        tenantId,
        status: "AVAILABLE"
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 5,
      select: {
        id: true,
        jobId: true,
        filePath: true,
        reportKey: true,
        exportFormat: true,
        byteLength: true,
        expiresAt: true
      }
    })
    : [];

  const integrityIssues = [];
  if (!normalizeString(input.database?.snapshotReference)) {
    integrityIssues.push("Database snapshot reference is missing.");
  }
  if (!normalizeString(input.database?.checksum)) {
    integrityIssues.push("Database checksum is missing.");
  }
  const metadata = {
    backupKey: sha256({
      environment,
      snapshotLabel,
      snapshotReference: normalizeString(input.database?.snapshotReference),
      artifactCount
    }),
    snapshotLabel,
    environment,
    backupType: normalizeString(input.backupType, "FULL").toUpperCase(),
    retentionDays,
    retentionUntil: retentionUntil.toISOString(),
    database: {
      snapshotReference: normalizeString(input.database?.snapshotReference),
      checksum: normalizeString(input.database?.checksum),
      rowEstimate: Number.isFinite(Number(input.database?.rowEstimate)) ? Number(input.database.rowEstimate) : null,
      capturedAt: normalizeString(input.database?.capturedAt, new Date().toISOString())
    },
    artifacts: {
      tracked: includeArtifacts,
      availableCount: artifactCount,
      sampleArtifacts
    },
    integrity: {
      passed: integrityIssues.length === 0,
      issues: integrityIssues
    }
  };

  const backupId = normalizeString(input.backupId) || buildBackupEntityId({
    environment,
    snapshotLabel,
    backupType: metadata.backupType,
    database: metadata.database
  });

  await recordGovernanceAuditEvent({
    tenantId,
    userId: viewer?.userId,
    role: viewer?.role,
    action: "BACKUP_SNAPSHOT_RECORDED",
    entityType: BACKUP_ENTITY_TYPE,
    entityId: backupId,
    metadata
  });

  return buildBackupSummary(await listAuditLogs({ tenantId, entityType: BACKUP_ENTITY_TYPE, entityId: backupId, limit: 25 }));
}

async function validateBackupRestoreReadiness({ viewer, input = {} }) {
  const tenantId = viewer?.tenantId || null;
  const backupId = normalizeString(input.backupId);
  let entries = [];

  if (backupId) {
    entries = await listAuditLogs({ tenantId, entityType: BACKUP_ENTITY_TYPE, entityId: backupId, limit: 25 });
  } else {
    const recentBackups = await loadEntitySummaries({
      tenantId,
      entityType: BACKUP_ENTITY_TYPE,
      windowStart: new Date(Date.now() - env.productionGovernanceWindowHours * 60 * 60 * 1000),
      limit: 1,
      summaryBuilder: buildBackupSummary
    });
    if (recentBackups[0]?.backupId) {
      entries = await listAuditLogs({ tenantId, entityType: BACKUP_ENTITY_TYPE, entityId: recentBackups[0].backupId, limit: 25 });
    }
  }

  if (!entries.length) {
    const error = new Error("Backup snapshot not found");
    error.statusCode = 404;
    error.errorCode = "BACKUP_SNAPSHOT_NOT_FOUND";
    throw error;
  }

  const backup = buildBackupSummary(entries);
  const sampleArtifacts = backup.artifacts?.sampleArtifacts || [];
  const missingFiles = [];
  for (const artifact of sampleArtifacts) {
    try {
      await fs.access(artifact.filePath, fsConstants.F_OK);
    } catch {
      missingFiles.push({
        artifactId: artifact.id,
        jobId: artifact.jobId,
        filePath: artifact.filePath
      });
    }
  }

  const issues = [];
  if (!backup.database?.snapshotReference) {
    issues.push("Database snapshot reference is missing.");
  }
  if (!backup.database?.checksum) {
    issues.push("Database checksum is missing.");
  }
  if (backup.retentionUntil && new Date(backup.retentionUntil) <= new Date()) {
    issues.push("Backup retention window has expired.");
  }
  if (missingFiles.length) {
    issues.push("One or more tracked artifact files are missing from disk.");
  }

  const restoreValidation = {
    passed: issues.length === 0,
    score: Math.max(0, 100 - issues.length * 25),
    issues,
    missingFiles,
    validatedAt: new Date().toISOString(),
    dryRun: input.dryRun !== false
  };

  await recordGovernanceAuditEvent({
    tenantId,
    userId: viewer?.userId,
    role: viewer?.role,
    action: "BACKUP_RESTORE_VALIDATED",
    entityType: BACKUP_ENTITY_TYPE,
    entityId: backup.backupId,
    metadata: {
      ...entries[0].metadata,
      restoreValidation
    }
  });

  return buildBackupSummary(await listAuditLogs({ tenantId, entityType: BACKUP_ENTITY_TYPE, entityId: backup.backupId, limit: 25 }));
}

async function listStaleProcessingJobs({ tenantId, limit }) {
  const now = new Date();
  const staleHeartbeatBefore = new Date(now.getTime() - env.reportExportWorkerHeartbeatStaleMs);
  return prisma.reportExportJob.findMany({
    where: {
      tenantId,
      status: "PROCESSING",
      OR: [
        { leaseExpiresAt: { lte: now } },
        { lastHeartbeatAt: { lte: staleHeartbeatBefore } }
      ]
    },
    include: { artifact: true },
    orderBy: [{ leaseExpiresAt: "asc" }, { lastHeartbeatAt: "asc" }, { queuedAt: "asc" }],
    take: limit
  });
}

async function listReplayCandidates({ tenantId, limit }) {
  return prisma.reportExportJob.findMany({
    where: {
      tenantId,
      status: { in: ["FAILED", "EXPIRED", "CANCELLED"] }
    },
    include: { artifact: true },
    orderBy: [{ updatedAt: "desc" }],
    take: limit
  });
}

function buildRecoveryRecommendations({ staleJobs, replayCandidates, reconciliation }) {
  const recommendations = [];
  if (staleJobs.length) {
    recommendations.push("Recover stale PROCESSING jobs before the next deployment window.");
  }
  if (reconciliation.missingArtifactFiles?.length) {
    recommendations.push("Expire or regenerate missing artifact files before production certification.");
  }
  if (replayCandidates.length) {
    recommendations.push("Review replay candidates and requeue the safe subset before declaring recovery complete.");
  }
  if (!recommendations.length) {
    recommendations.push("Recovery posture is stable for the current export backlog.");
  }
  return recommendations;
}

async function runProductionRecoveryDrill({ viewer, input = {} }) {
  const tenantId = viewer?.tenantId || null;
  const dryRun = input.dryRun !== false;
  const replayLimit = clampPositiveInteger(input.replayLimit, env.productionRecoveryReplayLimit, 25);
  const staleLimit = clampPositiveInteger(input.limit, env.reportExportRecoveryBatchSize, 50);
  const staleJobs = await listStaleProcessingJobs({ tenantId, limit: staleLimit });
  const replayCandidates = await listReplayCandidates({ tenantId, limit: replayLimit });
  const reconciliation = await reconcileReportExportState({
    viewer,
    dryRun: true,
    limit: staleLimit
  });

  let recovered = { recoveredCount: 0, items: [] };
  let replayQueued = [];
  let workerSummary = null;
  let cleanupSummary = null;

  if (!dryRun) {
    recovered = await recoverStalledReportExportJobs({
      viewer,
      reason: normalizeString(input.reason, "production_recovery_drill"),
      limit: staleLimit
    });

    for (const job of replayCandidates) {
      const requeued = await requeueReportExportJob(job.id, {
        auth: viewer,
        reason: "production_recovery_drill"
      });
      replayQueued.push(serializeExportJob(requeued));
    }

    if (input.executeWorkerPass !== false) {
      workerSummary = await runReportExportWorkerPass({
        limit: Math.max(replayQueued.length, recovered.recoveredCount, 1)
      });
    }
    if (input.executeCleanup !== false) {
      cleanupSummary = await runReportExportCleanupPass();
    }
  }

  const unresolvedIssues = staleJobs.length + replayCandidates.length + reconciliation.missingArtifactFiles.length + reconciliation.completedWithoutArtifact.length;
  const continuityScore = Math.max(0, 100 - unresolvedIssues * 10);
  const summary = {
    runId: buildRecoveryEntityId("drill"),
    dryRun,
    mode: "recovery-drill",
    continuityScore,
    staleJobsDetected: staleJobs.length,
    staleJobsRecovered: recovered.recoveredCount || 0,
    replayCandidates: replayCandidates.length,
    replayQueued: replayQueued.length,
    missingArtifactFiles: reconciliation.missingArtifactFiles.length,
    completedWithoutArtifact: reconciliation.completedWithoutArtifact.length,
    recommendations: buildRecoveryRecommendations({ staleJobs, replayCandidates, reconciliation }),
    staleJobs: staleJobs.map((job) => serializeExportJob(job)),
    replayQueue: replayQueued,
    workerSummary,
    cleanupSummary,
    reconciliation
  };

  await recordGovernanceAuditEvent({
    tenantId,
    userId: viewer?.userId,
    role: viewer?.role,
    action: "DISASTER_RECOVERY_DRILL_EXECUTED",
    entityType: RECOVERY_ENTITY_TYPE,
    entityId: summary.runId,
    metadata: {
      dryRun,
      mode: summary.mode,
      continuityScore,
      staleJobsDetected: summary.staleJobsDetected,
      staleJobsRecovered: summary.staleJobsRecovered,
      replayCandidates: summary.replayCandidates,
      replayQueued: summary.replayQueued,
      missingArtifactFiles: summary.missingArtifactFiles,
      recommendations: summary.recommendations
    }
  });

  return summary;
}

async function runProductionFailoverCertification({ viewer, input = {} }) {
  const tenantId = viewer?.tenantId || null;
  const dryRun = input.dryRun !== false;
  const limit = clampPositiveInteger(input.limit, env.reportExportRecoveryBatchSize, 50);
  const interruptedJobs = await prisma.reportExportJob.findMany({
    where: {
      tenantId,
      status: { in: ["QUEUED", "PROCESSING", "RETRY_WAIT"] }
    },
    include: { artifact: true },
    orderBy: [{ updatedAt: "desc" }],
    take: limit
  });
  const recoverableJobs = interruptedJobs.filter((job) => Boolean(job.checkpointState?.lastPhase));
  const reconciliation = await reconcileReportExportState({ viewer, dryRun: true, limit });
  const latestReleases = await loadEntitySummaries({
    tenantId,
    entityType: DEPLOYMENT_ENTITY_TYPE,
    windowStart: new Date(Date.now() - env.productionGovernanceWindowHours * 60 * 60 * 1000),
    limit: 5,
    summaryBuilder: buildReleaseSummary
  });
  const rollbackReady = latestReleases.some((release) => release.rollbackVersionTag && release.currentCheckpoint === "COMPLETED");

  let recovered = { recoveredCount: 0, items: [] };
  if (!dryRun && input.executeRecovery !== false) {
    recovered = await recoverStalledReportExportJobs({
      viewer,
      reason: "production_failover_certification",
      limit
    });
  }

  const penalties =
    reconciliation.missingArtifactFiles.length * 15
    + (interruptedJobs.length - recoverableJobs.length) * 10
    + (rollbackReady ? 0 : 15)
    + (dryRun ? 0 : Math.max(0, interruptedJobs.length - recovered.recoveredCount) * 5);
  const continuityScore = Math.max(0, 100 - penalties);
  const passed = continuityScore >= env.productionFailoverPassScore && reconciliation.missingArtifactFiles.length === 0 && rollbackReady;
  const recommendations = [];

  if (!rollbackReady) {
    recommendations.push("Complete at least one release with rollbackVersionTag metadata before failover certification." );
  }
  if (interruptedJobs.length > recoverableJobs.length) {
    recommendations.push("Ensure every in-flight export writes checkpoint metadata before certification." );
  }
  if (reconciliation.missingArtifactFiles.length) {
    recommendations.push("Repair artifact integrity gaps before declaring failover continuity." );
  }
  if (!recommendations.length) {
    recommendations.push("Failover continuity is within the configured certification threshold." );
  }

  const summary = {
    runId: buildRecoveryEntityId("failover"),
    dryRun,
    passed,
    continuityScore,
    interruptedJobs: interruptedJobs.length,
    recoverableJobs: recoverableJobs.length,
    recoveredCount: recovered.recoveredCount || 0,
    missingArtifactFiles: reconciliation.missingArtifactFiles.length,
    rollbackReady,
    recommendations,
    interruptedItems: interruptedJobs.map((job) => serializeExportJob(job)),
    reconciliation
  };

  await recordGovernanceAuditEvent({
    tenantId,
    userId: viewer?.userId,
    role: viewer?.role,
    action: "PRODUCTION_FAILOVER_CERTIFIED",
    entityType: FAILOVER_ENTITY_TYPE,
    entityId: summary.runId,
    metadata: {
      dryRun,
      passed,
      continuityScore,
      interruptedJobs: summary.interruptedJobs,
      recoverableJobs: summary.recoverableJobs,
      missingArtifactFiles: summary.missingArtifactFiles,
      rollbackReady,
      recommendations
    }
  });

  return summary;
}

async function getProductionRuntimeDiagnostics({ viewer, windowHours = env.productionGovernanceWindowHours, recentLimit = env.productionGovernanceRecentLimit } = {}) {
  const tenantId = viewer?.tenantId || null;
  const now = new Date();
  const normalizedWindowHours = clampPositiveInteger(windowHours, env.productionGovernanceWindowHours, 24 * 30);
  const normalizedRecentLimit = clampPositiveInteger(recentLimit, env.productionGovernanceRecentLimit, 25);
  const windowStart = new Date(now.getTime() - normalizedWindowHours * 60 * 60 * 1000);
  const [operationalSummary, operationsDashboard, security, releaseSummaries, backupSummaries, recoverySummaries, failoverSummaries] = await Promise.all([
    getReportExportOperationalSummary({ viewer }),
    getReportExportOperationsDashboard({ viewer, windowHours: normalizedWindowHours, recentLimit: normalizedRecentLimit }),
    Promise.resolve(buildSecurityDiagnostics()),
    loadEntitySummaries({ tenantId, entityType: DEPLOYMENT_ENTITY_TYPE, windowStart, limit: normalizedRecentLimit, summaryBuilder: buildReleaseSummary }),
    loadEntitySummaries({ tenantId, entityType: BACKUP_ENTITY_TYPE, windowStart, limit: normalizedRecentLimit, summaryBuilder: buildBackupSummary }),
    loadEntitySummaries({ tenantId, entityType: RECOVERY_ENTITY_TYPE, windowStart, limit: normalizedRecentLimit, summaryBuilder: buildRecoverySummary }),
    loadEntitySummaries({ tenantId, entityType: FAILOVER_ENTITY_TYPE, windowStart, limit: normalizedRecentLimit, summaryBuilder: buildFailoverSummary })
  ]);

  const recommendations = [];
  if (operationalSummary.queuedSlaBreaches > 0) {
    recommendations.push("Queued export SLA breaches are active; clear backlog before production rollout." );
  }
  if (operationalSummary.processingSlaBreaches > 0) {
    recommendations.push("Processing SLA breaches are active; stabilize worker throughput before deployment." );
  }
  if (operationsDashboard.sla?.staleLeaseBreaches > 0) {
    recommendations.push("Stale worker leases are present; run recovery before cutover." );
  }
  if ((backupSummaries[0]?.restoreValidation?.passed) !== true) {
    recommendations.push("Validate the latest backup restore path before production certification." );
  }
  recommendations.push(...security.recommendations);

  return {
    generatedAt: now,
    windowHours: normalizedWindowHours,
    overallScore: averageNumbers([
      security.score,
      failoverSummaries[0]?.continuityScore || 0,
      backupSummaries[0]?.restoreValidation?.score || 0,
      releaseSummaries[0]?.healthValidation?.deploymentReady ? 100 : 70
    ]),
    productionCertified: Boolean(
      security.status !== "BLOCKED"
      && (backupSummaries[0]?.restoreValidation?.passed || false)
      && (failoverSummaries[0]?.passed || false)
    ),
    runtime: {
      summary: operationalSummary,
      backlog: operationsDashboard.backlog,
      throughput: operationsDashboard.throughput,
      workers: operationsDashboard.workers,
      artifacts: operationsDashboard.artifacts,
      incidents: operationsDashboard.sla?.incidents || []
    },
    security,
    deployments: {
      countsByCheckpoint: summarizeCounts(releaseSummaries, "currentCheckpoint"),
      recent: releaseSummaries,
      latest: releaseSummaries[0] || null
    },
    backups: {
      recent: backupSummaries,
      latest: backupSummaries[0] || null,
      restoreValidatedCount: backupSummaries.filter((item) => item.restoreValidation?.passed).length,
      integrityFailures: backupSummaries.filter((item) => item.integrity?.passed === false).length
    },
    recovery: {
      recent: recoverySummaries,
      latest: recoverySummaries[0] || null,
      averageContinuityScore: averageNumbers(recoverySummaries.map((item) => item.continuityScore || 0))
    },
    failover: {
      recent: failoverSummaries,
      latest: failoverSummaries[0] || null,
      passCount: failoverSummaries.filter((item) => item.passed).length,
      averageScore: averageNumbers(failoverSummaries.map((item) => item.continuityScore || 0))
    },
    recommendations: Array.from(new Set(recommendations))
  };
}

async function getProductionReadinessDashboard({ viewer, windowHours = env.productionGovernanceWindowHours, recentLimit = env.productionGovernanceRecentLimit } = {}) {
  const diagnostics = await getProductionRuntimeDiagnostics({ viewer, windowHours, recentLimit });
  return {
    generatedAt: diagnostics.generatedAt,
    windowHours: diagnostics.windowHours,
    summary: {
      overallScore: diagnostics.overallScore,
      productionCertified: diagnostics.productionCertified,
      openRecommendations: diagnostics.recommendations.length,
      queuedBreaches: diagnostics.runtime.summary.queuedSlaBreaches,
      processingBreaches: diagnostics.runtime.summary.processingSlaBreaches
    },
    deployments: diagnostics.deployments,
    backups: diagnostics.backups,
    recovery: diagnostics.recovery,
    failover: diagnostics.failover,
    security: diagnostics.security,
    diagnostics: {
      runtime: diagnostics.runtime,
      recommendations: diagnostics.recommendations
    }
  };
}

export {
  advanceDeploymentRelease,
  getProductionReadinessDashboard,
  getProductionRuntimeDiagnostics,
  recordBackupSnapshot,
  rollbackDeploymentRelease,
  runProductionFailoverCertification,
  runProductionRecoveryDrill,
  stageDeploymentRelease,
  validateBackupRestoreReadiness
};