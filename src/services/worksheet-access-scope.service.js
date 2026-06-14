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

  if (role === "SUPERADMIN") {
    return null;
  }

  if (!LIMITED_ROLES.has(role)) {
    return null;
  }

  const hierarchyNodeIds = await resolveScopedHierarchyNodeIds({ tenantId, auth });
  if (!hierarchyNodeIds.length) {
    return 0;
  }

  const enrollmentWhere = {
    tenantId,
    status: "ACTIVE",
    hierarchyNodeId: { in: hierarchyNodeIds }
  };

  if (role === "TEACHER") {
    enrollmentWhere.assignedTeacherUserId = auth.userId;
  }

  const enrollmentLevels = await prisma.enrollment.findMany({
    where: enrollmentWhere,
    select: {
      levelId: true,
      student: {
        select: {
          levelId: true
        }
      }
    }
  });

  const levelIds = Array.from(
    new Set(
      enrollmentLevels
        .map((row) => row.levelId || row.student?.levelId || null)
        .filter(Boolean)
    )
  );

  if (!levelIds.length) {
    return 0;
  }

  const highest = await prisma.level.findFirst({
    where: {
      tenantId,
      id: { in: levelIds }
    },
    orderBy: { rank: "desc" },
    select: { rank: true }
  });

  return Number(highest?.rank || 0);
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