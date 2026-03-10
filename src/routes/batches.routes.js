import { Router } from "express";
import { requireOperationalRoles, requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import { listBatches, createBatch, updateBatch, setBatchTeachers } from "../controllers/batches.controller.js";

const batchesRouter = Router();

batchesRouter.get("/", requireOperationalRoles(), listBatches);

batchesRouter.post(
  "/",
  requireRole("CENTER", "SUPERADMIN"),
  auditAction("CREATE_BATCH", "BATCH"),
  createBatch
);

batchesRouter.put(
  "/:id",
  requireRole("CENTER", "SUPERADMIN"),
  auditAction("UPDATE_BATCH", "BATCH", (req) => req.params.id),
  updateBatch
);

batchesRouter.put(
  "/:id/teachers",
  requireRole("CENTER", "SUPERADMIN"),
  auditAction("SET_BATCH_TEACHERS", "BATCH", (req) => req.params.id),
  setBatchTeachers
);

export { batchesRouter };
