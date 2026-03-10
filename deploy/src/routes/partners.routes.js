import { Router } from "express";
import { createBusinessPartner } from "../controllers/business-partners.controller.js";
import { requireSuperadmin } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";

const partnersRouter = Router();

partnersRouter.post(
  "/",
  requireSuperadmin(),
  auditAction("CREATE_BUSINESS_PARTNER", "BUSINESS_PARTNER"),
  createBusinessPartner
);

export { partnersRouter };
