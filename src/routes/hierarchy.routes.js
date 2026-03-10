import { Router } from "express";
import {
  createHierarchyNode,
  listHierarchyNodes
} from "../controllers/hierarchy.controller.js";
import { requireOperationalRoles, requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";

const hierarchyRouter = Router();

hierarchyRouter.get("/", requireOperationalRoles(), listHierarchyNodes);
hierarchyRouter.post(
  "/",
  requireRole("BP", "FRANCHISE", "CENTER"),
  auditAction("CREATE_HIERARCHY_NODE", "HIERARCHY_NODE"),
  createHierarchyNode
);

export { hierarchyRouter };
