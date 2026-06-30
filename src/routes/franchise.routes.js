import { Router } from "express";
import { requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import { requireFranchiseScope } from "../middleware/franchise-scope.js";
import { requireScopeAccess } from "../middleware/scope-access.js";
import {
  getFranchiseCenterHealthDashboard,
  getFranchiseOperationalAnomalies,
  getFranchiseOperationalOverview,
  getFranchiseOperationalTrends,
  getFranchiseTeacherOperations
} from "../controllers/franchise-dashboard.controller.js";
import {
  acknowledgeFranchiseEscalationAction,
  acknowledgeFranchiseWorkflowAction,
  escalateFranchiseCenterRiskAction,
  forwardFranchiseEscalationAction,
  getFranchiseWorkflowById,
  getFranchiseWorkflowHistoryById,
  listFranchiseWorkflowAnomalyQueue,
  listFranchiseWorkflowEscalationQueue,
  listFranchiseWorkflowQueue,
  listFranchiseWorkflowReviewQueue,
  reopenFranchiseWorkflowAction,
  requestFranchiseCenterActionHandler,
  resolveFranchiseWorkflowAction,
  reviewFranchiseWorkflowAction
} from "../controllers/franchise-workflow.controller.js";
import {
  createCenter,
  deleteCenter,
  resetCenterPassword,
  exportFranchiseReportsCsv,
  exportFranchiseStudentsCsv,
  forwardFranchiseCompetitionRequest,
  getFranchiseDashboard,
  getFranchiseMe,
  getFranchiseReports,
  listFranchiseCenters,
  listFranchiseCompetitionRequests,
  listFranchiseCourses,
  listFranchiseMargins,
  listFranchiseSettlements,
  listFranchiseStudents,
  rejectFranchiseCompetitionRequest,
  updateCenter,
  updateFranchiseProfile
} from "../controllers/franchise.controller.js";
import {
  listFranchiseCompetitionCenters,
  getFranchiseCompetitionCenterDetail,
  returnFranchiseCompetitionCenter,
  approveFranchiseCompetitionCenter,
  submitFranchiseCompetition
} from "../controllers/franchise-competition.controller.js";

const franchiseRouter = Router();

franchiseRouter.use(requireRole("FRANCHISE"));
franchiseRouter.use(requireFranchiseScope);

franchiseRouter.get("/me", auditAction("FRANCHISE_VIEW_PROFILE", "FRANCHISE"), getFranchiseMe);

franchiseRouter.patch(
  "/profile",
  auditAction("FRANCHISE_UPDATE_PROFILE", "FRANCHISE"),
  updateFranchiseProfile
);

franchiseRouter.get(
  "/dashboard",
  auditAction("FRANCHISE_VIEW_DASHBOARD", "FRANCHISE"),
  getFranchiseDashboard
);

franchiseRouter.get(
  "/dashboard/overview",
  auditAction("FRANCHISE_VIEW_DASHBOARD", "FRANCHISE"),
  getFranchiseOperationalOverview
);

franchiseRouter.get(
  "/dashboard/center-health",
  auditAction("FRANCHISE_VIEW_DASHBOARD", "CENTER"),
  getFranchiseCenterHealthDashboard
);

franchiseRouter.get(
  "/dashboard/teacher-ops",
  auditAction("FRANCHISE_VIEW_DASHBOARD", "TEACHER"),
  getFranchiseTeacherOperations
);

franchiseRouter.get(
  "/dashboard/anomalies",
  auditAction("FRANCHISE_VIEW_DASHBOARD", "FRANCHISE"),
  getFranchiseOperationalAnomalies
);

franchiseRouter.get(
  "/dashboard/trends",
  auditAction("FRANCHISE_VIEW_DASHBOARD", "FRANCHISE"),
  getFranchiseOperationalTrends
);

franchiseRouter.get(
  "/workflows/queues",
  auditAction("FRANCHISE_VIEW_WORKFLOW_QUEUE", "FRANCHISE_OPERATIONAL_WORKFLOW"),
  listFranchiseWorkflowQueue
);

franchiseRouter.get(
  "/workflows/queues/reviews",
  auditAction("FRANCHISE_VIEW_WORKFLOW_QUEUE", "FRANCHISE_OPERATIONAL_WORKFLOW"),
  listFranchiseWorkflowReviewQueue
);

franchiseRouter.get(
  "/workflows/queues/anomalies",
  auditAction("FRANCHISE_VIEW_WORKFLOW_QUEUE", "FRANCHISE_OPERATIONAL_WORKFLOW"),
  listFranchiseWorkflowAnomalyQueue
);

franchiseRouter.get(
  "/workflows/queues/escalations",
  auditAction("FRANCHISE_VIEW_WORKFLOW_QUEUE", "FRANCHISE_OPERATIONAL_WORKFLOW"),
  listFranchiseWorkflowEscalationQueue
);

franchiseRouter.get(
  "/workflows/:id",
  auditAction("FRANCHISE_VIEW_WORKFLOW_DETAIL", "FRANCHISE_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  getFranchiseWorkflowById
);

franchiseRouter.get(
  "/workflows/:id/history",
  auditAction("FRANCHISE_VIEW_WORKFLOW_HISTORY", "FRANCHISE_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  getFranchiseWorkflowHistoryById
);

franchiseRouter.post(
  "/workflows/:id/actions/review",
  auditAction("FRANCHISE_REVIEW_WORKFLOW", "FRANCHISE_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  reviewFranchiseWorkflowAction
);

franchiseRouter.post(
  "/workflows/:id/actions/acknowledge",
  auditAction("FRANCHISE_ACKNOWLEDGE_WORKFLOW", "FRANCHISE_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  acknowledgeFranchiseWorkflowAction
);

franchiseRouter.post(
  "/workflows/:id/actions/request-center-action",
  auditAction("FRANCHISE_REQUEST_CENTER_ACTION", "FRANCHISE_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  requestFranchiseCenterActionHandler
);

franchiseRouter.post(
  "/workflows/:id/actions/escalate",
  auditAction("FRANCHISE_ESCALATE_CENTER_RISK", "FRANCHISE_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  escalateFranchiseCenterRiskAction
);

franchiseRouter.post(
  "/workflows/:id/actions/acknowledge-escalation",
  auditAction("FRANCHISE_ACKNOWLEDGE_ESCALATION", "FRANCHISE_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  acknowledgeFranchiseEscalationAction
);

franchiseRouter.post(
  "/workflows/:id/actions/forward",
  auditAction("FRANCHISE_FORWARD_ESCALATION", "FRANCHISE_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  forwardFranchiseEscalationAction
);

franchiseRouter.post(
  "/workflows/:id/actions/resolve",
  auditAction("FRANCHISE_RESOLVE_WORKFLOW", "FRANCHISE_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  resolveFranchiseWorkflowAction
);

franchiseRouter.post(
  "/workflows/:id/actions/reopen",
  auditAction("FRANCHISE_REOPEN_WORKFLOW", "FRANCHISE_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  reopenFranchiseWorkflowAction
);

franchiseRouter.get(
  "/margins",
  auditAction("FRANCHISE_VIEW_MARGINS", "MARGIN"),
  listFranchiseMargins
);

franchiseRouter.get(
  "/settlements",
  auditAction("FRANCHISE_VIEW_SETTLEMENTS", "SETTLEMENT"),
  listFranchiseSettlements
);

franchiseRouter.get(
  "/centers",
  auditAction("FRANCHISE_LIST_CENTERS", "CENTER"),
  listFranchiseCenters
);

franchiseRouter.post(
  "/centers",
  auditAction("FRANCHISE_CREATE_CENTER", "CENTER"),
  createCenter
);

franchiseRouter.put(
  "/centers/:id",
  auditAction("FRANCHISE_UPDATE_CENTER", "CENTER", (req) => req.params.id),
  updateCenter
);

franchiseRouter.delete(
  "/centers/:id",
  auditAction("FRANCHISE_DELETE_CENTER", "CENTER", (req) => req.params.id),
  deleteCenter
);

franchiseRouter.post(
  "/centers/:id/reset-password",
  auditAction("FRANCHISE_RESET_CENTER_PASSWORD", "CENTER", (req) => req.params.id),
  resetCenterPassword
);

franchiseRouter.get(
  "/students",
  auditAction("FRANCHISE_VIEW_STUDENTS", "STUDENT"),
  listFranchiseStudents
);

franchiseRouter.get(
  "/students/export.csv",
  auditAction("FRANCHISE_EXPORT_STUDENTS", "STUDENT"),
  exportFranchiseStudentsCsv
);

franchiseRouter.get(
  "/reports",
  auditAction("FRANCHISE_VIEW_REPORTS", "REPORT"),
  getFranchiseReports
);

franchiseRouter.get(
  "/reports/export.csv",
  auditAction("FRANCHISE_EXPORT_REPORTS", "REPORT"),
  exportFranchiseReportsCsv
);

franchiseRouter.get(
  "/competition_requests",
  auditAction("FRANCHISE_VIEW_COMPETITION_REQUESTS", "COMPETITION"),
  listFranchiseCompetitionRequests
);

franchiseRouter.post(
  "/competition_requests/:id/forward",
  requireScopeAccess("competition", "id"),
  auditAction("FRANCHISE_FORWARD_COMPETITION_REQUEST", "COMPETITION", (req) => req.params.id),
  forwardFranchiseCompetitionRequest
);

franchiseRouter.post(
  "/competition_requests/:id/reject",
  requireScopeAccess("competition", "id"),
  auditAction("FRANCHISE_REJECT_COMPETITION_REQUEST", "COMPETITION", (req) => req.params.id),
  rejectFranchiseCompetitionRequest
);

/* Competition center review endpoints */
franchiseRouter.get(
  "/competitions/:competitionId/centers",
  requireScopeAccess("competition", "competitionId"),
  auditAction("FRANCHISE_LIST_COMPETITION_CENTERS", "COMPETITION"),
  listFranchiseCompetitionCenters
);

franchiseRouter.get(
  "/competitions/:competitionId/centers/:centerId",
  requireScopeAccess("competition", "competitionId"),
  auditAction("FRANCHISE_VIEW_COMPETITION_CENTER", "COMPETITION", (req) => req.params.competitionId),
  getFranchiseCompetitionCenterDetail
);

franchiseRouter.post(
  "/competitions/:competitionId/centers/:centerId/return",
  requireScopeAccess("competition", "competitionId"),
  auditAction("FRANCHISE_RETURN_COMPETITION_CENTER", "COMPETITION", (req) => req.params.competitionId),
  returnFranchiseCompetitionCenter
);

franchiseRouter.post(
  "/competitions/:competitionId/centers/:centerId/approve",
  requireScopeAccess("competition", "competitionId"),
  auditAction("FRANCHISE_APPROVE_COMPETITION_CENTER", "COMPETITION", (req) => req.params.competitionId),
  approveFranchiseCompetitionCenter
);

franchiseRouter.post(
  "/competitions/:competitionId/submit",
  requireScopeAccess("competition", "competitionId"),
  auditAction("FRANCHISE_SUBMIT_COMPETITION", "COMPETITION", (req) => req.params.competitionId),
  submitFranchiseCompetition
);

franchiseRouter.get(
  "/courses",
  auditAction("FRANCHISE_VIEW_COURSES", "COURSE"),
  listFranchiseCourses
);

/* ── Intelligence ── */
import { getFranchiseNetworkPulse } from "../controllers/leadership-intel.controller.js";
import { getFranchiseAiNarrative } from "../controllers/ai-narrative.controller.js";

franchiseRouter.get("/intel/network-pulse", getFranchiseNetworkPulse);

/* ── AI Narrative (Phase 10) ── */
franchiseRouter.get("/ai/narrative", getFranchiseAiNarrative);

export { franchiseRouter };
