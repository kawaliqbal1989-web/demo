import { Router } from "express";
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
  getTeacherAssignWorksheetsContext,
  saveTeacherWorksheetAssignments,
  getTeacherBatchWorksheetsContext,
  assignTeacherBatchWorksheet,
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
  bulkAssignWorksheetToStudents,
  getTeacherStudentAttendanceHistory,
  getTeacherStudent360,
} from "../controllers/teacher-portal.controller.js";

const teacherRouter = Router();

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
  getTeacherAssignWorksheetsContext
);
teacherRouter.post(
  "/students/:studentId/assign-worksheets",
  auditAction("TEACHER_SAVE_ASSIGN_WORKSHEETS", "STUDENT", (req) => req.params.studentId),
  saveTeacherWorksheetAssignments
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
  bulkAssignWorksheetToStudents
);

/* ── Cockpit / Intervention Console ── */
teacherRouter.get("/cockpit/dashboard", getCockpitDashboard);
teacherRouter.get("/cockpit/at-risk", getAtRisk);
teacherRouter.get("/cockpit/batches", getCockpitBatches);
teacherRouter.get("/cockpit/recommendations", getRecommendations);
teacherRouter.get("/cockpit/interventions", getInterventions);

/* ── AI Narrative (Phase 10) ── */
teacherRouter.get("/ai/narrative", getTeacherAiNarrative);

export { teacherRouter };
