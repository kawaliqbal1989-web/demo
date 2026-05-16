import { prisma } from "../lib/prisma.js";
import { resolveBusinessPartnerScope } from "./bp-scope.service.js";
import { resolveHierarchyNodeIdsFromRoot } from "./hierarchy-cascade.service.js";

async function resolveActorExamScope({ tenantId, actor }) {
  const role = actor?.role;
  const userId = actor?.userId;
  const hierarchyNodeId = actor?.hierarchyNodeId || null;

  if (!tenantId || !role || !userId) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    error.errorCode = "AUTH_REQUIRED";
    throw error;
  }

  if (role === "SUPERADMIN") {
    return {
      role,
      businessPartnerId: null,
      hierarchyNodeIds: []
    };
  }

  if (role === "BP") {
    const scope = await resolveBusinessPartnerScope({ tenantId, userId });
    if (!scope?.businessPartner) {
      const error = new Error("Business partner scope not resolved");
      error.statusCode = 403;
      error.errorCode = "BP_SCOPE_REQUIRED";
      throw error;
    }

    return {
      role,
      businessPartnerId: scope.businessPartner.id,
      hierarchyNodeIds: scope.hierarchyNodeIds
    };
  }

  if (role === "FRANCHISE") {
    const profile = await prisma.franchiseProfile.findFirst({
      where: { tenantId, authUserId: userId, isActive: true },
      select: { id: true, businessPartnerId: true }
    });

    if (!profile) {
      const error = new Error("Franchise scope not resolved");
      error.statusCode = 403;
      error.errorCode = "FRANCHISE_SCOPE_REQUIRED";
      throw error;
    }

    if (!hierarchyNodeId) {
      const error = new Error("Franchise hierarchy root not configured");
      error.statusCode = 409;
      error.errorCode = "FRANCHISE_HIERARCHY_REQUIRED";
      throw error;
    }

    const hierarchyNodeIds = await resolveHierarchyNodeIdsFromRoot({ tenantId, rootId: hierarchyNodeId });

    return {
      role,
      businessPartnerId: profile.businessPartnerId,
      hierarchyNodeIds
    };
  }

  if (role === "CENTER" || role === "TEACHER") {
    if (!hierarchyNodeId) {
      const error = new Error("Center scope missing");
      error.statusCode = 400;
      error.errorCode = "CENTER_SCOPE_REQUIRED";
      throw error;
    }

    const center = await prisma.centerProfile.findFirst({
      where: {
        tenantId,
        authUser: {
          hierarchyNodeId
        }
      },
      select: {
        id: true,
        franchiseProfile: {
          select: {
            businessPartnerId: true
          }
        }
      }
    });

    const businessPartnerId = center?.franchiseProfile?.businessPartnerId || null;
    if (!businessPartnerId) {
      const error = new Error("Business partner for center not resolved");
      error.statusCode = 409;
      error.errorCode = "BP_SCOPE_REQUIRED";
      throw error;
    }

    return {
      role,
      businessPartnerId,
      hierarchyNodeIds: [hierarchyNodeId]
    };
  }

  const error = new Error("Role not supported");
  error.statusCode = 403;
  error.errorCode = "ROLE_FORBIDDEN";
  throw error;
}

export { resolveActorExamScope };
