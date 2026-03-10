import { Router } from "express";
import {
  createCompetition,
  enrollStudent,
  exportCompetitionResultsCsv,
  forwardCompetitionRequest,
  getCompetitionDetail,
  getCompetitionResults,
  publishCompetitionResults,
  rejectCompetitionRequest,
  getLeaderboard,
  unpublishCompetitionResults,
  listCompetitions
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

competitionsRouter.post(
  "/:id/enrollments",
  requireRole("CENTER", "FRANCHISE", "BP", "SUPERADMIN"),
  requireScopeAccess("competition", "id"),
  auditAction("ENROLL_STUDENT_COMPETITION", "COMPETITION", (req) => req.params.id),
  enrollStudent
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
  "/:id/results",
  requireOperationalRoles(),
  requireScopeAccess("competition", "id"),
  getCompetitionResults
);

competitionsRouter.post(
  "/:id/results/publish",
  requireRole("SUPERADMIN"),
  requireScopeAccess("competition", "id"),
  auditAction("COMPETITION_RESULTS_PUBLISH", "COMPETITION", (req) => req.params.id),
  publishCompetitionResults
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
