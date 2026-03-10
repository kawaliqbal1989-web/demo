import { Router } from "express";
import {
	createLevel,
	generateLevelWorksheet,
	listLevels,
	updateLevelFeeDefaults
} from "../controllers/levels.controller.js";
import {
  getWorksheetTemplate,
  upsertWorksheetTemplate
} from "../controllers/worksheet-templates.controller.js";
import { requireOperationalRoles, requireRole } from "../middleware/rbac.js";
import { requireScopeAccess } from "../middleware/scope-access.js";
import { auditAction } from "../middleware/audit-logger.js";

const levelsRouter = Router();

levelsRouter.get("/", requireOperationalRoles(), listLevels);
levelsRouter.post(
	"/",
	requireRole("SUPERADMIN"),
	auditAction("CREATE_LEVEL", "LEVEL"),
	createLevel
);

levelsRouter.patch(
	"/:id/fee-defaults",
	requireRole("CENTER", "SUPERADMIN"),
	auditAction("UPDATE_LEVEL_FEE_DEFAULTS", "LEVEL", (req) => req.params.id),
	updateLevelFeeDefaults
);

levelsRouter.post(
  "/:id/generate-worksheet",
	requireOperationalRoles(),
  requireScopeAccess("level", "id"),
	auditAction("GENERATE_WORKSHEET", "LEVEL", (req) => req.params.id),
  generateLevelWorksheet
);

levelsRouter.get(
	"/:id/worksheet-template",
	requireRole("SUPERADMIN"),
	auditAction("VIEW_WORKSHEET_TEMPLATE", "WORKSHEET_TEMPLATE"),
	getWorksheetTemplate
);

levelsRouter.put(
	"/:id/worksheet-template",
	requireRole("SUPERADMIN"),
	auditAction("UPSERT_WORKSHEET_TEMPLATE", "WORKSHEET_TEMPLATE"),
	upsertWorksheetTemplate
);

export { levelsRouter };
