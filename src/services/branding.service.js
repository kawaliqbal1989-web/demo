import { prisma } from "../lib/prisma.js";
import { versionAssetUrl } from "../utils/request-url.js";

function sanitizeBrandingPartner(partner) {
  if (!partner) {
    return null;
  }

  return {
    ...partner,
    logoUrl: versionAssetUrl(partner.logoUrl, partner.updatedAt)
  };
}

function buildResolvedBranding({
  businessPartner,
  franchiseProfile = null,
  centerProfile = null
}) {
  const resolvedBusinessPartner = sanitizeBrandingPartner(businessPartner);
  const franchiseLogoUrl = versionAssetUrl(franchiseProfile?.logoUrl, franchiseProfile?.updatedAt) || null;
  const centerLogoUrl = versionAssetUrl(
    centerProfile?.customLogoUrl || centerProfile?.logoUrl,
    centerProfile?.updatedAt
  ) || null;

  const franchiseBrandName = franchiseProfile?.displayName || franchiseProfile?.name || null;
  const centerBrandName = centerProfile?.customBrandName || centerProfile?.displayName || centerProfile?.name || null;

  const franchiseOverridesBranding = franchiseProfile && franchiseProfile.inheritBranding === false;
  const centerOverridesBranding = centerProfile && (
    centerProfile.brandingMode === "CUSTOM_CENTER"
    || centerProfile.inheritBranding === false
  );

  const effectiveName = centerOverridesBranding
    ? centerBrandName || franchiseBrandName || resolvedBusinessPartner?.name || null
    : franchiseOverridesBranding
      ? franchiseBrandName || resolvedBusinessPartner?.name || null
      : resolvedBusinessPartner?.name || franchiseBrandName || centerBrandName || null;

  const effectiveLogoUrl = centerOverridesBranding
    ? centerLogoUrl || franchiseLogoUrl || resolvedBusinessPartner?.logoUrl || null
    : franchiseOverridesBranding
      ? franchiseLogoUrl || resolvedBusinessPartner?.logoUrl || null
      : resolvedBusinessPartner?.logoUrl || franchiseLogoUrl || centerLogoUrl || null;

  return {
    ...(resolvedBusinessPartner || {}),
    name: effectiveName,
    displayName: effectiveName,
    logoUrl: effectiveLogoUrl,
    brandingSource: centerOverridesBranding
      ? "CENTER"
      : franchiseOverridesBranding
        ? "FRANCHISE"
        : "BUSINESS_PARTNER",
    businessPartnerId: resolvedBusinessPartner?.id || null,
    franchiseProfileId: franchiseProfile?.id || null,
    centerProfileId: centerProfile?.id || null,
    brandingMode: centerProfile?.brandingMode || null,
    brandingActive: centerProfile?.brandingActive ?? true,
    brandingLocked: centerProfile?.brandingLocked ?? false,
    commercializationTier: centerProfile?.commercializationTier || null
  };
}

async function findCenterByNodeId({ tenantId, hierarchyNodeId }) {
  if (!tenantId || !hierarchyNodeId) {
    return null;
  }

  return prisma.centerProfile.findFirst({
    where: {
      tenantId,
      authUser: {
        hierarchyNodeId
      },
      isActive: true
    },
    select: {
      id: true
    }
  });
}

async function loadCenterBrandingContext({ tenantId, centerProfileId }) {
  if (!tenantId || !centerProfileId) {
    return null;
  }

  return prisma.centerProfile.findFirst({
    where: {
      tenantId,
      id: centerProfileId,
      isActive: true
    },
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      brandingMode: true,
      inheritBranding: true,
      customLogoUrl: true,
      customBrandName: true,
      brandingApprovedAt: true,
      brandingApprovedById: true,
      brandingNotes: true,
      brandingActive: true,
      brandingLocked: true,
      commercializationTier: true,
      logoUrl: true,
      updatedAt: true,
      franchiseProfile: {
        select: {
          id: true,
          code: true,
          name: true,
          displayName: true,
          inheritBranding: true,
          logoUrl: true,
          updatedAt: true,
          businessPartner: {
            select: {
              id: true,
              code: true,
              name: true,
              logoUrl: true,
              updatedAt: true,
              primaryBrandColor: true,
              secondaryBrandColor: true
            }
          }
        }
      }
    }
  });
}

function serializeCertificateTemplateSnapshot({ template, businessPartner }) {
  const templateVersion = template?.updatedAt || null;
  const bpLogoUrl = versionAssetUrl(businessPartner?.logoUrl, businessPartner?.updatedAt) || null;

  return {
    title: template?.title || "Certificate of Achievement",
    signatoryName: template?.signatoryName ?? null,
    signatoryDesignation: template?.signatoryDesignation ?? null,
    signatureImageUrl: versionAssetUrl(template?.signatureImageUrl, templateVersion) || null,
    affiliationLogoUrl: versionAssetUrl(template?.affiliationLogoUrl, templateVersion) || null,
    stampImageUrl: versionAssetUrl(template?.stampImageUrl, templateVersion) || null,
    backgroundImageUrl: versionAssetUrl(template?.backgroundImageUrl, templateVersion) || null,
    bpLogoUrl,
    layout: template?.layout || null,
    updatedAt: template?.updatedAt || null
  };
}

async function buildCertificateBrandingSnapshotForCenter(centerId, tenantId) {
  const center = await loadCenterBrandingContext({ tenantId, centerProfileId: centerId });
  if (!center) {
    return null;
  }

  const [resolvedBranding, certificateTemplate] = await Promise.all([
    resolveBrandingForCenter(center.id, tenantId),
    center.franchiseProfile?.businessPartner?.id
      ? prisma.certificateTemplate.findUnique({
          where: {
            businessPartnerId: center.franchiseProfile.businessPartner.id
          },
          select: {
            id: true,
            title: true,
            signatoryName: true,
            signatoryDesignation: true,
            signatureImageUrl: true,
            affiliationLogoUrl: true,
            stampImageUrl: true,
            backgroundImageUrl: true,
            layout: true,
            updatedAt: true
          }
        })
      : null
  ]);

  if (!resolvedBranding) {
    return null;
  }

  return {
    version: 1,
    brandingSource: resolvedBranding.brandingSource,
    organizationName: resolvedBranding.displayName || resolvedBranding.name || null,
    organizationLogoUrl: resolvedBranding.logoUrl || null,
    businessPartnerId: resolvedBranding.businessPartnerId || null,
    franchiseProfileId: resolvedBranding.franchiseProfileId || null,
    centerProfileId: center.id,
    centerCode: center.code,
    centerName: center.name,
    centerDisplayName: center.customBrandName || center.displayName || center.name || null,
    brandingMode: center.brandingMode || null,
    brandingActive: center.brandingActive ?? true,
    brandingLocked: center.brandingLocked ?? false,
    brandingApprovedAt: center.brandingApprovedAt || null,
    brandingApprovedById: center.brandingApprovedById || null,
    brandingNotes: center.brandingNotes || null,
    commercializationTier: center.commercializationTier || null,
    certificateTemplate: serializeCertificateTemplateSnapshot({
      template: certificateTemplate,
      businessPartner: center.franchiseProfile?.businessPartner || null
    })
  };
}

async function buildCertificateBrandingSnapshotForStudent(studentId, tenantId) {
  if (!studentId || !tenantId) {
    return null;
  }

  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId
    },
    select: {
      hierarchyNodeId: true
    }
  });

  const center = await findCenterByNodeId({
    tenantId,
    hierarchyNodeId: student?.hierarchyNodeId || null
  });

  if (!center?.id) {
    return null;
  }

  return buildCertificateBrandingSnapshotForCenter(center.id, tenantId);
}

async function resolveBrandingForCenter(centerId, tenantId) {
  const center = await loadCenterBrandingContext({ tenantId, centerProfileId: centerId });
  if (!center) {
    return null;
  }

  return buildResolvedBranding({
    businessPartner: center.franchiseProfile?.businessPartner || null,
    franchiseProfile: center.franchiseProfile || null,
    centerProfile: center
  });
}

async function resolveFranchiseBrandingForAuth({ auth }) {
  const franchise = await prisma.franchiseProfile.findFirst({
    where: {
      tenantId: auth.tenantId,
      authUserId: auth.userId,
      isActive: true
    },
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      inheritBranding: true,
      logoUrl: true,
      updatedAt: true,
      businessPartner: {
        select: {
          id: true,
          code: true,
          name: true,
          logoUrl: true,
          updatedAt: true,
          primaryBrandColor: true,
          secondaryBrandColor: true
        }
      }
    }
  });

  if (!franchise) {
    return null;
  }

  return buildResolvedBranding({
    businessPartner: franchise.businessPartner || null,
    franchiseProfile: franchise
  });
}

async function resolveCenterBrandingForAuth({ auth }) {
  if (!auth?.tenantId || !auth?.userId) {
    return null;
  }

  if (auth.role === "CENTER") {
    const center = await prisma.centerProfile.findFirst({
      where: {
        tenantId: auth.tenantId,
        authUserId: auth.userId,
        isActive: true
      },
      select: { id: true }
    });

    return resolveBrandingForCenter(center?.id || null, auth.tenantId);
  }

  if (auth.role === "STUDENT" && auth.studentId) {
    const student = await prisma.student.findFirst({
      where: {
        tenantId: auth.tenantId,
        id: auth.studentId
      },
      select: {
        hierarchyNodeId: true
      }
    });

    const center = await findCenterByNodeId({
      tenantId: auth.tenantId,
      hierarchyNodeId: student?.hierarchyNodeId || null
    });

    return resolveBrandingForCenter(center?.id || null, auth.tenantId);
  }

  if (auth.role === "TEACHER") {
    const teacher = await prisma.teacherProfile.findFirst({
      where: {
        tenantId: auth.tenantId,
        authUserId: auth.userId,
        isActive: true
      },
      select: {
        hierarchyNodeId: true
      }
    });

    const center = await findCenterByNodeId({
      tenantId: auth.tenantId,
      hierarchyNodeId: teacher?.hierarchyNodeId || auth.hierarchyNodeId || null
    });

    return resolveBrandingForCenter(center?.id || null, auth.tenantId);
  }

  return null;
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
        updatedAt: true,
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

  if (auth.role === "FRANCHISE") {
    const franchiseBranding = await resolveFranchiseBrandingForAuth({ auth });
    if (franchiseBranding) {
      return franchiseBranding;
    }
  }

  if (auth.role === "CENTER" || auth.role === "STUDENT" || auth.role === "TEACHER") {
    const centerBranding = await resolveCenterBrandingForAuth({ auth });
    if (centerBranding) {
      return centerBranding;
    }
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
        updatedAt: true,
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
          updatedAt: true,
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
          updatedAt: true,
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

export {
  resolveBrandingForCenter,
  resolveBusinessPartnerBrandingForAuth,
  buildCertificateBrandingSnapshotForCenter,
  buildCertificateBrandingSnapshotForStudent
};
