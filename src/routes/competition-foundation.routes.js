import { Router } from "express";
import { createFoundationSeason, createFoundationTemplate, listFoundationSeasons, listFoundationTemplates } from "../controllers/competition-foundation.controller.js";
import { requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";

const competitionFoundationRouter = Router();

competitionFoundationRouter.get("/templates", requireRole("SUPERADMIN"), listFoundationTemplates);
competitionFoundationRouter.post(
  "/templates",
  requireRole("SUPERADMIN"),
  auditAction("CREATE_COMPETITION_TEMPLATE", "COMPETITION_TEMPLATE"),
  createFoundationTemplate
);
competitionFoundationRouter.get("/seasons", requireRole("SUPERADMIN"), listFoundationSeasons);
competitionFoundationRouter.post(
  "/seasons",
  requireRole("SUPERADMIN"),
  auditAction("CREATE_COMPETITION_SEASON", "COMPETITION_SEASON"),
  createFoundationSeason
);

export { competitionFoundationRouter };
