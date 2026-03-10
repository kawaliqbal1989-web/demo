import { Router } from "express";
import {
  createBusinessPartner,
  getMyBusinessPartner,
  getBusinessPartner,
  listBusinessPartners,
  uploadBusinessPartnerLogo,
  updateBusinessPartner,
  setBusinessPartnerStatus,
  resetBusinessPartnerPassword,
  updateRevenueSplit,
  renewBusinessPartnerSubscription,
  getBPPracticeEntitlements,
  updateBPPracticeEntitlements,
  getBPPracticeUsageReport
} from "../controllers/business-partners.controller.js";
import { requireRole, requireSuperadmin } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import { businessPartnerLogoUpload } from "../middleware/upload.js";

const businessPartnersRouter = Router();

businessPartnersRouter.get("/", requireSuperadmin(), listBusinessPartners);

businessPartnersRouter.get("/me", requireRole("BP"), getMyBusinessPartner);

businessPartnersRouter.get(
  "/:id",
  requireSuperadmin(),
  auditAction("VIEW_BUSINESS_PARTNER", "BUSINESS_PARTNER", (req) => req.params.id),
  getBusinessPartner
);

businessPartnersRouter.post(
  "/",
  requireSuperadmin(),
  auditAction("CREATE_BUSINESS_PARTNER", "BUSINESS_PARTNER"),
  createBusinessPartner
);

businessPartnersRouter.post(
  "/:id/logo",
  requireSuperadmin(),
  auditAction("UPLOAD_BUSINESS_PARTNER_LOGO", "BUSINESS_PARTNER", (req) => req.params.id),
  (req, res, next) => {
    businessPartnerLogoUpload(req, res, next);
  },
  uploadBusinessPartnerLogo
);

businessPartnersRouter.patch(
  "/:id",
  requireSuperadmin(),
  auditAction("UPDATE_BUSINESS_PARTNER", "BUSINESS_PARTNER", (req) => req.params.id),
  updateBusinessPartner
);

businessPartnersRouter.patch(
  "/:id/status",
  requireSuperadmin(),
  auditAction("SET_BUSINESS_PARTNER_STATUS", "BUSINESS_PARTNER", (req) => req.params.id),
  setBusinessPartnerStatus
);

businessPartnersRouter.post(
  "/:id/reset-password",
  requireSuperadmin(),
  auditAction("RESET_BP_PASSWORD", "BUSINESS_PARTNER", (req) => req.params.id),
  resetBusinessPartnerPassword
);

businessPartnersRouter.patch(
  "/:id/renew",
  requireSuperadmin(),
  auditAction("SUBSCRIPTION_RENEWAL", "BUSINESS_PARTNER", (req) => req.params.id),
  renewBusinessPartnerSubscription
);

businessPartnersRouter.patch(
  "/:id/revenue-split",
  requireRole("SUPERADMIN", "BP"),
  auditAction("UPDATE_REVENUE_SPLIT", "BUSINESS_PARTNER", (req) => req.params.id),
  updateRevenueSplit
);

// Practice Feature Entitlements (Superadmin only)
businessPartnersRouter.get(
  "/:id/practice-entitlements",
  requireSuperadmin(),
  auditAction("VIEW_BP_PRACTICE_ENTITLEMENTS", "BUSINESS_PARTNER", (req) => req.params.id),
  getBPPracticeEntitlements
);

businessPartnersRouter.patch(
  "/:id/practice-entitlements",
  requireSuperadmin(),
  auditAction("UPDATE_BP_PRACTICE_ENTITLEMENTS", "BUSINESS_PARTNER", (req) => req.params.id),
  updateBPPracticeEntitlements
);

businessPartnersRouter.get(
  "/:id/practice-usage",
  requireSuperadmin(),
  auditAction("VIEW_BP_PRACTICE_USAGE", "BUSINESS_PARTNER", (req) => req.params.id),
  getBPPracticeUsageReport
);

export { businessPartnersRouter };
