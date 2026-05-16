import { asyncHandler } from "../utils/async-handler.js";
import { prisma } from "../lib/prisma.js";
import {
  resolveBusinessPartnerForUser,
  resolveBusinessPartnerScope
} from "../services/bp-scope.service.js";
import { toBpScopeIdsOrImpossible } from "../utils/bp-scope-filters.js";

async function ensureBusinessPartnerHierarchyRoot({ tenantId, authUserId, businessPartner }) {
  if (businessPartner?.hierarchyNodeId) {
    return businessPartner.hierarchyNodeId;
  }

  const refreshed = await prisma.businessPartner.findFirst({
    where: {
      tenantId,
      id: businessPartner.id
    },
    select: {
      id: true,
      name: true,
      code: true,
      hierarchyNodeId: true
    }
  });

  if (!refreshed) {
    return null;
  }

  if (refreshed.hierarchyNodeId) {
    return refreshed.hierarchyNodeId;
  }

  // Create a root node for this BP so BP-scoped operations can attach child nodes.
  // Use BP code as node code when possible, but gracefully handle uniqueness collisions.
  const createNode = async ({ code }) => {
    return prisma.hierarchyNode.create({
      data: {
        tenantId,
        name: refreshed.name,
        code,
        type: "REGION",
        parentId: null
      },
      select: { id: true }
    });
  };

  let node;
  try {
    node = await createNode({ code: refreshed.code });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "P2002") {
      node = await createNode({ code: null });
    } else {
      throw error;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.businessPartner.update({
      where: { id: refreshed.id },
      data: { hierarchyNodeId: node.id }
    });

    await tx.authUser.update({
      where: { id: authUserId },
      data: { hierarchyNodeId: node.id }
    });
  });

  return node.id;
}

const requireBusinessPartnerScope = asyncHandler(async (req, res, next) => {
  if (!req.auth || req.auth.role !== "BP") {
    return res.apiError(403, "Business partner role required", "BP_ROLE_REQUIRED");
  }

  const partner = await resolveBusinessPartnerForUser({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId
  });

  if (!partner) {
    return res.apiError(403, "Business partner scope not resolved", "BP_SCOPE_REQUIRED");
  }

  const ensuredHierarchyNodeId = await ensureBusinessPartnerHierarchyRoot({
    tenantId: req.auth.tenantId,
    authUserId: req.auth.userId,
    businessPartner: partner
  });

  const effectivePartner = ensuredHierarchyNodeId
    ? { ...partner, hierarchyNodeId: ensuredHierarchyNodeId }
    : partner;

  const resolvedScope = await resolveBusinessPartnerScope({
    tenantId: req.auth.tenantId,
    businessPartnerId: partner.id,
    forceRefresh: effectivePartner.hierarchyNodeId !== partner.hierarchyNodeId
  });
  const hierarchyNodeIds = toBpScopeIdsOrImpossible(resolvedScope?.hierarchyNodeIds);
  const franchiseIds = toBpScopeIdsOrImpossible(resolvedScope?.franchiseIds);
  const centerIds = toBpScopeIdsOrImpossible(resolvedScope?.centerIds);

  req.bpScope = {
    businessPartner: resolvedScope?.businessPartner || effectivePartner,
    hierarchyNodeIds,
    franchiseIds,
    centerIds
  };

  res.locals.auditMetadata = {
    ...(res.locals.auditMetadata || {}),
    businessPartnerId: partner.id,
    scopeNodeIdsCount: resolvedScope?.hierarchyNodeIds?.length || 0,
    scopeFranchiseIdsCount: resolvedScope?.franchiseIds?.length || 0,
    scopeCenterIdsCount: resolvedScope?.centerIds?.length || 0,
    bpScopeUsedLegacyFallback: Boolean(resolvedScope?.meta?.usedLegacyFallback),
    bpScopeUsedExplicitScopes: Boolean(resolvedScope?.meta?.usedExplicitScopes),
    bpScopeCacheHit: Boolean(resolvedScope?.meta?.cacheHit)
  };

  return next();
});

export { requireBusinessPartnerScope };
