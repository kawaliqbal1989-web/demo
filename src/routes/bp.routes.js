import { Router } from "express";
import {
  getBpCenterCapacitySummary,
  patchCenterCapacity
} from "../controllers/capacity.controller.js";
import { requireBusinessPartnerScope } from "../middleware/partner-scope.js";
import { requireRole } from "../middleware/rbac.js";

const bpRouter = Router();

function requireBusinessPartnerScopeWhenNeeded(req, res, next) {
  if (req.auth?.role !== "BP") {
    return next();
  }

  return requireBusinessPartnerScope(req, res, next);
}

bpRouter.use(requireRole("SUPERADMIN", "BP"));
bpRouter.use(requireBusinessPartnerScopeWhenNeeded);

bpRouter.patch("/centers/:id/capacity", patchCenterCapacity);
bpRouter.get("/centers/capacity-summary", getBpCenterCapacitySummary);

export { bpRouter };