import { prisma } from "../lib/prisma.js";
import {
  applyBpScopeToCenterQuery,
  applyBpScopeToFranchiseQuery,
  applyBpScopeToStudentQuery,
  applyBpScopeToTeacherQuery,
  normalizeScopeIds
} from "../utils/bp-scope-filters.js";
import {
  average,
  buildComparisonMetric,
  calculateDeltaPercent,
  computeHealthScore,
  roundMetric,
  toNumber,
  weightedAverage
} from "./bp-kpi.service.js";

const DEFAULT_TREND_MONTHS = 6;
const MAX_TREND_MONTHS = 12;
const DEFAULT_RANKING_SORT = "healthScore";
const DEFAULT_SORT_DIRECTION = "desc";
const PRESENT_ATTENDANCE_STATUSES = new Set(["PRESENT", "LATE", "EXCUSED"]);
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getScopeMeta(bpScope) {
  return {
    businessPartnerId: bpScope?.businessPartner?.id || null,
    franchiseIdsCount: normalizeScopeIds(bpScope?.franchiseIds).length,
    centerIdsCount: normalizeScopeIds(bpScope?.centerIds).length,
    hierarchyNodeIdsCount: normalizeScopeIds(bpScope?.hierarchyNodeIds).length
  };
}

function serializeDate(value) {
  return value instanceof Date ? value.toISOString() : null;
}

function startOfUtcMonth(value = new Date()) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addUtcMonths(value, months) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1, 0, 0, 0, 0));
}

function createMonthRange(value = new Date()) {
  const start = startOfUtcMonth(value);
  return {
    start,
    end: addUtcMonths(start, 1)
  };
}

function getTrailingDaysStart(endDate, days) {
  return new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
}

function formatMonthLabel(value) {
  return `${monthLabels[value.getUTCMonth()]} ${value.getUTCFullYear()}`;
}

function getMonthKey(value) {
  return value.toISOString().slice(0, 7);
}

function normalizeAsOfDate(value) {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function normalizeMonths(value) {
  const parsed = Number.parseInt(String(value ?? DEFAULT_TREND_MONTHS), 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_TREND_MONTHS;
  }

  return Math.max(1, Math.min(MAX_TREND_MONTHS, parsed));
}

function normalizeLimit(value, fallback = 10) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(100, parsed));
}

function normalizeOffset(value) {
  const parsed = Number.parseInt(String(value ?? 0), 10);
  if (Number.isNaN(parsed)) {
    return 0;
  }

  return Math.max(0, parsed);
}

function normalizeSortDirection(value) {
  return String(value || DEFAULT_SORT_DIRECTION).trim().toLowerCase() === "asc" ? "asc" : "desc";
}

function normalizeSortBy(value, allowed, fallback = DEFAULT_RANKING_SORT) {
  const resolved = String(value || fallback).trim();
  return allowed.has(resolved) ? resolved : fallback;
}

function buildMonthWindows(months, asOfDate = new Date()) {
  const currentMonthStart = startOfUtcMonth(asOfDate);
  const windows = [];

  for (let index = months - 1; index >= 0; index -= 1) {
    const start = addUtcMonths(currentMonthStart, -index);
    const end = addUtcMonths(start, 1);
    windows.push({
      key: getMonthKey(start),
      label: formatMonthLabel(start),
      start,
      end
    });
  }

  return windows;
}

function buildMeta({ bpScope, range, source }) {
  return {
    generatedAt: new Date().toISOString(),
    scope: getScopeMeta(bpScope),
    range,
    source
  };
}

function toRangeMeta({ start, end, previousStart, previousEnd, months }) {
  return {
    from: serializeDate(start),
    to: serializeDate(end),
    previousFrom: serializeDate(previousStart),
    previousTo: serializeDate(previousEnd),
    months: months ?? null
  };
}

function sumValues(rows = [], field) {
  return roundMetric(rows.reduce((sum, row) => sum + toNumber(row?.[field]), 0), 2);
}

function sortItems(items, sortBy, sortDirection) {
  const direction = sortDirection === "asc" ? 1 : -1;
  return [...items].sort((left, right) => {
    const leftValue = left?.[sortBy];
    const rightValue = right?.[sortBy];

    if (typeof leftValue === "string" || typeof rightValue === "string") {
      return String(leftValue || "").localeCompare(String(rightValue || "")) * direction;
    }

    if (toNumber(leftValue) === toNumber(rightValue)) {
      return String(left?.name || left?.centerName || left?.franchiseName || "").localeCompare(
        String(right?.name || right?.centerName || right?.franchiseName || "")
      );
    }

    return (toNumber(leftValue) - toNumber(rightValue)) * direction;
  });
}

function paginateItems(items, { limit, offset }) {
  return {
    total: items.length,
    limit,
    offset,
    returned: Math.max(0, Math.min(limit, items.length - offset)),
    items: items.slice(offset, offset + limit)
  };
}

async function findSnapshotRowsByMonth({ tenantId, businessPartnerId, windows }) {
  const [firstWindow] = windows;
  const lastWindow = windows[windows.length - 1];
  if (!firstWindow || !lastWindow) {
    return [];
  }

  return prisma.analyticsDailySnapshot.findMany({
    where: {
      tenantId,
      businessPartnerId,
      snapshotDate: {
        gte: firstWindow.start,
        lt: lastWindow.end
      }
    },
    orderBy: [{ snapshotDate: "asc" }],
    select: {
      snapshotDate: true,
      monthlyCollections: true,
      activeStudents: true,
      newAdmissions: true,
      studentGrowthPercent: true
    }
  });
}

function selectLatestRowsPerMonth(rows) {
  const latestByMonth = new Map();

  for (const row of rows) {
    const key = getMonthKey(row.snapshotDate);
    const existing = latestByMonth.get(key);
    if (!existing || existing.snapshotDate < row.snapshotDate) {
      latestByMonth.set(key, row);
    }
  }

  return latestByMonth;
}

async function getCurrentMonthOverviewSnapshots({ tenantId, businessPartnerId, currentRange, previousRange }) {
  const [currentSnapshot, previousSnapshot] = await Promise.all([
    prisma.analyticsDailySnapshot.findFirst({
      where: {
        tenantId,
        businessPartnerId,
        snapshotDate: {
          gte: currentRange.start,
          lt: currentRange.end
        }
      },
      orderBy: [{ snapshotDate: "desc" }],
      select: {
        snapshotDate: true,
        totalStudents: true,
        activeStudents: true,
        totalFranchises: true,
        activeCenters: true,
        monthlyCollections: true,
        pendingFees: true,
        newAdmissions: true,
        attendancePercent: true,
        studentGrowthPercent: true,
        healthScore: true
      }
    }),
    prisma.analyticsDailySnapshot.findFirst({
      where: {
        tenantId,
        businessPartnerId,
        snapshotDate: {
          gte: previousRange.start,
          lt: previousRange.end
        }
      },
      orderBy: [{ snapshotDate: "desc" }],
      select: {
        snapshotDate: true,
        totalStudents: true,
        activeStudents: true,
        totalFranchises: true,
        activeCenters: true,
        monthlyCollections: true,
        pendingFees: true,
        newAdmissions: true,
        attendancePercent: true,
        studentGrowthPercent: true,
        healthScore: true
      }
    })
  ]);

  return { currentSnapshot, previousSnapshot };
}

async function loadScopedCenters({ tenantId, bpScope }) {
  return prisma.centerProfile.findMany({
    where: applyBpScopeToCenterQuery({
      tenantId,
      bpScope,
      where: {
        status: { not: "ARCHIVED" }
      }
    }),
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      status: true,
      isActive: true,
      franchiseProfileId: true,
      franchiseProfile: {
        select: {
          id: true,
          code: true,
          name: true,
          displayName: true
        }
      },
      authUser: {
        select: {
          hierarchyNodeId: true
        }
      }
    }
  });
}

async function loadScopedOutstandingFees({ tenantId, bpScope, cutoffDate, hierarchyNodeIds }) {
  if (!hierarchyNodeIds.length) {
    return new Map();
  }

  const installments = await prisma.studentFeeInstallment.findMany({
    where: {
      tenantId,
      dueDate: { lte: cutoffDate },
      student: {
        is: applyBpScopeToStudentQuery({
          tenantId,
          bpScope,
          where: {
            hierarchyNodeId: { in: hierarchyNodeIds }
          }
        })
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

  const payments = await prisma.financialTransaction.groupBy({
    by: ["installmentId"],
    where: {
      tenantId,
      installmentId: {
        in: installments.map((installment) => installment.id)
      },
      createdAt: {
        lte: cutoffDate
      }
    },
    _sum: {
      grossAmount: true
    }
  });

  const paymentByInstallment = new Map(
    payments.map((payment) => [payment.installmentId, toNumber(payment._sum.grossAmount)])
  );

  const outstandingByNode = new Map();

  for (const installment of installments) {
    const hierarchyNodeId = installment.student?.hierarchyNodeId;
    if (!hierarchyNodeId) {
      continue;
    }

    const outstanding = Math.max(0, toNumber(installment.amount) - toNumber(paymentByInstallment.get(installment.id)));
    outstandingByNode.set(hierarchyNodeId, roundMetric((outstandingByNode.get(hierarchyNodeId) || 0) + outstanding, 2));
  }

  return outstandingByNode;
}

async function loadLiveCenterMetrics({ tenantId, bpScope, currentRange, previousRange }) {
  const centers = await loadScopedCenters({ tenantId, bpScope });
  const hierarchyNodeIds = centers
    .map((center) => center.authUser?.hierarchyNodeId)
    .filter((value) => typeof value === "string" && value.length > 0);

  if (!centers.length || !hierarchyNodeIds.length) {
    return { centers: [], rows: [] };
  }

  const attendanceStart = getTrailingDaysStart(currentRange.end, 30);

  const [
    activeStudentCounts,
    totalStudentCounts,
    previousActiveStudentCounts,
    teacherCounts,
    transactionRows,
    attendanceRows,
    currentOutstandingByNode
  ] = await Promise.all([
    prisma.student.groupBy({
      by: ["hierarchyNodeId"],
      where: applyBpScopeToStudentQuery({
        tenantId,
        bpScope,
        where: {
          isActive: true,
          hierarchyNodeId: { in: hierarchyNodeIds }
        }
      }),
      _count: { _all: true }
    }),
    prisma.student.groupBy({
      by: ["hierarchyNodeId"],
      where: applyBpScopeToStudentQuery({
        tenantId,
        bpScope,
        where: {
          hierarchyNodeId: { in: hierarchyNodeIds }
        }
      }),
      _count: { _all: true }
    }),
    prisma.student.groupBy({
      by: ["hierarchyNodeId"],
      where: applyBpScopeToStudentQuery({
        tenantId,
        bpScope,
        where: {
          isActive: true,
          hierarchyNodeId: { in: hierarchyNodeIds },
          createdAt: {
            lt: currentRange.start
          }
        }
      }),
      _count: { _all: true }
    }),
    prisma.teacherProfile.groupBy({
      by: ["hierarchyNodeId"],
      where: applyBpScopeToTeacherQuery({
        tenantId,
        bpScope,
        where: {
          isActive: true,
          status: "ACTIVE",
          hierarchyNodeId: { in: hierarchyNodeIds }
        }
      }),
      _count: { _all: true }
    }),
    prisma.financialTransaction.findMany({
      where: {
        tenantId,
        businessPartnerId: bpScope.businessPartner.id,
        centerId: { in: hierarchyNodeIds },
        createdAt: {
          gte: previousRange.start,
          lt: currentRange.end
        }
      },
      select: {
        centerId: true,
        createdAt: true,
        grossAmount: true
      }
    }),
    prisma.attendanceEntry.findMany({
      where: {
        tenantId,
        session: {
          is: {
            hierarchyNodeId: { in: hierarchyNodeIds },
            date: {
              gte: attendanceStart,
              lt: currentRange.end
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
    loadScopedOutstandingFees({ tenantId, bpScope, cutoffDate: currentRange.end, hierarchyNodeIds })
  ]);

  const activeStudentsByNode = new Map(activeStudentCounts.map((row) => [row.hierarchyNodeId, row._count._all]));
  const totalStudentsByNode = new Map(totalStudentCounts.map((row) => [row.hierarchyNodeId, row._count._all]));
  const previousActiveStudentsByNode = new Map(
    previousActiveStudentCounts.map((row) => [row.hierarchyNodeId, row._count._all])
  );
  const teachersByNode = new Map(teacherCounts.map((row) => [row.hierarchyNodeId, row._count._all]));

  const currentRevenueByNode = new Map();
  const previousRevenueByNode = new Map();
  for (const row of transactionRows) {
    const targetMap = row.createdAt >= currentRange.start ? currentRevenueByNode : previousRevenueByNode;
    targetMap.set(row.centerId, roundMetric((targetMap.get(row.centerId) || 0) + toNumber(row.grossAmount), 2));
  }

  const attendanceByNode = new Map();
  for (const row of attendanceRows) {
    const hierarchyNodeId = row.session?.hierarchyNodeId;
    if (!hierarchyNodeId) {
      continue;
    }

    const stats = attendanceByNode.get(hierarchyNodeId) || { total: 0, attended: 0 };
    stats.total += 1;
    if (PRESENT_ATTENDANCE_STATUSES.has(row.status)) {
      stats.attended += 1;
    }
    attendanceByNode.set(hierarchyNodeId, stats);
  }

  const rows = centers.map((center) => {
    const hierarchyNodeId = center.authUser?.hierarchyNodeId;
    const activeStudents = activeStudentsByNode.get(hierarchyNodeId) || 0;
    const totalStudents = totalStudentsByNode.get(hierarchyNodeId) || 0;
    const previousActiveStudents = previousActiveStudentsByNode.get(hierarchyNodeId) || 0;
    const teacherCount = teachersByNode.get(hierarchyNodeId) || 0;
    const monthlyRevenue = currentRevenueByNode.get(hierarchyNodeId) || 0;
    const previousRevenue = previousRevenueByNode.get(hierarchyNodeId) || 0;
    const pendingFees = currentOutstandingByNode.get(hierarchyNodeId) || 0;
    const attendanceStats = attendanceByNode.get(hierarchyNodeId) || { total: 0, attended: 0 };
    const attendancePercent = attendanceStats.total
      ? roundMetric((attendanceStats.attended / attendanceStats.total) * 100, 2)
      : 0;
    const retentionPercent = totalStudents ? roundMetric((activeStudents / totalStudents) * 100, 2) : 0;
    const studentGrowthPercent = calculateDeltaPercent(activeStudents, previousActiveStudents);
    const collectionRatio = monthlyRevenue + pendingFees > 0
      ? roundMetric((monthlyRevenue / (monthlyRevenue + pendingFees)) * 100, 2)
      : 0;

    return {
      centerId: center.id,
      centerCode: center.code,
      centerName: center.displayName || center.name,
      franchiseId: center.franchiseProfileId,
      franchiseCode: center.franchiseProfile?.code || null,
      franchiseName: center.franchiseProfile?.displayName || center.franchiseProfile?.name || null,
      hierarchyNodeId,
      status: center.status,
      isActive: center.isActive,
      totalStudents,
      activeStudents,
      previousActiveStudents,
      teacherCount,
      monthlyRevenue: roundMetric(monthlyRevenue, 2),
      previousRevenue: roundMetric(previousRevenue, 2),
      pendingFees: roundMetric(pendingFees, 2),
      attendancePercent,
      retentionPercent,
      studentGrowthPercent,
      healthScore: computeHealthScore({
        attendancePercent,
        retentionPercent,
        collectionRatio,
        growthPercent: studentGrowthPercent
      })
    };
  });

  return { centers, rows };
}

async function buildLiveOverviewAnalytics({ tenantId, bpScope, currentRange, previousRange }) {
  const [centerMetrics, totalFranchises, currentAdmissions, previousAdmissions, previousOutstandingByNode] = await Promise.all([
    loadLiveCenterMetrics({ tenantId, bpScope, currentRange, previousRange }),
    prisma.franchiseProfile.count({
      where: applyBpScopeToFranchiseQuery({
        tenantId,
        bpScope,
        where: {
          status: { not: "ARCHIVED" }
        }
      })
    }),
    prisma.student.count({
      where: applyBpScopeToStudentQuery({
        tenantId,
        bpScope,
        where: {
          createdAt: {
            gte: currentRange.start,
            lt: currentRange.end
          }
        }
      })
    }),
    prisma.student.count({
      where: applyBpScopeToStudentQuery({
        tenantId,
        bpScope,
        where: {
          createdAt: {
            gte: previousRange.start,
            lt: previousRange.end
          }
        }
      })
    }),
    loadScopedOutstandingFees({
      tenantId,
      bpScope,
      cutoffDate: previousRange.end,
      hierarchyNodeIds: normalizeScopeIds(bpScope?.hierarchyNodeIds)
    })
  ]);

  const rows = centerMetrics.rows;
  const totalStudents = rows.reduce((sum, row) => sum + row.totalStudents, 0);
  const activeStudents = rows.reduce((sum, row) => sum + row.activeStudents, 0);
  const previousActiveStudents = rows.reduce((sum, row) => sum + row.previousActiveStudents, 0);
  const activeCenters = rows.filter((row) => row.isActive && row.status === "ACTIVE").length;
  const monthlyCollections = sumValues(rows, "monthlyRevenue");
  const previousMonthlyCollections = sumValues(rows, "previousRevenue");
  const pendingFees = sumValues(rows, "pendingFees");
  const previousPendingFees = roundMetric(
    Array.from(previousOutstandingByNode.values()).reduce((sum, value) => sum + toNumber(value), 0),
    2
  );
  const attendancePercent = weightedAverage(
    rows.map((row) => ({ value: row.attendancePercent, weight: Math.max(row.activeStudents, 1) }))
  );
  const studentGrowthPercent = calculateDeltaPercent(activeStudents, previousActiveStudents);
  const retentionPercent = totalStudents ? roundMetric((activeStudents / totalStudents) * 100, 2) : 0;
  const collectionRatio = monthlyCollections + pendingFees > 0
    ? roundMetric((monthlyCollections / (monthlyCollections + pendingFees)) * 100, 2)
    : 0;
  const healthScore = computeHealthScore({
    attendancePercent,
    retentionPercent,
    collectionRatio,
    growthPercent: studentGrowthPercent
  });

  return {
    meta: buildMeta({
      bpScope,
      range: toRangeMeta({
        start: currentRange.start,
        end: currentRange.end,
        previousStart: previousRange.start,
        previousEnd: previousRange.end
      }),
      source: {
        mode: "live",
        snapshotDate: null,
        liveFallback: true
      }
    }),
    kpis: {
      totalStudents: buildComparisonMetric({
        key: "totalStudents",
        label: "Total students",
        currentValue: totalStudents,
        previousValue: Math.max(totalStudents - currentAdmissions, 0)
      }),
      activeStudents: buildComparisonMetric({
        key: "activeStudents",
        label: "Active students",
        currentValue: activeStudents,
        previousValue: previousActiveStudents
      }),
      totalFranchises: buildComparisonMetric({
        key: "totalFranchises",
        label: "Total franchises",
        currentValue: totalFranchises,
        previousValue: totalFranchises
      }),
      activeCenters: buildComparisonMetric({
        key: "activeCenters",
        label: "Active centers",
        currentValue: activeCenters,
        previousValue: activeCenters
      }),
      monthlyCollections: buildComparisonMetric({
        key: "monthlyCollections",
        label: "Monthly collections",
        currentValue: monthlyCollections,
        previousValue: previousMonthlyCollections,
        unit: "currency"
      }),
      pendingFees: buildComparisonMetric({
        key: "pendingFees",
        label: "Pending fees",
        currentValue: pendingFees,
        previousValue: previousPendingFees,
        unit: "currency"
      }),
      newAdmissions: buildComparisonMetric({
        key: "newAdmissions",
        label: "New admissions",
        currentValue: currentAdmissions,
        previousValue: previousAdmissions
      }),
      attendancePercent: buildComparisonMetric({
        key: "attendancePercent",
        label: "Attendance",
        currentValue: attendancePercent,
        previousValue: attendancePercent,
        unit: "percent"
      }),
      studentGrowthPercent: buildComparisonMetric({
        key: "studentGrowthPercent",
        label: "Student growth",
        currentValue: studentGrowthPercent,
        previousValue: 0,
        unit: "percent"
      }),
      healthScore: buildComparisonMetric({
        key: "healthScore",
        label: "Network health",
        currentValue: healthScore,
        previousValue: healthScore,
        unit: "score"
      })
    }
  };
}

async function getOverviewAnalytics({ tenantId, bpScope, asOf }) {
  const businessPartnerId = bpScope?.businessPartner?.id;
  const asOfDate = normalizeAsOfDate(asOf);
  const currentRange = createMonthRange(asOfDate);
  const previousRange = {
    start: addUtcMonths(currentRange.start, -1),
    end: currentRange.start
  };

  const { currentSnapshot, previousSnapshot } = await getCurrentMonthOverviewSnapshots({
    tenantId,
    businessPartnerId,
    currentRange,
    previousRange
  });

  if (!currentSnapshot) {
    return buildLiveOverviewAnalytics({ tenantId, bpScope, currentRange, previousRange });
  }

  return {
    meta: buildMeta({
      bpScope,
      range: toRangeMeta({
        start: currentRange.start,
        end: currentRange.end,
        previousStart: previousRange.start,
        previousEnd: previousRange.end
      }),
      source: {
        mode: "snapshot",
        snapshotDate: serializeDate(currentSnapshot.snapshotDate),
        liveFallback: false
      }
    }),
    kpis: {
      totalStudents: buildComparisonMetric({
        key: "totalStudents",
        label: "Total students",
        currentValue: currentSnapshot.totalStudents,
        previousValue: previousSnapshot?.totalStudents || 0
      }),
      activeStudents: buildComparisonMetric({
        key: "activeStudents",
        label: "Active students",
        currentValue: currentSnapshot.activeStudents,
        previousValue: previousSnapshot?.activeStudents || 0
      }),
      totalFranchises: buildComparisonMetric({
        key: "totalFranchises",
        label: "Total franchises",
        currentValue: currentSnapshot.totalFranchises,
        previousValue: previousSnapshot?.totalFranchises || 0
      }),
      activeCenters: buildComparisonMetric({
        key: "activeCenters",
        label: "Active centers",
        currentValue: currentSnapshot.activeCenters,
        previousValue: previousSnapshot?.activeCenters || 0
      }),
      monthlyCollections: buildComparisonMetric({
        key: "monthlyCollections",
        label: "Monthly collections",
        currentValue: currentSnapshot.monthlyCollections,
        previousValue: previousSnapshot?.monthlyCollections || 0,
        unit: "currency"
      }),
      pendingFees: buildComparisonMetric({
        key: "pendingFees",
        label: "Pending fees",
        currentValue: currentSnapshot.pendingFees,
        previousValue: previousSnapshot?.pendingFees || 0,
        unit: "currency"
      }),
      newAdmissions: buildComparisonMetric({
        key: "newAdmissions",
        label: "New admissions",
        currentValue: currentSnapshot.newAdmissions,
        previousValue: previousSnapshot?.newAdmissions || 0
      }),
      attendancePercent: buildComparisonMetric({
        key: "attendancePercent",
        label: "Attendance",
        currentValue: currentSnapshot.attendancePercent,
        previousValue: previousSnapshot?.attendancePercent || 0,
        unit: "percent"
      }),
      studentGrowthPercent: buildComparisonMetric({
        key: "studentGrowthPercent",
        label: "Student growth",
        currentValue: currentSnapshot.studentGrowthPercent,
        previousValue: previousSnapshot?.studentGrowthPercent || 0,
        unit: "percent"
      }),
      healthScore: buildComparisonMetric({
        key: "healthScore",
        label: "Network health",
        currentValue: currentSnapshot.healthScore,
        previousValue: previousSnapshot?.healthScore || 0,
        unit: "score"
      })
    }
  };
}

async function getRevenueTrendAnalytics({ tenantId, bpScope, months, asOf }) {
  const businessPartnerId = bpScope?.businessPartner?.id;
  const normalizedMonths = normalizeMonths(months);
  const windows = buildMonthWindows(normalizedMonths, normalizeAsOfDate(asOf));
  const rows = await findSnapshotRowsByMonth({ tenantId, businessPartnerId, windows });
  const latestByMonth = selectLatestRowsPerMonth(rows);

  if (rows.length) {
    const series = windows.map((window) => {
      const row = latestByMonth.get(window.key);
      return {
        label: window.label,
        from: serializeDate(window.start),
        to: serializeDate(window.end),
        revenue: roundMetric(row?.monthlyCollections || 0, 2)
      };
    });

    const latestValue = series[series.length - 1]?.revenue || 0;
    const previousValue = series[series.length - 2]?.revenue || 0;

    return {
      meta: buildMeta({
        bpScope,
        range: toRangeMeta({
          start: windows[0]?.start,
          end: windows[windows.length - 1]?.end,
          months: normalizedMonths
        }),
        source: {
          mode: "snapshot",
          snapshotDate: serializeDate(rows[rows.length - 1]?.snapshotDate),
          liveFallback: false
        }
      }),
      series,
      summary: {
        totalRevenue: sumValues(series, "revenue"),
        averageRevenue: average(series.map((point) => point.revenue)),
        growthPercent: calculateDeltaPercent(latestValue, previousValue)
      }
    };
  }

  const transactionRows = await prisma.financialTransaction.findMany({
    where: {
      tenantId,
      businessPartnerId,
      centerId: {
        in: normalizeScopeIds(bpScope?.hierarchyNodeIds)
      },
      createdAt: {
        gte: windows[0]?.start,
        lt: windows[windows.length - 1]?.end
      }
    },
    select: {
      createdAt: true,
      grossAmount: true
    }
  });

  const revenueByMonth = new Map();
  for (const row of transactionRows) {
    const key = getMonthKey(startOfUtcMonth(row.createdAt));
    revenueByMonth.set(key, roundMetric((revenueByMonth.get(key) || 0) + toNumber(row.grossAmount), 2));
  }

  const series = windows.map((window) => ({
    label: window.label,
    from: serializeDate(window.start),
    to: serializeDate(window.end),
    revenue: roundMetric(revenueByMonth.get(window.key) || 0, 2)
  }));

  const latestValue = series[series.length - 1]?.revenue || 0;
  const previousValue = series[series.length - 2]?.revenue || 0;

  return {
    meta: buildMeta({
      bpScope,
      range: toRangeMeta({
        start: windows[0]?.start,
        end: windows[windows.length - 1]?.end,
        months: normalizedMonths
      }),
      source: {
        mode: "live",
        snapshotDate: null,
        liveFallback: true
      }
    }),
    series,
    summary: {
      totalRevenue: sumValues(series, "revenue"),
      averageRevenue: average(series.map((point) => point.revenue)),
      growthPercent: calculateDeltaPercent(latestValue, previousValue)
    }
  };
}

async function getStudentGrowthTrendAnalytics({ tenantId, bpScope, months, asOf }) {
  const businessPartnerId = bpScope?.businessPartner?.id;
  const normalizedMonths = normalizeMonths(months);
  const windows = buildMonthWindows(normalizedMonths, normalizeAsOfDate(asOf));
  const rows = await findSnapshotRowsByMonth({ tenantId, businessPartnerId, windows });
  const latestByMonth = selectLatestRowsPerMonth(rows);

  if (rows.length) {
    const series = windows.map((window) => {
      const row = latestByMonth.get(window.key);
      return {
        label: window.label,
        from: serializeDate(window.start),
        to: serializeDate(window.end),
        activeStudents: row?.activeStudents || 0,
        newAdmissions: row?.newAdmissions || 0,
        growthPercent: roundMetric(row?.studentGrowthPercent || 0, 2)
      };
    });

    return {
      meta: buildMeta({
        bpScope,
        range: toRangeMeta({
          start: windows[0]?.start,
          end: windows[windows.length - 1]?.end,
          months: normalizedMonths
        }),
        source: {
          mode: "snapshot",
          snapshotDate: serializeDate(rows[rows.length - 1]?.snapshotDate),
          liveFallback: false
        }
      }),
      series,
      summary: {
        latestActiveStudents: series[series.length - 1]?.activeStudents || 0,
        totalNewAdmissions: series.reduce((sum, point) => sum + point.newAdmissions, 0),
        averageGrowthPercent: average(series.map((point) => point.growthPercent))
      }
    };
  }

  const [activeStudents, admissions] = await Promise.all([
    prisma.student.findMany({
      where: applyBpScopeToStudentQuery({
        tenantId,
        bpScope,
        where: {
          isActive: true,
          createdAt: {
            lt: windows[windows.length - 1]?.end
          }
        }
      }),
      select: {
        createdAt: true
      }
    }),
    prisma.student.findMany({
      where: applyBpScopeToStudentQuery({
        tenantId,
        bpScope,
        where: {
          createdAt: {
            gte: windows[0]?.start,
            lt: windows[windows.length - 1]?.end
          }
        }
      }),
      select: {
        createdAt: true
      }
    })
  ]);

  const admissionsByMonth = new Map();
  for (const student of admissions) {
    const key = getMonthKey(startOfUtcMonth(student.createdAt));
    admissionsByMonth.set(key, (admissionsByMonth.get(key) || 0) + 1);
  }

  const series = windows.map((window, index) => {
    const activeStudentCount = activeStudents.filter((student) => student.createdAt < window.end).length;
    const previousActiveStudentCount = index === 0 ? 0 : activeStudents.filter((student) => student.createdAt < window.start).length;

    return {
      label: window.label,
      from: serializeDate(window.start),
      to: serializeDate(window.end),
      activeStudents: activeStudentCount,
      newAdmissions: admissionsByMonth.get(window.key) || 0,
      growthPercent: calculateDeltaPercent(activeStudentCount, previousActiveStudentCount)
    };
  });

  return {
    meta: buildMeta({
      bpScope,
      range: toRangeMeta({
        start: windows[0]?.start,
        end: windows[windows.length - 1]?.end,
        months: normalizedMonths
      }),
      source: {
        mode: "live",
        snapshotDate: null,
        liveFallback: true
      }
    }),
    series,
    summary: {
      latestActiveStudents: series[series.length - 1]?.activeStudents || 0,
      totalNewAdmissions: series.reduce((sum, point) => sum + point.newAdmissions, 0),
      averageGrowthPercent: average(series.map((point) => point.growthPercent))
    }
  };
}

async function getFranchiseRankingAnalytics({ tenantId, bpScope, asOf, limit, offset, sortBy, sortDirection }) {
  const businessPartnerId = bpScope?.businessPartner?.id;
  const scopedFranchiseIds = normalizeScopeIds(bpScope?.franchiseIds);
  const currentRange = createMonthRange(normalizeAsOfDate(asOf));
  const allowedSortBy = new Set([
    "franchiseName",
    "studentCount",
    "activeStudents",
    "centerCount",
    "teacherCount",
    "monthlyCollections",
    "pendingFees",
    "attendancePercent",
    "studentGrowthPercent",
    "healthScore"
  ]);
  const resolvedSortBy = normalizeSortBy(sortBy, allowedSortBy);
  const resolvedSortDirection = normalizeSortDirection(sortDirection);
  const pagination = {
    limit: normalizeLimit(limit),
    offset: normalizeOffset(offset)
  };

  const latestSnapshot = scopedFranchiseIds.length
    ? await prisma.franchiseAnalyticsSnapshot.findFirst({
        where: {
          tenantId,
          businessPartnerId,
          franchiseId: { in: scopedFranchiseIds },
          snapshotDate: {
            gte: currentRange.start,
            lt: currentRange.end
          }
        },
        orderBy: [{ snapshotDate: "desc" }],
        select: { snapshotDate: true }
      })
    : null;

  if (latestSnapshot) {
    const rows = await prisma.franchiseAnalyticsSnapshot.findMany({
      where: {
        tenantId,
        businessPartnerId,
        franchiseId: { in: scopedFranchiseIds },
        snapshotDate: latestSnapshot.snapshotDate
      },
      select: {
        franchiseId: true,
        studentCount: true,
        activeStudents: true,
        centerCount: true,
        teacherCount: true,
        monthlyCollections: true,
        pendingFees: true,
        attendancePercent: true,
        studentGrowthPercent: true,
        healthScore: true,
        franchise: {
          select: {
            code: true,
            name: true,
            displayName: true
          }
        }
      }
    });

    const items = rows.map((row) => ({
      franchiseId: row.franchiseId,
      franchiseCode: row.franchise?.code || null,
      franchiseName: row.franchise?.displayName || row.franchise?.name || row.franchise?.code || row.franchiseId,
      studentCount: row.studentCount,
      activeStudents: row.activeStudents,
      centerCount: row.centerCount,
      teacherCount: row.teacherCount,
      monthlyCollections: roundMetric(row.monthlyCollections, 2),
      pendingFees: roundMetric(row.pendingFees, 2),
      attendancePercent: roundMetric(row.attendancePercent, 2),
      studentGrowthPercent: roundMetric(row.studentGrowthPercent, 2),
      healthScore: roundMetric(row.healthScore, 2)
    }));

    const sortedItems = sortItems(items, resolvedSortBy, resolvedSortDirection);
    const page = paginateItems(sortedItems, pagination);

    return {
      meta: buildMeta({
        bpScope,
        range: toRangeMeta({ start: currentRange.start, end: currentRange.end }),
        source: {
          mode: "snapshot",
          snapshotDate: serializeDate(latestSnapshot.snapshotDate),
          liveFallback: false
        }
      }),
      sort: {
        sortBy: resolvedSortBy,
        sortDirection: resolvedSortDirection
      },
      pagination: {
        total: page.total,
        limit: pagination.limit,
        offset: pagination.offset,
        returned: page.items.length
      },
      items: page.items
    };
  }

  const liveCenters = await loadLiveCenterMetrics({
    tenantId,
    bpScope,
    currentRange,
    previousRange: {
      start: addUtcMonths(currentRange.start, -1),
      end: currentRange.start
    }
  });
  const grouped = new Map();

  for (const row of liveCenters.rows) {
    const current = grouped.get(row.franchiseId) || {
      franchiseId: row.franchiseId,
      franchiseCode: row.franchiseCode,
      franchiseName: row.franchiseName,
      studentCount: 0,
      activeStudents: 0,
      centerCount: 0,
      teacherCount: 0,
      monthlyCollections: 0,
      pendingFees: 0,
      attendanceValues: [],
      growthValues: [],
      healthValues: []
    };

    current.studentCount += row.totalStudents;
    current.activeStudents += row.activeStudents;
    current.centerCount += 1;
    current.teacherCount += row.teacherCount;
    current.monthlyCollections = roundMetric(current.monthlyCollections + row.monthlyRevenue, 2);
    current.pendingFees = roundMetric(current.pendingFees + row.pendingFees, 2);
    current.attendanceValues.push(row.attendancePercent);
    current.growthValues.push(row.studentGrowthPercent);
    current.healthValues.push(row.healthScore);
    grouped.set(row.franchiseId, current);
  }

  const items = Array.from(grouped.values()).map((row) => ({
    franchiseId: row.franchiseId,
    franchiseCode: row.franchiseCode,
    franchiseName: row.franchiseName,
    studentCount: row.studentCount,
    activeStudents: row.activeStudents,
    centerCount: row.centerCount,
    teacherCount: row.teacherCount,
    monthlyCollections: row.monthlyCollections,
    pendingFees: row.pendingFees,
    attendancePercent: average(row.attendanceValues),
    studentGrowthPercent: average(row.growthValues),
    healthScore: average(row.healthValues)
  }));

  const sortedItems = sortItems(items, resolvedSortBy, resolvedSortDirection);
  const page = paginateItems(sortedItems, pagination);

  return {
    meta: buildMeta({
      bpScope,
      range: toRangeMeta({ start: currentRange.start, end: currentRange.end }),
      source: {
        mode: "live",
        snapshotDate: null,
        liveFallback: true
      }
    }),
    sort: {
      sortBy: resolvedSortBy,
      sortDirection: resolvedSortDirection
    },
    pagination: {
      total: page.total,
      limit: pagination.limit,
      offset: pagination.offset,
      returned: page.items.length
    },
    items: page.items
  };
}

async function getCenterHealthAnalytics({ tenantId, bpScope, asOf, franchiseId, limit, offset, sortBy, sortDirection }) {
  const businessPartnerId = bpScope?.businessPartner?.id;
  const scopedFranchiseIds = normalizeScopeIds(bpScope?.franchiseIds);
  const scopedCenterIds = normalizeScopeIds(bpScope?.centerIds);
  const currentRange = createMonthRange(normalizeAsOfDate(asOf));
  const resolvedFranchiseId = franchiseId && scopedFranchiseIds.includes(franchiseId) ? franchiseId : null;
  const restrictedCenterIds = scopedCenterIds;
  const allowedSortBy = new Set([
    "centerName",
    "activeStudents",
    "monthlyRevenue",
    "pendingFees",
    "teacherCount",
    "attendancePercent",
    "studentGrowthPercent",
    "retentionPercent",
    "healthScore"
  ]);
  const resolvedSortBy = normalizeSortBy(sortBy, allowedSortBy);
  const resolvedSortDirection = normalizeSortDirection(sortDirection);
  const pagination = {
    limit: normalizeLimit(limit),
    offset: normalizeOffset(offset)
  };

  const latestSnapshot = restrictedCenterIds.length
    ? await prisma.centerAnalyticsSnapshot.findFirst({
        where: {
          tenantId,
          businessPartnerId,
          centerId: { in: restrictedCenterIds },
          ...(resolvedFranchiseId ? { franchiseId: resolvedFranchiseId } : {}),
          snapshotDate: {
            gte: currentRange.start,
            lt: currentRange.end
          }
        },
        orderBy: [{ snapshotDate: "desc" }],
        select: { snapshotDate: true }
      })
    : null;

  if (latestSnapshot) {
    const rows = await prisma.centerAnalyticsSnapshot.findMany({
      where: {
        tenantId,
        businessPartnerId,
        centerId: { in: restrictedCenterIds },
        ...(resolvedFranchiseId ? { franchiseId: resolvedFranchiseId } : {}),
        snapshotDate: latestSnapshot.snapshotDate
      },
      select: {
        centerId: true,
        franchiseId: true,
        activeStudents: true,
        attendancePercent: true,
        monthlyRevenue: true,
        pendingFees: true,
        teacherCount: true,
        studentGrowthPercent: true,
        retentionPercent: true,
        healthScore: true,
        center: {
          select: {
            code: true,
            name: true,
            displayName: true,
            status: true,
            isActive: true
          }
        },
        franchise: {
          select: {
            code: true,
            name: true,
            displayName: true
          }
        }
      }
    });

    const items = rows.map((row) => ({
      centerId: row.centerId,
      centerCode: row.center?.code || null,
      centerName: row.center?.displayName || row.center?.name || row.centerId,
      franchiseId: row.franchiseId,
      franchiseCode: row.franchise?.code || null,
      franchiseName: row.franchise?.displayName || row.franchise?.name || row.franchiseId,
      status: row.center?.status || null,
      isActive: row.center?.isActive ?? false,
      activeStudents: row.activeStudents,
      attendancePercent: roundMetric(row.attendancePercent, 2),
      monthlyRevenue: roundMetric(row.monthlyRevenue, 2),
      pendingFees: roundMetric(row.pendingFees, 2),
      teacherCount: row.teacherCount,
      studentGrowthPercent: roundMetric(row.studentGrowthPercent, 2),
      retentionPercent: roundMetric(row.retentionPercent, 2),
      healthScore: roundMetric(row.healthScore, 2)
    }));

    const sortedItems = sortItems(items, resolvedSortBy, resolvedSortDirection);
    const page = paginateItems(sortedItems, pagination);

    return {
      meta: buildMeta({
        bpScope,
        range: toRangeMeta({ start: currentRange.start, end: currentRange.end }),
        source: {
          mode: "snapshot",
          snapshotDate: serializeDate(latestSnapshot.snapshotDate),
          liveFallback: false
        }
      }),
      sort: {
        sortBy: resolvedSortBy,
        sortDirection: resolvedSortDirection
      },
      pagination: {
        total: page.total,
        limit: pagination.limit,
        offset: pagination.offset,
        returned: page.items.length
      },
      items: page.items
    };
  }

  const liveCenters = await loadLiveCenterMetrics({
    tenantId,
    bpScope,
    currentRange,
    previousRange: {
      start: addUtcMonths(currentRange.start, -1),
      end: currentRange.start
    }
  });

  const filteredRows = liveCenters.rows.filter((row) => !resolvedFranchiseId || row.franchiseId === resolvedFranchiseId);
  const items = filteredRows.map((row) => ({
    centerId: row.centerId,
    centerCode: row.centerCode,
    centerName: row.centerName,
    franchiseId: row.franchiseId,
    franchiseCode: row.franchiseCode,
    franchiseName: row.franchiseName,
    status: row.status,
    isActive: row.isActive,
    activeStudents: row.activeStudents,
    attendancePercent: row.attendancePercent,
    monthlyRevenue: row.monthlyRevenue,
    pendingFees: row.pendingFees,
    teacherCount: row.teacherCount,
    studentGrowthPercent: row.studentGrowthPercent,
    retentionPercent: row.retentionPercent,
    healthScore: row.healthScore
  }));

  const sortedItems = sortItems(items, resolvedSortBy, resolvedSortDirection);
  const page = paginateItems(sortedItems, pagination);

  return {
    meta: buildMeta({
      bpScope,
      range: toRangeMeta({ start: currentRange.start, end: currentRange.end }),
      source: {
        mode: "live",
        snapshotDate: null,
        liveFallback: true
      }
    }),
    sort: {
      sortBy: resolvedSortBy,
      sortDirection: resolvedSortDirection
    },
    pagination: {
      total: page.total,
      limit: pagination.limit,
      offset: pagination.offset,
      returned: page.items.length
    },
    items: page.items
  };
}

export {
  getCenterHealthAnalytics,
  getFranchiseRankingAnalytics,
  getOverviewAnalytics,
  getRevenueTrendAnalytics,
  getStudentGrowthTrendAnalytics
};