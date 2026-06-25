import { Router } from "express";
import {
  dashboardSummary,
  feesMonthlyDues,
  feesPendingInstallments,
  feesReminders,
  feesStudentWise,
  healthMetrics,
  monthlyRevenue,
  revenueByBusinessPartner,
  revenueByCenter,
  revenueByType,
  revenueSummary
} from "../controllers/financial-reporting.controller.js";
import {
  createReportExportSchedule,
  downloadReportExportJobArtifact,
  exportExcelReport,
  exportPdfReport,
  advanceDeploymentReleaseController,
  getBusinessPartnerFoundationReport,
  getCenterFoundationReport,
  getProductionReadinessDashboardController,
  getProductionRuntimeDiagnosticsController,
  getReportExportCertificationReportController,
  getReportExportJobStatus,
  getReportExportOperationsDashboardController,
  getReportExportOperationsSummary,
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
  rollbackDeploymentReleaseController,
  resumeReportExportSchedule,
  runProductionFailoverCertificationController,
  runProductionRecoveryDrillController,
  runReportExportCertificationScenarioController,
  runReportExportCleanupController,
  stageDeploymentReleaseController,
  validateBackupRestoreReadinessController,
  retryReportExportJob
} from "../controllers/reporting-foundation.controller.js";
import { auditAction } from "../middleware/audit-logger.js";
import { requireFranchiseScope } from "../middleware/franchise-scope.js";
import { requireBusinessPartnerScope } from "../middleware/partner-scope.js";
import { requireParent } from "../middleware/require-parent.js";
import { requireStudent } from "../middleware/require-student.js";
import { requireRole } from "../middleware/rbac.js";

const financialReportingRouter = Router();

const REPORT_ROUTE_KEY_BY_ALIAS = Object.freeze({
  bp: "bp-operational",
  franchise: "franchise-operational",
  center: "center-operational",
  teacher: "teacher-productivity",
  student: "student-engagement",
  parent: "parent-visibility",
  audit: "governance-audit",
  workflow: "workflow-lifecycle"
});

function resolveReportKeyFromRequest(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return REPORT_ROUTE_KEY_BY_ALIAS[normalized] || normalized;
}

function attachReportKeyFromQuery(req, res, next) {
  const reportKey = resolveReportKeyFromRequest(req.query.reportKey || req.query.report);
  if (!reportKey) {
    return res.apiError(400, "reportKey query parameter is required", "VALIDATION_ERROR");
  }
  req.params.reportKey = reportKey;
  return next();
}

function prepareReportContext(req, res, next) {
  const reportKey = String(req.params.reportKey || "").trim().toLowerCase();

  if (reportKey === "bp-operational") {
    return requireBusinessPartnerScope(req, res, next);
  }

  if (reportKey === "franchise-operational") {
    return requireFranchiseScope(req, res, next);
  }

  if (reportKey === "center-operational") {
    return requireRole("CENTER")(req, res, next);
  }

  if (reportKey === "teacher-productivity") {
    return requireRole("TEACHER")(req, res, next);
  }

  if (reportKey === "student-engagement") {
    return requireStudent(req, res, next);
  }

  if (reportKey === "parent-visibility") {
    return requireParent(req, res, next);
  }

  if (reportKey === "governance-audit") {
    return requireRole("SUPERADMIN")(req, res, next);
  }

  if (reportKey === "workflow-lifecycle") {
    if (req.auth?.role === "BP") {
      return requireBusinessPartnerScope(req, res, next);
    }
    if (req.auth?.role === "FRANCHISE") {
      return requireFranchiseScope(req, res, next);
    }
    return requireRole("SUPERADMIN", "CENTER", "TEACHER")(req, res, next);
  }

  return res.apiError(404, "Report not found", "REPORT_NOT_FOUND");
}

financialReportingRouter.get(
  "/revenue/summary",
  requireRole("SUPERADMIN", "BP", "CENTER"),
  revenueSummary
);

financialReportingRouter.get(
  "/revenue/by-type",
  requireRole("SUPERADMIN", "BP", "CENTER"),
  revenueByType
);

financialReportingRouter.get(
  "/revenue/monthly",
  requireRole("SUPERADMIN", "BP", "CENTER"),
  monthlyRevenue
);

financialReportingRouter.get(
  "/revenue/by-business-partner",
  requireRole("SUPERADMIN"),
  revenueByBusinessPartner
);

financialReportingRouter.get(
  "/revenue/by-center",
  requireRole("BP"),
  revenueByCenter
);

financialReportingRouter.get(
  "/dashboard-summary",
  requireRole("SUPERADMIN", "BP", "CENTER"),
  dashboardSummary
);

financialReportingRouter.get(
  "/health-metrics",
  requireRole("SUPERADMIN"),
  healthMetrics
);

financialReportingRouter.get(
  "/fees/pending-installments",
  requireRole("CENTER"),
  feesPendingInstallments
);

financialReportingRouter.get(
  "/fees/student-wise",
  requireRole("CENTER"),
  feesStudentWise
);

financialReportingRouter.get(
  "/fees/monthly-dues",
  requireRole("CENTER"),
  feesMonthlyDues
);

financialReportingRouter.get(
  "/fees/reminders",
  requireRole("CENTER"),
  feesReminders
);

financialReportingRouter.get(
  "/bp/foundation",
  requireRole("BP"),
  requireBusinessPartnerScope,
  auditAction("BP_VIEW_REPORT_FOUNDATION", "REPORT", () => "bp-operational"),
  getBusinessPartnerFoundationReport
);

financialReportingRouter.get(
  "/bp",
  requireRole("BP"),
  requireBusinessPartnerScope,
  auditAction("BP_VIEW_REPORT_FOUNDATION", "REPORT", () => "bp-operational"),
  getBusinessPartnerFoundationReport
);

financialReportingRouter.get(
  "/franchise/foundation",
  requireRole("FRANCHISE"),
  requireFranchiseScope,
  auditAction("FRANCHISE_VIEW_REPORT_FOUNDATION", "REPORT", () => "franchise-operational"),
  getFranchiseFoundationReport
);

financialReportingRouter.get(
  "/franchise",
  requireRole("FRANCHISE"),
  requireFranchiseScope,
  auditAction("FRANCHISE_VIEW_REPORT_FOUNDATION", "REPORT", () => "franchise-operational"),
  getFranchiseFoundationReport
);

financialReportingRouter.get(
  "/center/foundation",
  requireRole("CENTER"),
  auditAction("CENTER_VIEW_REPORT_FOUNDATION", "REPORT", () => "center-operational"),
  getCenterFoundationReport
);

financialReportingRouter.get(
  "/center",
  requireRole("CENTER"),
  auditAction("CENTER_VIEW_REPORT_FOUNDATION", "REPORT", () => "center-operational"),
  getCenterFoundationReport
);

financialReportingRouter.get(
  "/teacher/foundation",
  requireRole("TEACHER"),
  auditAction("TEACHER_VIEW_REPORT_FOUNDATION", "REPORT", () => "teacher-productivity"),
  getTeacherFoundationReport
);

financialReportingRouter.get(
  "/teacher",
  requireRole("TEACHER"),
  auditAction("TEACHER_VIEW_REPORT_FOUNDATION", "REPORT", () => "teacher-productivity"),
  getTeacherFoundationReport
);

financialReportingRouter.get(
  "/student/foundation",
  requireStudent,
  auditAction("STUDENT_VIEW_REPORT_FOUNDATION", "REPORT", () => "student-engagement"),
  getStudentFoundationReport
);

financialReportingRouter.get(
  "/student",
  requireStudent,
  auditAction("STUDENT_VIEW_REPORT_FOUNDATION", "REPORT", () => "student-engagement"),
  getStudentFoundationReport
);

financialReportingRouter.get(
  "/parent/foundation",
  requireParent,
  auditAction("PARENT_VIEW_REPORT_FOUNDATION", "REPORT", () => "parent-visibility"),
  getParentFoundationReport
);

financialReportingRouter.get(
  "/parent",
  requireParent,
  auditAction("PARENT_VIEW_REPORT_FOUNDATION", "REPORT", () => "parent-visibility"),
  getParentFoundationReport
);

financialReportingRouter.get(
  "/audit/governance-summary",
  requireRole("SUPERADMIN"),
  auditAction("SUPERADMIN_VIEW_GOVERNANCE_AUDIT_REPORT", "REPORT", () => "governance-audit"),
  getGovernanceAuditSummaryReport
);

financialReportingRouter.get(
  "/audit",
  requireRole("SUPERADMIN"),
  auditAction("SUPERADMIN_VIEW_GOVERNANCE_AUDIT_REPORT", "REPORT", () => "governance-audit"),
  getGovernanceAuditSummaryReport
);

financialReportingRouter.get(
  "/audit/workflow-summary",
  requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER"),
  (req, res, next) => {
    if (req.auth?.role === "BP") {
      return requireBusinessPartnerScope(req, res, next);
    }
    if (req.auth?.role === "FRANCHISE") {
      return requireFranchiseScope(req, res, next);
    }
    return next();
  },
  auditAction("VIEW_WORKFLOW_LIFECYCLE_REPORT", "REPORT", () => "workflow-lifecycle"),
  getWorkflowLifecycleSummaryReport
);

financialReportingRouter.get(
  "/printable/:reportKey",
  prepareReportContext,
  auditAction("VIEW_PRINTABLE_REPORT", "REPORT", (req) => req.params.reportKey),
  getPrintableReport
);

financialReportingRouter.get(
  "/exports/jobs",
  requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER", "PARENT", "STUDENT"),
  listReportExportHistory
);

financialReportingRouter.get(
  "/exports/schedules",
  requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER", "PARENT", "STUDENT"),
  listReportExportSchedules
);

financialReportingRouter.get(
  "/exports/operations/summary",
  requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER", "PARENT", "STUDENT"),
  getReportExportOperationsSummary
);

financialReportingRouter.get(
  "/exports/operations/dashboard",
  requireRole("SUPERADMIN"),
  getReportExportOperationsDashboardController
);

financialReportingRouter.get(
  "/exports/operations/certification/report",
  requireRole("SUPERADMIN"),
  getReportExportCertificationReportController
);

financialReportingRouter.get(
  "/exports/operations/production/dashboard",
  requireRole("SUPERADMIN"),
  getProductionReadinessDashboardController
);

financialReportingRouter.get(
  "/exports/operations/production/diagnostics",
  requireRole("SUPERADMIN"),
  getProductionRuntimeDiagnosticsController
);

financialReportingRouter.get(
  "/exports/jobs/:jobId",
  requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER", "PARENT", "STUDENT"),
  getReportExportJobStatus
);

financialReportingRouter.get(
  "/exports/jobs/:jobId/download",
  requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER", "PARENT", "STUDENT"),
  downloadReportExportJobArtifact
);

financialReportingRouter.post(
  "/exports/jobs/:jobId/retry",
  requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER", "PARENT", "STUDENT"),
  retryReportExportJob
);

financialReportingRouter.post(
  "/exports/operations/recovery/stale-processing",
  requireRole("SUPERADMIN"),
  recoverReportExportOperationsController
);

financialReportingRouter.post(
  "/exports/operations/recovery/cleanup",
  requireRole("SUPERADMIN"),
  runReportExportCleanupController
);

financialReportingRouter.post(
  "/exports/operations/recovery/reconcile",
  requireRole("SUPERADMIN"),
  reconcileReportExportStateController
);

financialReportingRouter.post(
  "/exports/operations/certification/scenarios/:scenarioKey/run",
  requireRole("SUPERADMIN"),
  runReportExportCertificationScenarioController
);

financialReportingRouter.post(
  "/exports/operations/production/deployments/stage",
  requireRole("SUPERADMIN"),
  stageDeploymentReleaseController
);

financialReportingRouter.post(
  "/exports/operations/production/deployments/:releaseId/advance",
  requireRole("SUPERADMIN"),
  advanceDeploymentReleaseController
);

financialReportingRouter.post(
  "/exports/operations/production/deployments/:releaseId/rollback",
  requireRole("SUPERADMIN"),
  rollbackDeploymentReleaseController
);

financialReportingRouter.post(
  "/exports/operations/production/backups/record",
  requireRole("SUPERADMIN"),
  recordBackupSnapshotController
);

financialReportingRouter.post(
  "/exports/operations/production/backups/restore/validate",
  requireRole("SUPERADMIN"),
  validateBackupRestoreReadinessController
);

financialReportingRouter.post(
  "/exports/operations/production/recovery/drill",
  requireRole("SUPERADMIN"),
  runProductionRecoveryDrillController
);

financialReportingRouter.post(
  "/exports/operations/production/failover/certify",
  requireRole("SUPERADMIN"),
  runProductionFailoverCertificationController
);

financialReportingRouter.post(
  "/exports/operations/simulations/:format/:reportKey",
  requireRole("SUPERADMIN"),
  prepareReportContext,
  queueReportExportSimulationController
);

financialReportingRouter.post(
  "/exports/schedules/:format/:reportKey",
  prepareReportContext,
  createReportExportSchedule
);

financialReportingRouter.post(
  "/exports/schedules/:scheduleId/pause",
  requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER", "PARENT", "STUDENT"),
  pauseReportExportSchedule
);

financialReportingRouter.post(
  "/exports/schedules/:scheduleId/resume",
  requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER", "PARENT", "STUDENT"),
  resumeReportExportSchedule
);

financialReportingRouter.get(
  "/exports/pdf/:reportKey",
  prepareReportContext,
  auditAction("EXPORT_REPORT_PDF", "REPORT", (req) => req.params.reportKey),
  exportPdfReport
);

financialReportingRouter.get(
  "/export/pdf",
  attachReportKeyFromQuery,
  prepareReportContext,
  auditAction("EXPORT_REPORT_PDF", "REPORT", (req) => req.params.reportKey),
  exportPdfReport
);

financialReportingRouter.get(
  "/exports/excel/:reportKey",
  prepareReportContext,
  auditAction("EXPORT_REPORT_EXCEL", "REPORT", (req) => req.params.reportKey),
  exportExcelReport
);

financialReportingRouter.get(
  "/export/excel",
  attachReportKeyFromQuery,
  prepareReportContext,
  auditAction("EXPORT_REPORT_EXCEL", "REPORT", (req) => req.params.reportKey),
  exportExcelReport
);

export { financialReportingRouter };