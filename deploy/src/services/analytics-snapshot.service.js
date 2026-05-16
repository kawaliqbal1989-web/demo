import { prisma } from "../lib/prisma.js";
import {
  average,
  calculateDeltaPercent,
  roundMetric,
  toNumber,
  weightedAverage
} from "./bp-kpi.service.js";
import {
  calculateBusinessPartnerHealthScore,
  calculateCenterHealthScore,
  calculateFranchiseHealthScore
} from "./health-score.service.js";

const SNAPSHOT_BATCH_SIZE = 50;
const SNAPSHOT_UPSERT_BATCH_SIZE = 25;
const ATTENDANCE_LOOKBACK_DAYS = 30;
const ACTIVE_CENTER_STATUSES = new Set(["ACTIVE"]);
const PRESENT_ATTENDANCE_STATUSES = new Set(["PRESENT", "LATE", "EXCUSED"]);

function startOfUtcDay(value = new Date()) {
  const normalized = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(normalized.getUTCFullYear(), normalized.getUTCMonth(), normalized.getUTCDate(), 0, 0, 0, 0));
}

function addUtcDays(value, days) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + days, 0, 0, 0, 0));
}

function startOfUtcMonth(value) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 0, 0, 0, 0));
}

function normalizeSnapshotDate(value) {
  if (!value) {
    return startOfUtcDay(new Date());
  }

  return startOfUtcDay(new Date(value));
}

function chunkItems(items = [], chunkSize = SNAPSHOT_BATCH_SIZE) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function uniqueStrings(values = []) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0)));
}

function mapCountRows(rows = []) {
  return new Map(rows.map((row) => [row.hierarchyNodeId, row._count._all]));
}

function sumBy(items = [], selector) {
  return roundMetric(items.reduce((sum, item) => sum + toNumber(selector(item)), 0), 2);
}

async function listActiveBusinessPartners({ tenantId, businessPartnerId, tx = prisma } = {}) {
  return tx.businessPartner.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      ...(businessPartnerId ? { id: businessPartnerId } : {}),
      isActive: true,
      status: "ACTIVE"
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      tenantId: true,
      code: true,
      name: true
    }
  });
}

async function listBusinessPartnerCenters({ tenantId, businessPartnerId, centerIds, tx = prisma } = {}) {
  return tx.centerProfile.findMany({
    where: {
      tenantId,
      ...(centerIds?.length ? { id: { in: centerIds } } : {}),
      status: { not: "ARCHIVED" },
      franchiseProfile: {
        is: {
          businessPartnerId
        }
      }
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      status: true,
      isActive: true,
      franchiseProfileId: true,
      updatedAt: true,
      authUser: {
        select: {
          hierarchyNodeId: true
        }
      }
    }
  });
}

async function listBusinessPartnerFranchises({ tenantId, businessPartnerId, franchiseIds, tx = prisma } = {}) {
  return tx.franchiseProfile.findMany({
    where: {
      tenantId,
      businessPartnerId,
      ...(franchiseIds?.length ? { id: { in: franchiseIds } } : {}),
      status: { not: "ARCHIVED" }
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      status: true,
      isActive: true
    }
  });
}

async function detectChangedCenterIds({ tenantId, businessPartnerId, snapshotDate, centers, tx = prisma } = {}) {
  const normalizedDate = normalizeSnapshotDate(snapshotDate);
  const nextDate = addUtcDays(normalizedDate, 1);
  const centerIds = uniqueStrings((centers || []).map((center) => center.id));
  const hierarchyNodeIds = uniqueStrings((centers || []).map((center) => center.authUser?.hierarchyNodeId));

  if (!centerIds.length || !hierarchyNodeIds.length) {
    return [];
  }

  const hierarchyNodeToCenterId = new Map(
    centers
      .filter((center) => center.authUser?.hierarchyNodeId)
      .map((center) => [center.authUser.hierarchyNodeId, center.id])
  );

  const existingSnapshots = await tx.centerAnalyticsSnapshot.findMany({
    where: {
      tenantId,
      businessPartnerId,
      centerId: { in: centerIds },
      snapshotDate: normalizedDate
    },
    select: {
      centerId: true
    }
  });

  const existingCenterIds = new Set(existingSnapshots.map((row) => row.centerId));
  const missingCenterIds = centerIds.filter((centerId) => !existingCenterIds.has(centerId));

  const [changedStudents, changedTeachers, changedTransactions, changedSessions, changedInstallments, changedCenters] = await Promise.all([
    tx.student.findMany({
      where: {
        tenantId,
        hierarchyNodeId: { in: hierarchyNodeIds },
        OR: [{ createdAt: { gte: normalizedDate, lt: nextDate } }, { updatedAt: { gte: normalizedDate, lt: nextDate } }]
      },
      distinct: ["hierarchyNodeId"],
      select: {
        hierarchyNodeId: true
      }
    }),
    tx.teacherProfile.findMany({
      where: {
        tenantId,
        hierarchyNodeId: { in: hierarchyNodeIds },
        OR: [{ createdAt: { gte: normalizedDate, lt: nextDate } }, { updatedAt: { gte: normalizedDate, lt: nextDate } }]
      },
      distinct: ["hierarchyNodeId"],
      select: {
        hierarchyNodeId: true
      }
    }),
    tx.financialTransaction.findMany({
      where: {
        tenantId,
        businessPartnerId,
        centerId: { in: hierarchyNodeIds },
        createdAt: { gte: normalizedDate, lt: nextDate }
      },
      distinct: ["centerId"],
      select: {
        centerId: true
      }
    }),
    tx.attendanceSession.findMany({
      where: {
        tenantId,
        hierarchyNodeId: { in: hierarchyNodeIds },
        OR: [{ date: { gte: normalizedDate, lt: nextDate } }, { updatedAt: { gte: normalizedDate, lt: nextDate } }]
      },
      distinct: ["hierarchyNodeId"],
      select: {
        hierarchyNodeId: true
      }
    }),
    tx.studentFeeInstallment.findMany({
      where: {
        tenantId,
        student: {
          is: {
            hierarchyNodeId: { in: hierarchyNodeIds }
          }
        },
        OR: [
          { dueDate: { gte: normalizedDate, lt: nextDate } },
          { createdAt: { gte: normalizedDate, lt: nextDate } },
          { updatedAt: { gte: normalizedDate, lt: nextDate } }
        ]
      },
      select: {
        student: {
          select: {
            hierarchyNodeId: true
          }
        }
      }
    }),
    tx.centerProfile.findMany({
      where: {
        tenantId,
        id: { in: centerIds },
        OR: [{ createdAt: { gte: normalizedDate, lt: nextDate } }, { updatedAt: { gte: normalizedDate, lt: nextDate } }]
      },
      select: {
        id: true
      }
    })
  ]);

  const changedCenterIds = new Set(missingCenterIds);

  for (const row of changedStudents) {
    const centerId = hierarchyNodeToCenterId.get(row.hierarchyNodeId);
    if (centerId) {
      changedCenterIds.add(centerId);
    }
  }

  for (const row of changedTeachers) {
    const centerId = hierarchyNodeToCenterId.get(row.hierarchyNodeId);
    if (centerId) {
      changedCenterIds.add(centerId);
    }
  }

  for (const row of changedTransactions) {
    const centerId = hierarchyNodeToCenterId.get(row.centerId);
    if (centerId) {
      changedCenterIds.add(centerId);
    }
  }

  for (const row of changedSessions) {
    const centerId = hierarchyNodeToCenterId.get(row.hierarchyNodeId);
    if (centerId) {
      changedCenterIds.add(centerId);
    }
  }

  for (const row of changedInstallments) {
    const centerId = hierarchyNodeToCenterId.get(row.student?.hierarchyNodeId);
    if (centerId) {
      changedCenterIds.add(centerId);
    }
  }

  for (const row of changedCenters) {
    changedCenterIds.add(row.id);
  }

  return [...changedCenterIds];
}

async function loadOutstandingFeesByHierarchyNode({ tenantId, hierarchyNodeIds, cutoffDate, tx = prisma } = {}) {
  if (!hierarchyNodeIds?.length) {
    return new Map();
  }

  const installments = await tx.studentFeeInstallment.findMany({
    where: {
      tenantId,
      dueDate: { lt: cutoffDate },
      student: {
        is: {
          hierarchyNodeId: { in: hierarchyNodeIds }
        }
      }
    },
    select: {
      id: true,
      amount: true,
      student: {
        select: {
          hierarchyNodeId: true
        }
      }
    }
  });

  if (!installments.length) {
    return new Map();
  }

  const payments = await tx.financialTransaction.groupBy({
    by: ["installmentId"],
    where: {
      tenantId,
      installmentId: {
        in: installments.map((installment) => installment.id)
      },
      createdAt: {
        lt: cutoffDate
      }
    },
    _sum: {
      grossAmount: true
    }
  });

  const paidByInstallment = new Map(
    payments.map((row) => [row.installmentId, toNumber(row._sum.grossAmount)])
  );
  const outstandingByNode = new Map();

  for (const installment of installments) {
    const hierarchyNodeId = installment.student?.hierarchyNodeId;
    if (!hierarchyNodeId) {
      continue;
    }

    const outstanding = Math.max(0, toNumber(installment.amount) - toNumber(paidByInstallment.get(installment.id)));
    outstandingByNode.set(hierarchyNodeId, roundMetric((outstandingByNode.get(hierarchyNodeId) || 0) + outstanding, 2));
  }

  return outstandingByNode;
}

async function aggregateCenterSnapshotRows({ tenantId, businessPartnerId, centers, snapshotDate, tx = prisma } = {}) {
  const normalizedDate = normalizeSnapshotDate(snapshotDate);
  const nextDate = addUtcDays(normalizedDate, 1);
  const monthStart = startOfUtcMonth(normalizedDate);
  const attendanceStart = addUtcDays(nextDate, -ATTENDANCE_LOOKBACK_DAYS);
  const rows = [];

  for (const centerChunk of chunkItems(centers)) {
    const hierarchyNodeIds = uniqueStrings(centerChunk.map((center) => center.authUser?.hierarchyNodeId));
    if (!hierarchyNodeIds.length) {
      continue;
    }

    const [activeStudents, totalStudents, previousActiveStudents, teacherCounts, revenueRows, attendanceRows, outstandingByNode] =
      await Promise.all([
        tx.student.groupBy({
          by: ["hierarchyNodeId"],
          where: {
            tenantId,
            hierarchyNodeId: { in: hierarchyNodeIds },
            isActive: true
          },
          _count: { _all: true }
        }),
        tx.student.groupBy({
          by: ["hierarchyNodeId"],
          where: {
            tenantId,
            hierarchyNodeId: { in: hierarchyNodeIds }
          },
          _count: { _all: true }
        }),
        tx.student.groupBy({
          by: ["hierarchyNodeId"],
          where: {
            tenantId,
            hierarchyNodeId: { in: hierarchyNodeIds },
            isActive: true,
            createdAt: { lt: monthStart }
          },
          _count: { _all: true }
        }),
        tx.teacherProfile.groupBy({
          by: ["hierarchyNodeId"],
          where: {
            tenantId,
            hierarchyNodeId: { in: hierarchyNodeIds },
            isActive: true,
            status: "ACTIVE"
          },
          _count: { _all: true }
        }),
        tx.financialTransaction.findMany({
          where: {
            tenantId,
            businessPartnerId,
            centerId: { in: hierarchyNodeIds },
            createdAt: { gte: monthStart, lt: nextDate }
          },
          select: {
            centerId: true,
            grossAmount: true
          }
        }),
        tx.attendanceEntry.findMany({
          where: {
            tenantId,
            session: {
              is: {
                hierarchyNodeId: { in: hierarchyNodeIds },
                date: {
                  gte: attendanceStart,
                  lt: nextDate
                }
              }
            }
          },
          select: {
            status: true,
            session: {
              select: {
                hierarchyNodeId: true
              }
            }
          }
        }),
        loadOutstandingFeesByHierarchyNode({
          tenantId,
          hierarchyNodeIds,
          cutoffDate: nextDate,
          tx
        })
      ]);

    const activeStudentsByNode = mapCountRows(activeStudents);
    const totalStudentsByNode = mapCountRows(totalStudents);
    const previousActiveStudentsByNode = mapCountRows(previousActiveStudents);
    const teachersByNode = mapCountRows(teacherCounts);

    const revenueByNode = new Map();
    for (const row of revenueRows) {
      revenueByNode.set(row.centerId, roundMetric((revenueByNode.get(row.centerId) || 0) + toNumber(row.grossAmount), 2));
    }

    const attendanceByNode = new Map();
    for (const row of attendanceRows) {
      const hierarchyNodeId = row.session?.hierarchyNodeId;
      if (!hierarchyNodeId) {
        continue;
      }

      const existing = attendanceByNode.get(hierarchyNodeId) || { total: 0, attended: 0 };
      existing.total += 1;
      if (PRESENT_ATTENDANCE_STATUSES.has(row.status)) {
        existing.attended += 1;
      }
      attendanceByNode.set(hierarchyNodeId, existing);
    }

    for (const center of centerChunk) {
      const hierarchyNodeId = center.authUser?.hierarchyNodeId;
      if (!hierarchyNodeId) {
        continue;
      }

      const activeStudentCount = activeStudentsByNode.get(hierarchyNodeId) || 0;
      const totalStudentCount = totalStudentsByNode.get(hierarchyNodeId) || 0;
      const previousActiveStudentCount = previousActiveStudentsByNode.get(hierarchyNodeId) || 0;
      const teacherCount = teachersByNode.get(hierarchyNodeId) || 0;
      const monthlyRevenue = revenueByNode.get(hierarchyNodeId) || 0;
      const pendingFees = outstandingByNode.get(hierarchyNodeId) || 0;
      const attendanceStats = attendanceByNode.get(hierarchyNodeId) || { total: 0, attended: 0 };
      const attendancePercent = attendanceStats.total
        ? roundMetric((attendanceStats.attended / attendanceStats.total) * 100, 2)
        : 0;
      const retentionPercent = totalStudentCount
        ? roundMetric((activeStudentCount / totalStudentCount) * 100, 2)
        : 0;
      const studentGrowthPercent = calculateDeltaPercent(activeStudentCount, previousActiveStudentCount);
      const health = calculateCenterHealthScore({
        attendancePercent,
        retentionPercent,
        monthlyRevenue,
        pendingFees,
        studentGrowthPercent,
        teacherCount,
        activeStudents: activeStudentCount
      });

      rows.push({
        tenantId,
        businessPartnerId,
        franchiseId: center.franchiseProfileId,
        centerId: center.id,
        activeStudents: activeStudentCount,
        attendancePercent,
        monthlyRevenue: roundMetric(monthlyRevenue, 2),
        pendingFees: roundMetric(pendingFees, 2),
        teacherCount,
        studentGrowthPercent: roundMetric(studentGrowthPercent, 2),
        retentionPercent,
        healthScore: roundMetric(health.score, 2)
      });
    }
  }

  return rows;
}

async function upsertCenterSnapshots({ snapshotDate, rows, tx = prisma } = {}) {
  let upsertedCount = 0;
  for (const chunk of chunkItems(rows, SNAPSHOT_UPSERT_BATCH_SIZE)) {
    await Promise.all(
      chunk.map(async (row) => {
        await tx.centerAnalyticsSnapshot.upsert({
          where: {
            centerId_snapshotDate: {
              centerId: row.centerId,
              snapshotDate
            }
          },
          update: {
            tenantId: row.tenantId,
            businessPartnerId: row.businessPartnerId,
            franchiseId: row.franchiseId,
            activeStudents: row.activeStudents,
            attendancePercent: row.attendancePercent,
            monthlyRevenue: row.monthlyRevenue,
            pendingFees: row.pendingFees,
            teacherCount: row.teacherCount,
            studentGrowthPercent: row.studentGrowthPercent,
            retentionPercent: row.retentionPercent,
            healthScore: row.healthScore
          },
          create: {
            ...row,
            snapshotDate
          }
        });
        upsertedCount += 1;
      })
    );
  }

  return {
    upsertedCount
  };
}

async function aggregateFranchiseSnapshotRows({ tenantId, businessPartnerId, franchiseIds, snapshotDate, tx = prisma } = {}) {
  const normalizedDate = normalizeSnapshotDate(snapshotDate);
  const franchises = await listBusinessPartnerFranchises({ tenantId, businessPartnerId, franchiseIds, tx });
  if (!franchises.length) {
    return [];
  }

  const centerProfiles = await tx.centerProfile.findMany({
    where: {
      tenantId,
      franchiseProfileId: { in: franchises.map((franchise) => franchise.id) },
      status: { not: "ARCHIVED" }
    },
    select: {
      id: true,
      franchiseProfileId: true,
      isActive: true,
      status: true,
      authUser: {
        select: {
          hierarchyNodeId: true
        }
      }
    }
  });

  const hierarchyNodeIds = uniqueStrings(centerProfiles.map((center) => center.authUser?.hierarchyNodeId));
  const centerSnapshots = await tx.centerAnalyticsSnapshot.findMany({
    where: {
      tenantId,
      businessPartnerId,
      franchiseId: { in: franchises.map((franchise) => franchise.id) },
      snapshotDate: normalizedDate
    },
    select: {
      franchiseId: true,
      centerId: true,
      activeStudents: true,
      attendancePercent: true,
      monthlyRevenue: true,
      pendingFees: true,
      teacherCount: true,
      studentGrowthPercent: true,
      retentionPercent: true,
      healthScore: true
    }
  });

  const [studentCounts, activeStudentCounts] = await Promise.all([
    hierarchyNodeIds.length
      ? tx.student.groupBy({
          by: ["hierarchyNodeId"],
          where: {
            tenantId,
            hierarchyNodeId: { in: hierarchyNodeIds }
          },
          _count: { _all: true }
        })
      : Promise.resolve([]),
    hierarchyNodeIds.length
      ? tx.student.groupBy({
          by: ["hierarchyNodeId"],
          where: {
            tenantId,
            hierarchyNodeId: { in: hierarchyNodeIds },
            isActive: true
          },
          _count: { _all: true }
        })
      : Promise.resolve([])
  ]);

  const totalStudentsByNode = mapCountRows(studentCounts);
  const activeStudentsByNode = mapCountRows(activeStudentCounts);
  const centersByFranchise = new Map();
  for (const center of centerProfiles) {
    const list = centersByFranchise.get(center.franchiseProfileId) || [];
    list.push(center);
    centersByFranchise.set(center.franchiseProfileId, list);
  }

  const snapshotsByFranchise = new Map();
  for (const snapshot of centerSnapshots) {
    const list = snapshotsByFranchise.get(snapshot.franchiseId) || [];
    list.push(snapshot);
    snapshotsByFranchise.set(snapshot.franchiseId, list);
  }

  return franchises.map((franchise) => {
    const franchiseCenters = centersByFranchise.get(franchise.id) || [];
    const franchiseCenterSnapshots = snapshotsByFranchise.get(franchise.id) || [];
    const studentCount = franchiseCenters.reduce(
      (sum, center) => sum + (totalStudentsByNode.get(center.authUser?.hierarchyNodeId) || 0),
      0
    );
    const activeStudents = franchiseCenters.reduce(
      (sum, center) => sum + (activeStudentsByNode.get(center.authUser?.hierarchyNodeId) || 0),
      0
    );
    const centerCount = franchiseCenters.filter(
      (center) => center.isActive && ACTIVE_CENTER_STATUSES.has(center.status)
    ).length;
    const teacherCount = franchiseCenterSnapshots.reduce((sum, snapshot) => sum + snapshot.teacherCount, 0);
    const monthlyCollections = sumBy(franchiseCenterSnapshots, (snapshot) => snapshot.monthlyRevenue);
    const pendingFees = sumBy(franchiseCenterSnapshots, (snapshot) => snapshot.pendingFees);
    const attendancePercent = weightedAverage(
      franchiseCenterSnapshots.map((snapshot) => ({ value: snapshot.attendancePercent, weight: Math.max(snapshot.activeStudents, 1) }))
    );
    const studentGrowthPercent = weightedAverage(
      franchiseCenterSnapshots.map((snapshot) => ({ value: snapshot.studentGrowthPercent, weight: Math.max(snapshot.activeStudents, 1) }))
    );
    const retentionPercent = studentCount ? roundMetric((activeStudents / studentCount) * 100, 2) : 0;
    const health = calculateFranchiseHealthScore({
      monthlyCollections,
      pendingFees,
      studentGrowthPercent,
      attendancePercent,
      retentionPercent,
      activeStudents,
      studentCount
    });

    return {
      tenantId,
      businessPartnerId,
      franchiseId: franchise.id,
      studentCount,
      activeStudents,
      centerCount,
      teacherCount,
      monthlyCollections,
      pendingFees,
      attendancePercent: roundMetric(attendancePercent, 2),
      studentGrowthPercent: roundMetric(studentGrowthPercent, 2),
      healthScore: roundMetric(health.score, 2)
    };
  });
}

async function upsertFranchiseSnapshots({ snapshotDate, rows, tx = prisma } = {}) {
  let upsertedCount = 0;
  for (const chunk of chunkItems(rows, SNAPSHOT_UPSERT_BATCH_SIZE)) {
    await Promise.all(
      chunk.map(async (row) => {
        await tx.franchiseAnalyticsSnapshot.upsert({
          where: {
            franchiseId_snapshotDate: {
              franchiseId: row.franchiseId,
              snapshotDate
            }
          },
          update: {
            tenantId: row.tenantId,
            businessPartnerId: row.businessPartnerId,
            studentCount: row.studentCount,
            activeStudents: row.activeStudents,
            centerCount: row.centerCount,
            teacherCount: row.teacherCount,
            monthlyCollections: row.monthlyCollections,
            pendingFees: row.pendingFees,
            attendancePercent: row.attendancePercent,
            studentGrowthPercent: row.studentGrowthPercent,
            healthScore: row.healthScore
          },
          create: {
            ...row,
            snapshotDate
          }
        });
        upsertedCount += 1;
      })
    );
  }

  return {
    upsertedCount
  };
}

async function aggregateBusinessPartnerSnapshot({ tenantId, businessPartnerId, snapshotDate, tx = prisma } = {}) {
  const normalizedDate = normalizeSnapshotDate(snapshotDate);
  const nextDate = addUtcDays(normalizedDate, 1);
  const monthStart = startOfUtcMonth(normalizedDate);
  const [franchiseSnapshots, centerProfiles, totalFranchises, activeCenters] = await Promise.all([
    tx.franchiseAnalyticsSnapshot.findMany({
      where: {
        tenantId,
        businessPartnerId,
        snapshotDate: normalizedDate
      },
      select: {
        studentCount: true,
        activeStudents: true,
        centerCount: true,
        monthlyCollections: true,
        pendingFees: true,
        attendancePercent: true,
        studentGrowthPercent: true,
        healthScore: true
      }
    }),
    tx.centerProfile.findMany({
      where: {
        tenantId,
        status: { not: "ARCHIVED" },
        franchiseProfile: {
          is: {
            businessPartnerId
          }
        }
      },
      select: {
        isActive: true,
        status: true,
        authUser: {
          select: {
            hierarchyNodeId: true
          }
        }
      }
    }),
    tx.franchiseProfile.count({
      where: {
        tenantId,
        businessPartnerId,
        status: { not: "ARCHIVED" }
      }
    }),
    tx.centerProfile.count({
      where: {
        tenantId,
        isActive: true,
        status: "ACTIVE",
        franchiseProfile: {
          is: {
            businessPartnerId
          }
        }
      }
    })
  ]);

  const hierarchyNodeIds = uniqueStrings(centerProfiles.map((center) => center.authUser?.hierarchyNodeId));
  const newAdmissions = hierarchyNodeIds.length
    ? await tx.student.count({
        where: {
          tenantId,
          hierarchyNodeId: { in: hierarchyNodeIds },
          createdAt: { gte: monthStart, lt: nextDate }
        }
      })
    : 0;

  const totalStudents = franchiseSnapshots.reduce((sum, snapshot) => sum + snapshot.studentCount, 0);
  const activeStudents = franchiseSnapshots.reduce((sum, snapshot) => sum + snapshot.activeStudents, 0);
  const monthlyCollections = sumBy(franchiseSnapshots, (snapshot) => snapshot.monthlyCollections);
  const pendingFees = sumBy(franchiseSnapshots, (snapshot) => snapshot.pendingFees);
  const attendancePercent = weightedAverage(
    franchiseSnapshots.map((snapshot) => ({ value: snapshot.attendancePercent, weight: Math.max(snapshot.activeStudents, 1) }))
  );
  const studentGrowthPercent = weightedAverage(
    franchiseSnapshots.map((snapshot) => ({ value: snapshot.studentGrowthPercent, weight: Math.max(snapshot.activeStudents, 1) }))
  );
  const retentionPercent = totalStudents ? roundMetric((activeStudents / totalStudents) * 100, 2) : 0;
  const health = calculateBusinessPartnerHealthScore({
    monthlyCollections,
    pendingFees,
    studentGrowthPercent,
    attendancePercent,
    retentionPercent,
    activeStudents,
    totalStudents
  });

  return {
    tenantId,
    businessPartnerId,
    totalStudents,
    activeStudents,
    totalFranchises,
    activeCenters,
    monthlyCollections,
    pendingFees,
    newAdmissions,
    attendancePercent: roundMetric(attendancePercent, 2),
    studentGrowthPercent: roundMetric(studentGrowthPercent, 2),
    healthScore: roundMetric(health.score, 2)
  };
}

async function upsertBusinessPartnerSnapshot({ snapshotDate, row, tx = prisma } = {}) {
  await tx.analyticsDailySnapshot.upsert({
    where: {
      businessPartnerId_snapshotDate: {
        businessPartnerId: row.businessPartnerId,
        snapshotDate
      }
    },
    update: {
      tenantId: row.tenantId,
      totalStudents: row.totalStudents,
      activeStudents: row.activeStudents,
      totalFranchises: row.totalFranchises,
      activeCenters: row.activeCenters,
      monthlyCollections: row.monthlyCollections,
      pendingFees: row.pendingFees,
      newAdmissions: row.newAdmissions,
      attendancePercent: row.attendancePercent,
      studentGrowthPercent: row.studentGrowthPercent,
      healthScore: row.healthScore
    },
    create: {
      ...row,
      snapshotDate
    }
  });

  return {
    upsertedCount: 1
  };
}

export {
  ATTENDANCE_LOOKBACK_DAYS,
  SNAPSHOT_BATCH_SIZE,
  addUtcDays,
  aggregateBusinessPartnerSnapshot,
  aggregateCenterSnapshotRows,
  aggregateFranchiseSnapshotRows,
  chunkItems,
  detectChangedCenterIds,
  listActiveBusinessPartners,
  listBusinessPartnerCenters,
  listBusinessPartnerFranchises,
  normalizeSnapshotDate,
  startOfUtcDay,
  startOfUtcMonth,
  uniqueStrings,
  upsertBusinessPartnerSnapshot,
  upsertCenterSnapshots,
  upsertFranchiseSnapshots
};