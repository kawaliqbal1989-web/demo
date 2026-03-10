/**
 * Practice Allocation Controller
 *
 * Handles BP/Franchise management of center seat allocations
 */

import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  getCenterAllocationsForBP,
  upsertCenterAllocation,
  getOwnPracticeUsage,
  resolveBusinessPartnerIdForUser
} from "../services/practice-entitlement.service.js";
import { resolveHierarchyNodeIdsFromRoot } from "../services/hierarchy-cascade.service.js";

/**
 * Resolve actor's BP context (businessPartnerId and hierarchyNodeIds for scope filtering)
 */
async function resolveActorBPContext({ tenantId, userId, role, hierarchyNodeId }) {
  const businessPartnerId = await resolveBusinessPartnerIdForUser({ tenantId, userId, role });

  if (!businessPartnerId) {
    const error = new Error("Business partner context not found");
    error.statusCode = 403;
    error.errorCode = "BP_CONTEXT_REQUIRED";
    throw error;
  }

  // For franchise, resolve descendant hierarchy node IDs for scope filtering
  let actorHierarchyNodeIds = null;
  if (role === "FRANCHISE" && hierarchyNodeId) {
    actorHierarchyNodeIds = await resolveHierarchyNodeIdsFromRoot({
      tenantId,
      rootId: hierarchyNodeId
    });
  }

  return { businessPartnerId, actorHierarchyNodeIds };
}

/**
 * GET /practice-allocations
 * List centers under BP with their current allocation state
 * For BP: shows all centers
 * For Franchise: shows only centers under their hierarchy
 */
const listCenterAllocations = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const userId = req.auth.userId;
  const role = req.auth.role;
  const hierarchyNodeId = req.auth.hierarchyNodeId;

  const { businessPartnerId, actorHierarchyNodeIds } = await resolveActorBPContext({
    tenantId,
    userId,
    role,
    hierarchyNodeId
  });

  const data = await getCenterAllocationsForBP({
    tenantId,
    businessPartnerId,
    actorHierarchyNodeIds
  });

  return res.apiSuccess("Center allocations loaded", data);
});

/**
 * PATCH /practice-allocations/:centerNodeId
 * Update allocation for a specific center
 * Body: { practice?: number, abacusPractice?: number }
 */
const updateCenterAllocation = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const userId = req.auth.userId;
  const role = req.auth.role;
  const hierarchyNodeId = req.auth.hierarchyNodeId;
  const centerNodeId = String(req.params.centerNodeId || "").trim();

  if (!centerNodeId) {
    return res.apiError(400, "Center node ID is required", "MISSING_CENTER_ID");
  }

  const { businessPartnerId, actorHierarchyNodeIds } = await resolveActorBPContext({
    tenantId,
    userId,
    role,
    hierarchyNodeId
  });

  // Verify center exists and is of appropriate type
  const centerNode = await prisma.hierarchyNode.findFirst({
    where: { id: centerNodeId, tenantId },
    select: { id: true, type: true, name: true }
  });

  if (!centerNode) {
    return res.apiError(404, "Center not found", "CENTER_NOT_FOUND");
  }

  if (!["SCHOOL", "BRANCH"].includes(centerNode.type)) {
    return res.apiError(400, "Node is not a center/school type", "INVALID_NODE_TYPE");
  }

  const { practice, abacusPractice } = req.body || {};
  const updates = [];

  // Process PRACTICE allocation
  if (practice !== undefined && practice !== null) {
    const allocatedSeats = parseInt(practice, 10);
    if (isNaN(allocatedSeats) || allocatedSeats < 0) {
      return res.apiError(400, "Practice seats must be a non-negative number", "INVALID_SEATS");
    }

    updates.push(
      upsertCenterAllocation({
        tenantId,
        businessPartnerId,
        featureKey: "PRACTICE",
        centerNodeId,
        allocatedSeats,
        actorUserId: userId,
        actorRole: role,
        actorHierarchyNodeIds
      })
    );
  }

  // Process ABACUS_PRACTICE allocation
  if (abacusPractice !== undefined && abacusPractice !== null) {
    const allocatedSeats = parseInt(abacusPractice, 10);
    if (isNaN(allocatedSeats) || allocatedSeats < 0) {
      return res.apiError(400, "Abacus Practice seats must be a non-negative number", "INVALID_SEATS");
    }

    updates.push(
      upsertCenterAllocation({
        tenantId,
        businessPartnerId,
        featureKey: "ABACUS_PRACTICE",
        centerNodeId,
        allocatedSeats,
        actorUserId: userId,
        actorRole: role,
        actorHierarchyNodeIds
      })
    );
  }

  if (updates.length === 0) {
    return res.apiError(400, "No allocation data provided", "NO_DATA");
  }

  await Promise.all(updates);

  // Return updated allocations
  const data = await getCenterAllocationsForBP({
    tenantId,
    businessPartnerId,
    actorHierarchyNodeIds
  });

  res.locals.entityId = centerNodeId;
  return res.apiSuccess("Center allocation updated", data);
});

/**
 * GET /practice-allocations/usage
 * View-only usage summary for BP/Franchise (own usage, filtered to scope)
 */
const getOwnUsage = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const userId = req.auth.userId;
  const role = req.auth.role;
  const hierarchyNodeId = req.auth.hierarchyNodeId;

  const { businessPartnerId, actorHierarchyNodeIds } = await resolveActorBPContext({
    tenantId,
    userId,
    role,
    hierarchyNodeId
  });

  const report = await getOwnPracticeUsage({
    tenantId,
    businessPartnerId,
    actorHierarchyNodeIds
  });

  return res.apiSuccess("Practice usage loaded", report);
});

/**
 * GET /practice-allocations/centers
 * List all centers under BP (for assignment UI dropdown)
 * Returns centers that don't have allocations yet too
 */
const listAvailableCenters = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const userId = req.auth.userId;
  const role = req.auth.role;
  const hierarchyNodeId = req.auth.hierarchyNodeId;

  const { businessPartnerId, actorHierarchyNodeIds } = await resolveActorBPContext({
    tenantId,
    userId,
    role,
    hierarchyNodeId
  });

  // Get BP's hierarchy node to find all centers under it
  const bp = await prisma.businessPartner.findUnique({
    where: { id: businessPartnerId },
    select: { hierarchyNodeId: true }
  });

  if (!bp?.hierarchyNodeId) {
    return res.apiSuccess("Centers loaded", { centers: [] });
  }

  // Get all hierarchy nodes of type SCHOOL or BRANCH under BP
  const allNodeIds = await resolveHierarchyNodeIdsFromRoot({
    tenantId,
    rootId: bp.hierarchyNodeId
  });

  // Filter to franchise scope if applicable
  let scopeNodeIds = allNodeIds;
  if (actorHierarchyNodeIds && actorHierarchyNodeIds.length > 0) {
    scopeNodeIds = allNodeIds.filter(id => actorHierarchyNodeIds.includes(id));
  }

  // Find centers (SCHOOL/BRANCH nodes)
  const centers = await prisma.hierarchyNode.findMany({
    where: {
      tenantId,
      id: { in: scopeNodeIds },
      type: { in: ["SCHOOL", "BRANCH"] },
      isActive: true
    },
    select: {
      id: true,
      name: true,
      code: true,
      type: true
    },
    orderBy: { name: "asc" }
  });

  return res.apiSuccess("Centers loaded", { centers });
});

export {
  listCenterAllocations,
  updateCenterAllocation,
  getOwnUsage,
  listAvailableCenters
};
