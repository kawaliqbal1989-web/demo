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

const centerRouter = Router();

centerRouter.use(requireRole("CENTER"));

centerRouter.get("/me", auditAction("CENTER_VIEW_PROFILE", "CENTER"), getCenterMe);
centerRouter.get("/dashboard", auditAction("CENTER_VIEW_DASHBOARD", "CENTER"), getCenterDashboard);

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
