import { asyncHandler } from "../utils/async-handler.js";
import { prisma } from "../lib/prisma.js";
import { resolveHierarchyNodeIdsFromRoot } from "../services/hierarchy-cascade.service.js";

const requireFranchiseScope = asyncHandler(async (req, res, next) => {
  if (!req.auth || req.auth.role !== "FRANCHISE") {
    return res.apiError(403, "Franchise role required", "FRANCHISE_ROLE_REQUIRED");
  }

  const profile = await prisma.franchiseProfile.findFirst({
    where: {
      tenantId: req.auth.tenantId,
      authUserId: req.auth.userId,
      isActive: true
    },
    select: {
      id: true,
      tenantId: true,
      businessPartnerId: true,
      code: true,
      name: true,
      displayName: true,
      status: true,
      isActive: true,
      phonePrimary: true,
      emailOfficial: true,
      logoUrl: true,
      authUserId: true,
      authUser: {
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isActive: true
        }
      }
    }
  });

  if (!profile) {
    return res.apiError(403, "Franchise scope not resolved", "FRANCHISE_SCOPE_REQUIRED");
  }

  if (!req.auth.hierarchyNodeId) {
    return res.apiError(409, "Franchise hierarchy root not configured", "FRANCHISE_HIERARCHY_REQUIRED");
  }

  const hierarchyNodeIds = await resolveHierarchyNodeIdsFromRoot({
    tenantId: req.auth.tenantId,
    rootId: req.auth.hierarchyNodeId
  });

  req.franchiseScope = {
    franchise: profile,
    hierarchyNodeIds
  };

  res.locals.auditMetadata = {
    ...(res.locals.auditMetadata || {}),
    franchiseProfileId: profile.id,
    businessPartnerId: profile.businessPartnerId,
    scopeNodeIdsCount: hierarchyNodeIds.length
  };

  return next();
});

export { requireFranchiseScope };
