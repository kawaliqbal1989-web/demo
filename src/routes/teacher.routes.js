import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import {
  getCockpitDashboard,
  getAtRisk,
  getBatches as getCockpitBatches,
  getRecommendations,
  getInterventions,
} from "../controllers/teacher-cockpit.controller.js";
import { getTeacherAiNarrative } from "../controllers/ai-narrative.controller.js";
import {
  getTeacherMe,
  updateTeacherProfile,
  listTeacherBatches,
  getTeacherBatchRoster,
  listTeacherStudents,
  getTeacherStudent,
  listTeacherStudentMaterials,
  getTeacherStudentPracticeReport,
  listTeacherStudentAttempts,
  exportTeacherStudentAttemptsCsv,
  overrideTeacherStudentPromotion,
  getTeacherBatchWorksheetsContext,
  assignTeacherBatchWorksheet,
  assignTeacherBatchWorksheetToStudents,
  listTeacherBatchMockTests,
  getTeacherMockTest,
  upsertTeacherMockTestResults,
  listTeacherNotesForStudent,
  createTeacherNoteForStudent,
  updateTeacherNote,
  deleteTeacherNote,
  createTeacherAttendanceSession,
  listTeacherAttendanceSessions,
  listTeacherBatchAttendanceHistory,
  exportTeacherBatchAttendanceHistoryCsv,
  getTeacherAttendanceSession,
  updateTeacherAttendanceEntries,
  publishTeacherAttendanceSession,
  teacherDirectReassign,
  listTeacherReassignmentRequests,
  reviewTeacherReassignmentRequest,
  rejectLegacyTeacherAssignmentRoute,
  getTeacherStudentAttendanceHistory,
  getTeacherStudent360,
} from "../controllers/teacher-portal.controller.js";
import {
  getTeacherDashboardAnomaliesController,
  getTeacherDashboardAttendanceProductivityController,
  getTeacherFinancialOverviewController,
  getTeacherDashboardGradingProductivityController,
  getTeacherDashboardOverviewController,
  getTeacherDashboardTaskQueueController,
  getTeacherDashboardTrendsController,
} from "../controllers/teacher-dashboard.controller.js";
import {
  acknowledgeTeacherWorkflowAction,
  bulkGradeTeacherWorkflowAction,
  completeTeacherWorkflowGradingAction,
  getTeacherWorkflowById,
  getTeacherWorkflowHistoryById,
  listTeacherAnomalyWorkflowQueue,
  listTeacherAttendanceWorkflowQueue,
  listTeacherGradingWorkflowQueue,
  listTeacherWorkflowQueue,
  markTeacherWorkflowAttendanceAction,
  reopenTeacherWorkflowAction,
  resolveTeacherWorkflowAction,
  reviewTeacherWorkflowAction,
  startTeacherWorkflowRecoveryAction,
} from "../controllers/teacher-workflow.controller.js";

const teacherRouter = Router();

teacherRouter.use(async (req, res, next) => {
  const candidateIds = new Set();

  const paramIds = [req.params?.studentId, req.params?.id];
  for (const value of paramIds) {
    if (value) candidateIds.add(String(value));
  }

  const body = req.body || {};
  const bodyStudentIds = [];
  if (body.studentId) bodyStudentIds.push(body.studentId);
  if (Array.isArray(body.studentIds)) bodyStudentIds.push(...body.studentIds);
  if (Array.isArray(body.attendanceRows)) {
    for (const row of body.attendanceRows) {
      if (row?.studentId) bodyStudentIds.push(row.studentId);
    }
  }
  if (Array.isArray(body.assignments)) {
    for (const row of body.assignments) {
      if (row?.studentId) bodyStudentIds.push(row.studentId);
    }
  }

  for (const value of bodyStudentIds) {
    if (value) candidateIds.add(String(value));
  }

  const ids = Array.from(candidateIds).filter(Boolean);
  if (!ids.length) {
    return next();
  }

  const rows = await prisma.student.findMany({
    where: {
      tenantId: req.auth.tenantId,
      id: { in: ids },
      isActive: true,
      ...(req.auth.role === "TEACHER" && req.auth.hierarchyNodeId
        ? { hierarchyNodeId: req.auth.hierarchyNodeId }
        : {})
    },
    select: { id: true }
  });

  const allowed = new Set(rows.map((row) => row.id));
  const blocked = ids.filter((id) => !allowed.has(id));
  if (blocked.length) {
    return res.status(403).json({
      error: "Inactive or out-of-scope students are not allowed in teacher operations",
      error_code: "INACTIVE_STUDENT_FORBIDDEN",
      blockedStudentIds: blocked
    });
  }

  return next();
});

teacherRouter.use(requireRole("TEACHER"));

teacherRouter.get("/me", getTeacherMe);

teacherRouter.patch(
  "/profile",
  auditAction("TEACHER_UPDATE_PROFILE", "TEACHER"),
  updateTeacherProfile
);

teacherRouter.get("/batches", listTeacherBatches);
teacherRouter.get("/batches/:batchId/roster", getTeacherBatchRoster);
teacherRouter.get(
  "/batches/:batchId/worksheets/context",
  auditAction("TEACHER_VIEW_BATCH_WORKSHEET_CONTEXT", "BATCH", (req) => req.params.batchId),
  getTeacherBatchWorksheetsContext
);
teacherRouter.post(
  "/batches/:batchId/worksheets/assign",
  auditAction("TEACHER_ASSIGN_BATCH_WORKSHEET", "BATCH", (req) => req.params.batchId),
  assignTeacherBatchWorksheet
);
teacherRouter.post(
  "/batches/:batchId/worksheets/assign-selected",
  auditAction("TEACHER_ASSIGN_SELECTED_BATCH_WORKSHEETS", "BATCH", (req) => req.params.batchId),
  assignTeacherBatchWorksheetToStudents
);
teacherRouter.get(
  "/batches/:batchId/mock-tests",
  auditAction("TEACHER_LIST_BATCH_MOCK_TESTS", "BATCH", (req) => req.params.batchId),
  listTeacherBatchMockTests
);
teacherRouter.get(
  "/mock-tests/:mockTestId",
  auditAction("TEACHER_VIEW_MOCK_TEST", "MOCK_TEST", (req) => req.params.mockTestId),
  getTeacherMockTest
);
teacherRouter.put(
  "/mock-tests/:mockTestId/results",
  auditAction("TEACHER_SAVE_MOCK_TEST_RESULTS", "MOCK_TEST", (req) => req.params.mockTestId),
  upsertTeacherMockTestResults
);

teacherRouter.get("/students", listTeacherStudents);
teacherRouter.get("/students/:studentId", getTeacherStudent);
teacherRouter.get("/students/:studentId/materials", listTeacherStudentMaterials);
teacherRouter.get("/students/:studentId/practice-report", getTeacherStudentPracticeReport);
teacherRouter.get("/students/:studentId/attempts/export.csv", exportTeacherStudentAttemptsCsv);
teacherRouter.get("/students/:studentId/attempts", listTeacherStudentAttempts);
teacherRouter.get("/students/:studentId/attendance-history", getTeacherStudentAttendanceHistory);
teacherRouter.get(
  "/students/:studentId/360",
  auditAction("TEACHER_VIEW_STUDENT_360", "STUDENT", (req) => req.params.studentId),
  getTeacherStudent360
);
teacherRouter.post(
  "/students/:studentId/override-promotion",
  auditAction("TEACHER_OVERRIDE_PROMOTION", "STUDENT", (req) => req.params.studentId),
  overrideTeacherStudentPromotion
);
teacherRouter.get(
  "/students/:studentId/assign-worksheets",
  auditAction("TEACHER_VIEW_ASSIGN_WORKSHEETS", "STUDENT", (req) => req.params.studentId),
  rejectLegacyTeacherAssignmentRoute
);
teacherRouter.post(
  "/students/:studentId/assign-worksheets",
  auditAction("TEACHER_SAVE_ASSIGN_WORKSHEETS", "STUDENT", (req) => req.params.studentId),
  rejectLegacyTeacherAssignmentRoute
);

teacherRouter.get("/students/:studentId/notes", listTeacherNotesForStudent);
teacherRouter.post(
  "/students/:studentId/notes",
  auditAction("TEACHER_NOTE_CREATE", "TEACHER_NOTE"),
  createTeacherNoteForStudent
);
teacherRouter.put(
  "/notes/:noteId",
  auditAction("TEACHER_NOTE_UPDATE", "TEACHER_NOTE", (req) => req.params.noteId),
  updateTeacherNote
);
teacherRouter.delete(
  "/notes/:noteId",
  auditAction("TEACHER_NOTE_DELETE", "TEACHER_NOTE", (req) => req.params.noteId),
  deleteTeacherNote
);

teacherRouter.post(
  "/attendance/sessions",
  auditAction("TEACHER_ATTENDANCE_CREATE_SESSION", "ATTENDANCE_SESSION"),
  createTeacherAttendanceSession
);
teacherRouter.get("/attendance/history/export.csv", exportTeacherBatchAttendanceHistoryCsv);
teacherRouter.get("/attendance/history", listTeacherBatchAttendanceHistory);
teacherRouter.get("/attendance/sessions", listTeacherAttendanceSessions);
teacherRouter.get("/attendance/sessions/:sessionId", getTeacherAttendanceSession);
teacherRouter.put(
  "/attendance/sessions/:sessionId/entries",
  auditAction("TEACHER_ATTENDANCE_UPDATE_ENTRIES", "ATTENDANCE_SESSION", (req) => req.params.sessionId),
  updateTeacherAttendanceEntries
);
teacherRouter.post(
  "/attendance/sessions/:sessionId/publish",
  auditAction("TEACHER_ATTENDANCE_PUBLISH", "ATTENDANCE_SESSION", (req) => req.params.sessionId),
  publishTeacherAttendanceSession
);

/* ── Reassignment ── */
teacherRouter.get("/reassignment-requests", listTeacherReassignmentRequests);
teacherRouter.post(
  "/reassignment-requests/:requestId/review",
  auditAction("TEACHER_REVIEW_REASSIGNMENT", "REASSIGNMENT_REQUEST", (req) => req.params.requestId),
  reviewTeacherReassignmentRequest
);
teacherRouter.post(
  "/students/:studentId/reassign",
  auditAction("TEACHER_DIRECT_REASSIGN", "STUDENT", (req) => req.params.studentId),
  teacherDirectReassign
);
teacherRouter.post(
  "/worksheets/bulk-assign",
  auditAction("TEACHER_BULK_ASSIGN_WORKSHEET", "WORKSHEET"),
  rejectLegacyTeacherAssignmentRoute
);

/* ── Cockpit / Intervention Console ── */
teacherRouter.get("/cockpit/dashboard", getCockpitDashboard);
teacherRouter.get("/cockpit/at-risk", getAtRisk);
teacherRouter.get("/cockpit/batches", getCockpitBatches);
teacherRouter.get("/cockpit/recommendations", getRecommendations);
teacherRouter.get("/cockpit/interventions", getInterventions);

teacherRouter.get("/dashboard/overview", getTeacherDashboardOverviewController);
teacherRouter.get("/dashboard/financial-overview", getTeacherFinancialOverviewController);
teacherRouter.get("/dashboard/attendance-productivity", getTeacherDashboardAttendanceProductivityController);
teacherRouter.get("/dashboard/grading-productivity", getTeacherDashboardGradingProductivityController);
teacherRouter.get("/dashboard/task-queue", getTeacherDashboardTaskQueueController);
teacherRouter.get("/dashboard/anomalies", getTeacherDashboardAnomaliesController);
teacherRouter.get("/dashboard/trends", getTeacherDashboardTrendsController);

teacherRouter.get(
  "/workflows/queues",
  auditAction("TEACHER_VIEW_WORKFLOW_QUEUE", "TEACHER_OPERATIONAL_WORKFLOW"),
  listTeacherWorkflowQueue
);
teacherRouter.get(
  "/workflows/queues/attendance",
  auditAction("TEACHER_VIEW_WORKFLOW_QUEUE", "TEACHER_OPERATIONAL_WORKFLOW"),
  listTeacherAttendanceWorkflowQueue
);
teacherRouter.get(
  "/workflows/queues/grading",
  auditAction("TEACHER_VIEW_WORKFLOW_QUEUE", "TEACHER_OPERATIONAL_WORKFLOW"),
  listTeacherGradingWorkflowQueue
);
teacherRouter.get(
  "/workflows/queues/anomalies",
  auditAction("TEACHER_VIEW_WORKFLOW_QUEUE", "TEACHER_OPERATIONAL_WORKFLOW"),
  listTeacherAnomalyWorkflowQueue
);
teacherRouter.get(
  "/workflows/:id",
  auditAction("TEACHER_VIEW_WORKFLOW_DETAIL", "TEACHER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  getTeacherWorkflowById
);
teacherRouter.get(
  "/workflows/:id/history",
  auditAction("TEACHER_VIEW_WORKFLOW_HISTORY", "TEACHER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  getTeacherWorkflowHistoryById
);
teacherRouter.post(
  "/workflows/:id/actions/review",
  auditAction("TEACHER_REVIEW_WORKFLOW", "TEACHER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  reviewTeacherWorkflowAction
);
teacherRouter.post(
  "/workflows/:id/actions/acknowledge",
  auditAction("TEACHER_ACKNOWLEDGE_WORKFLOW", "TEACHER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  acknowledgeTeacherWorkflowAction
);
teacherRouter.post(
  "/workflows/:id/actions/start-recovery",
  auditAction("TEACHER_START_WORKFLOW_RECOVERY", "TEACHER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  startTeacherWorkflowRecoveryAction
);
teacherRouter.post(
  "/workflows/:id/actions/mark-attendance",
  auditAction("TEACHER_MARK_WORKFLOW_ATTENDANCE", "TEACHER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  markTeacherWorkflowAttendanceAction
);
teacherRouter.post(
  "/workflows/:id/actions/complete-grading",
  auditAction("TEACHER_COMPLETE_WORKFLOW_GRADING", "TEACHER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  completeTeacherWorkflowGradingAction
);
teacherRouter.post(
  "/workflows/:id/actions/bulk-grade",
  auditAction("TEACHER_BULK_WORKFLOW_GRADING", "TEACHER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  bulkGradeTeacherWorkflowAction
);
teacherRouter.post(
  "/workflows/:id/actions/resolve",
  auditAction("TEACHER_RESOLVE_WORKFLOW", "TEACHER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  resolveTeacherWorkflowAction
);
teacherRouter.post(
  "/workflows/:id/actions/reopen",
  auditAction("TEACHER_REOPEN_WORKFLOW", "TEACHER_OPERATIONAL_WORKFLOW", (req) => req.params.id),
  reopenTeacherWorkflowAction
);

/* ── AI Narrative (Phase 10) ── */
teacherRouter.get("/ai/narrative", getTeacherAiNarrative);

export { teacherRouter };
