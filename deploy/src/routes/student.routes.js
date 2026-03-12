import { Router } from "express";
import { requireStudent } from "../middleware/require-student.js";
import {
  changeStudentPassword,
  createStudentPracticeWorksheet,
  createStudentAbacusPracticeWorksheet,
  getStudentFeesSummary,
  getStudentMe,
  getStudentMyCourse,
  listStudentExamEnrollments,
  listStudentExamsOverview,
  listStudentMockTests,
  getStudentMockTest,
  startStudentMockTestAttempt,
  submitStudentMockTestAttempt,
  getStudentExamResult,
  getStudentPracticeReport,
  getStudentPracticeFeatureStatus,
  getStudentPracticeWorksheetOptions,
  getStudentAbacusPracticeWorksheetOptions,
  getStudentWeakTopics,
  getStudentWorksheet,
  listStudentRecentAttendance,
  listStudentEnrollments,
  listStudentMaterials,
  saveStudentAttemptAnswers,
  listStudentWorksheetAttempts,
  listStudentWorksheets,
  startOrResumeStudentWorksheetAttempt,
  startStudentWorksheet,
  submitStudentAttempt,
  submitStudentWorksheet,
  listStudentCertificates,
  updateStudentProfile,
  getStudentPerformanceTrends,
  createStudentReassignmentRequest,
  listStudentReassignmentRequests,
  cancelStudentReassignmentRequest,
} from "../controllers/student.controller.js";
import {
  aiPlayground,
  getAiPlaygroundUsage,
  getAiPlaygroundHistory,
  suggestImprovements,
  createCustomTool,
  listCustomTools,
  deleteCustomTool,
  runCustomToolEndpoint
} from "../controllers/ai-playground.controller.js";
import { getStudentLeaderboard } from "../controllers/student-leaderboard.controller.js";
import {
  getCoachData,
  getDailyMission,
  getWeeklyPlan,
  getReadiness,
  getPerformanceExplainer,
} from "../controllers/student-coach.controller.js";
import { getStudentAiNarrative } from "../controllers/ai-narrative.controller.js";
import { auditAction } from "../middleware/audit-logger.js";
import { authRateLimiter } from "../middleware/auth-rate-limit.js";

const studentRouter = Router();

studentRouter.use(requireStudent);

studentRouter.get(
  "/me",
  auditAction("STUDENT_VIEW_ME", "STUDENT", (req) => req.student.id),
  getStudentMe
);

studentRouter.patch(
  "/me",
  auditAction("STUDENT_UPDATE_PROFILE", "STUDENT", (req) => req.student.id),
  updateStudentProfile
);

studentRouter.get(
  "/enrollments",
  auditAction("STUDENT_LIST_ENROLLMENTS", "STUDENT", (req) => req.student.id),
  listStudentEnrollments
);

studentRouter.get(
  "/exam-enrollments",
  auditAction("STUDENT_LIST_EXAM_ENROLLMENTS", "STUDENT", (req) => req.student.id),
  listStudentExamEnrollments
);

studentRouter.get(
  "/exams",
  auditAction("STUDENT_LIST_EXAMS", "STUDENT", (req) => req.student.id),
  listStudentExamsOverview
);

studentRouter.get(
  "/mock-tests",
  auditAction("STUDENT_LIST_MOCK_TESTS", "STUDENT", (req) => req.student.id),
  listStudentMockTests
);

studentRouter.get(
  "/mock-tests/:mockTestId",
  auditAction("STUDENT_VIEW_MOCK_TEST", "MOCK_TEST", (req) => req.params.mockTestId),
  getStudentMockTest
);

studentRouter.post(
  "/mock-tests/:mockTestId/attempt/start",
  auditAction("STUDENT_START_MOCK_TEST_ATTEMPT", "MOCK_TEST", (req) => req.params.mockTestId),
  startStudentMockTestAttempt
);

studentRouter.post(
  "/mock-tests/:mockTestId/attempt/submit",
  auditAction("STUDENT_SUBMIT_MOCK_TEST_ATTEMPT", "MOCK_TEST", (req) => req.params.mockTestId),
  submitStudentMockTestAttempt
);

studentRouter.get(
  "/worksheets",
  auditAction("STUDENT_LIST_WORKSHEETS", "STUDENT", (req) => req.student.id),
  listStudentWorksheets
);

studentRouter.get(
  "/worksheets/:worksheetId",
  auditAction("STUDENT_VIEW_WORKSHEET", "WORKSHEET", (req) => req.params.worksheetId),
  getStudentWorksheet
);

studentRouter.post(
  "/worksheets/:worksheetId/start",
  auditAction("STUDENT_START_WORKSHEET", "WORKSHEET", (req) => req.params.worksheetId),
  startStudentWorksheet
);

studentRouter.post(
  "/worksheets/:worksheetId/attempts/start",
  auditAction("STUDENT_START_WORKSHEET", "WORKSHEET", (req) => req.params.worksheetId),
  startOrResumeStudentWorksheetAttempt
);

studentRouter.patch(
  "/attempts/:attemptId/answers",
  auditAction("STUDENT_SAVE_WORKSHEET_ANSWERS", "WORKSHEET_SUBMISSION", (req) => req.params.attemptId),
  saveStudentAttemptAnswers
);

studentRouter.post(
  "/attempts/:attemptId/submit",
  auditAction("STUDENT_SUBMIT_WORKSHEET", "WORKSHEET_SUBMISSION", (req) => req.params.attemptId),
  submitStudentAttempt
);

studentRouter.get(
  "/worksheets/:worksheetId/attempts",
  auditAction("STUDENT_LIST_WORKSHEET_ATTEMPTS", "WORKSHEET", (req) => req.params.worksheetId),
  listStudentWorksheetAttempts
);

studentRouter.post(
  "/worksheets/:worksheetId/submit",
  auditAction("STUDENT_SUBMIT_WORKSHEET", "WORKSHEET", (req) => req.params.worksheetId),
  submitStudentWorksheet
);

studentRouter.get(
  "/materials",
  auditAction("STUDENT_LIST_MATERIALS", "STUDENT", (req) => req.student.id),
  listStudentMaterials
);

studentRouter.get(
  "/practice-report",
  auditAction("STUDENT_VIEW_PRACTICE_REPORT", "STUDENT", (req) => req.student.id),
  getStudentPracticeReport
);

studentRouter.get(
  "/exam-cycles/:examCycleId/result",
  auditAction("STUDENT_VIEW_EXAM_RESULT", "EXAM_CYCLE", (req) => req.params.examCycleId),
  getStudentExamResult
);

studentRouter.get(
  "/practice-features/status",
  auditAction("STUDENT_VIEW_PRACTICE_FEATURE_STATUS", "STUDENT", (req) => req.student.id),
  getStudentPracticeFeatureStatus
);

studentRouter.get(
  "/practice-worksheets/options",
  auditAction("STUDENT_VIEW_PRACTICE_OPTIONS", "STUDENT", (req) => req.student.id),
  getStudentPracticeWorksheetOptions
);

studentRouter.get(
  "/abacus-practice-worksheets/options",
  auditAction("STUDENT_VIEW_PRACTICE_OPTIONS", "STUDENT", (req) => req.student.id),
  getStudentAbacusPracticeWorksheetOptions
);

studentRouter.post(
  "/practice-worksheets",
  auditAction("STUDENT_CREATE_PRACTICE_WORKSHEET", "STUDENT", (req) => req.student.id),
  createStudentPracticeWorksheet
);

studentRouter.post(
  "/abacus-practice-worksheets",
  auditAction("STUDENT_CREATE_PRACTICE_WORKSHEET", "STUDENT", (req) => req.student.id),
  createStudentAbacusPracticeWorksheet
);

studentRouter.get(
  "/my-course",
  auditAction("STUDENT_VIEW_MY_COURSE", "STUDENT", (req) => req.student.id),
  getStudentMyCourse
);

studentRouter.get(
  "/attendance",
  auditAction("STUDENT_LIST_ATTENDANCE", "STUDENT", (req) => req.student.id),
  listStudentRecentAttendance
);

studentRouter.get(
  "/weak-topics",
  auditAction("STUDENT_VIEW_WEAK_TOPICS", "STUDENT", (req) => req.student.id),
  getStudentWeakTopics
);

studentRouter.get(
  "/fees",
  auditAction("STUDENT_VIEW_FEES", "STUDENT", (req) => req.student.id),
  getStudentFeesSummary
);

studentRouter.post(
  "/change-password",
  authRateLimiter,
  auditAction("STUDENT_CHANGE_PASSWORD", "AUTH", (req) => req.auth.userId),
  changeStudentPassword
);

// AI Playground
studentRouter.post(
  "/ai-playground",
  auditAction("STUDENT_AI_PLAYGROUND", "STUDENT", (req) => req.student.id),
  aiPlayground
);

studentRouter.get(
  "/ai-playground/usage",
  getAiPlaygroundUsage
);

studentRouter.get(
  "/ai-playground/history",
  getAiPlaygroundHistory
);

studentRouter.post(
  "/ai-playground/suggest-improvements",
  auditAction("STUDENT_AI_SUGGEST", "STUDENT", (req) => req.student.id),
  suggestImprovements
);

studentRouter.post(
  "/ai-playground/custom-tools",
  auditAction("STUDENT_AI_CREATE_TOOL", "STUDENT", (req) => req.student.id),
  createCustomTool
);

studentRouter.get(
  "/ai-playground/custom-tools",
  listCustomTools
);

studentRouter.delete(
  "/ai-playground/custom-tools/:id",
  auditAction("STUDENT_AI_DELETE_TOOL", "STUDENT", (req) => req.student.id),
  deleteCustomTool
);

studentRouter.post(
  "/ai-playground/custom-tools/:id/run",
  auditAction("STUDENT_AI_RUN_CUSTOM", "STUDENT", (req) => req.student.id),
  runCustomToolEndpoint
);

// Leaderboard
studentRouter.get(
  "/leaderboard",
  auditAction("STUDENT_VIEW_LEADERBOARD", "STUDENT", (req) => req.student.id),
  getStudentLeaderboard
);

// Performance trends
studentRouter.get(
  "/performance-trends",
  auditAction("STUDENT_VIEW_PERFORMANCE_TRENDS", "STUDENT", (req) => req.student.id),
  getStudentPerformanceTrends
);

// Certificates
studentRouter.get(
  "/certificates",
  auditAction("STUDENT_VIEW_CERTIFICATES", "STUDENT", (req) => req.student.id),
  listStudentCertificates
);

// Reassignment Requests
studentRouter.post(
  "/reassignment-requests",
  auditAction("STUDENT_CREATE_REASSIGNMENT_REQUEST", "REASSIGNMENT_REQUEST"),
  createStudentReassignmentRequest
);
studentRouter.get("/reassignment-requests", listStudentReassignmentRequests);
studentRouter.post(
  "/reassignment-requests/:requestId/cancel",
  auditAction("STUDENT_CANCEL_REASSIGNMENT_REQUEST", "REASSIGNMENT_REQUEST", (req) => req.params.requestId),
  cancelStudentReassignmentRequest
);

// ── Student Coach (Phase 5) ──
studentRouter.get(
  "/coach/dashboard",
  auditAction("STUDENT_VIEW_COACH", "STUDENT", (req) => req.student.id),
  getCoachData
);
studentRouter.get(
  "/coach/daily-mission",
  getDailyMission
);
studentRouter.get(
  "/coach/weekly-plan",
  getWeeklyPlan
);
studentRouter.get(
  "/coach/readiness",
  getReadiness
);
studentRouter.get(
  "/coach/performance",
  getPerformanceExplainer
);

/* ── AI Narrative (Phase 10) ── */
studentRouter.get(
  "/ai/narrative",
  auditAction("STUDENT_AI_NARRATIVE", "STUDENT", (req) => req.student.id),
  getStudentAiNarrative
);

export { studentRouter };
