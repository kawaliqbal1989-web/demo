import { Router } from "express";
import {
  createQuestionBankEntry,
  deleteQuestionBankEntry,
  exportQuestionBankCsv,
  importQuestionBank,
  listQuestionBank,
  updateQuestionBankEntry
} from "../controllers/question-bank.controller.js";
import { requireSuperadmin } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";

const questionBankRouter = Router();

questionBankRouter.get(
  "/",
  requireSuperadmin(),
  auditAction("LIST_QUESTION_BANK", "QUESTION_BANK"),
  listQuestionBank
);

questionBankRouter.get(
  "/export.csv",
  requireSuperadmin(),
  auditAction("EXPORT_QUESTION_BANK", "QUESTION_BANK"),
  exportQuestionBankCsv
);

questionBankRouter.post(
  "/import",
  requireSuperadmin(),
  auditAction("IMPORT_QUESTION_BANK", "QUESTION_BANK"),
  importQuestionBank
);

questionBankRouter.post(
  "/",
  requireSuperadmin(),
  auditAction("CREATE_QUESTION_BANK", "QUESTION_BANK"),
  createQuestionBankEntry
);

questionBankRouter.patch(
  "/:id",
  requireSuperadmin(),
  auditAction("UPDATE_QUESTION_BANK", "QUESTION_BANK", (req) => req.params.id),
  updateQuestionBankEntry
);

questionBankRouter.delete(
  "/:id",
  requireSuperadmin(),
  auditAction("DELETE_QUESTION_BANK", "QUESTION_BANK", (req) => req.params.id),
  deleteQuestionBankEntry
);

export { questionBankRouter };
