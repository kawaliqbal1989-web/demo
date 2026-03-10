import { Router } from "express";
import { requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import { requireBusinessPartnerScope } from "../middleware/partner-scope.js";
import {
  createFranchise,
  deleteFranchise,
  listFranchises,
  updateFranchise,
  uploadFranchiseLogo
} from "../controllers/franchises.controller.js";
import { franchiseLogoUpload } from "../middleware/upload.js";

const franchisesRouter = Router();

franchisesRouter.use(requireRole("BP"));
franchisesRouter.use(requireBusinessPartnerScope);

franchisesRouter.get(
  "/",
  auditAction("BP_LIST_FRANCHISES", "AUTH_USER"),
  listFranchises
);

franchisesRouter.post(
  "/",
  auditAction("BP_CREATE_FRANCHISE", "AUTH_USER"),
  createFranchise
);

franchisesRouter.patch(
  "/:id",
  auditAction("BP_UPDATE_FRANCHISE", "AUTH_USER", (req) => req.params.id),
  updateFranchise
);

franchisesRouter.delete(
  "/:id",
  auditAction("BP_DELETE_FRANCHISE", "AUTH_USER", (req) => req.params.id),
  deleteFranchise
);

franchisesRouter.post(
  "/:id/logo",
  auditAction("BP_UPLOAD_FRANCHISE_LOGO", "AUTH_USER", (req) => req.params.id),
  (req, res, next) => {
    franchiseLogoUpload(req, res, next);
  },
  uploadFranchiseLogo
);

export { franchisesRouter };
