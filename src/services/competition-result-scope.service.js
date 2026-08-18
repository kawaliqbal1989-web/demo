import { prisma } from "../lib/prisma.js";
import { resolveBusinessPartnerScope } from "./bp-scope.service.js";

const NO_RESULT_ROW_ID = "__NO_COMPETITION_RESULT_ROW__";

function normalizeId(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function noCompetitionResultRows() {
  return { id: { in: [NO_RESULT_ROW_ID] } };
}

function canReadCompetitionResults({ auth, resultStatus, legacyResultStatus = false } = {}) {
  if (!auth?.role) return false;
  if (auth.role === "SUPERADMIN") return true;
  if (!["BP", "FRANCHISE", "CENTER", "TEACHER"].includes(auth.role)) return false;
  return legacyResultStatus || resultStatus === "PUBLISHED";
}

function activeHierarchyNodeIds(centerProfiles) {
  return [
    ...new Set(
      (centerProfiles || [])
        .filter((profile) => profile?.authUser?.isActive !== false)
        .map((profile) => normalizeId(profile?.authUser?.hierarchyNodeId))
        .filter(Boolean)
    )
  ];
}

async function resolveCompetitionResultEnrollmentWhere({
  auth,
  tx = prisma,
  resolveBpScope = resolveBusinessPartnerScope
} = {}) {
  if (!auth?.tenantId || !auth?.userId) {
    return noCompetitionResultRows();
  }

  if (auth.role === "SUPERADMIN") {
    return {};
  }

  if (auth.role === "TEACHER") {
    const teacher = await tx.teacherProfile.findFirst({
      where: {
        tenantId: auth.tenantId,
        authUserId: auth.userId,
        isActive: true,
        status: "ACTIVE"
      },
      select: { id: true }
    });

    return teacher?.id
      ? { sourceTeacherUserId: auth.userId }
      : noCompetitionResultRows();
  }

  if (auth.role === "CENTER") {
    const center = await tx.centerProfile.findFirst({
      where: {
        tenantId: auth.tenantId,
        authUserId: auth.userId,
        isActive: true,
        status: "ACTIVE"
      },
      select: {
        authUser: {
          select: {
            hierarchyNodeId: true,
            isActive: true
          }
        }
      }
    });

    const hierarchyNodeId = center?.authUser?.isActive === false
      ? null
      : normalizeId(center?.authUser?.hierarchyNodeId);

    return hierarchyNodeId
      ? { hierarchyNodeId }
      : noCompetitionResultRows();
  }

  let centerProfiles = [];

  if (auth.role === "FRANCHISE") {
    const franchise = await tx.franchiseProfile.findFirst({
      where: {
        tenantId: auth.tenantId,
        authUserId: auth.userId,
        isActive: true,
        status: "ACTIVE"
      },
      select: { id: true }
    });

    if (!franchise?.id) {
      return noCompetitionResultRows();
    }

    centerProfiles = await tx.centerProfile.findMany({
      where: {
        tenantId: auth.tenantId,
        franchiseProfileId: franchise.id,
        isActive: true,
        status: "ACTIVE"
      },
      select: {
        authUser: {
          select: {
            hierarchyNodeId: true,
            isActive: true
          }
        }
      }
    });
  } else if (auth.role === "BP") {
    const bpScope = await resolveBpScope({
      tenantId: auth.tenantId,
      userId: auth.userId,
      tx
    });
    const centerIds = Array.isArray(bpScope?.centerIds)
      ? [...new Set(bpScope.centerIds.map(normalizeId).filter(Boolean))]
      : [];

    if (!centerIds.length) {
      return noCompetitionResultRows();
    }

    centerProfiles = await tx.centerProfile.findMany({
      where: {
        tenantId: auth.tenantId,
        id: { in: centerIds },
        isActive: true,
        status: "ACTIVE"
      },
      select: {
        authUser: {
          select: {
            hierarchyNodeId: true,
            isActive: true
          }
        }
      }
    });
  } else {
    return noCompetitionResultRows();
  }

  const hierarchyNodeIds = activeHierarchyNodeIds(centerProfiles);
  return hierarchyNodeIds.length
    ? { hierarchyNodeId: { in: hierarchyNodeIds } }
    : noCompetitionResultRows();
}

export {
  NO_RESULT_ROW_ID,
  canReadCompetitionResults,
  noCompetitionResultRows,
  resolveCompetitionResultEnrollmentWhere
};
