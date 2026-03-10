import { Router } from "express";
import { listSettlements, generateSettlements, markSettlementPaid } from "../controllers/settlements.controller.js";
import { requireRole, requireSuperadmin } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";

const settlementsRouter = Router();

settlementsRouter.get("/", requireRole("SUPERADMIN", "BP", "CENTER"), listSettlements);

settlementsRouter.post(
  "/generate",
  requireSuperadmin(),
  auditAction("GENERATE_SETTLEMENTS", "SETTLEMENT"),
  generateSettlements
);

settlementsRouter.post(
  "/:id/mark-paid",
  requireSuperadmin(),
  auditAction("SETTLEMENT_MARK_PAID", "SETTLEMENT", (req) => req.params.id),
  markSettlementPaid
);

export { settlementsRouter };
