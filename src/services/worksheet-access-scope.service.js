import { prisma } from "../lib/prisma.js";

const LIMITED_ROLES = new Set(["TEACHER", "CENTER", "FRANCHISE"]);



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

  if (!LIMITED_ROLES.has(role) || !tenantId || !userId) {
    return null;
  }

  // The current Prisma/database contract does not contain the legacy
  // maxLicensedLevelRank/licenseStartDate/licenseExpiryDate fields.
  // Keep hierarchy/profile validation fail-closed, but do not invent a
  // replacement curriculum cap that is not persisted anywhere.
  if (role === "CENTER") {
    const center = await prisma.centerProfile.findFirst({
      where: {
        tenantId,
        authUserId: userId,
        isActive: true,
        status: "ACTIVE"
      },
      select: { id: true }
    });

    return center ? null : 0;
  }

  if (role === "TEACHER") {
    const teacher = await prisma.teacherProfile.findFirst({
      where: {
        tenantId,
        authUserId: userId,
        isActive: true,
        status: "ACTIVE"
      },
      select: { hierarchyNodeId: true }
    });

    const centerHierarchyNodeId =
      teacher?.hierarchyNodeId || auth?.hierarchyNodeId || null;

    if (!centerHierarchyNodeId) {
      return 0;
    }

    const center = await prisma.centerProfile.findFirst({
      where: {
        tenantId,
        isActive: true,
        status: "ACTIVE",
        authUser: {
          hierarchyNodeId: centerHierarchyNodeId
        }
      },
      select: { id: true }
    });

    return center ? null : 0;
  }

  if (role === "FRANCHISE") {
    const franchise = await prisma.franchiseProfile.findFirst({
      where: {
        tenantId,
        authUserId: userId,
        isActive: true,
        status: "ACTIVE"
      },
      select: { id: true }
    });

    return franchise ? null : 0;
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