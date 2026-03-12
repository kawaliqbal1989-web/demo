import { Router } from "express";
import { requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import { requireBusinessPartnerScope } from "../middleware/partner-scope.js";
import {
  exportPartnerStudentsCsv,
  getPartnerDashboard,
  listPartnerStudents,
  listPartnerCertificates,
  issuePartnerCertificate,
  bulkIssuePartnerCertificates,
  listEligibleStudentsForCertificate,
  revokePartnerCertificate,
  exportPartnerCertificatesCsv,
  getPartnerProfile,
  updatePartnerProfile,
  listPartnerCourses,
  listPartnerHierarchy,
  listPartnerCompetitionRequests,
  submitPartnerCompetitionRequest,
  forwardPartnerCompetitionRequest
} from "../controllers/partner.controller.js";
import {
  getCertificateTemplate,
  upsertCertificateTemplate,
  uploadSignatureImage,
  uploadAffiliationLogo,
  uploadStampImage,
  uploadBackgroundImage
} from "../controllers/certificate-template.controller.js";
import {
  certificateSignatureUpload,
  certificateAffiliationLogoUpload,
  certificateStampUpload,
  certificateBackgroundUpload
} from "../middleware/upload.js";

const partnerRouter = Router();

partnerRouter.use(requireRole("BP"));
partnerRouter.use(requireBusinessPartnerScope);

partnerRouter.get(
  "/dashboard",
  auditAction("BP_VIEW_DASHBOARD", "BUSINESS_PARTNER"),
  getPartnerDashboard
);

partnerRouter.get(
  "/profile",
  auditAction("BP_VIEW_PROFILE", "BUSINESS_PARTNER"),
  getPartnerProfile
);

partnerRouter.patch(
  "/profile",
  auditAction("BP_UPDATE_PROFILE", "BUSINESS_PARTNER"),
  updatePartnerProfile
);

partnerRouter.get(
  "/students",
  auditAction("BP_VIEW_STUDENTS", "STUDENT"),
  listPartnerStudents
);

partnerRouter.get(
  "/students/export.csv",
  auditAction("BP_EXPORT_STUDENTS", "STUDENT"),
  exportPartnerStudentsCsv
);

partnerRouter.get(
  "/certificates",
  auditAction("BP_VIEW_CERTIFICATES", "CERTIFICATE"),
  listPartnerCertificates
);

partnerRouter.get(
  "/certificates/export.csv",
  auditAction("BP_EXPORT_CERTIFICATES", "CERTIFICATE"),
  exportPartnerCertificatesCsv
);

partnerRouter.get(
  "/certificates/eligible",
  auditAction("BP_VIEW_ELIGIBLE_STUDENTS", "CERTIFICATE"),
  listEligibleStudentsForCertificate
);

partnerRouter.post(
  "/certificates",
  auditAction("BP_ISSUE_CERTIFICATE", "CERTIFICATE"),
  issuePartnerCertificate
);

partnerRouter.post(
  "/certificates/bulk",
  auditAction("BP_BULK_ISSUE_CERTIFICATES", "CERTIFICATE"),
  bulkIssuePartnerCertificates
);

partnerRouter.patch(
  "/certificates/:id/revoke",
  auditAction("BP_REVOKE_CERTIFICATE", "CERTIFICATE", (req) => req.params.id),
  revokePartnerCertificate
);

partnerRouter.get(
  "/courses",
  auditAction("BP_VIEW_COURSES", "COURSE"),
  listPartnerCourses
);

partnerRouter.get(
  "/hierarchy",
  auditAction("BP_VIEW_HIERARCHY", "HIERARCHY_NODE"),
  listPartnerHierarchy
);

partnerRouter.get(
  "/competition_requests",
  auditAction("BP_VIEW_COMPETITION_REQUESTS", "COMPETITION"),
  listPartnerCompetitionRequests
);

partnerRouter.post(
  "/competition_requests",
  auditAction("BP_SUBMIT_COMPETITION_REQUEST", "COMPETITION"),
  submitPartnerCompetitionRequest
);

partnerRouter.post(
  "/competition_requests/:id/forward",
  auditAction("BP_FORWARD_COMPETITION_REQUEST", "COMPETITION", (req) => req.params.id),
  forwardPartnerCompetitionRequest
);

// Certificate template routes
partnerRouter.get(
  "/certificate-template",
  auditAction("BP_VIEW_CERTIFICATE_TEMPLATE", "CERTIFICATE_TEMPLATE"),
  getCertificateTemplate
);

partnerRouter.put(
  "/certificate-template",
  auditAction("BP_UPDATE_CERTIFICATE_TEMPLATE", "CERTIFICATE_TEMPLATE"),
  upsertCertificateTemplate
);

partnerRouter.post(
  "/certificate-template/signature",
  certificateSignatureUpload,
  auditAction("BP_UPLOAD_CERTIFICATE_SIGNATURE", "CERTIFICATE_TEMPLATE"),
  uploadSignatureImage
);

partnerRouter.post(
  "/certificate-template/affiliation-logo",
  certificateAffiliationLogoUpload,
  auditAction("BP_UPLOAD_CERTIFICATE_AFFILIATION_LOGO", "CERTIFICATE_TEMPLATE"),
  uploadAffiliationLogo
);

partnerRouter.post(
  "/certificate-template/stamp",
  certificateStampUpload,
  auditAction("BP_UPLOAD_CERTIFICATE_STAMP", "CERTIFICATE_TEMPLATE"),
  uploadStampImage
);

partnerRouter.post(
  "/certificate-template/background",
  certificateBackgroundUpload,
  auditAction("BP_UPLOAD_CERTIFICATE_BACKGROUND", "CERTIFICATE_TEMPLATE"),
  uploadBackgroundImage
);

/* ── Intelligence ── */
import { getBpNetworkPulse } from "../controllers/leadership-intel.controller.js";
import { getBpAiNarrative } from "../controllers/ai-narrative.controller.js";

partnerRouter.get("/intel/network-pulse", getBpNetworkPulse);

/* ── AI Narrative (Phase 10) ── */
partnerRouter.get("/ai/narrative", getBpAiNarrative);

export { partnerRouter };
