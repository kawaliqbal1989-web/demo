import { Router } from "express";
import { listMargins, setMargin } from "../controllers/margins.controller.js";
import { requireSuperadmin } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";

const marginsRouter = Router();

marginsRouter.get("/", requireSuperadmin(), listMargins);

marginsRouter.put(
  "/:businessPartnerId",
  requireSuperadmin(),
  auditAction("SET_MARGIN", "BUSINESS_PARTNER", (req) => req.params.businessPartnerId),
  setMargin
);

export { marginsRouter };
