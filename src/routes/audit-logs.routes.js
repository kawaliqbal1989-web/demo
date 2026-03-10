import { Router } from "express";
import { listAuditLogs } from "../controllers/audit-logs.controller.js";
import { requireSuperadmin } from "../middleware/rbac.js";

const auditLogsRouter = Router();

auditLogsRouter.get("/", requireSuperadmin(), listAuditLogs);

export { auditLogsRouter };
