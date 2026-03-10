import { Router } from "express";
import { requireOperationalRoles, requireRole, requireSuperadmin } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import {
  listExamCycles,
  createExamCycle,
  getTeacherList,
  teacherEnrollStudents,
  submitTeacherListToCenter,
  centerPrepareCombinedList,
  centerSubmitCombinedListToFranchise,
  centerSetCombinedListItemIncluded,
  centerRejectTeacherList,
  exportEnrollmentListCsv,
  getEnrollmentListLevelBreakdown,
  listPendingEnrollmentLists,
  forwardPendingEnrollmentList,
  rejectPendingEnrollmentList,
  superadminApproveEnrollmentList,
  centerCreateTemporaryStudents,
  getExamResults,
  exportExamResultsCsv,
  publishExamResults,
  unpublishExamResults
} from "../controllers/exam-cycles.controller.js";

const examCyclesRouter = Router();

examCyclesRouter.get("/", requireOperationalRoles(), auditAction("EXAM_CYCLE_LIST", "EXAM_CYCLE"), listExamCycles);

examCyclesRouter.post(
  "/",
  requireSuperadmin(),
  auditAction("EXAM_CYCLE_CREATE", "EXAM_CYCLE"),
  createExamCycle
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

// Results
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

export { examCyclesRouter };
