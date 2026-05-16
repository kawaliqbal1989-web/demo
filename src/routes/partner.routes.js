import { Router } from "express";
import { requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import { requireBusinessPartnerScope } from "../middleware/partner-scope.js";
import {
  exportPartnerStudentsCsv,
  getPartnerDashboard,
  listPartnerStudents,
  listPartnerCertificates,
  issuePartnerCertificate,
  bulkIssuePartnerCertificates,
  listEligibleStudentsForCertificate,
  revokePartnerCertificate,
  exportPartnerCertificatesCsv,
  getPartnerProfile,
  updatePartnerProfile,
  listPartnerCourses,
  listPartnerHierarchy,
  listPartnerCompetitionRequests,
  submitPartnerCompetitionRequest,
  forwardPartnerCompetitionRequest
} from "../controllers/partner.controller.js";
import {
  getOperationalPartnerUnreadCount,
  listOperationalPartnerNotifications,
  markAllOperationalPartnerNotificationsRead,
  markOperationalPartnerNotificationRead
} from "../controllers/notifications.controller.js";
import {
  approvePartnerSettlementWorkflow,
  createPartnerSettlementSupportingRecord,
  escalatePartnerSettlementWorkflow,
  getPartnerSettlementWorkflowDetail,
  getPartnerSettlementWorkflowQueueSummary,
  listPartnerSettlementSupportingRecords,
  listPartnerSettlementWorkflowEscalations,
  listPartnerSettlementWorkflowHistory,
  listPartnerSettlementWorkflowTasks,
  listPartnerSettlementWorkflows,
  markPartnerSettlementPaid,
  rejectPartnerSettlementWorkflow,
  reopenPartnerSettlementWorkflow,
  resolvePartnerSettlementEscalation,
  reviewPartnerSettlementWorkflow,
  submitPartnerSettlementWorkflow
} from "../controllers/settlement-workflow.controller.js";
import {
  getBpDashboardCenterHealth,
  getBpDashboardFranchiseRanking,
  getBpDashboardOverview,
  getBpDashboardRevenueTrend,
  getBpDashboardStudentGrowthTrend,
  getBpFranchiseAlerts,
  getBpFranchiseCenters,
  getBpFranchiseOverview,
  getBpFranchiseRevenueTrend,
  getBpFranchiseStudentGrowth
} from "../controllers/bp-dashboard.controller.js";
import {
  getCertificateTemplate,
  upsertCertificateTemplate,
  uploadSignatureImage,
  uploadAffiliationLogo,
  uploadStampImage,
  uploadBackgroundImage
} from "../controllers/certificate-template.controller.js";
import {
  certificateSignatureUpload,
  certificateAffiliationLogoUpload,
  certificateStampUpload,
  certificateBackgroundUpload
} from "../middleware/upload.js";
import { getBpNetworkPulse } from "../controllers/leadership-intel.controller.js";
import { getBpAiNarrative } from "../controllers/ai-narrative.controller.js";

const partnerRouter = Router();

partnerRouter.use(requireRole("BP"));
partnerRouter.use(requireBusinessPartnerScope);

partnerRouter.get(
  "/dashboard",
  auditAction("BP_VIEW_DASHBOARD", "BUSINESS_PARTNER"),
  getPartnerDashboard
);

partnerRouter.get(
  "/dashboard/overview",
  auditAction("BP_VIEW_DASHBOARD_OVERVIEW", "BUSINESS_PARTNER"),
  getBpDashboardOverview
);

partnerRouter.get(
  "/dashboard/revenue-trend",
  auditAction("BP_VIEW_DASHBOARD_REVENUE_TREND", "BUSINESS_PARTNER"),
  getBpDashboardRevenueTrend
);

partnerRouter.get(
  "/dashboard/student-growth-trend",
  auditAction("BP_VIEW_DASHBOARD_STUDENT_GROWTH_TREND", "BUSINESS_PARTNER"),
  getBpDashboardStudentGrowthTrend
);

partnerRouter.get(
  "/dashboard/franchise-ranking",
  auditAction("BP_VIEW_DASHBOARD_FRANCHISE_RANKING", "BUSINESS_PARTNER"),
  getBpDashboardFranchiseRanking
);

partnerRouter.get(
  "/dashboard/center-health",
  auditAction("BP_VIEW_DASHBOARD_CENTER_HEALTH", "BUSINESS_PARTNER"),
  getBpDashboardCenterHealth
);

partnerRouter.get(
  "/notifications/operational",
  auditAction("BP_VIEW_OPERATIONAL_NOTIFICATIONS", "BUSINESS_PARTNER"),
  listOperationalPartnerNotifications
);

partnerRouter.get(
  "/notifications/operational/unread-count",
  auditAction("BP_VIEW_OPERATIONAL_NOTIFICATION_UNREAD", "BUSINESS_PARTNER"),
  getOperationalPartnerUnreadCount
);

partnerRouter.patch(
  "/notifications/operational/read-all",
  auditAction("BP_MARK_ALL_OPERATIONAL_NOTIFICATIONS_READ", "BUSINESS_PARTNER"),
  markAllOperationalPartnerNotificationsRead
);

partnerRouter.patch(
  "/notifications/operational/:id/read",
  auditAction("BP_MARK_OPERATIONAL_NOTIFICATION_READ", "BUSINESS_PARTNER", (req) => req.params.id),
  markOperationalPartnerNotificationRead
);

partnerRouter.get(
  "/workflows/settlements",
  auditAction("BP_VIEW_SETTLEMENT_WORKFLOWS", "SETTLEMENT"),
  listPartnerSettlementWorkflows
);

partnerRouter.get(
  "/workflows/settlements/queue/summary",
  auditAction("BP_VIEW_SETTLEMENT_WORKFLOW_QUEUE", "SETTLEMENT"),
  getPartnerSettlementWorkflowQueueSummary
);

partnerRouter.get(
  "/workflows/settlements/:id",
  auditAction("BP_VIEW_SETTLEMENT_WORKFLOW_DETAIL", "SETTLEMENT", (req) => req.params.id),
  getPartnerSettlementWorkflowDetail
);

partnerRouter.get(
  "/workflows/settlements/:id/history",
  auditAction("BP_VIEW_SETTLEMENT_WORKFLOW_HISTORY", "SETTLEMENT", (req) => req.params.id),
  listPartnerSettlementWorkflowHistory
);

partnerRouter.get(
  "/workflows/settlements/:id/tasks",
  auditAction("BP_VIEW_SETTLEMENT_WORKFLOW_TASKS", "SETTLEMENT", (req) => req.params.id),
  listPartnerSettlementWorkflowTasks
);

partnerRouter.get(
  "/workflows/settlements/:id/escalations",
  auditAction("BP_VIEW_SETTLEMENT_WORKFLOW_ESCALATIONS", "SETTLEMENT", (req) => req.params.id),
  listPartnerSettlementWorkflowEscalations
);

partnerRouter.get(
  "/workflows/settlements/:id/supporting-records",
  auditAction("BP_VIEW_SETTLEMENT_SUPPORTING_RECORDS", "SETTLEMENT", (req) => req.params.id),
  listPartnerSettlementSupportingRecords
);

partnerRouter.post(
  "/workflows/settlements/:id/actions/submit",
  auditAction("BP_SUBMIT_SETTLEMENT_WORKFLOW", "SETTLEMENT", (req) => req.params.id),
  submitPartnerSettlementWorkflow
);

partnerRouter.post(
  "/workflows/settlements/:id/actions/review",
  auditAction("BP_REVIEW_SETTLEMENT_WORKFLOW", "SETTLEMENT", (req) => req.params.id),
  reviewPartnerSettlementWorkflow
);

partnerRouter.post(
  "/workflows/settlements/:id/actions/approve",
  auditAction("BP_APPROVE_SETTLEMENT_WORKFLOW", "SETTLEMENT", (req) => req.params.id),
  approvePartnerSettlementWorkflow
);

partnerRouter.post(
  "/workflows/settlements/:id/actions/reject",
  auditAction("BP_REJECT_SETTLEMENT_WORKFLOW", "SETTLEMENT", (req) => req.params.id),
  rejectPartnerSettlementWorkflow
);

partnerRouter.post(
  "/workflows/settlements/:id/actions/reopen",
  auditAction("BP_REOPEN_SETTLEMENT_WORKFLOW", "SETTLEMENT", (req) => req.params.id),
  reopenPartnerSettlementWorkflow
);

partnerRouter.post(
  "/workflows/settlements/:id/actions/escalate",
  auditAction("BP_ESCALATE_SETTLEMENT_WORKFLOW", "SETTLEMENT", (req) => req.params.id),
  escalatePartnerSettlementWorkflow
);

partnerRouter.post(
  "/workflows/settlements/:id/actions/resolve-escalation",
  auditAction("BP_RESOLVE_SETTLEMENT_ESCALATION", "SETTLEMENT", (req) => req.params.id),
  resolvePartnerSettlementEscalation
);

partnerRouter.post(
  "/workflows/settlements/:id/actions/mark-paid",
  auditAction("BP_MARK_SETTLEMENT_PAID", "SETTLEMENT", (req) => req.params.id),
  markPartnerSettlementPaid
);

partnerRouter.post(
  "/workflows/settlements/:id/supporting-records",
  auditAction("BP_CREATE_SETTLEMENT_SUPPORTING_RECORD", "SETTLEMENT", (req) => req.params.id),
  createPartnerSettlementSupportingRecord
);

partnerRouter.get(
  "/franchises/:id/overview",
  auditAction("BP_VIEW_FRANCHISE_OVERVIEW", "FRANCHISE_PROFILE", (req) => req.params.id),
  getBpFranchiseOverview
);

partnerRouter.get(
  "/franchises/:id/revenue-trend",
  auditAction("BP_VIEW_FRANCHISE_REVENUE_TREND", "FRANCHISE_PROFILE", (req) => req.params.id),
  getBpFranchiseRevenueTrend
);

partnerRouter.get(
  "/franchises/:id/student-growth",
  auditAction("BP_VIEW_FRANCHISE_STUDENT_GROWTH", "FRANCHISE_PROFILE", (req) => req.params.id),
  getBpFranchiseStudentGrowth
);

partnerRouter.get(
  "/franchises/:id/centers",
  auditAction("BP_VIEW_FRANCHISE_CENTERS", "FRANCHISE_PROFILE", (req) => req.params.id),
  getBpFranchiseCenters
);

partnerRouter.get(
  "/franchises/:id/alerts",
  auditAction("BP_VIEW_FRANCHISE_ALERTS", "FRANCHISE_PROFILE", (req) => req.params.id),
  getBpFranchiseAlerts
);

partnerRouter.get(
  "/profile",
  auditAction("BP_VIEW_PROFILE", "BUSINESS_PARTNER"),
  getPartnerProfile
);

partnerRouter.patch(
  "/profile",
  auditAction("BP_UPDATE_PROFILE", "BUSINESS_PARTNER"),
  updatePartnerProfile
);

partnerRouter.get(
  "/students",
  auditAction("BP_VIEW_STUDENTS", "STUDENT"),
  listPartnerStudents
);

partnerRouter.get(
  "/students/export.csv",
  auditAction("BP_EXPORT_STUDENTS", "STUDENT"),
  exportPartnerStudentsCsv
);

partnerRouter.get(
  "/certificates",
  auditAction("BP_VIEW_CERTIFICATES", "CERTIFICATE"),
  listPartnerCertificates
);

partnerRouter.get(
  "/certificates/export.csv",
  auditAction("BP_EXPORT_CERTIFICATES", "CERTIFICATE"),
  exportPartnerCertificatesCsv
);

partnerRouter.get(
  "/certificates/eligible",
  auditAction("BP_VIEW_ELIGIBLE_STUDENTS", "CERTIFICATE"),
  listEligibleStudentsForCertificate
);

partnerRouter.post(
  "/certificates",
  auditAction("BP_ISSUE_CERTIFICATE", "CERTIFICATE"),
  issuePartnerCertificate
);

partnerRouter.post(
  "/certificates/bulk",
  auditAction("BP_BULK_ISSUE_CERTIFICATES", "CERTIFICATE"),
  bulkIssuePartnerCertificates
);

partnerRouter.patch(
  "/certificates/:id/revoke",
  auditAction("BP_REVOKE_CERTIFICATE", "CERTIFICATE", (req) => req.params.id),
  revokePartnerCertificate
);

partnerRouter.get(
  "/courses",
  auditAction("BP_VIEW_COURSES", "COURSE"),
  listPartnerCourses
);

partnerRouter.get(
  "/hierarchy",
  auditAction("BP_VIEW_HIERARCHY", "HIERARCHY_NODE"),
  listPartnerHierarchy
);

partnerRouter.get(
  "/competition_requests",
  auditAction("BP_VIEW_COMPETITION_REQUESTS", "COMPETITION"),
  listPartnerCompetitionRequests
);

partnerRouter.post(
  "/competition_requests",
  auditAction("BP_SUBMIT_COMPETITION_REQUEST", "COMPETITION"),
  submitPartnerCompetitionRequest
);

partnerRouter.post(
  "/competition_requests/:id/forward",
  auditAction("BP_FORWARD_COMPETITION_REQUEST", "COMPETITION", (req) => req.params.id),
  forwardPartnerCompetitionRequest
);

// Certificate template routes
partnerRouter.get(
  "/certificate-template",
  auditAction("BP_VIEW_CERTIFICATE_TEMPLATE", "CERTIFICATE_TEMPLATE"),
  getCertificateTemplate
);

partnerRouter.put(
  "/certificate-template",
  auditAction("BP_UPDATE_CERTIFICATE_TEMPLATE", "CERTIFICATE_TEMPLATE"),
  upsertCertificateTemplate
);

partnerRouter.post(
  "/certificate-template/signature",
  certificateSignatureUpload,
  auditAction("BP_UPLOAD_CERTIFICATE_SIGNATURE", "CERTIFICATE_TEMPLATE"),
  uploadSignatureImage
);

partnerRouter.post(
  "/certificate-template/affiliation-logo",
  certificateAffiliationLogoUpload,
  auditAction("BP_UPLOAD_CERTIFICATE_AFFILIATION_LOGO", "CERTIFICATE_TEMPLATE"),
  uploadAffiliationLogo
);

partnerRouter.post(
  "/certificate-template/stamp",
  certificateStampUpload,
  auditAction("BP_UPLOAD_CERTIFICATE_STAMP", "CERTIFICATE_TEMPLATE"),
  uploadStampImage
);

partnerRouter.post(
  "/certificate-template/background",
  certificateBackgroundUpload,
  auditAction("BP_UPLOAD_CERTIFICATE_BACKGROUND", "CERTIFICATE_TEMPLATE"),
  uploadBackgroundImage
);

partnerRouter.get("/intel/network-pulse", getBpNetworkPulse);

/* ── AI Narrative (Phase 10) ── */
partnerRouter.get("/ai/narrative", getBpAiNarrative);

export { partnerRouter };
