import { Router } from "express";
import {
  createCompetition,
  enrollStudent,
  exportCompetitionResultsCsv,
  forwardCompetitionRequest,
  getCompetitionDetail,
  getCompetitionResults,
  publishCompetitionWorksheetResults,
  publishCompetitionResults,
  finalizeCompetitionAwards,
  listCompetitionCertificates,
  generateCompetitionCertificates,
  publishCompetitionCertificates,
  rejectCompetitionRequest,
  getLeaderboard,
  unpublishCompetitionResults,
  listCompetitions,
  listCompetitionBusinessPartners,
  assignCompetitionBusinessPartners,
  removeCompetitionBusinessPartner,
  listCompetitionRegistrations,
  updateCompetitionRegistrationLevel,
  updateCompetitionRegistrationTeacher,
  removeCompetitionRegistration,
  createCompetitionTemporaryStudent,
  lockCompetitionCenterRegistration,
  requestCompetitionCenterUnlock,
  createCompetitionWorksheetAssignments,
  cancelCompetitionWorksheetAssignment
} from "../controllers/competitions.controller.js";
import { requireOperationalRoles, requireRole } from "../middleware/rbac.js";
import { requireScopeAccess } from "../middleware/scope-access.js";
import { auditAction } from "../middleware/audit-logger.js";

const competitionsRouter = Router();

competitionsRouter.get("/", requireOperationalRoles(), listCompetitions);
competitionsRouter.get(
  "/:id",
  requireOperationalRoles(),
  requireScopeAccess("competition", "id"),
  getCompetitionDetail
);
competitionsRouter.post(
  "/",
  requireRole("BP", "FRANCHISE", "CENTER", "SUPERADMIN"),
  auditAction("CREATE_COMPETITION", "COMPETITION"),
  createCompetition
);

competitionsRouter.get(
  "/:id/registrations",
  requireRole("CENTER", "TEACHER"),
  requireScopeAccess("competition", "id"),
  auditAction("COMPETITION_REGISTRATIONS_VIEW", "COMPETITION", (req) => req.params.id),
  listCompetitionRegistrations
);

competitionsRouter.patch(
  "/:id/registrations/:registrationId/level",
  requireRole("CENTER"),
  requireScopeAccess("competition", "id"),
  auditAction("COMPETITION_REGISTRATION_LEVEL_UPDATE", "COMPETITION", (req) => req.params.id),
  updateCompetitionRegistrationLevel
);

competitionsRouter.patch(
  "/:id/registrations/:registrationId/teacher",
  requireRole("CENTER"),
  requireScopeAccess("competition", "id"),
  auditAction("COMPETITION_REGISTRATION_TEACHER_UPDATE", "COMPETITION", (req) => req.params.id),
  updateCompetitionRegistrationTeacher
);

competitionsRouter.delete(
  "/:id/registrations/:registrationId",
  requireRole("CENTER"),
  requireScopeAccess("competition", "id"),
  auditAction("COMPETITION_REGISTRATION_REMOVE", "COMPETITION", (req) => req.params.id),
  removeCompetitionRegistration
);

competitionsRouter.post(
  "/:id/temporary-students",
  requireRole("CENTER"),
  requireScopeAccess("competition", "id"),
  auditAction("COMPETITION_TEMPORARY_STUDENT_CREATE", "COMPETITION", (req) => req.params.id),
  createCompetitionTemporaryStudent
);

competitionsRouter.post(
  "/:id/center-lock",
  requireRole("CENTER"),
  requireScopeAccess("competition", "id"),
  auditAction("COMPETITION_CENTER_LOCK", "COMPETITION", (req) => req.params.id),
  lockCompetitionCenterRegistration
);

competitionsRouter.post(
  "/:id/unlock-requests",
  requireRole("CENTER"),
  requireScopeAccess("competition", "id"),
  auditAction("COMPETITION_CENTER_UNLOCK_REQUEST", "COMPETITION", (req) => req.params.id),
  requestCompetitionCenterUnlock
);

competitionsRouter.post(
  "/:id/enrollments",
  requireRole("CENTER", "FRANCHISE", "BP", "SUPERADMIN"),
  requireScopeAccess("competition", "id"),
  auditAction("ENROLL_STUDENT_COMPETITION", "COMPETITION", (req) => req.params.id),
  enrollStudent
);

competitionsRouter.post(
  "/:id/worksheet-assignments",
  requireRole("SUPERADMIN"),
  requireScopeAccess("competition", "id"),
  auditAction("COMPETITION_WORKSHEET_ASSIGNMENT_CREATE", "COMPETITION", (req) => req.params.id),
  createCompetitionWorksheetAssignments
);

competitionsRouter.patch(
  "/:id/worksheet-assignments/:assignmentId/cancel",
  requireRole("SUPERADMIN"),
  requireScopeAccess("competition", "id"),
  auditAction("COMPETITION_WORKSHEET_ASSIGNMENT_CANCEL", "COMPETITION", (req) => req.params.id),
  cancelCompetitionWorksheetAssignment
);

competitionsRouter.post(
  "/:id/forward-request",
  requireRole("CENTER", "FRANCHISE", "BP", "SUPERADMIN"),
  requireScopeAccess("competition", "id"),
  auditAction("FORWARD_COMPETITION_REQUEST", "COMPETITION", (req) => req.params.id),
  forwardCompetitionRequest
);

competitionsRouter.post(
  "/:id/reject",
  requireRole("CENTER", "FRANCHISE", "BP", "SUPERADMIN"),
  requireScopeAccess("competition", "id"),
  auditAction("REJECT_COMPETITION_REQUEST", "COMPETITION", (req) => req.params.id),
  rejectCompetitionRequest
);

competitionsRouter.get(
  "/:id/leaderboard",
  requireOperationalRoles(),
  requireScopeAccess("competition", "id"),
  getLeaderboard
);

competitionsRouter.get(
  "/:id/business-partners",
  requireRole("SUPERADMIN"),
  requireScopeAccess("competition", "id"),
  listCompetitionBusinessPartners
);

competitionsRouter.post(
  "/:id/business-partners",
  requireRole("SUPERADMIN"),
  requireScopeAccess("competition", "id"),
  auditAction("ASSIGN_COMPETITION_BUSINESS_PARTNERS", "COMPETITION", (req) => req.params.id),
  assignCompetitionBusinessPartners
);

competitionsRouter.delete(
  "/:id/business-partners/:businessPartnerId",
  requireRole("SUPERADMIN"),
  requireScopeAccess("competition", "id"),
  auditAction("REMOVE_COMPETITION_BUSINESS_PARTNER", "COMPETITION", (req) => req.params.id),
  removeCompetitionBusinessPartner
);

competitionsRouter.get(
  "/:id/results",
  requireOperationalRoles(),
  requireScopeAccess("competition", "id"),
  getCompetitionResults
);

competitionsRouter.post(
  "/:id/worksheet-assignments/publish",
  requireRole("SUPERADMIN"),
  requireScopeAccess("competition", "id"),
  auditAction("COMPETITION_RESULT_PUBLISH", "COMPETITION", (req) => req.params.id),
  publishCompetitionWorksheetResults
);

competitionsRouter.post(
  "/:id/results/publish",
  requireRole("SUPERADMIN"),
  requireScopeAccess("competition", "id"),
  auditAction("COMPETITION_RESULTS_PUBLISH", "COMPETITION", (req) => req.params.id),
  publishCompetitionResults
);

competitionsRouter.post(
  "/:id/awards/finalize",
  requireRole("SUPERADMIN"),
  requireScopeAccess("competition", "id"),
  auditAction("COMPETITION_AWARDS_FINALIZE", "COMPETITION", (req) => req.params.id),
  finalizeCompetitionAwards
);

competitionsRouter.get(
  "/:id/certificates",
  requireRole("SUPERADMIN"),
  requireScopeAccess("competition", "id"),
  listCompetitionCertificates
);

competitionsRouter.post(
  "/:id/certificates/generate",
  requireRole("SUPERADMIN"),
  requireScopeAccess("competition", "id"),
  auditAction("COMPETITION_CERTIFICATES_GENERATE", "COMPETITION", (req) => req.params.id),
  generateCompetitionCertificates
);

competitionsRouter.post(
  "/:id/certificates/publish",
  requireRole("SUPERADMIN"),
  requireScopeAccess("competition", "id"),
  auditAction("COMPETITION_CERTIFICATES_PUBLISH", "COMPETITION", (req) => req.params.id),
  publishCompetitionCertificates
);

competitionsRouter.post(
  "/:id/results/unpublish",
  requireRole("SUPERADMIN"),
  requireScopeAccess("competition", "id"),
  auditAction("COMPETITION_RESULTS_UNPUBLISH", "COMPETITION", (req) => req.params.id),
  unpublishCompetitionResults
);

competitionsRouter.get(
  "/:id/results.csv",
  requireOperationalRoles(),
  requireScopeAccess("competition", "id"),
  exportCompetitionResultsCsv
);

export { competitionsRouter };
