import { Router } from "express";
import { requireOperationalRoles, requireRole, requireSuperadmin } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import {
  listExamCycles,
  listExamCourses,
  createExamCourse,
  createExamCourseLevel,
  listExamResultsControlCenter,
  createExamCycle,
  getExamCycleSchedule,
  extendExamCycleSchedule,
  getTeacherList,
  teacherEnrollStudents,
  submitTeacherListToCenter,
  centerPrepareCombinedList,
  centerSubmitCombinedListToFranchise,
  centerSetCombinedListItemIncluded,
  centerRejectTeacherList,
  exportEnrollmentListCsv,
  getEnrollmentListLevelBreakdown,
  getExamCycleLevelsForAssessment,
  getExamCycleAssessmentConfig,
  saveExamCycleAssessmentConfig,
  generateExamCycleQuestionSet,
  listPendingEnrollmentLists,
  forwardPendingEnrollmentList,
  rejectPendingEnrollmentList,
  superadminApproveEnrollmentList,
  centerCreateTemporaryStudents,
  getExamCycleArchiveImpact,
  archiveExamCycle,
  restoreExamCycle,
  getExamCycleDeleteImpact,
  getExamCycleAuditCheck,
  getExamCycleQuestionPreview,
  deleteExamCycle,
  getExamResults,
  getExamResultsReview,
  getExamResultPublicationAuditTrail,
  exportExamResultsCsv,
  publishExamResults,
  unpublishExamResults,
  grantSecondAttemptToStudent,
  revokeSecondAttemptFromStudent
} from "../controllers/exam-cycles.controller.js";
import {
  listLateEnrollmentEligibleStudents,
  createLateEnrollmentRequest,
  listLateEnrollmentRequests,
  reviewLateEnrollmentRequest,
  getLateEnrollmentAudit
} from "../controllers/exam-late-enrollment.controller.js";

const examCyclesRouter = Router();

examCyclesRouter.get("/", requireOperationalRoles(), auditAction("EXAM_CYCLE_LIST", "EXAM_CYCLE"), listExamCycles);

examCyclesRouter.post(
  "/",
  requireSuperadmin(),
  auditAction("EXAM_CYCLE_CREATE", "EXAM_CYCLE"),
  createExamCycle
);

examCyclesRouter.get(
  "/:id/schedule",
  requireSuperadmin(),
  auditAction("EXAM_CYCLE_SCHEDULE_VIEW", "EXAM_CYCLE", (req) => req.params.id),
  getExamCycleSchedule
);

examCyclesRouter.patch(
  "/:id/schedule",
  requireSuperadmin(),
  auditAction("EXAM_CYCLE_SCHEDULE_EXTEND", "EXAM_CYCLE", (req) => req.params.id),
  extendExamCycleSchedule
);

examCyclesRouter.get(
  "/exam-courses",
  requireSuperadmin(),
  auditAction("EXAM_COURSE_LIST", "COURSE"),
  listExamCourses
);

examCyclesRouter.post(
  "/exam-courses",
  requireSuperadmin(),
  auditAction("EXAM_COURSE_CREATE", "COURSE"),
  createExamCourse
);

examCyclesRouter.post(
  "/exam-courses/:courseId/levels",
  requireSuperadmin(),
  auditAction("EXAM_COURSE_LEVEL_CREATE", "COURSE_LEVEL", (req) => req.params.courseId),
  createExamCourseLevel
);

// Teacher enrollment list
examCyclesRouter.get(
  "/:id/teacher-list",
  requireRole("TEACHER"),
  auditAction("EXAM_TEACHER_LIST_VIEW", "EXAM_ENROLLMENT_LIST", (req, res) => res?.locals?.entityId || null),
  getTeacherList
);

examCyclesRouter.post(
  "/:id/teacher-list/enroll",
  requireRole("TEACHER"),
  auditAction("EXAM_TEACHER_ENROLL", "EXAM_ENROLLMENT_ENTRY"),
  teacherEnrollStudents
);

examCyclesRouter.post(
  "/:id/teacher-list/submit",
  requireRole("TEACHER"),
  auditAction("EXAM_TEACHER_LIST_SUBMIT", "EXAM_ENROLLMENT_LIST"),
  submitTeacherListToCenter
);

// Center combined list
examCyclesRouter.post(
  "/:id/center-list/prepare",
  requireRole("CENTER"),
  auditAction("EXAM_CENTER_LIST_PREPARE", "EXAM_ENROLLMENT_LIST"),
  centerPrepareCombinedList
);

examCyclesRouter.post(
  "/:id/center-list/submit",
  requireRole("CENTER"),
  auditAction("EXAM_CENTER_LIST_SUBMIT", "EXAM_ENROLLMENT_LIST"),
  centerSubmitCombinedListToFranchise
);

examCyclesRouter.patch(
  "/:id/center-list/items/:entryId",
  requireRole("CENTER"),
  auditAction("EXAM_CENTER_LIST_ITEM_UPDATE", "EXAM_ENROLLMENT_LIST"),
  centerSetCombinedListItemIncluded
);

examCyclesRouter.post(
  "/:id/teacher-lists/:listId/reject",
  requireRole("CENTER"),
  auditAction("EXAM_CENTER_REJECT_TEACHER_LIST", "EXAM_ENROLLMENT_LIST", (req) => req.params.listId),
  centerRejectTeacherList
);

examCyclesRouter.post(
  "/:id/temporary-students",
  requireRole("CENTER"),
  auditAction("EXAM_CENTER_CREATE_TEMP_STUDENTS", "STUDENT"),
  centerCreateTemporaryStudents
);

examCyclesRouter.get(
  "/:id/archive-impact",
  requireSuperadmin(),
  auditAction("EXAM_CYCLE_ARCHIVE_IMPACT", "EXAM_CYCLE", (req) => req.params.id),
  getExamCycleArchiveImpact
);

examCyclesRouter.post(
  "/:id/archive",
  requireSuperadmin(),
  auditAction("EXAM_CYCLE_ARCHIVED", "EXAM_CYCLE", (req) => req.params.id),
  archiveExamCycle
);

examCyclesRouter.post(
  "/:id/restore",
  requireSuperadmin(),
  auditAction("EXAM_CYCLE_RESTORED", "EXAM_CYCLE", (req) => req.params.id),
  restoreExamCycle
);

examCyclesRouter.get(
  "/:id/delete-impact",
  requireSuperadmin(),
  auditAction("EXAM_CYCLE_DELETE_IMPACT", "EXAM_CYCLE", (req) => req.params.id),
  getExamCycleDeleteImpact
);

examCyclesRouter.get(
  "/:id/audit-check",
  requireSuperadmin(),
  auditAction("EXAM_CYCLE_AUDIT_CHECK", "EXAM_CYCLE", (req) => req.params.id),
  getExamCycleAuditCheck
);

examCyclesRouter.get(
  "/:id/audit-check/questions",
  requireSuperadmin(),
  auditAction("EXAM_CYCLE_QUESTION_PREVIEW", "EXAM_CYCLE", (req) => req.params.id),
  getExamCycleQuestionPreview
);

examCyclesRouter.delete(
  "/:id",
  requireSuperadmin(),
  auditAction("EXAM_CYCLE_DELETE", "EXAM_CYCLE", (req) => req.params.id),
  deleteExamCycle
);

// Exports
examCyclesRouter.get(
  "/:id/enrollment-lists/:listId/export.csv",
  requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER"),
  auditAction("EXAM_LIST_EXPORT", "EXAM_ENROLLMENT_LIST", (req) => req.params.listId),
  exportEnrollmentListCsv
);

// Superadmin: list levels included in a combined list (for worksheet selection on approval)
examCyclesRouter.get(
  "/:id/enrollment-lists/:listId/level-breakdown",
  requireSuperadmin(),
  auditAction("EXAM_LIST_LEVEL_BREAKDOWN", "EXAM_ENROLLMENT_LIST", (req) => req.params.listId),
  getEnrollmentListLevelBreakdown
);

examCyclesRouter.get(
  "/:id/levels",
  requireSuperadmin(),
  auditAction("EXAM_CYCLE_LEVELS", "EXAM_CYCLE", (req) => req.params.id),
  getExamCycleLevelsForAssessment
);

examCyclesRouter.get(
  "/:id/assessment-config",
  requireSuperadmin(),
  auditAction("EXAM_ASSESSMENT_CONFIG_VIEW", "EXAM_CYCLE", (req) => req.params.id),
  getExamCycleAssessmentConfig
);

examCyclesRouter.post(
  "/:id/assessment-config",
  requireSuperadmin(),
  auditAction("EXAM_ASSESSMENT_CONFIG_SAVE", "EXAM_CYCLE", (req) => req.params.id),
  saveExamCycleAssessmentConfig
);

examCyclesRouter.put(
  "/:id/assessment-config",
  requireSuperadmin(),
  auditAction("EXAM_ASSESSMENT_CONFIG_UPDATE", "EXAM_CYCLE", (req) => req.params.id),
  saveExamCycleAssessmentConfig
);

examCyclesRouter.post(
  "/:id/generate-question-set",
  requireSuperadmin(),
  auditAction("EXAM_GENERATE_QUESTION_SET", "EXAM_CYCLE", (req) => req.params.id),
  generateExamCycleQuestionSet
);

// Pending lists for approvers
examCyclesRouter.get(
  "/:id/enrollment-lists/pending",
  requireRole("FRANCHISE", "BP", "SUPERADMIN"),
  auditAction("EXAM_LIST_PENDING", "EXAM_ENROLLMENT_LIST"),
  listPendingEnrollmentLists
);

examCyclesRouter.post(
  "/:id/enrollment-lists/:listId/forward",
  requireRole("FRANCHISE", "BP"),
  auditAction("EXAM_LIST_FORWARD", "EXAM_ENROLLMENT_LIST", (req) => req.params.listId),
  forwardPendingEnrollmentList
);

examCyclesRouter.post(
  "/:id/enrollment-lists/:listId/reject",
  requireRole("FRANCHISE", "BP", "SUPERADMIN"),
  auditAction("EXAM_LIST_REJECT", "EXAM_ENROLLMENT_LIST", (req) => req.params.listId),
  rejectPendingEnrollmentList
);

examCyclesRouter.post(
  "/:id/enrollment-lists/:listId/approve",
  requireSuperadmin(),
  auditAction("EXAM_LIST_APPROVE", "EXAM_ENROLLMENT_LIST", (req) => req.params.listId),
  superadminApproveEnrollmentList
);

// Late enrollment
examCyclesRouter.get(
  "/:id/late-enrollment/eligible-students",
  requireRole("CENTER"),
  auditAction("EXAM_LATE_ENROLLMENT_ELIGIBLE_LIST", "EXAM_CYCLE", (req) => req.params.id),
  listLateEnrollmentEligibleStudents
);

examCyclesRouter.post(
  "/:id/late-enrollment/requests",
  requireRole("CENTER"),
  auditAction("EXAM_LATE_ENROLLMENT_REQUEST_CREATE", "EXAM_CYCLE", (req) => req.params.id),
  createLateEnrollmentRequest
);

examCyclesRouter.get(
  "/:id/late-enrollment/requests",
  requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER"),
  auditAction("EXAM_LATE_ENROLLMENT_REQUEST_LIST", "EXAM_CYCLE", (req) => req.params.id),
  listLateEnrollmentRequests
);

examCyclesRouter.post(
  "/:id/late-enrollment/requests/:requestId/review",
  requireSuperadmin(),
  auditAction("EXAM_LATE_ENROLLMENT_REQUEST_REVIEW", "EXAM_LATE_ENROLLMENT_REQUEST", (req) => req.params.requestId),
  reviewLateEnrollmentRequest
);

examCyclesRouter.get(
  "/:id/late-enrollment/audit",
  requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER"),
  auditAction("EXAM_LATE_ENROLLMENT_AUDIT", "EXAM_CYCLE", (req) => req.params.id),
  getLateEnrollmentAudit
);

// Results
examCyclesRouter.get(
  "/results/control-center",
  requireSuperadmin(),
  auditAction("EXAM_RESULTS_CONTROL_CENTER_VIEW", "EXAM_CYCLE"),
  listExamResultsControlCenter
);

examCyclesRouter.get(
  "/:id/results/review",
  requireSuperadmin(),
  auditAction("EXAM_RESULTS_REVIEW_VIEW", "EXAM_CYCLE", (req) => req.params.id),
  getExamResultsReview
);

examCyclesRouter.get(
  "/:id/results/publication-audit",
  requireSuperadmin(),
  auditAction("EXAM_RESULTS_PUBLICATION_AUDIT_VIEW", "EXAM_CYCLE", (req) => req.params.id),
  getExamResultPublicationAuditTrail
);

examCyclesRouter.get(
  "/:id/results",
  requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER"),
  auditAction("EXAM_RESULTS_VIEW", "EXAM_CYCLE", (req) => req.params.id),
  getExamResults
);

examCyclesRouter.get(
  "/:id/results/export.csv",
  requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER"),
  auditAction("EXAM_RESULTS_EXPORT", "EXAM_CYCLE", (req) => req.params.id),
  exportExamResultsCsv
);

examCyclesRouter.post(
  "/:id/results/publish",
  requireSuperadmin(),
  auditAction("EXAM_RESULTS_PUBLISH", "EXAM_CYCLE", (req) => req.params.id),
  publishExamResults
);

examCyclesRouter.post(
  "/:id/results/unpublish",
  requireSuperadmin(),
  auditAction("EXAM_RESULTS_UNPUBLISH", "EXAM_CYCLE", (req) => req.params.id),
  unpublishExamResults
);

examCyclesRouter.post(
  "/:id/students/:studentId/second-attempt/grant",
  requireSuperadmin(),
  auditAction("EXAM_SECOND_ATTEMPT_GRANT", "EXAM_ENROLLMENT_ENTRY", (req) => req.params.studentId),
  grantSecondAttemptToStudent
);

examCyclesRouter.post(
  "/:id/students/:studentId/second-attempt/revoke",
  requireSuperadmin(),
  auditAction("EXAM_SECOND_ATTEMPT_REVOKE", "EXAM_ENROLLMENT_ENTRY", (req) => req.params.studentId),
  revokeSecondAttemptFromStudent
);

export { examCyclesRouter };
