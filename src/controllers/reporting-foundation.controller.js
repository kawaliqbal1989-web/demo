import { pipeline } from "node:stream/promises";
import { asyncHandler } from "../utils/async-handler.js";
import { prisma } from "../lib/prisma.js";
import {
  createReportArtifactReadStream,
  generateReportExportArtifact
} from "../services/report-export.service.js";
import {
  buildExportLockKey,
  buildExportRequestFingerprint,
  getReportExportJobForViewer,
  getReportExportOperationsDashboard,
  getReportExportOperationalSummary,
  listReportExportJobs,
  prepareQueuedExportJob,
  queueReportExportSimulationJobs,
  recordReportExportArtifactDownload,
  recordReportExportAuditEvent,
  recoverStalledReportExportJobs,
  requeueReportExportJob,
  runCoalescedExport,
  serializeExportJob
} from "../services/report-export-job.service.js";
import {
  buildNextScheduleRunAt,
  runReportExportCleanupPass,
  runReportExportWorkerPass
} from "../services/report-export-runner.service.js";
import {
  getReportExportCertificationReport,
  queueReportExportCertificationScenario,
  reconcileReportExportState,
  resolveCertificationScenarioWorkload
} from "../services/report-export-certification.service.js";
import {
  advanceDeploymentRelease,
  getProductionReadinessDashboard,
  getProductionRuntimeDiagnostics,
  recordBackupSnapshot,
  rollbackDeploymentRelease,
  runProductionFailoverCertification,
  runProductionRecoveryDrill,
  stageDeploymentRelease,
  validateBackupRestoreReadiness
} from "../services/report-export-production-governance.service.js";
import { createHttpError, getReportDocument, resolveReportKeyAlias } from "../services/reporting.service.js";

function getResolvedReportKey(reportKeyOrAlias) {
  const resolved = resolveReportKeyAlias(reportKeyOrAlias);
  if (!resolved) {
    throw createHttpError(404, "Report not found", "REPORT_NOT_FOUND");
  }
  return resolved;
}

function buildReportContext(req, reportKey, query = req.query) {
  return {
    reportKey,
    auth: req.auth,
    query,
    bpScope: req.bpScope,
    franchiseScope: req.franchiseScope,
    student: req.student,
    parent: req.parent
  };
}

function buildExportExecutionContext(req, reportKey, query = req.query) {
  return {
    reportKey,
    auth: {
      tenantId: req.auth?.tenantId || null,
      userId: req.auth?.userId || null,
      role: req.auth?.role || null,
      hierarchyNodeId: req.auth?.hierarchyNodeId || null,
      studentId: req.auth?.studentId || null
    },
    query,
    bpScope: req.bpScope
      ? {
        tenantId: req.bpScope.tenantId,
        businessPartner: req.bpScope.businessPartner,
        hierarchyNodeIds: req.bpScope.hierarchyNodeIds,
        franchiseIds: req.bpScope.franchiseIds,
        centerIds: req.bpScope.centerIds
      }
      : null,
    franchiseScope: req.franchiseScope
      ? {
        franchise: req.franchiseScope.franchise,
        hierarchyNodeIds: req.franchiseScope.hierarchyNodeIds
      }
      : null,
    student: req.student ? { id: req.student.id } : null,
    parent: req.parent ? { id: req.parent.id } : null
  };
}

function setTrackedExportHeaders(res, { job, artifact, coalesced }) {
  res.setHeader("Content-Disposition", `attachment; filename="${artifact.fileName}"`);
  if (Number.isFinite(artifact.byteLength)) {
    res.setHeader("Content-Length", String(artifact.byteLength));
  }
  res.setHeader("X-Export-Job-Id", job.id);
  res.setHeader("X-Export-Job-Status", job.status);
  res.setHeader("X-Export-Coalesced", coalesced ? "true" : "false");
  res.setHeader("X-Report-Snapshot-Ref", job.snapshotReferenceId);
  res.setHeader("X-Report-Snapshot-Captured-At", String(job.snapshotCapturedAt || ""));
  res.setHeader("X-Export-Integrity-Sha256", job.integrityDigest);
  res.setHeader("X-Export-Row-Count", String(artifact.rowCount));
  res.setHeader("X-Export-Table-Count", String(artifact.tableCount));
}

async function prepareTrackedExport({ req, reportKey, format }) {
  const context = buildReportContext(req, reportKey);
  const executionContext = buildExportExecutionContext(req, reportKey);
  const tenantId = req.auth?.tenantId;
  const fingerprint = buildExportRequestFingerprint({
    tenantId,
    reportKey,
    format,
    auth: req.auth,
    scope: {
      role: req.auth?.role || null,
      entityId: req.student?.id || req.parent?.id || req.bpScope?.businessPartner?.id || req.franchiseScope?.franchise?.id || null
    },
    filters: req.query
  });
  const lockKey = buildExportLockKey(fingerprint);

  return runCoalescedExport(lockKey, async () => {
    const prepared = await prepareQueuedExportJob({
      tenantId,
      reportKey,
      format,
      requestFingerprint: fingerprint,
      lockKey,
      auth: req.auth,
      executionContext,
      filters: req.query,
      reportFactory: () => getReportDocument(context)
    });

    return prepared;
  });
}

function buildExportQueuedResponse({ job, coalesced }) {
  return {
    coalesced,
    job: serializeExportJob(job)
  };
}

function buildScheduleViewerWhere(auth) {
  const where = {
    tenantId: auth?.tenantId || null
  };

  if (auth?.role !== "SUPERADMIN") {
    where.createdByUserId = auth?.userId || null;
  }

  return where;
}

function serializeExportSchedule(schedule) {
  return {
    id: schedule.id,
    reportKey: schedule.reportKey,
    exportFormat: schedule.exportFormat,
    status: schedule.status,
    title: schedule.title,
    targetRole: schedule.targetRole,
    targetEntityId: schedule.targetEntityId,
    queueName: schedule.queueName,
    priority: schedule.priority,
    runHourUtc: schedule.runHourUtc,
    runMinuteUtc: schedule.runMinuteUtc,
    maxRetentionHours: schedule.maxRetentionHours,
    lastWindowKey: schedule.lastWindowKey,
    lastQueuedAt: schedule.lastQueuedAt,
    lastCompletedAt: schedule.lastCompletedAt,
    nextRunAt: schedule.nextRunAt,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt
  };
}

function createScopedReportHandler(reportKey, successMessage) {
  return asyncHandler(async (req, res) => {
    const document = await getReportDocument(buildReportContext(req, reportKey));
    return res.apiSuccess(successMessage, document);
  });
}

const getBusinessPartnerFoundationReport = createScopedReportHandler(
  "bp-operational",
  "Business partner report fetched"
);

const getFranchiseFoundationReport = createScopedReportHandler(
  "franchise-operational",
  "Franchise report fetched"
);

const getCenterFoundationReport = createScopedReportHandler(
  "center-operational",
  "Center report fetched"
);

const getTeacherFoundationReport = createScopedReportHandler(
  "teacher-productivity",
  "Teacher report fetched"
);

const getStudentFoundationReport = createScopedReportHandler(
  "student-engagement",
  "Student report fetched"
);

const getParentFoundationReport = createScopedReportHandler(
  "parent-visibility",
  "Parent report fetched"
);

const getGovernanceAuditSummaryReport = createScopedReportHandler(
  "governance-audit",
  "Governance audit report fetched"
);

const getWorkflowLifecycleSummaryReport = createScopedReportHandler(
  "workflow-lifecycle",
  "Workflow lifecycle report fetched"
);

const getPrintableReport = asyncHandler(async (req, res) => {
  const reportKey = getResolvedReportKey(req.params.reportKey);
  const document = await getReportDocument(buildReportContext(req, reportKey));
  return res.apiSuccess("Printable report fetched", {
    ...document,
    printable: {
      ...(document.printable || {}),
      mode: "printable"
    }
  });
});

const exportPdfReport = asyncHandler(async (req, res) => {
  const reportKey = getResolvedReportKey(req.params.reportKey);
  const { coalesced, result } = await prepareTrackedExport({ req, reportKey, format: "PDF" });
  const status = result.job.status === "COMPLETED" && result.job.artifact?.status === "AVAILABLE" ? 200 : 202;
  res.setHeader("X-Export-Job-Id", result.job.id);
  res.setHeader("X-Export-Job-Status", result.job.status);
  res.setHeader("X-Export-Coalesced", coalesced ? "true" : "false");
  res.setHeader("X-Report-Snapshot-Ref", result.job.snapshotReferenceId);
  res.setHeader("X-Export-Integrity-Sha256", result.job.integrityDigest);

  return res.apiSuccess(
    status === 200 ? "Export artifact ready" : "Export queued",
    buildExportQueuedResponse({ job: result.job, coalesced }),
    status
  );
});

const exportExcelReport = asyncHandler(async (req, res) => {
  const reportKey = getResolvedReportKey(req.params.reportKey);
  const { coalesced, result } = await prepareTrackedExport({ req, reportKey, format: "XLSX" });
  const status = result.job.status === "COMPLETED" && result.job.artifact?.status === "AVAILABLE" ? 200 : 202;
  res.setHeader("X-Export-Job-Id", result.job.id);
  res.setHeader("X-Export-Job-Status", result.job.status);
  res.setHeader("X-Export-Coalesced", coalesced ? "true" : "false");
  res.setHeader("X-Report-Snapshot-Ref", result.job.snapshotReferenceId);
  res.setHeader("X-Export-Integrity-Sha256", result.job.integrityDigest);

  return res.apiSuccess(
    status === 200 ? "Export artifact ready" : "Export queued",
    buildExportQueuedResponse({ job: result.job, coalesced }),
    status
  );
});

const listReportExportHistory = asyncHandler(async (req, res) => {
  const jobs = await listReportExportJobs({
    viewer: req.auth,
    filters: req.query
  });

  return res.apiSuccess("Export jobs fetched", {
    items: jobs.map((job) => serializeExportJob(job))
  });
});

const getReportExportJobStatus = asyncHandler(async (req, res) => {
  const job = await getReportExportJobForViewer({
    jobId: req.params.jobId,
    viewer: req.auth
  });

  if (!job) {
    return res.apiError(404, "Export job not found", "EXPORT_JOB_NOT_FOUND");
  }

  return res.apiSuccess("Export job fetched", {
    job: serializeExportJob(job)
  });
});

const retryReportExportJob = asyncHandler(async (req, res) => {
  const existing = await getReportExportJobForViewer({
    jobId: req.params.jobId,
    viewer: req.auth
  });

  if (!existing) {
    return res.apiError(404, "Export job not found", "EXPORT_JOB_NOT_FOUND");
  }

  if (!["FAILED", "EXPIRED", "CANCELLED"].includes(existing.status)) {
    return res.apiError(409, "Export job is not retryable", "EXPORT_JOB_NOT_RETRYABLE");
  }

  const job = await requeueReportExportJob(existing.id, {
    auth: req.auth,
    reason: "manual_retry"
  });

  return res.apiSuccess("Export job requeued", {
    job: serializeExportJob(job)
  }, 202);
});

const downloadReportExportJobArtifact = asyncHandler(async (req, res) => {
  const job = await getReportExportJobForViewer({
    jobId: req.params.jobId,
    viewer: req.auth
  });

  if (!job) {
    return res.apiError(404, "Export job not found", "EXPORT_JOB_NOT_FOUND");
  }

  if (job.status !== "COMPLETED" || job.artifact?.status !== "AVAILABLE") {
    return res.apiError(409, "Export artifact is not ready", "EXPORT_ARTIFACT_NOT_READY");
  }

  res.setHeader("Content-Type", job.artifact.mimeType);
  setTrackedExportHeaders(res, {
    job,
    artifact: job.artifact,
    coalesced: false
  });

  await recordReportExportArtifactDownload({
    job,
    viewer: req.auth,
    source: "artifact_download_endpoint"
  });

  await pipeline(createReportArtifactReadStream(job.artifact.filePath), res);
});

const getReportExportOperationsSummary = asyncHandler(async (req, res) => {
  const summary = await getReportExportOperationalSummary({
    viewer: req.auth
  });

  return res.apiSuccess("Export operations summary fetched", summary);
});

const getReportExportOperationsDashboardController = asyncHandler(async (req, res) => {
  const dashboard = await getReportExportOperationsDashboard({
    viewer: req.auth,
    windowHours: req.query.windowHours,
    recentLimit: req.query.limit
  });

  return res.apiSuccess("Export operations dashboard fetched", dashboard);
});

const recoverReportExportOperationsController = asyncHandler(async (req, res) => {
  const recovery = await recoverStalledReportExportJobs({
    viewer: req.auth,
    reason: req.body?.reason ? String(req.body.reason).trim() : "manual_recovery",
    limit: req.body?.limit
  });

  await recordReportExportAuditEvent({
    tenantId: req.auth?.tenantId,
    userId: req.auth?.userId,
    role: req.auth?.role,
    action: "REPORT_EXPORT_RECOVERY_TRIGGERED",
    entityId: `recovery:${Date.now().toString(36)}`,
    metadata: {
      recoveredCount: recovery.recoveredCount,
      requestedLimit: req.body?.limit || null,
      reason: req.body?.reason || "manual_recovery"
    }
  });

  return res.apiSuccess("Stalled export recovery completed", recovery);
});

const runReportExportCleanupController = asyncHandler(async (req, res) => {
  const summary = await runReportExportCleanupPass();

  await recordReportExportAuditEvent({
    tenantId: req.auth?.tenantId,
    userId: req.auth?.userId,
    role: req.auth?.role,
    action: "REPORT_EXPORT_CLEANUP_TRIGGERED",
    entityId: `cleanup:${Date.now().toString(36)}`,
    metadata: summary
  });

  return res.apiSuccess("Export cleanup completed", summary);
});

const queueReportExportSimulationController = asyncHandler(async (req, res) => {
  const reportKey = getResolvedReportKey(req.params.reportKey);
  const exportFormat = String(req.params.format || "").trim().toUpperCase();
  if (!["PDF", "XLSX"].includes(exportFormat)) {
    return res.apiError(400, "Invalid export format", "EXPORT_FORMAT_INVALID");
  }

  const count = req.body?.count;
  const queueName = req.body?.queueName ? String(req.body.queueName).trim() : "simulation";
  const priority = Number.parseInt(req.body?.priority, 10);
  const executeNow = Boolean(req.body?.executeNow);
  const context = buildReportContext(req, reportKey);
  const executionContext = buildExportExecutionContext(req, reportKey);

  const simulation = await queueReportExportSimulationJobs({
    tenantId: req.auth?.tenantId,
    reportKey,
    format: exportFormat,
    auth: req.auth,
    executionContext,
    filters: req.query,
    queueName,
    priority: Number.isFinite(priority) ? priority : 25,
    count,
    reportFactory: () => getReportDocument(context)
  });

  let workerSummary = null;
  if (executeNow && simulation.items.length) {
    workerSummary = await runReportExportWorkerPass({ limit: simulation.items.length });
  }

  return res.apiSuccess("Export simulation queued", {
    simulation,
    workerSummary
  }, 202);
});

const runReportExportCertificationScenarioController = asyncHandler(async (req, res) => {
  const scenarioKey = String(req.params.scenarioKey || "").trim().toLowerCase();
  const workload = resolveCertificationScenarioWorkload({
    scenarioKey,
    viewer: req.auth,
    resolveReportContext: (reportKey, query = req.query) => getReportDocument(buildReportContext(req, reportKey, query)),
    resolveExecutionContext: (reportKey, query = req.query) => buildExportExecutionContext(req, reportKey, query),
    overrides: {
      queueName: req.body?.queueName ? String(req.body.queueName).trim() : "certification",
      filters: req.body?.filters && typeof req.body.filters === "object" ? req.body.filters : req.query
    }
  });

  const certificationRun = await queueReportExportCertificationScenario({
    viewer: req.auth,
    scenarioKey,
    workload,
    executeNow: Boolean(req.body?.executeNow),
    workerPassLimit: req.body?.workerPassLimit
  });

  return res.apiSuccess("Export certification scenario queued", certificationRun, 202);
});

const getReportExportCertificationReportController = asyncHandler(async (req, res) => {
  const report = await getReportExportCertificationReport({
    viewer: req.auth,
    windowHours: req.query.windowHours,
    runId: req.query.runId || null
  });

  return res.apiSuccess("Export certification report fetched", report);
});

const reconcileReportExportStateController = asyncHandler(async (req, res) => {
  const reconciliation = await reconcileReportExportState({
    viewer: req.auth,
    dryRun: req.body?.dryRun !== false,
    limit: req.body?.limit
  });

  return res.apiSuccess("Export reconciliation completed", reconciliation);
});

const getProductionReadinessDashboardController = asyncHandler(async (req, res) => {
  const dashboard = await getProductionReadinessDashboard({
    viewer: req.auth,
    windowHours: req.query.windowHours,
    recentLimit: req.query.limit
  });

  return res.apiSuccess("Production readiness dashboard fetched", dashboard);
});

const getProductionRuntimeDiagnosticsController = asyncHandler(async (req, res) => {
  const diagnostics = await getProductionRuntimeDiagnostics({
    viewer: req.auth,
    windowHours: req.query.windowHours,
    recentLimit: req.query.limit
  });

  return res.apiSuccess("Production runtime diagnostics fetched", diagnostics);
});

const stageDeploymentReleaseController = asyncHandler(async (req, res) => {
  const release = await stageDeploymentRelease({
    viewer: req.auth,
    input: req.body || {}
  });

  return res.apiSuccess("Deployment release staged", release, 201);
});

const advanceDeploymentReleaseController = asyncHandler(async (req, res) => {
  const release = await advanceDeploymentRelease({
    viewer: req.auth,
    releaseId: req.params.releaseId,
    input: req.body || {}
  });

  return res.apiSuccess("Deployment release advanced", release);
});

const rollbackDeploymentReleaseController = asyncHandler(async (req, res) => {
  const release = await rollbackDeploymentRelease({
    viewer: req.auth,
    releaseId: req.params.releaseId,
    input: req.body || {}
  });

  return res.apiSuccess("Deployment rollback recorded", release);
});

const recordBackupSnapshotController = asyncHandler(async (req, res) => {
  const backup = await recordBackupSnapshot({
    viewer: req.auth,
    input: req.body || {}
  });

  return res.apiSuccess("Backup snapshot recorded", backup, 201);
});

const validateBackupRestoreReadinessController = asyncHandler(async (req, res) => {
  const backup = await validateBackupRestoreReadiness({
    viewer: req.auth,
    input: req.body || {}
  });

  return res.apiSuccess("Backup restore readiness validated", backup);
});

const runProductionRecoveryDrillController = asyncHandler(async (req, res) => {
  const drill = await runProductionRecoveryDrill({
    viewer: req.auth,
    input: req.body || {}
  });

  return res.apiSuccess("Production recovery drill completed", drill, req.body?.dryRun === false ? 202 : 200);
});

const runProductionFailoverCertificationController = asyncHandler(async (req, res) => {
  const certification = await runProductionFailoverCertification({
    viewer: req.auth,
    input: req.body || {}
  });

  return res.apiSuccess("Production failover certification completed", certification, req.body?.dryRun === false ? 202 : 200);
});

const listReportExportSchedules = asyncHandler(async (req, res) => {
  const schedules = await prisma.reportExportSchedule.findMany({
    where: {
      ...buildScheduleViewerWhere(req.auth),
      ...(req.query.reportKey ? { reportKey: String(req.query.reportKey) } : {})
    },
    orderBy: [{ createdAt: "desc" }],
    take: Math.max(1, Math.min(50, Number.parseInt(req.query.limit, 10) || 20))
  });

  return res.apiSuccess("Export schedules fetched", {
    items: schedules.map((schedule) => serializeExportSchedule(schedule))
  });
});

const createReportExportSchedule = asyncHandler(async (req, res) => {
  const reportKey = getResolvedReportKey(req.params.reportKey);
  const exportFormat = String(req.params.format || "").trim().toUpperCase();
  if (!["PDF", "XLSX"].includes(exportFormat)) {
    return res.apiError(400, "Invalid export format", "EXPORT_FORMAT_INVALID");
  }

  const runHourUtc = Number.parseInt(req.body?.runHourUtc, 10);
  const runMinuteUtc = Number.parseInt(req.body?.runMinuteUtc, 10);
  const normalizedRunHourUtc = Number.isFinite(runHourUtc) ? Math.max(0, Math.min(23, runHourUtc)) : 1;
  const normalizedRunMinuteUtc = Number.isFinite(runMinuteUtc) ? Math.max(0, Math.min(59, runMinuteUtc)) : 15;
  const maxRetentionHours = Math.max(1, Math.min(24 * 30, Number.parseInt(req.body?.maxRetentionHours, 10) || 24));

  const executionContext = buildExportExecutionContext(req, reportKey);
  await getReportDocument(buildReportContext(req, reportKey));

  const targetEntityId = req.student?.id || req.parent?.id || req.bpScope?.businessPartner?.id || req.franchiseScope?.franchise?.id || null;
  const schedule = await prisma.reportExportSchedule.create({
    data: {
      tenantId: req.auth.tenantId,
      createdByUserId: req.auth.userId,
      reportKey,
      exportFormat,
      title: req.body?.title ? String(req.body.title).trim() : null,
      targetRole: req.auth.role,
      targetEntityId,
      filters: req.query,
      executionContext,
      queueName: "scheduled",
      priority: 50,
      runHourUtc: normalizedRunHourUtc,
      runMinuteUtc: normalizedRunMinuteUtc,
      maxRetentionHours,
      nextRunAt: buildNextScheduleRunAt({ runHourUtc: normalizedRunHourUtc, runMinuteUtc: normalizedRunMinuteUtc }, new Date()),
      metadata: {
        createdFrom: "REPORT_EXPORT_UI",
        createdAt: new Date().toISOString()
      }
    }
  });

  return res.apiSuccess("Export schedule created", {
    schedule: serializeExportSchedule(schedule)
  }, 201);
});

const pauseReportExportSchedule = asyncHandler(async (req, res) => {
  const existing = await prisma.reportExportSchedule.findFirst({
    where: {
      id: req.params.scheduleId,
      ...buildScheduleViewerWhere(req.auth)
    }
  });

  if (!existing) {
    return res.apiError(404, "Export schedule not found", "EXPORT_SCHEDULE_NOT_FOUND");
  }

  const schedule = await prisma.reportExportSchedule.update({
    where: { id: existing.id },
    data: {
      status: "PAUSED"
    }
  });

  return res.apiSuccess("Export schedule paused", {
    schedule: serializeExportSchedule(schedule)
  });
});

const resumeReportExportSchedule = asyncHandler(async (req, res) => {
  const existing = await prisma.reportExportSchedule.findFirst({
    where: {
      id: req.params.scheduleId,
      ...buildScheduleViewerWhere(req.auth)
    }
  });

  if (!existing) {
    return res.apiError(404, "Export schedule not found", "EXPORT_SCHEDULE_NOT_FOUND");
  }

  const schedule = await prisma.reportExportSchedule.update({
    where: { id: existing.id },
    data: {
      status: "ACTIVE",
      nextRunAt: buildNextScheduleRunAt(existing, new Date())
    }
  });

  return res.apiSuccess("Export schedule resumed", {
    schedule: serializeExportSchedule(schedule)
  });
});

export {
  createReportExportSchedule,
  downloadReportExportJobArtifact,
  exportExcelReport,
  exportPdfReport,
  getBusinessPartnerFoundationReport,
  getCenterFoundationReport,
  getReportExportJobStatus,
  getReportExportCertificationReportController,
  getReportExportOperationsDashboardController,
  getReportExportOperationsSummary,
  getProductionReadinessDashboardController,
  getProductionRuntimeDiagnosticsController,
  getFranchiseFoundationReport,
  getGovernanceAuditSummaryReport,
  getParentFoundationReport,
  getPrintableReport,
  getStudentFoundationReport,
  getTeacherFoundationReport,
  getWorkflowLifecycleSummaryReport,
  listReportExportSchedules,
  listReportExportHistory,
  pauseReportExportSchedule,
  queueReportExportSimulationController,
  recordBackupSnapshotController,
  recoverReportExportOperationsController,
  reconcileReportExportStateController,
  resumeReportExportSchedule,
  rollbackDeploymentReleaseController,
  runProductionFailoverCertificationController,
  runProductionRecoveryDrillController,
  runReportExportCertificationScenarioController,
  runReportExportCleanupController,
  stageDeploymentReleaseController,
  validateBackupRestoreReadinessController,
  advanceDeploymentReleaseController,
  retryReportExportJob
};