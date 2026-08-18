import { Router } from "express";
import {
  approveEnrollmentList,
  createCompetition,
  enrollStudent,
  exportCompetitionResultsCsv,
  getCompetitionDetail,
  getCompetitionEnrollmentList,
  getCompetitionResults,
  getLeaderboard,
  grantCompetitionExtraAttempt,
  listCompetitionEnrollmentLists,
  listCompetitionQuotas,
  listCompetitions,
  publishCompetitionResults,
  returnEnrollmentList,
  reprocessCompetitionQuota,
  unpublishCompetitionResults,
  updateCompetitionSchedule,
  updateEnrollmentInclusion,
  updateCompetitionQuota,
  forwardEnrollmentList
} from "../controllers/competitions.controller.js";
import {
  createCompetitionTemporaryStudents
} from "../controllers/students.controller.js";
import {
  addCourseLevel,
  archiveCourse,
  restoreCourse,
  archiveQuestionBank,
  archiveCompetitionWorksheet,
  archiveSeason,
  createCourse,
  copyCompetitionResources,
  createQuestionBank,
  createCompetitionQuestionBankQuestion,
  importCompetitionQuestionBankQuestions,
  updateCompetitionQuestionBankQuestion,
  removeCompetitionQuestionBankQuestion,
  createCompetitionWorksheet,
  buildCompetitionWorksheetFromQuestions,
  createSeason,
  getCourse,
  getQuestionBank,
  getCompetitionWorksheet,
  getSeason,
  listCourseLevels,
  listCourses,
  listCompetitionReuseSources,
  listQuestionBanks,
  listCompetitionQuestionBankQuestions,
  listCompetitionWorksheets,
  listCompetitionWorksheetAssignments,
  listSeasons,
  removeCourseLevel,
  reorderCourseLevels,
  replaceCompetitionWorksheetAssignments,
  updateCourse,
  updateQuestionBank,
  updateCompetitionWorksheet,
  updateSeason
} from "../controllers/competition-master-data.controller.js";
import { requireOperationalRoles, requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";

const competitionsRouter = Router();

competitionsRouter.get("/seasons", requireRole("SUPERADMIN"), listSeasons);
competitionsRouter.post(
  "/seasons",
  requireRole("SUPERADMIN"),
  auditAction("CREATE_COMPETITION_SEASON", "COMPETITION_SEASON"),
  createSeason
);
competitionsRouter.get("/seasons/:seasonId", requireRole("SUPERADMIN"), getSeason);
competitionsRouter.patch(
  "/seasons/:seasonId",
  requireRole("SUPERADMIN"),
  auditAction("UPDATE_COMPETITION_SEASON", "COMPETITION_SEASON", (req) => req.params.seasonId),
  updateSeason
);
competitionsRouter.post(
  "/seasons/:seasonId/archive",
  requireRole("SUPERADMIN"),
  auditAction("ARCHIVE_COMPETITION_SEASON", "COMPETITION_SEASON", (req) => req.params.seasonId),
  archiveSeason
);

competitionsRouter.get(
  "/:competitionId/reuse-sources",
  requireRole("SUPERADMIN"),
  listCompetitionReuseSources
);
competitionsRouter.post(
  "/:competitionId/reuse-resources",
  requireRole("SUPERADMIN"),
  auditAction(
    "COPY_COMPETITION_RESOURCES",
    "COMPETITION",
    (req) => req.params.competitionId
  ),
  copyCompetitionResources
);

competitionsRouter.get("/:competitionId/courses", requireRole("SUPERADMIN"), listCourses);
competitionsRouter.post(
  "/:competitionId/courses",
  requireRole("SUPERADMIN"),
  auditAction("CREATE_COMPETITION_COURSE", "COMPETITION_COURSE"),
  createCourse
);
competitionsRouter.get("/:competitionId/courses/:courseId", requireRole("SUPERADMIN"), getCourse);
competitionsRouter.patch(
  "/:competitionId/courses/:courseId",
  requireRole("SUPERADMIN"),
  auditAction("UPDATE_COMPETITION_COURSE", "COMPETITION_COURSE", (req) => req.params.courseId),
  updateCourse
);
competitionsRouter.post(
  "/:competitionId/courses/:courseId/archive",
  requireRole("SUPERADMIN"),
  auditAction("ARCHIVE_COMPETITION_COURSE", "COMPETITION_COURSE", (req) => req.params.courseId),
  archiveCourse
);
competitionsRouter.post(
  "/:competitionId/courses/:courseId/restore",
  requireRole("SUPERADMIN"),
  auditAction(
    "RESTORE_COMPETITION_COURSE",
    "COMPETITION_COURSE",
    (req) => req.params.courseId
  ),
  restoreCourse
);
competitionsRouter.get("/:competitionId/courses/:courseId/levels", requireRole("SUPERADMIN"), listCourseLevels);
competitionsRouter.post(
  "/:competitionId/courses/:courseId/levels",
  requireRole("SUPERADMIN"),
  auditAction("ADD_COMPETITION_COURSE_LEVEL", "COMPETITION_COURSE_LEVEL"),
  addCourseLevel
);
competitionsRouter.put(
  "/:competitionId/courses/:courseId/levels/reorder",
  requireRole("SUPERADMIN"),
  auditAction("REORDER_COMPETITION_COURSE_LEVELS", "COMPETITION_COURSE", (req) => req.params.courseId),
  reorderCourseLevels
);
competitionsRouter.delete(
  "/:competitionId/courses/:courseId/levels/:courseLevelId",
  requireRole("SUPERADMIN"),
  auditAction("REMOVE_COMPETITION_COURSE_LEVEL", "COMPETITION_COURSE_LEVEL", (req) => req.params.courseLevelId),
  removeCourseLevel
);


competitionsRouter.get(
  "/:competitionId/courses/:courseId/levels/:courseLevelId/question-banks",
  requireRole("SUPERADMIN"),
  listQuestionBanks
);
competitionsRouter.post(
  "/:competitionId/courses/:courseId/levels/:courseLevelId/question-banks",
  requireRole("SUPERADMIN"),
  auditAction("CREATE_COMPETITION_QUESTION_BANK", "COMPETITION_QUESTION_BANK"),
  createQuestionBank
);
competitionsRouter.get(
  "/:competitionId/courses/:courseId/levels/:courseLevelId/question-banks/:questionBankId",
  requireRole("SUPERADMIN"),
  getQuestionBank
);
competitionsRouter.patch(
  "/:competitionId/courses/:courseId/levels/:courseLevelId/question-banks/:questionBankId",
  requireRole("SUPERADMIN"),
  auditAction(
    "UPDATE_COMPETITION_QUESTION_BANK",
    "COMPETITION_QUESTION_BANK",
    (req) => req.params.questionBankId
  ),
  updateQuestionBank
);
competitionsRouter.post(
  "/:competitionId/courses/:courseId/levels/:courseLevelId/question-banks/:questionBankId/archive",
  requireRole("SUPERADMIN"),
  auditAction(
    "ARCHIVE_COMPETITION_QUESTION_BANK",
    "COMPETITION_QUESTION_BANK",
    (req) => req.params.questionBankId
  ),
  archiveQuestionBank
);


competitionsRouter.get(
  "/:competitionId/courses/:courseId/levels/:courseLevelId/question-banks/:questionBankId/questions",
  requireRole("SUPERADMIN"),
  listCompetitionQuestionBankQuestions
);
competitionsRouter.post(
  "/:competitionId/courses/:courseId/levels/:courseLevelId/question-banks/:questionBankId/questions",
  requireRole("SUPERADMIN"),
  auditAction(
    "CREATE_COMPETITION_QUESTION",
    "COMPETITION_QUESTION_BANK",
    (req) => req.params.questionBankId
  ),
  createCompetitionQuestionBankQuestion
);
competitionsRouter.post(
  "/:competitionId/courses/:courseId/levels/:courseLevelId/question-banks/:questionBankId/questions/import",
  requireRole("SUPERADMIN"),
  auditAction(
    "IMPORT_COMPETITION_QUESTIONS",
    "COMPETITION_QUESTION_BANK",
    (req) => req.params.questionBankId
  ),
  importCompetitionQuestionBankQuestions
);
competitionsRouter.patch(
  "/:competitionId/courses/:courseId/levels/:courseLevelId/question-banks/:questionBankId/questions/:questionId",
  requireRole("SUPERADMIN"),
  auditAction(
    "UPDATE_COMPETITION_QUESTION",
    "QUESTION_BANK",
    (req) => req.params.questionId
  ),
  updateCompetitionQuestionBankQuestion
);
competitionsRouter.delete(
  "/:competitionId/courses/:courseId/levels/:courseLevelId/question-banks/:questionBankId/questions/:questionId",
  requireRole("SUPERADMIN"),
  auditAction(
    "REMOVE_COMPETITION_QUESTION",
    "COMPETITION_QUESTION_BANK",
    (req) => req.params.questionBankId
  ),
  removeCompetitionQuestionBankQuestion
);


competitionsRouter.get(
  "/:competitionId/courses/:courseId/levels/:courseLevelId/question-banks/:questionBankId/worksheets",
  requireRole("SUPERADMIN"),
  listCompetitionWorksheets
);
competitionsRouter.post(
  "/:competitionId/courses/:courseId/levels/:courseLevelId/question-banks/:questionBankId/worksheets",
  requireRole("SUPERADMIN"),
  auditAction("CREATE_COMPETITION_WORKSHEET", "COMPETITION_WORKSHEET"),
  createCompetitionWorksheet
);
competitionsRouter.post(
  "/:competitionId/courses/:courseId/levels/:courseLevelId/question-banks/:questionBankId/worksheets/build",
  requireRole("SUPERADMIN"),
  auditAction(
    "BUILD_COMPETITION_WORKSHEET",
    "COMPETITION_QUESTION_BANK",
    (req) => req.params.questionBankId
  ),
  buildCompetitionWorksheetFromQuestions
);
competitionsRouter.get(
  "/:competitionId/courses/:courseId/levels/:courseLevelId/question-banks/:questionBankId/worksheets/:worksheetId",
  requireRole("SUPERADMIN"),
  getCompetitionWorksheet
);
competitionsRouter.patch(
  "/:competitionId/courses/:courseId/levels/:courseLevelId/question-banks/:questionBankId/worksheets/:worksheetId",
  requireRole("SUPERADMIN"),
  auditAction(
    "UPDATE_COMPETITION_WORKSHEET",
    "COMPETITION_WORKSHEET",
    (req) => req.params.worksheetId
  ),
  updateCompetitionWorksheet
);
competitionsRouter.get(
  "/:competitionId/courses/:courseId/levels/:courseLevelId/question-banks/:questionBankId/worksheets/:worksheetId/assignments",
  requireRole("SUPERADMIN"),
  listCompetitionWorksheetAssignments
);
competitionsRouter.put(
  "/:competitionId/courses/:courseId/levels/:courseLevelId/question-banks/:questionBankId/worksheets/:worksheetId/assignments",
  requireRole("SUPERADMIN"),
  auditAction(
    "REPLACE_COMPETITION_WORKSHEET_ASSIGNMENTS",
    "COMPETITION_WORKSHEET",
    (req) => req.params.worksheetId
  ),
  replaceCompetitionWorksheetAssignments
);

competitionsRouter.post(
  "/:competitionId/courses/:courseId/levels/:courseLevelId/question-banks/:questionBankId/worksheets/:worksheetId/archive",
  requireRole("SUPERADMIN"),
  auditAction(
    "ARCHIVE_COMPETITION_WORKSHEET",
    "COMPETITION_WORKSHEET",
    (req) => req.params.worksheetId
  ),
  archiveCompetitionWorksheet
);

competitionsRouter.get(
  "/",
  requireOperationalRoles(),
  listCompetitions
);

competitionsRouter.post(
  "/",
  requireRole("SUPERADMIN"),
  auditAction("CREATE_COMPETITION", "COMPETITION"),
  createCompetition
);

competitionsRouter.post(
  "/:id/enrollments",
  requireRole("TEACHER", "CENTER"),
  auditAction(
    "ENROLL_STUDENT_COMPETITION",
    "COMPETITION",
    (req) => req.params.id
  ),
  enrollStudent
);

competitionsRouter.post(
  "/:id/temporary-students",
  requireRole("CENTER"),
  auditAction(
    "CREATE_COMPETITION_TEMPORARY_STUDENTS",
    "COMPETITION",
    (req) => req.params.id
  ),
  createCompetitionTemporaryStudents
);

competitionsRouter.get(
  "/:id/enrollment-lists",
  requireOperationalRoles(),
  listCompetitionEnrollmentLists
);

competitionsRouter.get(
  "/:id/enrollment-lists/:listId",
  requireOperationalRoles(),
  getCompetitionEnrollmentList
);

competitionsRouter.post(
  "/:id/enrollment-lists/:listId/forward",
  requireRole("TEACHER", "CENTER"),
  auditAction(
    "COMPETITION_ENROLLMENT_LIST_FORWARD",
    "COMPETITION_ENROLLMENT_LIST",
    (req) => req.params.listId
  ),
  forwardEnrollmentList
);

competitionsRouter.post(
  "/:id/enrollment-lists/:listId/return",
  requireRole("CENTER", "SUPERADMIN"),
  auditAction(
    "COMPETITION_ENROLLMENT_LIST_RETURN",
    "COMPETITION_ENROLLMENT_LIST",
    (req) => req.params.listId
  ),
  returnEnrollmentList
);

competitionsRouter.patch(
  "/:id/enrollment-lists/:listId/enrollments/:enrollmentId/inclusion",
  requireRole("TEACHER", "CENTER", "SUPERADMIN"),
  auditAction(
    "COMPETITION_ENROLLMENT_INCLUSION_UPDATE",
    "COMPETITION_ENROLLMENT",
    (req) => req.params.enrollmentId
  ),
  updateEnrollmentInclusion
);

competitionsRouter.post(
  "/:id/enrollment-lists/:listId/approve",
  requireRole("SUPERADMIN"),
  auditAction(
    "COMPETITION_ENROLLMENT_LIST_APPROVE",
    "COMPETITION_ENROLLMENT_LIST",
    (req) => req.params.listId
  ),
  approveEnrollmentList
);

competitionsRouter.get(
  "/:id/quotas",
  requireRole("SUPERADMIN"),
  listCompetitionQuotas
);

competitionsRouter.put(
  "/:id/quotas/:businessPartnerId",
  requireRole("SUPERADMIN"),
  auditAction(
    "COMPETITION_BP_QUOTA_UPDATE",
    "COMPETITION_BP_QUOTA",
    (req) => req.params.businessPartnerId
  ),
  updateCompetitionQuota
);

competitionsRouter.post(
  "/:id/quotas/:businessPartnerId/reprocess",
  requireRole("SUPERADMIN"),
  reprocessCompetitionQuota
);

competitionsRouter.post(
  "/:id/enrollments/:enrollmentId/extra-attempt",
  requireRole("SUPERADMIN"),
  grantCompetitionExtraAttempt
);

competitionsRouter.get(
  "/:id/leaderboard",
  requireOperationalRoles(),
  getLeaderboard
);

competitionsRouter.get(
  "/:id/results",
  requireOperationalRoles(),
  getCompetitionResults
);

competitionsRouter.post(
  "/:id/results/publish",
  requireRole("SUPERADMIN"),
  auditAction(
    "COMPETITION_RESULTS_PUBLISH",
    "COMPETITION",
    (req) => req.params.id
  ),
  publishCompetitionResults
);

competitionsRouter.post(
  "/:id/results/unpublish",
  requireRole("SUPERADMIN"),
  auditAction(
    "COMPETITION_RESULTS_UNPUBLISH",
    "COMPETITION",
    (req) => req.params.id
  ),
  unpublishCompetitionResults
);

competitionsRouter.patch(
  "/:id/schedule",
  requireRole("SUPERADMIN"),
  auditAction(
    "UPDATE_COMPETITION_SCHEDULE",
    "COMPETITION",
    (req) => req.params.id
  ),
  updateCompetitionSchedule
);

competitionsRouter.get(
  "/:id/results.csv",
  requireOperationalRoles(),
  exportCompetitionResultsCsv
);

competitionsRouter.get(
  "/:id",
  requireOperationalRoles(),
  getCompetitionDetail
);

export { competitionsRouter };
