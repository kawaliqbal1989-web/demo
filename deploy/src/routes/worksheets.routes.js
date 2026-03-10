import { Router } from "express";
import {
  addWorksheetQuestion,
  addWorksheetQuestionsBulk,
  createWorksheet,
  deleteWorksheet,
  deleteWorksheetQuestion,
  duplicateWorksheet,
  getWorksheet,
  listWorksheets,
  reorderWorksheetQuestions,
  submitWorksheetAnswers,
  updateWorksheet
} from "../controllers/worksheets.controller.js";
import { requireOperationalRoles, requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import { requireScopeAccess } from "../middleware/scope-access.js";

const worksheetsRouter = Router();

worksheetsRouter.get("/", requireOperationalRoles(), listWorksheets);

worksheetsRouter.get(
  "/:id",
  requireOperationalRoles(),
  requireScopeAccess("worksheet", "id"),
  auditAction("VIEW_WORKSHEET", "WORKSHEET", (req) => req.params.id),
  getWorksheet
);
worksheetsRouter.post(
  "/",
  requireRole("SUPERADMIN"),
  auditAction("CREATE_WORKSHEET", "WORKSHEET"),
  createWorksheet
);

worksheetsRouter.post(
  "/:id/duplicate",
  requireRole("SUPERADMIN"),
  requireScopeAccess("worksheet", "id"),
  auditAction("DUPLICATE_WORKSHEET", "WORKSHEET", (req) => req.params.id),
  duplicateWorksheet
);

worksheetsRouter.patch(
  "/:id",
  requireRole("SUPERADMIN"),
  requireScopeAccess("worksheet", "id"),
  auditAction("UPDATE_WORKSHEET", "WORKSHEET", (req) => req.params.id),
  updateWorksheet
);

worksheetsRouter.delete(
  "/:id",
  requireRole("SUPERADMIN"),
  requireScopeAccess("worksheet", "id"),
  auditAction("DELETE_WORKSHEET", "WORKSHEET", (req) => req.params.id),
  deleteWorksheet
);

worksheetsRouter.patch(
  "/:id/questions/reorder",
  requireRole("SUPERADMIN"),
  requireScopeAccess("worksheet", "id"),
  auditAction("REORDER_WORKSHEET_QUESTIONS", "WORKSHEET", (req) => req.params.id),
  reorderWorksheetQuestions
);

worksheetsRouter.post(
  "/:id/questions",
  requireRole("SUPERADMIN"),
  requireScopeAccess("worksheet", "id"),
  auditAction("ADD_WORKSHEET_QUESTION", "WORKSHEET", (req) => req.params.id),
  addWorksheetQuestion
);

worksheetsRouter.post(
  "/:id/questions/bulk",
  requireRole("SUPERADMIN"),
  requireScopeAccess("worksheet", "id"),
  auditAction("ADD_BULK_WORKSHEET_QUESTIONS", "WORKSHEET", (req) => req.params.id),
  addWorksheetQuestionsBulk
);

worksheetsRouter.delete(
  "/:id/questions/:questionId",
  requireRole("SUPERADMIN"),
  requireScopeAccess("worksheet", "id"),
  auditAction("DELETE_WORKSHEET_QUESTION", "WORKSHEET", (req) => req.params.id),
  deleteWorksheetQuestion
);

worksheetsRouter.post(
  "/:id/submit",
  requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER", "STUDENT"),
  requireScopeAccess("worksheet", "id"),
  submitWorksheetAnswers
);

export { worksheetsRouter };

