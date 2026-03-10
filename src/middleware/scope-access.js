import { prisma } from "../lib/prisma.js";
import { sendError } from "../utils/api-response.js";

async function hierarchyContainsNode(targetNodeId, actorNodeId, tenantId) {
  if (!targetNodeId || !actorNodeId) {
    return false;
  }

  if (targetNodeId === actorNodeId) {
    return true;
  }

  let cursorId = targetNodeId;

  while (cursorId) {
    const node = await prisma.hierarchyNode.findFirst({
      where: {
        id: cursorId,
        tenantId
      },
      select: {
        id: true,
        parentId: true
      }
    });

    if (!node) {
      return false;
    }

    if (node.parentId === actorNodeId) {
      return true;
    }

    cursorId = node.parentId;
  }

  return false;
}

async function loadScopedEntity(entityType, entityId) {
  switch (entityType) {
    case "student":
      return prisma.student.findUnique({
        where: { id: entityId },
        select: { id: true, tenantId: true, hierarchyNodeId: true }
      });
    case "batch":
      return prisma.batch.findUnique({
        where: { id: entityId },
        select: { id: true, tenantId: true, hierarchyNodeId: true }
      });
    case "enrollment":
      return prisma.enrollment.findUnique({
        where: { id: entityId },
        select: { id: true, tenantId: true, hierarchyNodeId: true }
      });
    case "attendanceSession":
      return prisma.attendanceSession.findUnique({
        where: { id: entityId },
        select: { id: true, tenantId: true, hierarchyNodeId: true }
      });
    case "competition":
      return prisma.competition.findUnique({
        where: { id: entityId },
        select: { id: true, tenantId: true, hierarchyNodeId: true }
      });
    case "hierarchy":
      return prisma.hierarchyNode.findUnique({
        where: { id: entityId },
        select: { id: true, tenantId: true }
      });
    case "worksheet":
      return prisma.worksheet.findUnique({
        where: { id: entityId },
        select: { id: true, tenantId: true }
      });
    case "level":
      return prisma.level.findUnique({
        where: { id: entityId },
        select: { id: true, tenantId: true }
      });
    default:
      return null;
  }
}

function requireScopeAccess(entityType, entityIdParam = "id") {
  return async function scopeGuard(req, res, next) {
    const entityId = req.params[entityIdParam];

    if (!entityId) {
      return sendError(res, 400, "Entity identifier is required for scope validation", "SCOPE_ID_REQUIRED");
    }

    const entity = await loadScopedEntity(entityType, entityId);

    if (!entity) {
      return sendError(res, 404, "Entity not found", "ENTITY_NOT_FOUND");
    }

    if (req.auth.role === "SUPERADMIN") {
      req.scopeEntity = entity;
      return next();
    }

    if (entity.tenantId !== req.auth.tenantId) {
      return sendError(res, 403, "Cross-tenant access denied", "TENANT_SCOPE_DENIED");
    }

    const targetHierarchyNodeId = entityType === "hierarchy" ? entity.id : entity.hierarchyNodeId;

    if (targetHierarchyNodeId && req.auth.hierarchyNodeId) {
      const allowed = await hierarchyContainsNode(
        targetHierarchyNodeId,
        req.auth.hierarchyNodeId,
        req.auth.tenantId
      );

      if (!allowed) {
        return sendError(res, 403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
      }
    }

    req.scopeEntity = entity;
    return next();
  };
}

export { requireScopeAccess };
