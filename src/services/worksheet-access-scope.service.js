import { prisma } from "../lib/prisma.js";

const LIMITED_ROLES = new Set(["TEACHER", "CENTER", "FRANCHISE"]);

function normalizeLicensedRank(value) {
  const rank = Number(value);
  if (!Number.isFinite(rank)) return 1;
  return Math.min(8, Math.max(1, Math.floor(rank)));
}

function isLicenseCurrentlyActive({ startDate, expiryDate, now = new Date() }) {
  const start = startDate ? new Date(startDate) : null;
  const expiry = expiryDate ? new Date(expiryDate) : null;

  if (start && start > now) return false;
  if (expiry && expiry < now) return false;
  return true;
}

async function resolveScopedHierarchyNodeIds({ tenantId, auth }) {
  const role = String(auth?.role || "").toUpperCase();
  const userId = String(auth?.userId || "").trim();

  if (!tenantId || !userId) {
    return [];
  }

  if (role === "TEACHER") {
    const teacherProfile = await prisma.teacherProfile.findFirst({
      where: {
        tenantId,
        authUserId: userId,
        isActive: true
      },
      select: { hierarchyNodeId: true }
    });

    const nodeId = teacherProfile?.hierarchyNodeId || auth?.hierarchyNodeId || null;
    return nodeId ? [nodeId] : [];
  }

  if (role === "CENTER") {
    const center = await prisma.centerProfile.findFirst({
      where: {
        tenantId,
        authUserId: userId,
        isActive: true,
        status: "ACTIVE"
      },
      select: {
        authUser: { select: { hierarchyNodeId: true } }
      }
    });

    const nodeId = center?.authUser?.hierarchyNodeId || auth?.hierarchyNodeId || null;
    return nodeId ? [nodeId] : [];
  }

  if (role === "FRANCHISE") {
    const centers = await prisma.centerProfile.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        isActive: true,
        franchiseProfile: {
          tenantId,
          authUserId: userId,
          status: "ACTIVE",
          isActive: true
        }
      },
      select: {
        authUser: { select: { hierarchyNodeId: true } }
      }
    });

    return Array.from(
      new Set(
        centers
          .map((row) => row?.authUser?.hierarchyNodeId || null)
          .filter(Boolean)
      )
    );
  }

  return [];
}

async function resolveActorLevelCap({ tenantId, auth }) {
  const role = String(auth?.role || "").toUpperCase();
  const userId = String(auth?.userId || "").trim();

  if (role === "SUPERADMIN") {
    return null;
  }

  if (!LIMITED_ROLES.has(role) || !userId) {
    return null;
  }

  if (role === "CENTER") {
    const center = await prisma.centerProfile.findFirst({
      where: {
        tenantId,
        authUserId: userId,
        isActive: true,
        status: "ACTIVE"
      },
      select: {
        maxLicensedLevelRank: true,
        licenseStartDate: true,
        licenseExpiryDate: true
      }
    });

    if (!center) return 0;
    if (!isLicenseCurrentlyActive({ startDate: center.licenseStartDate, expiryDate: center.licenseExpiryDate })) {
      return 0;
    }
    return normalizeLicensedRank(center.maxLicensedLevelRank);
  }

  if (role === "TEACHER") {
    const teacher = await prisma.teacherProfile.findFirst({
      where: {
        tenantId,
        authUserId: userId,
        isActive: true
      },
      select: { hierarchyNodeId: true }
    });

    const centerHierarchyNodeId = teacher?.hierarchyNodeId || auth?.hierarchyNodeId || null;
    if (!centerHierarchyNodeId) return 0;

    const center = await prisma.centerProfile.findFirst({
      where: {
        tenantId,
        isActive: true,
        status: "ACTIVE",
        authUser: {
          hierarchyNodeId: centerHierarchyNodeId
        }
      },
      select: {
        maxLicensedLevelRank: true,
        licenseStartDate: true,
        licenseExpiryDate: true
      }
    });

    if (!center) return 0;
    if (!isLicenseCurrentlyActive({ startDate: center.licenseStartDate, expiryDate: center.licenseExpiryDate })) {
      return 0;
    }
    return normalizeLicensedRank(center.maxLicensedLevelRank);
  }

  if (role === "FRANCHISE") {
    const franchise = await prisma.franchiseProfile.findFirst({
      where: {
        tenantId,
        authUserId: userId,
        isActive: true,
        status: "ACTIVE"
      },
      select: {
        id: true,
        maxLicensedLevelRank: true,
        licenseStartDate: true,
        licenseExpiryDate: true
      }
    });

    if (!franchise) return 0;

    const franchiseRank = isLicenseCurrentlyActive({
      startDate: franchise.licenseStartDate,
      expiryDate: franchise.licenseExpiryDate
    })
      ? normalizeLicensedRank(franchise.maxLicensedLevelRank)
      : 0;

    const centers = await prisma.centerProfile.findMany({
      where: {
        tenantId,
        franchiseProfileId: franchise.id,
        isActive: true,
        status: "ACTIVE"
      },
      select: {
        maxLicensedLevelRank: true,
        licenseStartDate: true,
        licenseExpiryDate: true
      }
    });

    const centerRank = centers.reduce((maxRank, center) => {
      if (!isLicenseCurrentlyActive({ startDate: center.licenseStartDate, expiryDate: center.licenseExpiryDate })) {
        return maxRank;
      }
      return Math.max(maxRank, normalizeLicensedRank(center.maxLicensedLevelRank));
    }, 0);

    const effective = Math.max(franchiseRank, centerRank);
    if (!effective) {
      return 0;
    }
    return effective;
  }

  return 0;
}

async function resolveAllowedLevelIdsByRank({ tenantId, maxRank }) {
  if (!Number.isFinite(maxRank) || maxRank <= 0) {
    return [];
  }

  const levels = await prisma.level.findMany({
    where: {
      tenantId,
      rank: { lte: maxRank }
    },
    select: { id: true }
  });

  return levels.map((row) => row.id);
}

export { resolveActorLevelCap, resolveAllowedLevelIdsByRank };