import { prisma } from "../lib/prisma.js";
import { normalizeStoredUploadUrl } from "../utils/request-url.js";

function sanitizeBrandingPartner(partner) {
  if (!partner) {
    return null;
  }

  return {
    ...partner,
    logoUrl: normalizeStoredUploadUrl(partner.logoUrl)
  };
}

async function resolvePartnerByHierarchyNode({ tenantId, hierarchyNodeId }) {
  let currentId = hierarchyNodeId || null;
  let safety = 0;

  while (currentId && safety < 50) {
    // eslint-disable-next-line no-await-in-loop
    const partner = await prisma.businessPartner.findFirst({
      where: {
        tenantId,
        hierarchyNodeId: currentId
      },
      select: {
        id: true,
        code: true,
        name: true,
        logoUrl: true,
        primaryBrandColor: true,
        secondaryBrandColor: true
      }
    });

    if (partner) {
      return sanitizeBrandingPartner(partner);
    }

    // eslint-disable-next-line no-await-in-loop
    const node = await prisma.hierarchyNode.findFirst({
      where: {
        tenantId,
        id: currentId
      },
      select: {
        parentId: true
      }
    });

    currentId = node?.parentId || null;
    safety += 1;
  }

  return null;
}

async function resolveBusinessPartnerBrandingForAuth({ auth }) {
  if (!auth?.tenantId || !auth?.userId) {
    return null;
  }

  // BP: Most reliable mapping is BP username == BusinessPartner code.
  if (auth.role === "BP" && auth.username) {
    const byCode = await prisma.businessPartner.findUnique({
      where: {
        tenantId_code: {
          tenantId: auth.tenantId,
          code: String(auth.username).trim()
        }
      },
      select: {
        id: true,
        code: true,
        name: true,
        logoUrl: true,
        primaryBrandColor: true,
        secondaryBrandColor: true
      }
    });

    if (byCode) {
      return sanitizeBrandingPartner(byCode);
    }
  }

  // FRANCHISE: resolve via franchise profile -> businessPartnerId.
  if (auth.role === "FRANCHISE") {
    const franchise = await prisma.franchiseProfile.findFirst({
      where: {
        tenantId: auth.tenantId,
        authUserId: auth.userId,
        isActive: true
      },
      select: {
        businessPartnerId: true
      }
    });

    if (franchise?.businessPartnerId) {
      const partner = await prisma.businessPartner.findFirst({
        where: {
          tenantId: auth.tenantId,
          id: franchise.businessPartnerId
        },
        select: {
          id: true,
          code: true,
          name: true,
          logoUrl: true,
          primaryBrandColor: true,
          secondaryBrandColor: true
        }
      });

      if (partner) {
        return sanitizeBrandingPartner(partner);
      }
    }
  }

  // CENTER: resolve via center profile -> franchise profile -> businessPartnerId.
  if (auth.role === "CENTER") {
    const center = await prisma.centerProfile.findFirst({
      where: {
        tenantId: auth.tenantId,
        authUserId: auth.userId,
        isActive: true
      },
      select: {
        franchiseProfile: {
          select: {
            businessPartnerId: true
          }
        }
      }
    });

    const businessPartnerId = center?.franchiseProfile?.businessPartnerId || null;
    if (businessPartnerId) {
      const partner = await prisma.businessPartner.findFirst({
        where: {
          tenantId: auth.tenantId,
          id: businessPartnerId
        },
        select: {
          id: true,
          code: true,
          name: true,
          logoUrl: true,
          primaryBrandColor: true,
          secondaryBrandColor: true
        }
      });

      if (partner) {
        return sanitizeBrandingPartner(partner);
      }
    }
  }

  // Other roles: resolve by the user's hierarchy node (walk parents until a partner root matches).
  let hierarchyNodeId = auth.hierarchyNodeId || null;
  if (!hierarchyNodeId && auth.role === "STUDENT" && auth.studentId) {
    const student = await prisma.student.findFirst({
      where: {
        tenantId: auth.tenantId,
        id: auth.studentId
      },
      select: { hierarchyNodeId: true }
    });
    hierarchyNodeId = student?.hierarchyNodeId || null;
  }

  if (!hierarchyNodeId) {
    return null;
  }

  return resolvePartnerByHierarchyNode({ tenantId: auth.tenantId, hierarchyNodeId });
}

export { resolveBusinessPartnerBrandingForAuth };
