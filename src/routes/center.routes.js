import { Router } from "express";
import { requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import {
  getCenterMe,
  getCenterDashboard,
  listCenterAvailableCourses,
  getCenterAssignWorksheetsContext,
  listMockTests,
  createMockTest,
  updateMockTestStatus,
  getMockTest,
  saveCenterWorksheetAssignments,
  upsertMockTestResults,
  listCenterReassignmentRequests,
  reviewCenterReassignmentRequest,
  centerDirectReassign,
  centerBulkAssignWorksheet,
  getCenterPracticeFeatures,
  getStudentPracticeFeatures,
  assignStudentFeature,
  unassignStudentFeature,
  listStudentsWithPracticeFeatures,
  getCenterStudentAttendanceHistory,
  listCenterAttendanceHistory,
  getStudent360,
} from "../controllers/center.controller.js";
import { getCenterCapacityController } from "../controllers/capacity.controller.js";
import {
  getCenterAttendanceHealthDashboard,
  getCenterBatchHealthDashboard,
  getCenterOperationalAnomaliesDashboard,
  getCenterOperationalOverview,
  getCenterOperationalTrendsDashboard,
  getCenterTeacherOperationsDashboard,
  getCenterWorksheetOperationsDashboard
} from "../controllers/center-dashboard.controller.js";
import {
  acknowledgeCenterWorkflowAction,
  escalateCenterWorkflowToFranchiseAction,
  getCenterWorkflowById,
  getCenterWorkflowHistoryById,
  listCenterAnomalyWorkflowQueue,
  listCenterAttendanceWorkflowQueue,
  listCenterTeacherWorkflowQueue,
  listCenterWorkflowQueue,
  listCenterWorksheetWorkflowQueue,
  reopenCenterWorkflowAction,
  resolveCenterWorkflowAction,
  reviewCenterWorkflowAction,
  scheduleCenterWorkflowFollowUpAction,
  startCenterWorkflowRecoveryAction
} from "../controllers/center-workflow.controller.js";

const centerRouter = Router();

centerRouter.use(requireRole("CENTER"));

centerRouter.get("/me", auditAction("CENTER_VIEW_PROFILE", "CENTER"), getCenterMe);
centerRouter.get("/dashboard", auditAction("CENTER_VIEW_DASHBOARD", "CENTER"), getCenterDashboard);
centerRouter.get("/capacity", auditAction("CENTER_VIEW_CAPACITY", "CENTER"), getCenterCapacityController);
centerRouter.get("/dashboard/overview", auditAction("CENTER_VIEW_DASHBOARD", "CENTER"), getCenterOperationalOverview);
centerRouter.get("/dashboard/attendance-health", auditAction("CENTER_VIEW_DASHBOARD", "CENTER"), getCenterAttendanceHealthDashboard);
centerRouter.get("/dashboard/worksheet-ops", auditAction("CENTER_VIEW_DASHBOARD", "CENTER"), getCenterWorksheetOperationsDashboard);
centerRouter.get("/dashboard/teacher-ops", auditAction("CENTER_VIEW_DASHBOARD", "CENTER"), getCenterTeacherOperationsDashboard);
centerRouter.get("/dashboard/batch-health", auditAction("CENTER_VIEW_DASHBOARD", "CENTER"), getCenterBatchHealthDashboard);
centerRouter.get("/dashboard/anomalies", auditAction("CENTER_VIEW_DASHBOARD", "CENTER"), getCenterOperationalAnomaliesDashboard);
centerRouter.get("/dashboard/trends", auditAction("CENTER_VIEW_DASHBOARD", "CENTER"), getCenterOperationalTrendsDashboard);
centerRouter.get(
  "/workflows/queues",
  auditAction("CENTER_VIEW_WORKFLOW_QUEUE", "CENTER_OPERATIONAL_WORKFLOW"),
  listCenterWorkflowQueue
);
centerRouter.get(
  "/workflows/queues/attendance",
  auditAction("CENTER_VIEW_WORKFLOW_QUEUE", "CENTER_OPERATIONAL_WORKFLOW"),
  listCenterAttendanceWorkflowQueue
);
centerRouter.get(
  "/workflows/queues/worksheets",
  auditAction("CENTER_VIEW_WORKFLOW_QUEUE", "CENTER_OPERATIONAL_WORKFLOW"),
  listCenterWorksheetWorkflowQueue
);
centerRouter.get(
  "/workflows/queues/teachers",
  auditAction("CENTER_VIEW_WORKFLOW_QUEUE", "CENTER_OPERATIONAL_WORKFLOW"),
  listCenterTeacherWorkflowQueue
);
centerRouter.get(
  "/workflows/queues/anomalies",
  auditAction("CENTER_VIEW_WORKFLOW_QUEUE", "CENTER_OPERATIONAL_WORKFLOW"),
  listCenterAnomalyWorkflowQueue
);
centerRouter.get(
  "/workflows/:id",
  auditAction("CENTER_VIEW_WORKFLOW_DETAIL", "CENTER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  getCenterWorkflowById
);
centerRouter.get(
  "/workflows/:id/history",
  auditAction("CENTER_VIEW_WORKFLOW_HISTORY", "CENTER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  getCenterWorkflowHistoryById
);
centerRouter.post(
  "/workflows/:id/actions/review",
  auditAction("CENTER_REVIEW_WORKFLOW", "CENTER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  reviewCenterWorkflowAction
);
centerRouter.post(
  "/workflows/:id/actions/acknowledge",
  auditAction("CENTER_ACKNOWLEDGE_WORKFLOW", "CENTER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  acknowledgeCenterWorkflowAction
);
centerRouter.post(
  "/workflows/:id/actions/start-recovery",
  auditAction("CENTER_START_WORKFLOW_RECOVERY", "CENTER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  startCenterWorkflowRecoveryAction
);
centerRouter.post(
  "/workflows/:id/actions/schedule-follow-up",
  auditAction("CENTER_SCHEDULE_WORKFLOW_FOLLOW_UP", "CENTER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  scheduleCenterWorkflowFollowUpAction
);
centerRouter.post(
  "/workflows/:id/actions/escalate",
  auditAction("CENTER_ESCALATE_WORKFLOW", "CENTER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  escalateCenterWorkflowToFranchiseAction
);
centerRouter.post(
  "/workflows/:id/actions/resolve",
  auditAction("CENTER_RESOLVE_WORKFLOW", "CENTER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  resolveCenterWorkflowAction
);
centerRouter.post(
  "/workflows/:id/actions/reopen",
  auditAction("CENTER_REOPEN_WORKFLOW", "CENTER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  reopenCenterWorkflowAction
);

centerRouter.get(
  "/available-courses",
  auditAction("CENTER_VIEW_AVAILABLE_COURSES", "COURSE"),
  listCenterAvailableCourses
);

centerRouter.get(
  "/students/:studentId/assign-worksheets",
  auditAction("CENTER_VIEW_ASSIGN_WORKSHEETS", "STUDENT", (req) => req.params.studentId),
  getCenterAssignWorksheetsContext
);

centerRouter.post(
  "/students/:studentId/assign-worksheets",
  auditAction("CENTER_SAVE_ASSIGN_WORKSHEETS", "STUDENT", (req) => req.params.studentId),
  saveCenterWorksheetAssignments
);

centerRouter.get("/mock-tests", auditAction("CENTER_LIST_MOCK_TESTS", "MOCK_TEST"), listMockTests);
centerRouter.post("/mock-tests", auditAction("CENTER_CREATE_MOCK_TEST", "MOCK_TEST"), createMockTest);
centerRouter.get("/mock-tests/:id", auditAction("CENTER_VIEW_MOCK_TEST", "MOCK_TEST", (req) => req.params.id), getMockTest);
centerRouter.patch(
  "/mock-tests/:id/status",
  auditAction("CENTER_UPDATE_MOCK_TEST_STATUS", "MOCK_TEST", (req) => req.params.id),
  updateMockTestStatus
);
centerRouter.put(
  "/mock-tests/:id/results",
  auditAction("CENTER_SAVE_MOCK_TEST_RESULTS", "MOCK_TEST", (req) => req.params.id),
  upsertMockTestResults
);

/* ── Reassignment ── */
centerRouter.get("/reassignment-requests", listCenterReassignmentRequests);
centerRouter.post(
  "/reassignment-requests/:requestId/review",
  auditAction("CENTER_REVIEW_REASSIGNMENT", "REASSIGNMENT_REQUEST", (req) => req.params.requestId),
  reviewCenterReassignmentRequest
);
centerRouter.post(
  "/students/:studentId/reassign",
  auditAction("CENTER_DIRECT_REASSIGN", "STUDENT", (req) => req.params.studentId),
  centerDirectReassign
);
centerRouter.post(
  "/worksheets/bulk-assign",
  auditAction("CENTER_BULK_ASSIGN_WORKSHEET", "WORKSHEET"),
  centerBulkAssignWorksheet
);

/* ── Practice Feature Management ── */
centerRouter.get(
  "/practice-features",
  auditAction("CENTER_VIEW_PRACTICE_FEATURES", "PRACTICE_FEATURE"),
  getCenterPracticeFeatures
);

centerRouter.get(
  "/practice-features/students",
  auditAction("CENTER_LIST_STUDENTS_PRACTICE_FEATURES", "PRACTICE_FEATURE"),
  listStudentsWithPracticeFeatures
);

centerRouter.get(
  "/students/:studentId/attendance-history",
  auditAction("CENTER_VIEW_STUDENT_ATTENDANCE_HISTORY", "STUDENT", (req) => req.params.studentId),
  getCenterStudentAttendanceHistory
);

centerRouter.get(
  "/students/:studentId/360",
  auditAction("CENTER_VIEW_STUDENT_360", "STUDENT", (req) => req.params.studentId),
  getStudent360
);

centerRouter.get(
  "/attendance-history",
  auditAction("CENTER_VIEW_ATTENDANCE_HISTORY", "CENTER"),
  listCenterAttendanceHistory
);

centerRouter.get(
  "/students/:studentId/practice-features",
  auditAction("CENTER_VIEW_STUDENT_PRACTICE_FEATURES", "STUDENT", (req) => req.params.studentId),
  getStudentPracticeFeatures
);

centerRouter.post(
  "/students/:studentId/practice-features",
  auditAction("CENTER_ASSIGN_STUDENT_PRACTICE_FEATURE", "STUDENT", (req) => req.params.studentId),
  assignStudentFeature
);

centerRouter.delete(
  "/students/:studentId/practice-features/:featureKey",
  auditAction("CENTER_UNASSIGN_STUDENT_PRACTICE_FEATURE", "STUDENT", (req) => req.params.studentId),
  unassignStudentFeature
);

/* ── Intelligence ── */
import {
  getCenterIntel,
  getCenterHealth,
  getCenterTeacherWorkload,
  getCenterAnomalies,
  getCenterFeePulse,
} from "../controllers/leadership-intel.controller.js";
import { getCenterAiNarrative } from "../controllers/ai-narrative.controller.js";

centerRouter.get("/intel/dashboard", getCenterIntel);
centerRouter.get("/intel/health", getCenterHealth);
centerRouter.get("/intel/teacher-workload", getCenterTeacherWorkload);
centerRouter.get("/intel/anomalies", getCenterAnomalies);
centerRouter.get("/intel/fee-pulse", getCenterFeePulse);

/* ── AI Narrative (Phase 10) ── */
centerRouter.get("/ai/narrative", getCenterAiNarrative);

export { centerRouter };
