import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { assertCanModifyOperational } from "../services/ownership-guard.service.js";
import { parsePagination } from "../utils/pagination.js";

const listHierarchyNodes = asyncHandler(async (req, res) => {
  const { take, skip, orderBy } = parsePagination(req.query);
  const includeInactive = req.query.includeInactive === "1" || req.query.includeInactive === "true";

  const where = {
    tenantId: req.auth.tenantId,
    ...(includeInactive ? {} : { isActive: true })
  };

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId) {
    where.id = req.auth.hierarchyNodeId;
  }

  const data = await prisma.hierarchyNode.findMany({
    where,
    orderBy,
    skip,
    take,
    include: {
      parent: { select: { id: true, name: true, type: true } }
    }
  });

  return res.apiSuccess("Hierarchy nodes fetched", data);
});

const ALLOWED_NODE_TYPES = ["COUNTRY", "REGION", "DISTRICT", "SCHOOL", "BRANCH"];

const createHierarchyNode = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const name = String(req.body.name || "").trim();
  const code = String(req.body.code || "").trim();
  const type = String(req.body.type || "").trim().toUpperCase();
  const parentId = req.body.parentId ? String(req.body.parentId).trim() : null;

  if (!name) {
    return res.apiError(400, "name is required", "VALIDATION_ERROR");
  }

  if (!ALLOWED_NODE_TYPES.includes(type)) {
    return res.apiError(400, `type must be one of: ${ALLOWED_NODE_TYPES.join(", ")}`, "VALIDATION_ERROR");
  }

  if (parentId) {
    const parent = await prisma.hierarchyNode.findFirst({
      where: { id: parentId, tenantId: req.auth.tenantId },
      select: { id: true }
    });
    if (!parent) {
      return res.apiError(404, "Parent node not found in this tenant", "PARENT_NOT_FOUND");
    }
  }

  const created = await prisma.hierarchyNode.create({
    data: {
      tenantId: req.auth.tenantId,
      name,
      code,
      type,
      parentId
    }
  });

  res.locals.entityId = created.id;
  return res.apiSuccess("Hierarchy node created", created, 201);
});

export { listHierarchyNodes, createHierarchyNode };
