import { Router } from "express";
import { listCenters } from "../controllers/centers.controller.js";
import { requireBusinessPartnerScope } from "../middleware/partner-scope.js";
import { requireRole } from "../middleware/rbac.js";

const centersRouter = Router();

function requireBusinessPartnerScopeWhenNeeded(req, res, next) {
	if (req.auth?.role !== "BP") {
		return next();
	}

	return requireBusinessPartnerScope(req, res, next);
}

centersRouter.get("/", requireRole("SUPERADMIN", "BP"), requireBusinessPartnerScopeWhenNeeded, listCenters);

export { centersRouter };
