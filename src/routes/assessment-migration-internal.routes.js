import { Router } from "express";
import {
  handleRunAssessmentBackfill,
  handleRunAssessmentParity,
  handleGetAssessmentMigrationStatus
} from "../controllers/assessment-migration.controller.js";
import { requireAssessmentMigrationAccess } from "../middleware/assessment-migration-auth.js";
import { validateAssessmentMigrationRequest } from "../middleware/assessment-migration-validator.js";

const assessmentMigrationInternalRouter = Router();

assessmentMigrationInternalRouter.use(requireAssessmentMigrationAccess);
assessmentMigrationInternalRouter.post("/backfill", validateAssessmentMigrationRequest, handleRunAssessmentBackfill);
assessmentMigrationInternalRouter.get("/status", validateAssessmentMigrationRequest, handleGetAssessmentMigrationStatus);
assessmentMigrationInternalRouter.get("/parity", validateAssessmentMigrationRequest, handleRunAssessmentParity);
assessmentMigrationInternalRouter.post("/parity", validateAssessmentMigrationRequest, handleRunAssessmentParity);

export { assessmentMigrationInternalRouter };
