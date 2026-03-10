import { Router } from "express";
import { requireSuperadmin } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import { getExamTextbookLevel, upsertExamTextbookLevel } from "../controllers/exam-textbook.controller.js";

const examTextbookRouter = Router();

examTextbookRouter.get(
  "/levels/:levelId",
  requireSuperadmin(),
  auditAction("EXAM_TEXTBOOK_VIEW", "LEVEL", (req) => req.params.levelId),
  getExamTextbookLevel
);

examTextbookRouter.put(
  "/levels/:levelId",
  requireSuperadmin(),
  auditAction("EXAM_TEXTBOOK_UPSERT", "LEVEL", (req) => req.params.levelId),
  upsertExamTextbookLevel
);

export { examTextbookRouter };
