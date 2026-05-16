import { Prisma } from "../../lib/prisma-compat.js";
import { prisma } from "../../lib/prisma.js";
import { applyBpScopeToCenterQuery } from "../../utils/bp-scope-filters.js";
import {
  buildCenterCapacitySnapshot,
  summarizeCapacityCollection
} from "./capacity.analytics.js";
import {
  CAPACITY_AUDIT_ACTIONS,
  listCenterCapacityAuditHistory,
  recordCenterCapacityAudit
} from "./capacity.audit.js";
import {
  createHttpError,
  normalizeAuditLimit,
  normalizeCapacitySummarySort,
  normalizeCapacitySummaryState
} from "./capacity.validation.js";

const centerCapacityExecutionLocks = new Map();

function isCapacityStorageMissingError(error) {
  const code = String(error?.code || "");
  if (code !== "P2021" && code !== "P2022") {
    return false;
  }

  const modelName = String(error?.meta?.modelName || "").toLowerCase();
  const table = String(error?.meta?.table || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    modelName.includes("centercapacity") ||
    table.includes("centercapacity") ||
    table.includes("center_capacity") ||
    message.includes("centercapacity") ||
    message.includes("center_capacity")
  );
}

function isCapacityEnforcementError(error) {
  return ["TEACHER_CAPACITY_EXCEEDED", "STUDENT_CAPACITY_EXCEEDED"].includes(String(error?.errorCode || ""));
}

function buildCenterCapacityLockKey({ tenantId, hierarchyNodeId, centerId }) {
  return `${String(tenantId || "unknown-tenant")}:${String(centerId || hierarchyNodeId || "unknown-center")}`;
}

async function withCenterCapacityExecutionLock({ tenantId, hierarchyNodeId, centerId }, work) {
  const lockKey = buildCenterCapacityLockKey({ tenantId, hierarchyNodeId, centerId });
  const previous = centerCapacityExecutionLocks.get(lockKey) || Promise.resolve();
  let releaseCurrent;
  const current = new Promise((resolve) => {
    releaseCurrent = resolve;
  });

  centerCapacityExecutionLocks.set(lockKey, current);

  await previous.catch(() => {});

  try {
    return await work();
  } finally {
    releaseCurrent();
    if (centerCapacityExecutionLocks.get(lockKey) === current) {
      centerCapacityExecutionLocks.delete(lockKey);
    }
  }
}

async function resolveCenterById({ tx, tenantId, centerId }) {
  return tx.centerProfile.findFirst({
    where: {
      id: centerId,
      tenantId
    },
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      authUser: {
        select: {
          hierarchyNodeId: true
        }
      },
      franchiseProfile: {
        select: {
          id: true,
          name: true,
          displayName: true,
          businessPartnerId: true
        }
      }
    }
  });
}

async function resolveCenterByHierarchyNodeId({ tx, tenantId, hierarchyNodeId }) {
  return tx.centerProfile.findFirst({
    where: {
      tenantId,
      authUser: {
        is: {
          hierarchyNodeId
        }
      }
    },
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      authUser: {
        select: {
          hierarchyNodeId: true
        }
      },
      franchiseProfile: {
        select: {
          id: true,
          name: true,
          displayName: true,
          businessPartnerId: true
        }
      }
    }
  });
}

async function lockCenterCapacityScope({ tx, centerId }) {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM centerprofile WHERE id = ${centerId} LIMIT 1 FOR UPDATE`
  );
}

async function loadCenterCapacityUsage({ tx, tenantId, hierarchyNodeId }) {
  const [teacherCount, studentCount] = await Promise.all([
    tx.teacherProfile.count({
      where: {
        tenantId,
        hierarchyNodeId,
        isActive: true,
        status: "ACTIVE"
      }
    }),
    tx.student.count({
      where: {
        tenantId,
        hierarchyNodeId,
        isActive: true
      }
    })
  ]);

  return {
    teacherCount,
    studentCount
  };
}

async function buildCenterSnapshot({ tx, tenantId, center, auditLimit = 10 }) {
  const usage = await loadCenterCapacityUsage({
    tx,
    tenantId,
    hierarchyNodeId: center.authUser?.hierarchyNodeId || null
  });

  let capacity = null;
  let auditHistory = [];

  try {
    [capacity, auditHistory] = await Promise.all([
      tx.centerCapacity.findUnique({
        where: {
          centerId: center.id
        }
      }),
      listCenterCapacityAuditHistory({
        tenantId,
        centerId: center.id,
        limit: auditLimit,
        tx
      })
    ]);
  } catch (error) {
    if (!isCapacityStorageMissingError(error)) {
      throw error;
    }
  }

  return buildCenterCapacitySnapshot({
    center,
    capacity,
    teacherCount: usage.teacherCount,
    studentCount: usage.studentCount,
    auditHistory
  });
}

function buildCapacityError(resourceType, centerSnapshot, projectedUsed) {
  const usage = resourceType === "TEACHER"
    ? centerSnapshot.usage.teachers
    : centerSnapshot.usage.students;
  const label = resourceType === "TEACHER" ? "Teacher" : "Student";
  const error = createHttpError(
    409,
    `${label} capacity exceeded for ${centerSnapshot.center.name}`,
    `${resourceType}_CAPACITY_EXCEEDED`
  );

  error.capacityContext = {
    centerId: centerSnapshot.center.id,
    centerCode: centerSnapshot.center.code,
    centerName: centerSnapshot.center.name,
    resourceType,
    currentUsed: usage.used,
    projectedUsed,
    limit: usage.limit,
    allowOverAllocation: centerSnapshot.allowOverAllocation,
    overallState: centerSnapshot.summary.overallState
  };

  return error;
}

async function assertCenterCapacityAvailable({
  tx,
  tenantId,
  hierarchyNodeId,
  resourceType,
  increment = 1
}) {
  const center = await resolveCenterByHierarchyNodeId({ tx, tenantId, hierarchyNodeId });
  if (!center) {
    throw createHttpError(404, "Center not found", "CENTER_NOT_FOUND");
  }

  await lockCenterCapacityScope({ tx, centerId: center.id });

  const snapshot = await buildCenterSnapshot({
    tx,
    tenantId,
    center,
    auditLimit: 5
  });

  if (!snapshot.configured) {
    return {
      snapshot,
      projectedUsed: null,
      shouldAuditOverAllocation: false
    };
  }

  const usage = resourceType === "TEACHER"
    ? snapshot.usage.teachers
    : snapshot.usage.students;
  const projectedUsed = usage.used + Number(increment || 0);

  if (!snapshot.allowOverAllocation && projectedUsed > usage.limit) {
    throw buildCapacityError(resourceType, snapshot, projectedUsed);
  }

  return {
    snapshot,
    projectedUsed,
    shouldAuditOverAllocation: snapshot.allowOverAllocation && projectedUsed > usage.limit
  };
}

async function getCenterCapacity({ tenantId, hierarchyNodeId, auditLimit }) {
  const tx = prisma;
  const center = await resolveCenterByHierarchyNodeId({ tx, tenantId, hierarchyNodeId });
  if (!center) {
    throw createHttpError(404, "Center not found", "CENTER_NOT_FOUND");
  }

  return buildCenterSnapshot({
    tx,
    tenantId,
    center,
    auditLimit: normalizeAuditLimit(auditLimit)
  });
}

function assertBpCenterAccess({ tenantId, bpScope, centerId }) {
  if (!bpScope) {
    return;
  }

  if (bpScope.tenantId !== tenantId) {
    throw createHttpError(403, "BP scope denied", "BP_SCOPE_DENIED");
  }

  const scopedCenterIds = new Set(bpScope.centerIds || []);
  if (!scopedCenterIds.has(centerId)) {
    throw createHttpError(403, "BP scope denied", "BP_SCOPE_DENIED");
  }
}

async function upsertCenterCapacity({ tenantId, centerId, actor, input, bpScope }) {
  if (actor?.role === "BP") {
    assertBpCenterAccess({ tenantId, bpScope, centerId });
  }

  const { snapshot, previousCapacity } = await prisma.$transaction(async (tx) => {
    const center = await resolveCenterById({ tx, tenantId, centerId });
    if (!center) {
      throw createHttpError(404, "Center not found", "CENTER_NOT_FOUND");
    }

    await lockCenterCapacityScope({ tx, centerId: center.id });

    const current = await tx.centerCapacity.findUnique({
      where: {
        centerId: center.id
      }
    });

    const nextData = {
      maxTeachers: input.maxTeachers ?? current?.maxTeachers ?? 0,
      maxStudents: input.maxStudents ?? current?.maxStudents ?? 0,
      allowOverAllocation: input.allowOverAllocation ?? current?.allowOverAllocation ?? false
    };

    await tx.centerCapacity.upsert({
      where: {
        centerId: center.id
      },
      update: nextData,
      create: {
        centerId: center.id,
        ...nextData
      }
    });

    const nextSnapshot = await buildCenterSnapshot({
      tx,
      tenantId,
      center,
      auditLimit: 10
    });

    return {
      snapshot: nextSnapshot,
      previousCapacity: current
    };
  });

  await recordCenterCapacityAudit({
    tenantId,
    userId: actor?.userId,
    role: actor?.role,
    action: CAPACITY_AUDIT_ACTIONS.UPDATED,
    centerId,
    metadata: {
      previousCapacity: previousCapacity
        ? {
            maxTeachers: previousCapacity.maxTeachers,
            maxStudents: previousCapacity.maxStudents,
            allowOverAllocation: previousCapacity.allowOverAllocation
          }
        : null,
      nextCapacity: snapshot.capacity,
      overallState: snapshot.summary.overallState,
      recommendedAction: snapshot.summary.recommendedAction
    }
  });

  return snapshot;
}

function compareSummaryItems(a, b, sortBy, sortDirection) {
  const direction = sortDirection === "asc" ? 1 : -1;
  const leftValue = a?.[sortBy];
  const rightValue = b?.[sortBy];

  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue || "").localeCompare(String(rightValue || "")) * direction;
  }

  return ((Number(leftValue || 0) - Number(rightValue || 0)) || 0) * direction;
}

async function getCapacitySummary({ tenantId, bpScope, query = {}, pagination }) {
  const stateFilter = normalizeCapacitySummaryState(query.state);
  const { sortBy, sortDirection } = normalizeCapacitySummarySort(query.sortBy, query.sortDirection);

  const where = bpScope
    ? applyBpScopeToCenterQuery({
        tenantId,
        bpScope,
        where: {
          status: { not: "ARCHIVED" },
          ...(query.franchiseId ? { franchiseProfileId: String(query.franchiseId) } : {}),
          ...(query.centerId ? { id: String(query.centerId) } : {})
        }
      })
    : {
        tenantId,
        status: { not: "ARCHIVED" },
        ...(query.franchiseId ? { franchiseProfileId: String(query.franchiseId) } : {}),
        ...(query.centerId ? { id: String(query.centerId) } : {})
      };

  const centers = await prisma.centerProfile.findMany({
    where,
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      centerCapacity: true,
      authUser: {
        select: {
          hierarchyNodeId: true
        }
      },
      franchiseProfile: {
        select: {
          id: true,
          name: true,
          displayName: true,
          businessPartnerId: true
        }
      }
    }
  });

  const hierarchyNodeIds = centers
    .map((center) => center.authUser?.hierarchyNodeId)
    .filter((value) => typeof value === "string" && value.length > 0);

  const [teacherCounts, studentCounts, auditRows] = await Promise.all([
    prisma.teacherProfile.groupBy({
      by: ["hierarchyNodeId"],
      where: {
        tenantId,
        hierarchyNodeId: hierarchyNodeIds.length ? { in: hierarchyNodeIds } : undefined,
        isActive: true,
        status: "ACTIVE"
      },
      _count: { _all: true }
    }),
    prisma.student.groupBy({
      by: ["hierarchyNodeId"],
      where: {
        tenantId,
        hierarchyNodeId: hierarchyNodeIds.length ? { in: hierarchyNodeIds } : undefined,
        isActive: true
      },
      _count: { _all: true }
    }),
    centers.length
      ? prisma.auditLog.findMany({
          where: {
            tenantId,
            entityType: "CENTER_CAPACITY",
            entityId: { in: centers.map((center) => center.id) }
          },
          orderBy: { createdAt: "desc" },
          take: Math.max(centers.length * 3, 10),
          select: {
            entityId: true,
            action: true,
            createdAt: true
          }
        })
      : []
  ]);

  const teachersByNode = new Map(teacherCounts.map((row) => [row.hierarchyNodeId, row._count._all]));
  const studentsByNode = new Map(studentCounts.map((row) => [row.hierarchyNodeId, row._count._all]));
  const latestAuditByCenterId = new Map();
  for (const row of auditRows) {
    if (!latestAuditByCenterId.has(row.entityId)) {
      latestAuditByCenterId.set(row.entityId, row);
    }
  }

  const allItems = centers.map((center) => {
    const snapshot = buildCenterCapacitySnapshot({
      center,
      capacity: center.centerCapacity,
      teacherCount: teachersByNode.get(center.authUser?.hierarchyNodeId || "") || 0,
      studentCount: studentsByNode.get(center.authUser?.hierarchyNodeId || "") || 0,
      auditHistory: []
    });
    const latestAudit = latestAuditByCenterId.get(center.id) || null;

    return {
      centerId: center.id,
      centerCode: snapshot.center.code,
      centerName: snapshot.center.name,
      franchiseId: snapshot.center.franchiseId,
      franchiseName: snapshot.center.franchiseName,
      configured: snapshot.configured,
      allowOverAllocation: snapshot.allowOverAllocation,
      teachersUsed: snapshot.usage.teachers.used,
      studentsUsed: snapshot.usage.students.used,
      teacherLimit: snapshot.usage.teachers.limit,
      studentLimit: snapshot.usage.students.limit,
      teacherUtilizationPercent: snapshot.usage.teachers.utilizationPercent,
      studentUtilizationPercent: snapshot.usage.students.utilizationPercent,
      remainingTeachers: snapshot.usage.teachers.remaining,
      remainingStudents: snapshot.usage.students.remaining,
      overallState: snapshot.summary.overallState,
      maxUtilizationPercent: snapshot.summary.maxUtilizationPercent,
      recommendedAction: snapshot.summary.recommendedAction,
      updatedAt: snapshot.capacity?.updatedAt || null,
      latestAuditAction: latestAudit?.action || null,
      latestAuditAt: latestAudit?.createdAt || null,
      usage: snapshot.usage,
      summary: snapshot.summary
    };
  });

  const filteredItems = stateFilter
    ? allItems.filter((item) => item.overallState === stateFilter)
    : allItems;

  filteredItems.sort((left, right) => compareSummaryItems(left, right, sortBy, sortDirection));

  const limit = pagination.limit;
  const offset = pagination.offset;
  const pagedItems = filteredItems.slice(offset, offset + limit);

  return {
    items: pagedItems,
    pagination: {
      limit,
      offset,
      total: filteredItems.length,
      returned: pagedItems.length
    },
    sort: {
      sortBy,
      sortDirection
    },
    summary: summarizeCapacityCollection(filteredItems),
    meta: {
      generatedAt: new Date().toISOString()
    }
  };
}

async function recordCapacityLimitBlocked({ tenantId, actor, error, requestMetadata = null }) {
  if (!isCapacityEnforcementError(error)) {
    return;
  }

  await recordCenterCapacityAudit({
    tenantId,
    userId: actor?.userId,
    role: actor?.role,
    action: CAPACITY_AUDIT_ACTIONS.LIMIT_BLOCKED,
    centerId: error.capacityContext?.centerId,
    metadata: {
      ...(error.capacityContext || {}),
      ...(requestMetadata || {})
    }
  });
}

async function recordCapacityOverAllocation({ tenantId, actor, centerSnapshot, resourceType, projectedUsed, requestMetadata = null }) {
  const usage = resourceType === "TEACHER"
    ? centerSnapshot.usage.teachers
    : centerSnapshot.usage.students;

  await recordCenterCapacityAudit({
    tenantId,
    userId: actor?.userId,
    role: actor?.role,
    action: CAPACITY_AUDIT_ACTIONS.OVERALLOCATED,
    centerId: centerSnapshot.center.id,
    metadata: {
      centerCode: centerSnapshot.center.code,
      centerName: centerSnapshot.center.name,
      resourceType,
      currentUsed: usage.used,
      projectedUsed,
      limit: usage.limit,
      allowOverAllocation: centerSnapshot.allowOverAllocation,
      ...(requestMetadata || {})
    }
  });
}

export {
  assertCenterCapacityAvailable,
  getCapacitySummary,
  getCenterCapacity,
  isCapacityEnforcementError,
  recordCapacityLimitBlocked,
  recordCapacityOverAllocation,
  withCenterCapacityExecutionLock,
  upsertCenterCapacity
};