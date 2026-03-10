import { Router } from "express";
import { exportLedgerCsv, listLedger } from "../controllers/ledger.controller.js";
import { requireRole } from "../middleware/rbac.js";

const ledgerRouter = Router();

ledgerRouter.get("/", requireRole("SUPERADMIN", "BP", "CENTER"), listLedger);
ledgerRouter.get("/export.csv", requireRole("SUPERADMIN", "BP", "CENTER"), exportLedgerCsv);

export { ledgerRouter };