import { prisma } from "../lib/prisma.js";
import {
  calculateDeltaPercent,
  roundMetric,
  toNumber,
  weightedAverage
} from "./bp-kpi.service.js";
import {
  calculateCenterHealthScore,
  clampScore,
  normalizeTeacherActivity,
  roundScore
} from "./health-score.service.js";

const DEFAULT_TREND_MONTHS = 6;
const MAX_TREND_MONTHS = 12;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_SORT_DIRECTION = "desc";
const PRESENT_ATTENDANCE_STATUSES = new Set(["PRESENT", "LATE", "EXCUSED"]);
const ACTIVE_CENTER_STATUSES = new Set(["ACTIVE"]);
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const FRANCHISE_ALERT_RULES = Object.freeze({
  inactiveCenterDays: 21,
  teacherInactiveDays: 14,
  weakCenterHealthScore: 65,
  attendanceCollapseThreshold: 60,
  worksheetBacklogThreshold: 45,
  growthDeclineThreshold: -5,
  operationalRiskThreshold: 55,
  minimumWorksheetAssigned: 5
});

function serializeDate(value) {
  return value instanceof Date ? value.toISOString() : null;
}

function normalizeAsOfDate(value) {
  if (!value) {
    return new Date();
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function normalizeMonths(value) {
  const parsed = Number.parseInt(String(value ?? DEFAULT_TREND_MONTHS), 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_TREND_MONTHS;
  }

  return Math.max(1, Math.min(MAX_TREND_MONTHS, parsed));
}

function normalizeLimit(value, fallback = DEFAULT_LIMIT) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(MAX_LIMIT, parsed));
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

function normalizeSearch(value) {
  const normalized = String(value || "").trim();
  return normalized.length ? normalized.toLowerCase() : null;
}

function startOfUtcDay(value = new Date()) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0));
}

function startOfUtcMonth(value = new Date()) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addUtcDays(value, days) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function addUtcMonths(value, months) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1, 0, 0, 0, 0));
}

function getMonthKey(value) {
  return value.toISOString().slice(0, 7);
}

function formatMonthLabel(value) {
  return `${monthLabels[value.getUTCMonth()]} ${value.getUTCFullYear()}`;
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

function uniqueStrings(values = []) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0)));
}

function mapCountRows(rows = [], keyField = "hierarchyNodeId") {
  return new Map(rows.map((row) => [row[keyField], Number(row?._count?._all || 0)]));
}

function mapLatestRows(rows = [], keyField) {
  const result = new Map();

  for (const row of rows) {
    const key = row?.[keyField];
    if (!key) {
      continue;
    }

    const existing = result.get(key);
    if (!existing || new Date(existing.snapshotDate) < new Date(row.snapshotDate)) {
      result.set(key, row);
    }
  }

  return result;
}

function buildMeta({ franchiseScope, asOfDate, source, filters = {}, range = null }) {
  return {
    generatedAt: new Date().toISOString(),
    scope: {
      businessPartnerId: franchiseScope?.franchise?.businessPartnerId || null,
      franchiseId: franchiseScope?.franchise?.id || null,
      hierarchyNodeIdsCount: Array.isArray(franchiseScope?.hierarchyNodeIds) ? franchiseScope.hierarchyNodeIds.length : 0
    },
    asOf: serializeDate(asOfDate),
    range,
    filters,
    source
  };
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

function stableSortItems(items, sortBy, sortDirection, fallbackKey = "name") {
  const direction = sortDirection === "asc" ? 1 : -1;

  return [...items].sort((left, right) => {
    const leftValue = left?.[sortBy];
    const rightValue = right?.[sortBy];

    if (typeof leftValue === "string" || typeof rightValue === "string") {
      const primary = String(leftValue || "").localeCompare(String(rightValue || "")) * direction;
      if (primary !== 0) {
        return primary;
      }
    } else {
      const primary = (toNumber(leftValue) - toNumber(rightValue)) * direction;
      if (primary !== 0) {
        return primary;
      }
    }

    const fallback = String(left?.[fallbackKey] || left?.id || "").localeCompare(
      String(right?.[fallbackKey] || right?.id || "")
    );
    if (fallback !== 0) {
      return fallback;
    }

    return String(left?.id || "").localeCompare(String(right?.id || ""));
  });
}

function matchesSearch(row, search) {
  if (!search) {
    return true;
  }

  return [
    row?.name,
    row?.centerName,
    row?.teacherName,
    row?.code,
    row?.centerCode,
    row?.teacherEmail,
    row?.teacherUsername,
    row?.centerDisplayName
  ].some((value) => String(value || "").toLowerCase().includes(search));
}

function calculateWorksheetCompletionRate(assignedCount, completedCount) {
  const assigned = Math.max(0, toNumber(assignedCount));
  const completed = Math.max(0, toNumber(completedCount));

  if (assigned <= 0) {
    return 0;
  }

  return roundMetric((completed / assigned) * 100, 2);
}

function calculateAttendanceStability(currentPercent, previousPercent) {
  if (previousPercent === null || previousPercent === undefined) {
    return 50;
  }

  return clampScore(100 - Math.abs(toNumber(currentPercent) - toNumber(previousPercent)));
}

function calculateOperationalTrendScore(currentHealthScore, previousHealthScore, growthPercent) {
  if (previousHealthScore === null || previousHealthScore === undefined) {
    return clampScore(50 + toNumber(growthPercent));
  }

  return clampScore(50 + toNumber(currentHealthScore) - toNumber(previousHealthScore));
}

function getDaysSince(referenceDate, value) {
  if (!value) {
    return null;
  }

  return Math.floor((referenceDate.getTime() - new Date(value).getTime()) / (24 * 60 * 60 * 1000));
}

function computeCenterOperationalProfile({
  center,
  row = {},
  previousRow = null,
  referenceDate,
  rules = FRANCHISE_ALERT_RULES
}) {
  const activeStudents = Math.max(0, toNumber(row.activeStudents));
  const teacherCount = Math.max(0, toNumber(row.teacherCount));
  const attendancePercent = roundMetric(row.attendancePercent, 2);
  const retentionPercent = roundMetric(row.retentionPercent, 2);
  const monthlyRevenue = roundMetric(row.monthlyRevenue, 2);
  const pendingFees = roundMetric(row.pendingFees, 2);
  const studentGrowthPercent = roundMetric(row.studentGrowthPercent, 2);
  const worksheetAssignedCount = Math.max(0, toNumber(row.worksheetAssignedCount));
  const worksheetCompletedCount = Math.max(0, toNumber(row.worksheetCompletedCount));
  const worksheetCompletionRate = calculateWorksheetCompletionRate(worksheetAssignedCount, worksheetCompletedCount);
  const examParticipationCount = Math.max(0, toNumber(row.examParticipationCount));
  const examParticipationRate = activeStudents > 0 ? roundMetric((examParticipationCount / activeStudents) * 100, 2) : 0;
  const teacherAvailabilityPercent = roundMetric(
    normalizeTeacherActivity({
      teacherCount,
      activeStudents
    }),
    2
  );
  const health = calculateCenterHealthScore({
    attendancePercent,
    retentionPercent,
    monthlyRevenue,
    pendingFees,
    studentGrowthPercent,
    teacherCount,
    activeStudents
  });
  const healthScore = roundMetric(row.healthScore ?? health.score, 2);
  const attendanceStabilityPercent = roundMetric(
    calculateAttendanceStability(attendancePercent, previousRow?.attendancePercent),
    2
  );
  const operationalTrendScore = roundMetric(
    calculateOperationalTrendScore(healthScore, previousRow?.healthScore, studentGrowthPercent),
    2
  );
  const lastActivityAt = row.lastActivityAt || null;
  const inactiveDays = getDaysSince(referenceDate, lastActivityAt);
  const isInactive = center?.status !== "ACTIVE"
    || !lastActivityAt
    || inactiveDays >= rules.inactiveCenterDays;
  const isWeakCenter = healthScore < rules.weakCenterHealthScore
    || attendancePercent < 70
    || teacherCount === 0
    || worksheetCompletionRate < 55;

  return {
    centerId: center.id,
    centerCode: center.code,
    centerName: center.displayName || center.name || center.code,
    centerDisplayName: center.displayName || center.name || center.code,
    centerStatus: center.status,
    hierarchyNodeId: center.authUser?.hierarchyNodeId || null,
    activeStudents,
    teacherCount,
    attendancePercent,
    attendanceStabilityPercent,
    retentionPercent,
    monthlyRevenue,
    pendingFees,
    teacherAvailabilityPercent,
    worksheetAssignedCount,
    worksheetCompletedCount,
    worksheetCompletionRate,
    examParticipationCount,
    examParticipationRate,
    studentGrowthPercent,
    healthScore,
    operationalTrendScore,
    lastActivityAt,
    inactiveDays,
    isInactive,
    isWeakCenter,
    riskLevel: healthScore < 45 || isInactive
      ? "CRITICAL"
      : isWeakCenter || operationalTrendScore < 45
        ? "HIGH"
        : healthScore < 75
          ? "WARNING"
          : "NORMAL"
  };
}

function buildTeacherOperationalItem({ teacher, metrics = {}, centerByNodeId = new Map(), referenceDate, rules = FRANCHISE_ALERT_RULES }) {
  const center = centerByNodeId.get(teacher.hierarchyNodeId) || null;
  const activeStudents = Math.max(0, toNumber(metrics.activeStudents));
  const activeBatches = Math.max(0, toNumber(metrics.activeBatches));
  const reviewedSubmissions = Math.max(0, toNumber(metrics.reviewedSubmissions));
  const assignedWorksheets = Math.max(0, toNumber(metrics.assignedWorksheets));
  const attendanceEntries = Math.max(0, toNumber(metrics.attendanceEntries));
  const presentEntries = Math.max(0, toNumber(metrics.presentEntries));
  const attendanceCompliancePercent = attendanceEntries > 0
    ? roundMetric((presentEntries / attendanceEntries) * 100, 2)
    : 0;
  const worksheetReviewRate = assignedWorksheets > 0
    ? roundMetric((reviewedSubmissions / assignedWorksheets) * 100, 2)
    : 0;
  const lastActivityAt = metrics.lastActivityAt || null;
  const inactiveDays = getDaysSince(referenceDate, lastActivityAt);
  const isInactive = !lastActivityAt || inactiveDays >= rules.teacherInactiveDays;
  const workloadIndex = roundMetric(activeStudents + activeBatches * 5, 2);
  const operationalScore = roundMetric(
    (attendanceCompliancePercent * 0.35)
      + (worksheetReviewRate * 0.35)
      + (normalizeTeacherActivity({ teacherCount: 1, activeStudents }) * 0.3),
    2
  );

  return {
    teacherUserId: teacher.authUserId,
    teacherProfileId: teacher.id,
    teacherName: teacher.fullName,
    teacherUsername: teacher.authUser?.username || null,
    teacherEmail: teacher.authUser?.email || null,
    centerId: center?.id || null,
    centerCode: center?.code || null,
    centerName: center?.displayName || center?.name || center?.code || null,
    hierarchyNodeId: teacher.hierarchyNodeId,
    activeStudents,
    activeBatches,
    assignedWorksheets,
    reviewedSubmissions,
    worksheetReviewRate,
    attendanceCompliancePercent,
    examParticipationCount: Math.max(0, toNumber(metrics.examParticipationCount)),
    workloadIndex,
    operationalScore,
    lastActivityAt,
    inactiveDays,
    isInactive,
    status: isInactive ? "INACTIVE" : operationalScore < 55 ? "AT_RISK" : "ACTIVE"
  };
}

function buildAnomalyFingerprint({ franchiseId, type, centerId = null, teacherUserId = null }) {
  return [
    "franchise",
    franchiseId || "none",
    "center",
    centerId || "none",
    "teacher",
    teacherUserId || "none",
    "rule",
    type
  ].join(":");
}

function detectFranchiseOperationalAnomalies({
  franchiseId,
  centerRows = [],
  teacherRows = [],
  rules = FRANCHISE_ALERT_RULES
}) {
  const anomalies = [];

  for (const center of centerRows) {
    if (center.isInactive) {
      anomalies.push({
        type: "INACTIVE_CENTER",
        severity: center.inactiveDays >= rules.inactiveCenterDays * 2 ? "CRITICAL" : "HIGH",
        title: `${center.centerName} is inactive`,
        message: center.lastActivityAt
          ? `${center.centerName} has not produced recent operational activity for ${center.inactiveDays} days.`
          : `${center.centerName} has no recent operational activity signal.`,
        centerId: center.centerId,
        centerName: center.centerName,
        observedValue: center.inactiveDays,
        threshold: rules.inactiveCenterDays,
        metricKey: "inactiveDays",
        fingerprint: buildAnomalyFingerprint({ franchiseId, type: "INACTIVE_CENTER", centerId: center.centerId })
      });
    }

    if (center.attendancePercent < rules.attendanceCollapseThreshold) {
      anomalies.push({
        type: "ATTENDANCE_COLLAPSE",
        severity: center.attendancePercent < 45 ? "CRITICAL" : "HIGH",
        title: `${center.centerName} attendance collapsed`,
        message: `${center.centerName} attendance is ${center.attendancePercent}% and below the operational floor.`,
        centerId: center.centerId,
        centerName: center.centerName,
        observedValue: center.attendancePercent,
        threshold: rules.attendanceCollapseThreshold,
        metricKey: "attendancePercent",
        fingerprint: buildAnomalyFingerprint({ franchiseId, type: "ATTENDANCE_COLLAPSE", centerId: center.centerId })
      });
    }

    if (
      center.worksheetAssignedCount >= rules.minimumWorksheetAssigned
      && center.worksheetCompletionRate < rules.worksheetBacklogThreshold
    ) {
      anomalies.push({
        type: "WORKSHEET_BACKLOG",
        severity: center.worksheetCompletionRate < 30 ? "CRITICAL" : "HIGH",
        title: `${center.centerName} worksheet completion is lagging`,
        message: `${center.centerName} worksheet completion is ${center.worksheetCompletionRate}% across recent assignments.`,
        centerId: center.centerId,
        centerName: center.centerName,
        observedValue: center.worksheetCompletionRate,
        threshold: rules.worksheetBacklogThreshold,
        metricKey: "worksheetCompletionRate",
        fingerprint: buildAnomalyFingerprint({ franchiseId, type: "WORKSHEET_BACKLOG", centerId: center.centerId })
      });
    }

    if (center.studentGrowthPercent < rules.growthDeclineThreshold) {
      anomalies.push({
        type: "CENTER_GROWTH_DECLINE",
        severity: center.studentGrowthPercent < -15 ? "HIGH" : "WARNING",
        title: `${center.centerName} growth is declining`,
        message: `${center.centerName} student growth is ${center.studentGrowthPercent}% and trending down.`,
        centerId: center.centerId,
        centerName: center.centerName,
        observedValue: center.studentGrowthPercent,
        threshold: rules.growthDeclineThreshold,
        metricKey: "studentGrowthPercent",
        fingerprint: buildAnomalyFingerprint({ franchiseId, type: "CENTER_GROWTH_DECLINE", centerId: center.centerId })
      });
    }

    if (center.healthScore < rules.operationalRiskThreshold || center.operationalTrendScore < 35) {
      anomalies.push({
        type: "CENTER_OPERATIONAL_RISK",
        severity: center.healthScore < 40 ? "CRITICAL" : "HIGH",
        title: `${center.centerName} is at operational risk`,
        message: `${center.centerName} health score is ${center.healthScore} with a trend score of ${center.operationalTrendScore}.`,
        centerId: center.centerId,
        centerName: center.centerName,
        observedValue: center.healthScore,
        threshold: rules.operationalRiskThreshold,
        metricKey: "healthScore",
        fingerprint: buildAnomalyFingerprint({ franchiseId, type: "CENTER_OPERATIONAL_RISK", centerId: center.centerId })
      });
    }
  }

  for (const teacher of teacherRows) {
    if (!teacher.isInactive) {
      continue;
    }

    anomalies.push({
      type: "TEACHER_INACTIVITY",
      severity: teacher.inactiveDays >= rules.teacherInactiveDays * 2 ? "HIGH" : "WARNING",
      title: `${teacher.teacherName} is inactive`,
      message: teacher.lastActivityAt
        ? `${teacher.teacherName} has not recorded recent operational activity for ${teacher.inactiveDays} days.`
        : `${teacher.teacherName} has no recent operational activity signal.`,
      centerId: teacher.centerId,
      centerName: teacher.centerName,
      teacherUserId: teacher.teacherUserId,
      teacherName: teacher.teacherName,
      observedValue: teacher.inactiveDays,
      threshold: rules.teacherInactiveDays,
      metricKey: "inactiveDays",
      fingerprint: buildAnomalyFingerprint({
        franchiseId,
        type: "TEACHER_INACTIVITY",
        centerId: teacher.centerId,
        teacherUserId: teacher.teacherUserId
      })
    });
  }

  return stableSortItems(anomalies, "severity", "desc", "title");
}

async function loadFranchiseCenters({ tenantId, franchiseId, tx = prisma }) {
  return tx.centerProfile.findMany({
    where: {
      tenantId,
      franchiseProfileId: franchiseId,
      status: { not: "ARCHIVED" }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      status: true,
      isActive: true,
      authUser: {
        select: {
          hierarchyNodeId: true
        }
      }
    }
  });
}

async function loadLatestSnapshotBundle({ tenantId, franchiseId, asOfDate, tx = prisma }) {
  const currentFranchiseSnapshot = await tx.franchiseAnalyticsSnapshot.findFirst({
    where: {
      tenantId,
      franchiseId,
      snapshotDate: {
        lte: asOfDate
      }
    },
    orderBy: [{ snapshotDate: "desc" }],
    select: {
      snapshotDate: true,
      studentCount: true,
      activeStudents: true,
      centerCount: true,
      teacherCount: true,
      monthlyCollections: true,
      pendingFees: true,
      attendancePercent: true,
      studentGrowthPercent: true,
      healthScore: true
    }
  });

  const previousFranchiseSnapshot = currentFranchiseSnapshot
    ? await tx.franchiseAnalyticsSnapshot.findFirst({
        where: {
          tenantId,
          franchiseId,
          snapshotDate: {
            lt: currentFranchiseSnapshot.snapshotDate
          }
        },
        orderBy: [{ snapshotDate: "desc" }],
        select: {
          snapshotDate: true,
          studentCount: true,
          activeStudents: true,
          centerCount: true,
          teacherCount: true,
          monthlyCollections: true,
          pendingFees: true,
          attendancePercent: true,
          studentGrowthPercent: true,
          healthScore: true
        }
      })
    : null;

  const currentSnapshotDate = currentFranchiseSnapshot?.snapshotDate
    || (
      await tx.centerAnalyticsSnapshot.findFirst({
        where: {
          tenantId,
          franchiseId,
          snapshotDate: {
            lte: asOfDate
          }
        },
        orderBy: [{ snapshotDate: "desc" }],
        select: {
          snapshotDate: true
        }
      })
    )?.snapshotDate
    || null;

  const previousSnapshotDate = currentSnapshotDate
    ? (
        await tx.centerAnalyticsSnapshot.findFirst({
          where: {
            tenantId,
            franchiseId,
            snapshotDate: {
              lt: currentSnapshotDate
            }
          },
          orderBy: [{ snapshotDate: "desc" }],
          select: {
            snapshotDate: true
          }
        })
      )?.snapshotDate || previousFranchiseSnapshot?.snapshotDate || null
    : null;

  const [currentCenterSnapshots, previousCenterSnapshots] = await Promise.all([
    currentSnapshotDate
      ? tx.centerAnalyticsSnapshot.findMany({
          where: {
            tenantId,
            franchiseId,
            snapshotDate: currentSnapshotDate
          },
          select: {
            centerId: true,
            snapshotDate: true,
            activeStudents: true,
            attendancePercent: true,
            monthlyRevenue: true,
            pendingFees: true,
            teacherCount: true,
            studentGrowthPercent: true,
            retentionPercent: true,
            healthScore: true
          }
        })
      : Promise.resolve([]),
    previousSnapshotDate
      ? tx.centerAnalyticsSnapshot.findMany({
          where: {
            tenantId,
            franchiseId,
            snapshotDate: previousSnapshotDate
          },
          select: {
            centerId: true,
            snapshotDate: true,
            activeStudents: true,
            attendancePercent: true,
            monthlyRevenue: true,
            pendingFees: true,
            teacherCount: true,
            studentGrowthPercent: true,
            retentionPercent: true,
            healthScore: true
          }
        })
      : Promise.resolve([])
  ]);

  return {
    currentFranchiseSnapshot,
    previousFranchiseSnapshot,
    currentSnapshotDate,
    previousSnapshotDate,
    currentCenterSnapshots,
    previousCenterSnapshots
  };
}

async function loadCenterActivityMetrics({ tenantId, centers, asOfDate, tx = prisma }) {
  const centerNodeIds = uniqueStrings(centers.map((center) => center.authUser?.hierarchyNodeId));
  if (!centerNodeIds.length) {
    return new Map();
  }

  const startDate = startOfUtcDay(asOfDate);
  const nextDay = addUtcDays(startDate, 1);
  const since30 = addUtcDays(nextDay, -30);
  const since90 = addUtcDays(nextDay, -90);
  const monthStart = startOfUtcMonth(asOfDate);

  const [
    activeStudents,
    totalStudents,
    previousActiveStudents,
    teacherCounts,
    attendanceRows,
    worksheetAssignments,
    worksheetSubmissions,
    examEntries,
    mockTestAttempts,
    revenueRows
  ] = await Promise.all([
    tx.student.groupBy({
      by: ["hierarchyNodeId"],
      where: {
        tenantId,
        hierarchyNodeId: { in: centerNodeIds },
        isActive: true
      },
      _count: { _all: true }
    }),
    tx.student.groupBy({
      by: ["hierarchyNodeId"],
      where: {
        tenantId,
        hierarchyNodeId: { in: centerNodeIds }
      },
      _count: { _all: true }
    }),
    tx.student.groupBy({
      by: ["hierarchyNodeId"],
      where: {
        tenantId,
        hierarchyNodeId: { in: centerNodeIds },
        isActive: true,
        createdAt: { lt: monthStart }
      },
      _count: { _all: true }
    }),
    tx.teacherProfile.groupBy({
      by: ["hierarchyNodeId"],
      where: {
        tenantId,
        hierarchyNodeId: { in: centerNodeIds },
        isActive: true,
        status: "ACTIVE"
      },
      _count: { _all: true }
    }),
    tx.attendanceEntry.findMany({
      where: {
        tenantId,
        session: {
          is: {
            hierarchyNodeId: { in: centerNodeIds },
            date: {
              gte: since30,
              lt: nextDay
            }
          }
        }
      },
      select: {
        status: true,
        session: {
          select: {
            hierarchyNodeId: true,
            date: true
          }
        }
      }
    }),
    tx.worksheetAssignment.findMany({
      where: {
        tenantId,
        isActive: true,
        assignedAt: {
          gte: since30,
          lt: nextDay
        },
        student: {
          is: {
            hierarchyNodeId: { in: centerNodeIds }
          }
        }
      },
      select: {
        assignedAt: true,
        student: {
          select: {
            hierarchyNodeId: true
          }
        }
      }
    }),
    tx.worksheetSubmission.findMany({
      where: {
        tenantId,
        submittedAt: {
          gte: since30,
          lt: nextDay
        },
        student: {
          is: {
            hierarchyNodeId: { in: centerNodeIds }
          }
        }
      },
      select: {
        status: true,
        score: true,
        submittedAt: true,
        student: {
          select: {
            hierarchyNodeId: true
          }
        }
      }
    }),
    tx.examEnrollmentEntry.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: since90,
          lt: nextDay
        },
        student: {
          is: {
            hierarchyNodeId: { in: centerNodeIds }
          }
        }
      },
      select: {
        createdAt: true,
        student: {
          select: {
            hierarchyNodeId: true
          }
        }
      }
    }),
    tx.mockTestAttempt.findMany({
      where: {
        tenantId,
        finalSubmittedAt: {
          gte: since30,
          lt: nextDay
        },
        student: {
          is: {
            hierarchyNodeId: { in: centerNodeIds }
          }
        }
      },
      select: {
        finalSubmittedAt: true,
        student: {
          select: {
            hierarchyNodeId: true
          }
        }
      }
    }),
    tx.financialTransaction.findMany({
      where: {
        tenantId,
        centerId: { in: centerNodeIds },
        createdAt: {
          gte: monthStart,
          lt: nextDay
        }
      },
      select: {
        centerId: true,
        grossAmount: true,
        createdAt: true
      }
    })
  ]);

  const activeStudentsByNode = mapCountRows(activeStudents);
  const totalStudentsByNode = mapCountRows(totalStudents);
  const previousActiveStudentsByNode = mapCountRows(previousActiveStudents);
  const teachersByNode = mapCountRows(teacherCounts);
  const metricsByNode = new Map();

  for (const nodeId of centerNodeIds) {
    metricsByNode.set(nodeId, {
      activeStudents: activeStudentsByNode.get(nodeId) || 0,
      totalStudents: totalStudentsByNode.get(nodeId) || 0,
      previousActiveStudents: previousActiveStudentsByNode.get(nodeId) || 0,
      teacherCount: teachersByNode.get(nodeId) || 0,
      attendancePresent: 0,
      attendanceEntries: 0,
      worksheetAssignedCount: 0,
      worksheetCompletedCount: 0,
      reviewedSubmissions: 0,
      examParticipationCount: 0,
      mockTestAttemptsCount: 0,
      monthlyRevenue: 0,
      lastActivityAt: null
    });
  }

  for (const row of attendanceRows) {
    const nodeId = row.session?.hierarchyNodeId;
    if (!nodeId || !metricsByNode.has(nodeId)) {
      continue;
    }

    const metrics = metricsByNode.get(nodeId);
    metrics.attendanceEntries += 1;
    if (PRESENT_ATTENDANCE_STATUSES.has(row.status)) {
      metrics.attendancePresent += 1;
    }
    if (!metrics.lastActivityAt || metrics.lastActivityAt < row.session?.date) {
      metrics.lastActivityAt = row.session?.date || metrics.lastActivityAt;
    }
  }

  for (const row of worksheetAssignments) {
    const nodeId = row.student?.hierarchyNodeId;
    if (!nodeId || !metricsByNode.has(nodeId)) {
      continue;
    }

    const metrics = metricsByNode.get(nodeId);
    metrics.worksheetAssignedCount += 1;
    if (!metrics.lastActivityAt || metrics.lastActivityAt < row.assignedAt) {
      metrics.lastActivityAt = row.assignedAt;
    }
  }

  for (const row of worksheetSubmissions) {
    const nodeId = row.student?.hierarchyNodeId;
    if (!nodeId || !metricsByNode.has(nodeId)) {
      continue;
    }

    const metrics = metricsByNode.get(nodeId);
    metrics.worksheetCompletedCount += 1;
    if (row.status === "REVIEWED") {
      metrics.reviewedSubmissions += 1;
    }
    if (!metrics.lastActivityAt || metrics.lastActivityAt < row.submittedAt) {
      metrics.lastActivityAt = row.submittedAt;
    }
  }

  for (const row of examEntries) {
    const nodeId = row.student?.hierarchyNodeId;
    if (!nodeId || !metricsByNode.has(nodeId)) {
      continue;
    }

    const metrics = metricsByNode.get(nodeId);
    metrics.examParticipationCount += 1;
    if (!metrics.lastActivityAt || metrics.lastActivityAt < row.createdAt) {
      metrics.lastActivityAt = row.createdAt;
    }
  }

  for (const row of mockTestAttempts) {
    const nodeId = row.student?.hierarchyNodeId;
    if (!nodeId || !metricsByNode.has(nodeId)) {
      continue;
    }

    const metrics = metricsByNode.get(nodeId);
    metrics.mockTestAttemptsCount += 1;
    if (!metrics.lastActivityAt || metrics.lastActivityAt < row.finalSubmittedAt) {
      metrics.lastActivityAt = row.finalSubmittedAt;
    }
  }

  for (const row of revenueRows) {
    const nodeId = row.centerId;
    if (!nodeId || !metricsByNode.has(nodeId)) {
      continue;
    }

    const metrics = metricsByNode.get(nodeId);
    metrics.monthlyRevenue = roundMetric(metrics.monthlyRevenue + toNumber(row.grossAmount), 2);
    if (!metrics.lastActivityAt || metrics.lastActivityAt < row.createdAt) {
      metrics.lastActivityAt = row.createdAt;
    }
  }

  return metricsByNode;
}

async function loadTeacherMetrics({ tenantId, centers, asOfDate, tx = prisma }) {
  const centerNodeIds = uniqueStrings(centers.map((center) => center.authUser?.hierarchyNodeId));
  if (!centerNodeIds.length) {
    return [];
  }

  const startDate = startOfUtcDay(asOfDate);
  const nextDay = addUtcDays(startDate, 1);
  const since30 = addUtcDays(nextDay, -30);
  const since90 = addUtcDays(nextDay, -90);

  const teachers = await tx.teacherProfile.findMany({
    where: {
      tenantId,
      hierarchyNodeId: { in: centerNodeIds },
      isActive: true
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      authUserId: true,
      fullName: true,
      status: true,
      hierarchyNodeId: true,
      authUser: {
        select: {
          username: true,
          email: true,
          isActive: true
        }
      }
    }
  });

  const teacherUserIds = uniqueStrings(teachers.map((teacher) => teacher.authUserId));
  if (!teacherUserIds.length) {
    return [];
  }

  const [activeStudents, enrollments, attendanceRows, worksheetAssignments, worksheetSubmissions, examEntries] = await Promise.all([
    tx.student.groupBy({
      by: ["currentTeacherUserId"],
      where: {
        tenantId,
        currentTeacherUserId: { in: teacherUserIds },
        isActive: true
      },
      _count: { _all: true }
    }),
    tx.enrollment.findMany({
      where: {
        tenantId,
        assignedTeacherUserId: { in: teacherUserIds },
        status: "ACTIVE"
      },
      select: {
        assignedTeacherUserId: true,
        batchId: true
      }
    }),
    tx.attendanceEntry.findMany({
      where: {
        tenantId,
        session: {
          is: {
            date: {
              gte: since30,
              lt: nextDay
            }
          }
        },
        student: {
          is: {
            currentTeacherUserId: { in: teacherUserIds }
          }
        }
      },
      select: {
        status: true,
        session: {
          select: {
            date: true
          }
        },
        student: {
          select: {
            currentTeacherUserId: true
          }
        }
      }
    }),
    tx.worksheetAssignment.findMany({
      where: {
        tenantId,
        isActive: true,
        assignedAt: {
          gte: since30,
          lt: nextDay
        },
        student: {
          is: {
            currentTeacherUserId: { in: teacherUserIds }
          }
        }
      },
      select: {
        assignedAt: true,
        student: {
          select: {
            currentTeacherUserId: true
          }
        }
      }
    }),
    tx.worksheetSubmission.findMany({
      where: {
        tenantId,
        submittedAt: {
          gte: since30,
          lt: nextDay
        },
        student: {
          is: {
            currentTeacherUserId: { in: teacherUserIds }
          }
        }
      },
      select: {
        status: true,
        submittedAt: true,
        student: {
          select: {
            currentTeacherUserId: true
          }
        }
      }
    }),
    tx.examEnrollmentEntry.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: since90,
          lt: nextDay
        },
        student: {
          is: {
            currentTeacherUserId: { in: teacherUserIds }
          }
        }
      },
      select: {
        createdAt: true,
        student: {
          select: {
            currentTeacherUserId: true
          }
        }
      }
    })
  ]);

  const activeStudentsByTeacher = new Map(activeStudents.map((row) => [row.currentTeacherUserId, Number(row?._count?._all || 0)]));
  const metricsByTeacher = new Map();

  for (const teacher of teachers) {
    metricsByTeacher.set(teacher.authUserId, {
      activeStudents: activeStudentsByTeacher.get(teacher.authUserId) || 0,
      activeBatches: 0,
      attendanceEntries: 0,
      presentEntries: 0,
      assignedWorksheets: 0,
      reviewedSubmissions: 0,
      examParticipationCount: 0,
      lastActivityAt: null
    });
  }

  const batchesByTeacher = new Map();
  for (const row of enrollments) {
    const teacherUserId = row.assignedTeacherUserId;
    if (!teacherUserId || !metricsByTeacher.has(teacherUserId)) {
      continue;
    }

    const batchSet = batchesByTeacher.get(teacherUserId) || new Set();
    batchSet.add(row.batchId);
    batchesByTeacher.set(teacherUserId, batchSet);
  }

  for (const [teacherUserId, batchSet] of batchesByTeacher.entries()) {
    metricsByTeacher.get(teacherUserId).activeBatches = batchSet.size;
  }

  for (const row of attendanceRows) {
    const teacherUserId = row.student?.currentTeacherUserId;
    if (!teacherUserId || !metricsByTeacher.has(teacherUserId)) {
      continue;
    }

    const metrics = metricsByTeacher.get(teacherUserId);
    metrics.attendanceEntries += 1;
    if (PRESENT_ATTENDANCE_STATUSES.has(row.status)) {
      metrics.presentEntries += 1;
    }
    if (!metrics.lastActivityAt || metrics.lastActivityAt < row.session?.date) {
      metrics.lastActivityAt = row.session?.date || metrics.lastActivityAt;
    }
  }

  for (const row of worksheetAssignments) {
    const teacherUserId = row.student?.currentTeacherUserId;
    if (!teacherUserId || !metricsByTeacher.has(teacherUserId)) {
      continue;
    }

    const metrics = metricsByTeacher.get(teacherUserId);
    metrics.assignedWorksheets += 1;
    if (!metrics.lastActivityAt || metrics.lastActivityAt < row.assignedAt) {
      metrics.lastActivityAt = row.assignedAt;
    }
  }

  for (const row of worksheetSubmissions) {
    const teacherUserId = row.student?.currentTeacherUserId;
    if (!teacherUserId || !metricsByTeacher.has(teacherUserId)) {
      continue;
    }

    const metrics = metricsByTeacher.get(teacherUserId);
    if (row.status === "REVIEWED") {
      metrics.reviewedSubmissions += 1;
    }
    if (!metrics.lastActivityAt || metrics.lastActivityAt < row.submittedAt) {
      metrics.lastActivityAt = row.submittedAt;
    }
  }

  for (const row of examEntries) {
    const teacherUserId = row.student?.currentTeacherUserId;
    if (!teacherUserId || !metricsByTeacher.has(teacherUserId)) {
      continue;
    }

    const metrics = metricsByTeacher.get(teacherUserId);
    metrics.examParticipationCount += 1;
    if (!metrics.lastActivityAt || metrics.lastActivityAt < row.createdAt) {
      metrics.lastActivityAt = row.createdAt;
    }
  }

  return teachers.map((teacher) => ({
    teacher,
    metrics: metricsByTeacher.get(teacher.authUserId) || {}
  }));
}

async function loadMonthlyOperationalSignals({ tenantId, centers, windows, tx = prisma }) {
  const centerNodeIds = uniqueStrings(centers.map((center) => center.authUser?.hierarchyNodeId));
  if (!centerNodeIds.length || !windows.length) {
    return {
      worksheetAssignments: [],
      worksheetSubmissions: [],
      examEntries: []
    };
  }

  const firstWindow = windows[0];
  const lastWindow = windows[windows.length - 1];

  const [worksheetAssignments, worksheetSubmissions, examEntries] = await Promise.all([
    tx.worksheetAssignment.findMany({
      where: {
        tenantId,
        assignedAt: {
          gte: firstWindow.start,
          lt: lastWindow.end
        },
        isActive: true,
        student: {
          is: {
            hierarchyNodeId: { in: centerNodeIds }
          }
        }
      },
      select: {
        assignedAt: true
      }
    }),
    tx.worksheetSubmission.findMany({
      where: {
        tenantId,
        submittedAt: {
          gte: firstWindow.start,
          lt: lastWindow.end
        },
        student: {
          is: {
            hierarchyNodeId: { in: centerNodeIds }
          }
        }
      },
      select: {
        submittedAt: true
      }
    }),
    tx.examEnrollmentEntry.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: firstWindow.start,
          lt: lastWindow.end
        },
        student: {
          is: {
            hierarchyNodeId: { in: centerNodeIds }
          }
        }
      },
      select: {
        createdAt: true
      }
    })
  ]);

  return {
    worksheetAssignments,
    worksheetSubmissions,
    examEntries
  };
}

async function resolveFranchiseOperationalContext({
  tenantId,
  franchiseScope,
  asOf,
  tx = prisma
}) {
  if (!tenantId || !franchiseScope?.franchise?.id) {
    throw new Error("tenantId and franchiseScope are required for franchise analytics");
  }

  const asOfDate = normalizeAsOfDate(asOf);
  const franchise = franchiseScope.franchise;
  const centers = await loadFranchiseCenters({ tenantId, franchiseId: franchise.id, tx });
  const snapshotBundle = await loadLatestSnapshotBundle({
    tenantId,
    franchiseId: franchise.id,
    asOfDate,
    tx
  });
  const activityByNode = await loadCenterActivityMetrics({ tenantId, centers, asOfDate, tx });
  const teacherMetrics = await loadTeacherMetrics({ tenantId, centers, asOfDate, tx });
  const currentCenterSnapshotsById = new Map(
    snapshotBundle.currentCenterSnapshots.map((row) => [row.centerId, row])
  );
  const previousCenterSnapshotsById = new Map(
    snapshotBundle.previousCenterSnapshots.map((row) => [row.centerId, row])
  );

  const centerRows = centers.map((center) => {
    const nodeId = center.authUser?.hierarchyNodeId;
    const snapshotRow = currentCenterSnapshotsById.get(center.id);
    const activity = nodeId ? activityByNode.get(nodeId) : null;
    const previousSnapshot = previousCenterSnapshotsById.get(center.id) || null;
    const merged = {
      activeStudents: snapshotRow?.activeStudents ?? activity?.activeStudents ?? 0,
      attendancePercent: snapshotRow?.attendancePercent
        ?? (activity?.attendanceEntries ? (activity.attendancePresent / activity.attendanceEntries) * 100 : 0),
      monthlyRevenue: snapshotRow?.monthlyRevenue ?? activity?.monthlyRevenue ?? 0,
      pendingFees: snapshotRow?.pendingFees ?? 0,
      teacherCount: snapshotRow?.teacherCount ?? activity?.teacherCount ?? 0,
      studentGrowthPercent: snapshotRow?.studentGrowthPercent
        ?? calculateDeltaPercent(activity?.activeStudents ?? 0, activity?.previousActiveStudents ?? 0),
      retentionPercent: snapshotRow?.retentionPercent
        ?? ((activity?.totalStudents ?? 0) > 0 ? ((activity.activeStudents || 0) / activity.totalStudents) * 100 : 0),
      healthScore: snapshotRow?.healthScore,
      worksheetAssignedCount: activity?.worksheetAssignedCount ?? 0,
      worksheetCompletedCount: activity?.worksheetCompletedCount ?? 0,
      reviewedSubmissions: activity?.reviewedSubmissions ?? 0,
      examParticipationCount: activity?.examParticipationCount ?? 0,
      lastActivityAt: activity?.lastActivityAt ?? null
    };

    return computeCenterOperationalProfile({
      center,
      row: merged,
      previousRow: previousSnapshot,
      referenceDate: asOfDate
    });
  });

  const centerByNodeId = new Map(
    centers
      .filter((center) => center.authUser?.hierarchyNodeId)
      .map((center) => [center.authUser.hierarchyNodeId, center])
  );
  const teacherRows = teacherMetrics.map(({ teacher, metrics }) =>
    buildTeacherOperationalItem({
      teacher,
      metrics,
      centerByNodeId,
      referenceDate: asOfDate
    })
  );

  const currentFranchiseSnapshot = snapshotBundle.currentFranchiseSnapshot || {
    snapshotDate: snapshotBundle.currentSnapshotDate,
    studentCount: centerRows.reduce((sum, row) => sum + row.activeStudents, 0),
    activeStudents: centerRows.reduce((sum, row) => sum + row.activeStudents, 0),
    centerCount: centerRows.filter((row) => ACTIVE_CENTER_STATUSES.has(row.centerStatus)).length,
    teacherCount: centerRows.reduce((sum, row) => sum + row.teacherCount, 0),
    monthlyCollections: centerRows.reduce((sum, row) => sum + row.monthlyRevenue, 0),
    pendingFees: centerRows.reduce((sum, row) => sum + row.pendingFees, 0),
    attendancePercent: weightedAverage(centerRows.map((row) => ({ value: row.attendancePercent, weight: Math.max(row.activeStudents, 1) }))),
    studentGrowthPercent: weightedAverage(centerRows.map((row) => ({ value: row.studentGrowthPercent, weight: Math.max(row.activeStudents, 1) }))),
    healthScore: weightedAverage(centerRows.map((row) => ({ value: row.healthScore, weight: Math.max(row.activeStudents, 1) })))
  };

  return {
    tenantId,
    asOfDate,
    franchiseScope,
    franchise,
    centers,
    centerRows,
    teacherRows,
    currentFranchiseSnapshot,
    previousFranchiseSnapshot: snapshotBundle.previousFranchiseSnapshot,
    currentSnapshotDate: snapshotBundle.currentSnapshotDate,
    previousSnapshotDate: snapshotBundle.previousSnapshotDate,
    source: {
      mode: snapshotBundle.currentSnapshotDate ? "snapshot" : "live",
      snapshotDate: serializeDate(snapshotBundle.currentSnapshotDate),
      liveFallback: !snapshotBundle.currentSnapshotDate || !snapshotBundle.currentFranchiseSnapshot
    }
  };
}

function buildFranchiseOperationalOverview(context) {
  const anomalies = detectFranchiseOperationalAnomalies({
    franchiseId: context.franchise.id,
    centerRows: context.centerRows,
    teacherRows: context.teacherRows
  });
  const activeCenters = context.centerRows.filter((row) => ACTIVE_CENTER_STATUSES.has(row.centerStatus));
  const centersWithTeachers = activeCenters.filter((row) => row.teacherCount > 0);
  const totalWorksheetAssigned = context.centerRows.reduce((sum, row) => sum + row.worksheetAssignedCount, 0);
  const totalWorksheetCompleted = context.centerRows.reduce((sum, row) => sum + row.worksheetCompletedCount, 0);
  const totalExamParticipants = context.centerRows.reduce((sum, row) => sum + row.examParticipationCount, 0);
  const totalActiveStudents = Math.max(0, toNumber(context.currentFranchiseSnapshot.activeStudents));

  return {
    franchiseId: context.franchise.id,
    businessPartnerId: context.franchise.businessPartnerId,
    operationalOverview: {
      activeCenters: activeCenters.length,
      weakCenters: context.centerRows.filter((row) => row.isWeakCenter).length,
      inactiveCenters: context.centerRows.filter((row) => row.isInactive).length,
      activeStudents: totalActiveStudents,
      totalStudents: Math.max(totalActiveStudents, toNumber(context.currentFranchiseSnapshot.studentCount)),
      teachers: context.teacherRows.length,
      teacherCoveragePercent: activeCenters.length
        ? roundMetric((centersWithTeachers.length / activeCenters.length) * 100, 2)
        : 0,
      attendanceHealthPercent: roundMetric(context.currentFranchiseSnapshot.attendancePercent, 2),
      worksheetCompletionPercent: calculateWorksheetCompletionRate(totalWorksheetAssigned, totalWorksheetCompleted),
      examParticipationPercent: totalActiveStudents > 0
        ? roundMetric((totalExamParticipants / totalActiveStudents) * 100, 2)
        : 0,
      studentGrowthPercent: roundMetric(context.currentFranchiseSnapshot.studentGrowthPercent, 2),
      healthScore: roundMetric(context.currentFranchiseSnapshot.healthScore, 2),
      operationalAnomalyCount: anomalies.length,
      highSeverityAnomalyCount: anomalies.filter((item) => ["HIGH", "CRITICAL"].includes(item.severity)).length
    },
    highlights: {
      weakCenterIds: context.centerRows.filter((row) => row.isWeakCenter).map((row) => row.centerId),
      inactiveCenterIds: context.centerRows.filter((row) => row.isInactive).map((row) => row.centerId),
      inactiveTeacherUserIds: context.teacherRows.filter((row) => row.isInactive).map((row) => row.teacherUserId)
    },
    anomalyPreview: anomalies.slice(0, 10),
    meta: buildMeta({
      franchiseScope: context.franchiseScope,
      asOfDate: context.asOfDate,
      source: context.source,
      filters: {}
    })
  };
}

async function getFranchiseOverviewAnalytics({ tenantId, franchiseScope, query = {}, tx = prisma } = {}) {
  const context = await resolveFranchiseOperationalContext({
    tenantId,
    franchiseScope,
    asOf: query.asOf,
    tx
  });

  return buildFranchiseOperationalOverview(context);
}

async function getFranchiseCenterHealthAnalytics({ tenantId, franchiseScope, query = {}, tx = prisma } = {}) {
  const context = await resolveFranchiseOperationalContext({
    tenantId,
    franchiseScope,
    asOf: query.asOf,
    tx
  });
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);
  const sortDirection = normalizeSortDirection(query.sortDirection);
  const sortBy = new Set([
    "healthScore",
    "attendancePercent",
    "studentGrowthPercent",
    "teacherCount",
    "monthlyRevenue",
    "operationalTrendScore",
    "worksheetCompletionRate",
    "centerName"
  ]).has(String(query.sortBy || "").trim()) ? String(query.sortBy).trim() : "healthScore";
  const search = normalizeSearch(query.search || query.q);
  const weakOnly = String(query.weakOnly || "false").trim().toLowerCase() === "true";
  const inactiveOnly = String(query.inactiveOnly || "false").trim().toLowerCase() === "true";
  const statusFilter = String(query.status || "").trim().toUpperCase() || null;

  let items = context.centerRows.filter((row) => matchesSearch(row, search));
  if (weakOnly) {
    items = items.filter((row) => row.isWeakCenter);
  }
  if (inactiveOnly) {
    items = items.filter((row) => row.isInactive);
  }
  if (statusFilter) {
    items = items.filter((row) => String(row.centerStatus || "").toUpperCase() === statusFilter);
  }

  const paginated = paginateItems(
    stableSortItems(items, sortBy, sortDirection, sortBy === "centerName" ? "centerCode" : "centerName"),
    { limit, offset }
  );

  return {
    ...paginated,
    meta: buildMeta({
      franchiseScope,
      asOfDate: context.asOfDate,
      source: context.source,
      filters: {
        weakOnly,
        inactiveOnly,
        status: statusFilter,
        search,
        sortBy,
        sortDirection
      }
    })
  };
}

async function getFranchiseTeacherOperationalAnalytics({ tenantId, franchiseScope, query = {}, tx = prisma } = {}) {
  const context = await resolveFranchiseOperationalContext({
    tenantId,
    franchiseScope,
    asOf: query.asOf,
    tx
  });
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);
  const sortDirection = normalizeSortDirection(query.sortDirection);
  const sortBy = new Set([
    "operationalScore",
    "attendanceCompliancePercent",
    "worksheetReviewRate",
    "activeStudents",
    "inactiveDays",
    "teacherName"
  ]).has(String(query.sortBy || "").trim()) ? String(query.sortBy).trim() : "operationalScore";
  const search = normalizeSearch(query.search || query.q);
  const inactiveOnly = String(query.inactiveOnly || "false").trim().toLowerCase() === "true";
  const centerId = String(query.centerId || "").trim() || null;

  let items = context.teacherRows.filter((row) => matchesSearch(row, search));
  if (inactiveOnly) {
    items = items.filter((row) => row.isInactive);
  }
  if (centerId) {
    items = items.filter((row) => row.centerId === centerId);
  }

  const paginated = paginateItems(
    stableSortItems(items, sortBy, sortDirection, sortBy === "teacherName" ? "teacherEmail" : "teacherName"),
    { limit, offset }
  );

  return {
    ...paginated,
    summary: {
      totalTeachers: context.teacherRows.length,
      inactiveTeachers: context.teacherRows.filter((row) => row.isInactive).length,
      averageOperationalScore: averageMetric(context.teacherRows.map((row) => row.operationalScore)),
      averageAttendanceCompliancePercent: averageMetric(context.teacherRows.map((row) => row.attendanceCompliancePercent))
    },
    meta: buildMeta({
      franchiseScope,
      asOfDate: context.asOfDate,
      source: context.source,
      filters: {
        search,
        inactiveOnly,
        centerId,
        sortBy,
        sortDirection
      }
    })
  };
}

function averageMetric(values = []) {
  const normalized = values.map((value) => toNumber(value));
  if (!normalized.length) {
    return 0;
  }

  return roundMetric(normalized.reduce((sum, value) => sum + value, 0) / normalized.length, 2);
}

async function getFranchiseOperationalAnomaliesAnalytics({ tenantId, franchiseScope, query = {}, tx = prisma } = {}) {
  const context = await resolveFranchiseOperationalContext({
    tenantId,
    franchiseScope,
    asOf: query.asOf,
    tx
  });
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);
  const sortDirection = normalizeSortDirection(query.sortDirection);
  const sortBy = new Set(["severity", "observedValue", "title", "type"]).has(String(query.sortBy || "").trim())
    ? String(query.sortBy).trim()
    : "severity";
  const search = normalizeSearch(query.search || query.q);
  const typeFilter = String(query.type || "").trim().toUpperCase() || null;
  const severityFilter = String(query.severity || "").trim().toUpperCase() || null;

  let items = detectFranchiseOperationalAnomalies({
    franchiseId: context.franchise.id,
    centerRows: context.centerRows,
    teacherRows: context.teacherRows
  }).filter((row) => matchesSearch(row, search));

  if (typeFilter) {
    items = items.filter((row) => row.type === typeFilter);
  }
  if (severityFilter) {
    items = items.filter((row) => row.severity === severityFilter);
  }

  const paginated = paginateItems(stableSortItems(items, sortBy, sortDirection, "title"), { limit, offset });

  return {
    ...paginated,
    summary: {
      totalAnomalies: items.length,
      critical: items.filter((row) => row.severity === "CRITICAL").length,
      high: items.filter((row) => row.severity === "HIGH").length,
      warning: items.filter((row) => row.severity === "WARNING").length
    },
    meta: buildMeta({
      franchiseScope,
      asOfDate: context.asOfDate,
      source: context.source,
      filters: {
        search,
        type: typeFilter,
        severity: severityFilter,
        sortBy,
        sortDirection
      }
    })
  };
}

async function getFranchiseOperationalTrendsAnalytics({ tenantId, franchiseScope, query = {}, tx = prisma } = {}) {
  const months = normalizeMonths(query.months);
  const asOfDate = normalizeAsOfDate(query.asOf);
  const context = await resolveFranchiseOperationalContext({
    tenantId,
    franchiseScope,
    asOf: asOfDate,
    tx
  });
  const windows = buildMonthWindows(months, asOfDate);
  const snapshotRows = await tx.franchiseAnalyticsSnapshot.findMany({
    where: {
      tenantId,
      franchiseId: franchiseScope.franchise.id,
      snapshotDate: {
        gte: windows[0]?.start,
        lt: windows[windows.length - 1]?.end
      }
    },
    orderBy: [{ snapshotDate: "asc" }],
    select: {
      snapshotDate: true,
      attendancePercent: true,
      healthScore: true,
      studentGrowthPercent: true,
      monthlyCollections: true,
      activeStudents: true
    }
  });
  const latestSnapshotByMonth = mapLatestRows(snapshotRows, "snapshotDate");
  const monthlySignals = await loadMonthlyOperationalSignals({
    tenantId,
    centers: context.centers,
    windows,
    tx
  });

  const assignmentCountsByMonth = new Map();
  for (const row of monthlySignals.worksheetAssignments) {
    const key = getMonthKey(startOfUtcMonth(row.assignedAt));
    assignmentCountsByMonth.set(key, (assignmentCountsByMonth.get(key) || 0) + 1);
  }

  const submissionCountsByMonth = new Map();
  for (const row of monthlySignals.worksheetSubmissions) {
    const key = getMonthKey(startOfUtcMonth(row.submittedAt));
    submissionCountsByMonth.set(key, (submissionCountsByMonth.get(key) || 0) + 1);
  }

  const examCountsByMonth = new Map();
  for (const row of monthlySignals.examEntries) {
    const key = getMonthKey(startOfUtcMonth(row.createdAt));
    examCountsByMonth.set(key, (examCountsByMonth.get(key) || 0) + 1);
  }

  const items = windows.map((window) => {
    const snapshot = Array.from(latestSnapshotByMonth.values()).find(
      (row) => getMonthKey(new Date(row.snapshotDate)) === window.key
    );
    const assignedCount = assignmentCountsByMonth.get(window.key) || 0;
    const completedCount = submissionCountsByMonth.get(window.key) || 0;

    return {
      key: window.key,
      label: window.label,
      attendancePercent: roundMetric(snapshot?.attendancePercent, 2),
      healthScore: roundMetric(snapshot?.healthScore, 2),
      studentGrowthPercent: roundMetric(snapshot?.studentGrowthPercent, 2),
      monthlyCollections: roundMetric(snapshot?.monthlyCollections, 2),
      activeStudents: Math.max(0, toNumber(snapshot?.activeStudents)),
      worksheetAssignedCount: assignedCount,
      worksheetCompletedCount: completedCount,
      worksheetCompletionRate: calculateWorksheetCompletionRate(assignedCount, completedCount),
      examParticipationCount: examCountsByMonth.get(window.key) || 0
    };
  });

  return {
    items,
    meta: buildMeta({
      franchiseScope,
      asOfDate,
      range: {
        from: serializeDate(windows[0]?.start || null),
        to: serializeDate(windows[windows.length - 1]?.end || null),
        months
      },
      source: {
        ...context.source,
        trendSource: "franchise_snapshot_plus_live_ops"
      },
      filters: { months }
    })
  };
}

export {
  FRANCHISE_ALERT_RULES,
  buildTeacherOperationalItem,
  buildFranchiseOperationalOverview,
  computeCenterOperationalProfile,
  detectFranchiseOperationalAnomalies,
  getFranchiseCenterHealthAnalytics,
  getFranchiseOperationalAnomaliesAnalytics,
  getFranchiseOperationalTrendsAnalytics,
  getFranchiseOverviewAnalytics,
  getFranchiseTeacherOperationalAnalytics,
  resolveFranchiseOperationalContext
};