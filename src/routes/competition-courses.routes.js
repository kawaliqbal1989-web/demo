import { Router } from "express";
import {
  archiveCompetitionCourse,
  archiveCompetitionCoursePaperBlueprint,
  assignCompetitionCourse,
  createCompetitionCourse,
  createCompetitionCoursePaper,
  createCompetitionCoursePaperBlueprint,
  createCompetitionCourseLevelQuestionBankEntry,
  createCompetitionCourseLevel,
  deleteCompetitionCourseLevelQuestionBankEntry,
  exportCompetitionCourseLevelQuestionBankCsv,
  archiveCompetitionCoursePaper,
  generateCompetitionCoursePaperWorksheet,
  getCompetitionCourse,
  importCompetitionCourseLevelQuestionBank,
  listCompetitionCoursePaperBlueprints,
  listCompetitionCoursePapers,
  listCompetitionCourseLevelQuestionBank,
  listCompetitionCourseLevels,
  listCompetitionCourses,
  updateCompetitionCourse,
  updateCompetitionCoursePaperBlueprint,
  updateCompetitionCoursePaper,
  updateCompetitionCourseLevelQuestionBankEntry,
  updateCompetitionCourseLevel
} from "../controllers/competition-courses.controller.js";
import { requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";

const competitionCoursesRouter = Router();
const competitionCourseAssignmentRouter = Router();

competitionCoursesRouter.get("/", requireRole("SUPERADMIN"), listCompetitionCourses);

competitionCoursesRouter.post(
  "/",
  requireRole("SUPERADMIN"),
  auditAction("CREATE_COMPETITION_COURSE", "COMPETITION_COURSE"),
  createCompetitionCourse
);

competitionCoursesRouter.get("/:id", requireRole("SUPERADMIN"), getCompetitionCourse);

competitionCoursesRouter.patch(
  "/:id",
  requireRole("SUPERADMIN"),
  auditAction("UPDATE_COMPETITION_COURSE", "COMPETITION_COURSE", (req) => req.params.id),
  updateCompetitionCourse
);

competitionCoursesRouter.post(
  "/:id/archive",
  requireRole("SUPERADMIN"),
  auditAction("ARCHIVE_COMPETITION_COURSE", "COMPETITION_COURSE", (req) => req.params.id),
  archiveCompetitionCourse
);

competitionCoursesRouter.get("/:courseId/levels", requireRole("SUPERADMIN"), listCompetitionCourseLevels);

competitionCoursesRouter.get(
  "/:courseId/levels/:levelId/question-bank",
  requireRole("SUPERADMIN"),
  listCompetitionCourseLevelQuestionBank
);

competitionCoursesRouter.get(
  "/:courseId/levels/:levelId/question-bank/export.csv",
  requireRole("SUPERADMIN"),
  auditAction("EXPORT_COMPETITION_COURSE_LEVEL_QUESTION_BANK", "COMPETITION_COURSE_LEVEL", (req) => req.params.levelId),
  exportCompetitionCourseLevelQuestionBankCsv
);

competitionCoursesRouter.post(
  "/:courseId/levels/:levelId/question-bank/import",
  requireRole("SUPERADMIN"),
  auditAction("IMPORT_COMPETITION_COURSE_LEVEL_QUESTION_BANK", "COMPETITION_COURSE_LEVEL", (req) => req.params.levelId),
  importCompetitionCourseLevelQuestionBank
);

competitionCoursesRouter.get(
  "/:courseId/levels/:levelId/papers",
  requireRole("SUPERADMIN"),
  listCompetitionCoursePapers
);

competitionCoursesRouter.post(
  "/:courseId/levels/:levelId/papers",
  requireRole("SUPERADMIN"),
  auditAction("CREATE_COMPETITION_COURSE_PAPER", "COMPETITION_COURSE_LEVEL", (req) => req.params.levelId),
  createCompetitionCoursePaper
);

competitionCoursesRouter.patch(
  "/:courseId/levels/:levelId/papers/:paperId",
  requireRole("SUPERADMIN"),
  auditAction("UPDATE_COMPETITION_COURSE_PAPER", "COMPETITION_COURSE_PAPER", (req) => req.params.paperId),
  updateCompetitionCoursePaper
);

competitionCoursesRouter.post(
  "/:courseId/levels/:levelId/papers/:paperId/archive",
  requireRole("SUPERADMIN"),
  auditAction("ARCHIVE_COMPETITION_COURSE_PAPER", "COMPETITION_COURSE_PAPER", (req) => req.params.paperId),
  archiveCompetitionCoursePaper
);

competitionCoursesRouter.get(
  "/:courseId/levels/:levelId/papers/:paperId/blueprints",
  requireRole("SUPERADMIN"),
  listCompetitionCoursePaperBlueprints
);

competitionCoursesRouter.post(
  "/:courseId/levels/:levelId/papers/:paperId/blueprints",
  requireRole("SUPERADMIN"),
  auditAction("CREATE_COMPETITION_COURSE_PAPER_BLUEPRINT", "COMPETITION_COURSE_PAPER", (req) => req.params.paperId),
  createCompetitionCoursePaperBlueprint
);

competitionCoursesRouter.patch(
  "/:courseId/levels/:levelId/papers/:paperId/blueprints/:blueprintId",
  requireRole("SUPERADMIN"),
  auditAction("UPDATE_COMPETITION_COURSE_PAPER_BLUEPRINT", "COMPETITION_COURSE_PAPER_BLUEPRINT", (req) => req.params.blueprintId),
  updateCompetitionCoursePaperBlueprint
);

competitionCoursesRouter.post(
  "/:courseId/levels/:levelId/papers/:paperId/blueprints/:blueprintId/archive",
  requireRole("SUPERADMIN"),
  auditAction("ARCHIVE_COMPETITION_COURSE_PAPER_BLUEPRINT", "COMPETITION_COURSE_PAPER_BLUEPRINT", (req) => req.params.blueprintId),
  archiveCompetitionCoursePaperBlueprint
);

competitionCoursesRouter.post(
  "/:courseId/levels/:levelId/papers/:paperId/blueprints/:blueprintId/generate-worksheet",
  requireRole("SUPERADMIN"),
  auditAction("GENERATE_COMPETITION_COURSE_WORKSHEET", "COMPETITION_COURSE_PAPER_BLUEPRINT", (req) => req.params.blueprintId),
  generateCompetitionCoursePaperWorksheet
);

competitionCoursesRouter.post(
  "/:courseId/levels/:levelId/question-bank",
  requireRole("SUPERADMIN"),
  auditAction("CREATE_COMPETITION_COURSE_LEVEL_QUESTION", "COMPETITION_COURSE_LEVEL", (req) => req.params.levelId),
  createCompetitionCourseLevelQuestionBankEntry
);

competitionCoursesRouter.patch(
  "/:courseId/levels/:levelId/question-bank/:mappingId",
  requireRole("SUPERADMIN"),
  auditAction("UPDATE_COMPETITION_COURSE_LEVEL_QUESTION", "COMPETITION_COURSE_LEVEL_QUESTION", (req) => req.params.mappingId),
  updateCompetitionCourseLevelQuestionBankEntry
);

competitionCoursesRouter.delete(
  "/:courseId/levels/:levelId/question-bank/:mappingId",
  requireRole("SUPERADMIN"),
  auditAction("DELETE_COMPETITION_COURSE_LEVEL_QUESTION", "COMPETITION_COURSE_LEVEL_QUESTION", (req) => req.params.mappingId),
  deleteCompetitionCourseLevelQuestionBankEntry
);

competitionCoursesRouter.post(
  "/:courseId/levels",
  requireRole("SUPERADMIN"),
  auditAction("CREATE_COMPETITION_COURSE_LEVEL", "COMPETITION_COURSE", (req) => req.params.courseId),
  createCompetitionCourseLevel
);

competitionCoursesRouter.patch(
  "/:courseId/levels/:levelId",
  requireRole("SUPERADMIN"),
  auditAction("UPDATE_COMPETITION_COURSE_LEVEL", "COMPETITION_COURSE_LEVEL", (req) => req.params.levelId),
  updateCompetitionCourseLevel
);

competitionCourseAssignmentRouter.patch(
  "/:competitionId/course",
  requireRole("SUPERADMIN"),
  auditAction("ASSIGN_COMPETITION_COURSE", "COMPETITION", (req) => req.params.competitionId),
  assignCompetitionCourse
);

export { competitionCourseAssignmentRouter, competitionCoursesRouter };
