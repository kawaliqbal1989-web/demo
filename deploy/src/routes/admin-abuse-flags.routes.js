import { Router } from "express";
import { listAbuseFlags, resolveAbuseFlag } from "../controllers/admin-abuse-flags.controller.js";
import { requireSuperadmin } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";

const adminAbuseFlagsRouter = Router();

adminAbuseFlagsRouter.use(requireSuperadmin());

adminAbuseFlagsRouter.get("/", listAbuseFlags);
adminAbuseFlagsRouter.patch(
	"/:id/resolve",
	auditAction("RESOLVE_ABUSE_FLAG", "ABUSE_FLAG", (req) => req.params.id),
	resolveAbuseFlag
);

export { adminAbuseFlagsRouter };
