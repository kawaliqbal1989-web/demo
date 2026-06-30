import { Router } from "express";
import {
  listCompetitionQuestionBank,
  createCompetitionQuestionBankEntry,
  updateCompetitionQuestionBankEntry,
  deleteCompetitionQuestionBankEntry,
  exportCompetitionQuestionBankCsv,
  importCompetitionQuestionBank
} from "../controllers/competition-question-bank.controller.js";
import { requireSuperadmin } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";

const competitionQuestionBankRouter = Router();

competitionQuestionBankRouter.get(
  "/",
  requireSuperadmin(),
  auditAction("LIST_COMPETITION_QUESTION_BANK", "COMPETITION_QUESTION_BANK"),
  listCompetitionQuestionBank
);

competitionQuestionBankRouter.get(
  "/export.csv",
  requireSuperadmin(),
  auditAction("EXPORT_COMPETITION_QUESTION_BANK", "COMPETITION_QUESTION_BANK"),
  exportCompetitionQuestionBankCsv
);

competitionQuestionBankRouter.post(
  "/import",
  requireSuperadmin(),
  auditAction("IMPORT_COMPETITION_QUESTION_BANK", "COMPETITION_QUESTION_BANK"),
  importCompetitionQuestionBank
);

competitionQuestionBankRouter.post(
  "/",
  requireSuperadmin(),
  auditAction("CREATE_COMPETITION_QUESTION_BANK", "COMPETITION_QUESTION_BANK"),
  createCompetitionQuestionBankEntry
);

competitionQuestionBankRouter.patch(
  "/:id",
  requireSuperadmin(),
  auditAction("UPDATE_COMPETITION_QUESTION_BANK", "COMPETITION_QUESTION_BANK", (req) => req.params.id),
  updateCompetitionQuestionBankEntry
);

competitionQuestionBankRouter.delete(
  "/:id",
  requireSuperadmin(),
  auditAction("DELETE_COMPETITION_QUESTION_BANK", "COMPETITION_QUESTION_BANK", (req) => req.params.id),
  deleteCompetitionQuestionBankEntry
);

export { competitionQuestionBankRouter };
