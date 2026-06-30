import { Router } from "express";
import {
  getBpCenterCapacitySummary,
  patchCenterCapacity
} from "../controllers/capacity.controller.js";
import { requireBusinessPartnerScope } from "../middleware/partner-scope.js";
import { requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import { requireScopeAccess } from "../middleware/scope-access.js";
import {
  listBpCompetitionFranchises,
  getBpCompetitionFranchiseDetail,
  returnBpCompetitionFranchise,
  approveBpCompetitionFranchise,
  submitBpCompetition
} from "../controllers/bp-competition.controller.js";

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

/* Competition franchise review endpoints for Business Partner */
bpRouter.get(
  "/competitions/:competitionId/franchises",
  requireScopeAccess("competition", "competitionId"),
  auditAction("BP_LIST_COMPETITION_FRANCHISES", "COMPETITION"),
  listBpCompetitionFranchises
);

bpRouter.get(
  "/competitions/:competitionId/franchises/:franchiseId",
  requireScopeAccess("competition", "competitionId"),
  auditAction("BP_VIEW_COMPETITION_FRANCHISE", "COMPETITION", (req) => req.params.competitionId),
  getBpCompetitionFranchiseDetail
);

bpRouter.post(
  "/competitions/:competitionId/franchises/:franchiseId/return",
  requireScopeAccess("competition", "competitionId"),
  auditAction("BP_RETURN_COMPETITION_FRANCHISE", "COMPETITION", (req) => req.params.competitionId),
  returnBpCompetitionFranchise
);

bpRouter.post(
  "/competitions/:competitionId/franchises/:franchiseId/approve",
  requireScopeAccess("competition", "competitionId"),
  auditAction("BP_APPROVE_COMPETITION_FRANCHISE", "COMPETITION", (req) => req.params.competitionId),
  approveBpCompetitionFranchise
);

bpRouter.post(
  "/competitions/:competitionId/submit",
  requireScopeAccess("competition", "competitionId"),
  auditAction("BP_SUBMIT_COMPETITION", "COMPETITION", (req) => req.params.competitionId),
  submitBpCompetition
);

export { bpRouter };