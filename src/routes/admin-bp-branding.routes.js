import { Router } from "express";
import { requireSuperadmin } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import { genericLogoUpload, wrapUploadMiddleware } from "../middleware/upload.js";
import {
  deleteLogo,
  getAdminBusinessPartnerBranding,
  resolveAdminBusinessPartnerLogoUploadTarget,
  uploadLogo
} from "../controllers/uploads.controller.js";

const adminBpBrandingRouter = Router();

adminBpBrandingRouter.use(requireSuperadmin());

adminBpBrandingRouter.get(
  "/:id/branding",
  auditAction("VIEW_BUSINESS_PARTNER_BRANDING", "BUSINESS_PARTNER", (req) => req.params.id),
  getAdminBusinessPartnerBranding
);

adminBpBrandingRouter.post(
  "/:id/branding/upload",
  auditAction("UPLOAD_BUSINESS_PARTNER_LOGO", "BUSINESS_PARTNER", (req) => req.params.id),
  resolveAdminBusinessPartnerLogoUploadTarget,
  wrapUploadMiddleware(genericLogoUpload),
  uploadLogo
);

adminBpBrandingRouter.delete(
  "/:id/branding/remove",
  auditAction("DELETE_BUSINESS_PARTNER_LOGO", "BUSINESS_PARTNER", (req) => req.params.id),
  resolveAdminBusinessPartnerLogoUploadTarget,
  deleteLogo
);

export { adminBpBrandingRouter };
