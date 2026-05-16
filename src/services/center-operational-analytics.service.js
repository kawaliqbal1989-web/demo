import { prisma } from "../lib/prisma.js";
import { aggregateCenterSnapshotRows } from "./analytics-snapshot.service.js";
import { calculateDeltaPercent, roundMetric, toNumber } from "./bp-kpi.service.js";
import {
  calculateCenterHealthScore,
  clampScore,
  normalizeTeacherActivity,
  roundScore
} from "./health-score.service.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_MONTHS = 6;
const MAX_MONTHS = 12;
const DEFAULT_SORT_DIRECTION = "desc";
const ATTENDANCE_LOOKBACK_DAYS = 30;
const ATTENDANCE_TREND_WINDOW_DAYS = 14;
const WORKSHEET_REVIEW_DELAY_DAYS = 5;
const WORKSHEET_BACKLOG_DAYS = 10;
const TEACHER_INACTIVE_DAYS = 14;
const BATCH_INACTIVE_DAYS = 14;
const EXAM_LOOKBACK_DAYS = 90;
const ACTIVE_BATCH_STATUSES = new Set(["ACTIVE"]);
const ATTENDED_STATUSES = new Set(["PRESENT", "LATE", "EXCUSED"]);
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const severityRank = Object.freeze({ CRITICAL: 4, HIGH: 3, WARNING: 2, INFO: 1 });

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function serializeDate(value) {
  return value instanceof Date ? value.toISOString() : value ? new Date(value).toISOString() : null;
}

function normalizeDate(value, fallback = new Date()) {
  if (!value) {
    return fallback;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function startOfUtcDay(value = new Date()) {
  const normalized = normalizeDate(value);
  return new Date(Date.UTC(normalized.getUTCFullYear(), normalized.getUTCMonth(), normalized.getUTCDate(), 0, 0, 0, 0));
}

function startOfUtcMonth(value = new Date()) {
  const normalized = normalizeDate(value);
  return new Date(Date.UTC(normalized.getUTCFullYear(), normalized.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addUtcDays(value, days) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function addUtcMonths(value, months) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1, 0, 0, 0, 0));
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

function normalizeMonths(value) {
  const parsed = Number.parseInt(String(value ?? DEFAULT_MONTHS), 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_MONTHS;
  }

  return Math.max(1, Math.min(MAX_MONTHS, parsed));
}

function normalizeSortDirection(value) {
  return String(value || DEFAULT_SORT_DIRECTION).trim().toLowerCase() === "asc" ? "asc" : "desc";
}

function normalizeSearch(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.length ? normalized : null;
}

function uniqueStrings(values = []) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0)));
}

function keyBy(items = [], selector) {
  return new Map(items.map((item) => [selector(item), item]));
}

function getMonthKey(value) {
  return normalizeDate(value).toISOString().slice(0, 7);
}

function formatMonthLabel(value) {
  const normalized = normalizeDate(value);
  return `${monthLabels[normalized.getUTCMonth()]} ${normalized.getUTCFullYear()}`;
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

function matchesSearch(values, search) {
  if (!search) {
    return true;
  }

  return values.some((value) => String(value || "").toLowerCase().includes(search));
}

function paginateItems(items, { limit, offset }) {
  return {
    total: items.length,
    limit,
    offset,
    returned: Math.max(0, Math.min(limit, Math.max(0, items.length - offset))),
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

    const fallback = String(left?.[fallbackKey] || left?.title || left?.id || "").localeCompare(
      String(right?.[fallbackKey] || right?.title || right?.id || "")
    );
    if (fallback !== 0) {
      return fallback;
    }

    return String(left?.id || "").localeCompare(String(right?.id || ""));
  });
}

function getDaysSince(referenceDate, value) {
  if (!value) {
    return null;
  }

  return Math.max(0, Math.floor((referenceDate.getTime() - normalizeDate(value).getTime()) / (24 * 60 * 60 * 1000)));
}

function average(values = []) {
  if (!values.length) {
    return 0;
  }

  return roundScore(values.reduce((sum, value) => sum + toNumber(value), 0) / values.length, 2);
}

function normalizeCountRate(count, total, fallback = 0) {
  const normalizedTotal = Math.max(0, toNumber(total));
  if (normalizedTotal <= 0) {
    return fallback;
  }

  return roundScore((Math.max(0, toNumber(count)) / normalizedTotal) * 100, 2);
}

function formatCenterName(center) {
  return center?.displayName || center?.name || center?.code || "Center";
}

function buildScopeMeta(centerScope) {
  return {
    businessPartnerId: centerScope?.center?.businessPartnerId || null,
    franchiseId: centerScope?.center?.franchiseId || null,
    centerId: centerScope?.center?.id || null,
    hierarchyNodeId: centerScope?.center?.hierarchyNodeId || null
  };
}

function snapshotRowToObject(row) {
  if (!row) {
    return null;
  }

  return {
    snapshotDate: serializeDate(row.snapshotDate),
    activeStudents: Math.max(0, toNumber(row.activeStudents)),
    attendancePercent: roundScore(row.attendancePercent),
    monthlyRevenue: roundMetric(row.monthlyRevenue, 2),
    pendingFees: roundMetric(row.pendingFees, 2),
    teacherCount: Math.max(0, toNumber(row.teacherCount)),
    studentGrowthPercent: roundScore(row.studentGrowthPercent),
    retentionPercent: roundScore(row.retentionPercent),
    healthScore: roundScore(row.healthScore)
  };
}

async function resolveCenterOperationalScope({ tenantId, authUserId, hierarchyNodeId, tx = prisma } = {}) {
  if (!tenantId || !authUserId) {
    throw createHttpError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const center = await tx.centerProfile.findFirst({
    where: {
      tenantId,
      authUserId,
      isActive: true,
      status: { not: "ARCHIVED" }
    },
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      authUserId: true,
      franchiseProfileId: true,
      authUser: {
        select: {
          id: true,
          hierarchyNodeId: true,
          username: true,
          email: true
        }
      },
      franchiseProfile: {
        select: {
          id: true,
          businessPartnerId: true
        }
      }
    }
  });

  if (!center?.authUser?.hierarchyNodeId) {
    throw createHttpError(404, "Center not found", "CENTER_NOT_FOUND");
  }

  if (hierarchyNodeId && hierarchyNodeId !== center.authUser.hierarchyNodeId) {
    throw createHttpError(404, "Center not found", "CENTER_NOT_FOUND");
  }

  return {
    tenantId,
    center: {
      id: center.id,
      code: center.code,
      name: formatCenterName(center),
      authUserId: center.authUserId,
      hierarchyNodeId: center.authUser.hierarchyNodeId,
      username: center.authUser.username,
      email: center.authUser.email,
      franchiseId: center.franchiseProfileId,
      businessPartnerId: center.franchiseProfile.businessPartnerId
    }
  };
}

async function loadCenterSnapshotContext({ tenantId, centerScope, asOfDate, tx = prisma } = {}) {
  const latestSnapshot = await tx.centerAnalyticsSnapshot.findFirst({
    where: {
      tenantId,
      centerId: centerScope.center.id,
      snapshotDate: {
        lte: asOfDate
      }
    },
    orderBy: [{ snapshotDate: "desc" }]
  });

  const previousSnapshot = await tx.centerAnalyticsSnapshot.findFirst({
    where: {
      tenantId,
      centerId: centerScope.center.id,
      snapshotDate: {
        lt: latestSnapshot?.snapshotDate || asOfDate
      }
    },
    orderBy: [{ snapshotDate: "desc" }]
  });

  if (latestSnapshot) {
    return {
      current: snapshotRowToObject(latestSnapshot),
      previous: snapshotRowToObject(previousSnapshot),
      source: {
        mode: "snapshot",
        liveFallback: false,
        snapshotDate: serializeDate(latestSnapshot.snapshotDate)
      }
    };
  }

  const fallbackRows = await aggregateCenterSnapshotRows({
    tenantId,
    businessPartnerId: centerScope.center.businessPartnerId,
    centers: [
      {
        id: centerScope.center.id,
        franchiseProfileId: centerScope.center.franchiseId,
        authUser: {
          hierarchyNodeId: centerScope.center.hierarchyNodeId
        }
      }
    ],
    snapshotDate: asOfDate,
    tx
  });

  return {
    current: snapshotRowToObject({
      ...(fallbackRows[0] || {
        activeStudents: 0,
        attendancePercent: 0,
        monthlyRevenue: 0,
        pendingFees: 0,
        teacherCount: 0,
        studentGrowthPercent: 0,
        retentionPercent: 0,
        healthScore: 0
      }),
      snapshotDate: asOfDate
    }),
    previous: snapshotRowToObject(previousSnapshot),
    source: {
      mode: "live-fallback",
      liveFallback: true,
      snapshotDate: serializeDate(asOfDate)
    }
  };
}

function buildActivityBuckets(entries = [], currentStart, previousStart) {
  const current = new Map();
  const previous = new Map();

  for (const entry of entries) {
    const target = normalizeDate(entry.session?.date) >= currentStart ? current : previous;
    const studentId = entry.studentId;
    const batchId = entry.session?.batchId || null;

    if (studentId) {
      const stats = target.get(`student:${studentId}`) || { total: 0, attended: 0, absent: 0, late: 0, lastAt: null };
      stats.total += 1;
      if (ATTENDED_STATUSES.has(entry.status)) {
        stats.attended += 1;
      }
      if (entry.status === "ABSENT") {
        stats.absent += 1;
      }
      if (entry.status === "LATE") {
        stats.late += 1;
      }
      const sessionDate = normalizeDate(entry.session?.date, null);
      if (sessionDate && (!stats.lastAt || sessionDate > stats.lastAt)) {
        stats.lastAt = sessionDate;
      }
      target.set(`student:${studentId}`, stats);
    }

    if (batchId) {
      const stats = target.get(`batch:${batchId}`) || { total: 0, attended: 0, absent: 0, late: 0, lastAt: null };
      stats.total += 1;
      if (ATTENDED_STATUSES.has(entry.status)) {
        stats.attended += 1;
      }
      if (entry.status === "ABSENT") {
        stats.absent += 1;
      }
      if (entry.status === "LATE") {
        stats.late += 1;
      }
      const sessionDate = normalizeDate(entry.session?.date, null);
      if (sessionDate && (!stats.lastAt || sessionDate > stats.lastAt)) {
        stats.lastAt = sessionDate;
      }
      target.set(`batch:${batchId}`, stats);
    }
  }

  return {
    current,
    previous
  };
}

function calculateAttendanceHealthScore({
  attendancePercent,
  activeStudents,
  chronicAbsenteeCount,
  inactiveStudentCount,
  atRiskBatchCount,
  batchCount,
  attendanceCollapseDetected
}) {
  const chronicRate = normalizeCountRate(chronicAbsenteeCount, activeStudents);
  const inactiveRate = normalizeCountRate(inactiveStudentCount, activeStudents);
  const batchRiskRate = normalizeCountRate(atRiskBatchCount, Math.max(batchCount, 1));
  const collapseScore = attendanceCollapseDetected ? 35 : 100;

  return clampScore(
    toNumber(attendancePercent) * 0.45
      + (100 - chronicRate) * 0.2
      + (100 - inactiveRate) * 0.15
      + (100 - batchRiskRate) * 0.1
      + collapseScore * 0.1
  );
}

function calculateWorksheetOperationalScore({
  completionRate,
  backlogCount,
  delayedReviewCount,
  pendingReviewCount,
  assignmentCount,
  submissionCount
}) {
  const backlogRate = normalizeCountRate(backlogCount, assignmentCount);
  const delayedRate = normalizeCountRate(delayedReviewCount, Math.max(submissionCount, 1));
  const pendingRate = normalizeCountRate(pendingReviewCount, Math.max(submissionCount, 1));
  const reviewedCount = Math.max(0, toNumber(submissionCount) - toNumber(pendingReviewCount));
  const gradingThroughput = normalizeCountRate(reviewedCount, Math.max(submissionCount, 1), 50);

  return clampScore(
    toNumber(completionRate) * 0.45
      + (100 - backlogRate) * 0.25
      + (100 - delayedRate) * 0.15
      + gradingThroughput * 0.1
      + (100 - pendingRate) * 0.05
  );
}

function calculateWorkloadBalanceScore(teacherItems = []) {
  if (!teacherItems.length) {
    return 50;
  }

  const averageStudents = teacherItems.reduce((sum, item) => sum + toNumber(item.assignedStudents), 0) / teacherItems.length;
  if (averageStudents <= 0) {
    return 100;
  }

  const averageDeviation = teacherItems.reduce(
    (sum, item) => sum + Math.abs(toNumber(item.assignedStudents) - averageStudents),
    0
  ) / teacherItems.length;

  return clampScore(100 - (averageDeviation / averageStudents) * 100);
}

function calculateTeacherCoordinationScore({
  workloadBalanceScore,
  attendanceCompliance,
  worksheetThroughput,
  inactiveDays,
  batchCount
}) {
  const activityScore = inactiveDays === null ? 100 : clampScore(100 - inactiveDays * 5);
  const coverageScore = batchCount > 0 ? 100 : 40;

  return clampScore(
    toNumber(workloadBalanceScore) * 0.35
      + toNumber(attendanceCompliance) * 0.25
      + toNumber(worksheetThroughput) * 0.2
      + activityScore * 0.1
      + coverageScore * 0.1
  );
}

async function buildCenterOperationalDataset({ tenantId, centerScope, asOfDate, tx = prisma } = {}) {
  const nextDate = addUtcDays(startOfUtcDay(asOfDate), 1);
  const currentAttendanceStart = addUtcDays(nextDate, -ATTENDANCE_TREND_WINDOW_DAYS);
  const previousAttendanceStart = addUtcDays(currentAttendanceStart, -ATTENDANCE_TREND_WINDOW_DAYS);
  const worksheetBacklogCutoff = addUtcDays(nextDate, -WORKSHEET_BACKLOG_DAYS);
  const worksheetReviewCutoff = addUtcDays(nextDate, -WORKSHEET_REVIEW_DELAY_DAYS);
  const teacherInactiveCutoff = addUtcDays(nextDate, -TEACHER_INACTIVE_DAYS);
  const batchInactiveCutoff = addUtcDays(nextDate, -BATCH_INACTIVE_DAYS);
  const examLookbackStart = addUtcDays(nextDate, -EXAM_LOOKBACK_DAYS);
  const snapshotContext = await loadCenterSnapshotContext({ tenantId, centerScope, asOfDate, tx });

  const [activeBatches, activeEnrollments, activeTeachers, newAdmissions7d] = await Promise.all([
    tx.batch.findMany({
      where: {
        tenantId,
        hierarchyNodeId: centerScope.center.hierarchyNodeId,
        isActive: true,
        deletedAt: null,
        status: "ACTIVE"
      },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        levelId: true,
        primaryTeacherUserId: true,
        createdAt: true,
        updatedAt: true,
        level: {
          select: {
            id: true,
            name: true
          }
        }
      }
    }),
    tx.enrollment.findMany({
      where: {
        tenantId,
        hierarchyNodeId: centerScope.center.hierarchyNodeId,
        status: "ACTIVE"
      },
      orderBy: [{ createdAt: "asc" }],
      select: {
        studentId: true,
        batchId: true,
        assignedTeacherUserId: true,
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            createdAt: true,
            isActive: true,
            levelId: true
          }
        },
        batch: {
          select: {
            id: true,
            name: true,
            levelId: true,
            primaryTeacherUserId: true,
            createdAt: true,
            updatedAt: true,
            level: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    }),
    tx.teacherProfile.findMany({
      where: {
        tenantId,
        hierarchyNodeId: centerScope.center.hierarchyNodeId,
        isActive: true,
        status: "ACTIVE"
      },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        authUserId: true,
        fullName: true,
        createdAt: true,
        updatedAt: true,
        authUser: {
          select: {
            username: true,
            email: true
          }
        }
      }
    }),
    tx.student.count({
      where: {
        tenantId,
        hierarchyNodeId: centerScope.center.hierarchyNodeId,
        createdAt: {
          gte: addUtcDays(nextDate, -7),
          lt: nextDate
        }
      }
    })
  ]);

  const batchIds = uniqueStrings(activeBatches.map((batch) => batch.id));
  const activeStudentIds = uniqueStrings(activeEnrollments.map((enrollment) => enrollment.studentId));

  const [batchTeacherAssignments, attendanceEntries, batchSessionMaxRows, worksheetAssignments, worksheetSubmissions, examEntries] = await Promise.all([
    batchIds.length
      ? tx.batchTeacherAssignment.findMany({
          where: {
            tenantId,
            batchId: {
              in: batchIds
            }
          },
          select: {
            batchId: true,
            teacherUserId: true
          }
        })
      : Promise.resolve([]),
    activeStudentIds.length
      ? tx.attendanceEntry.findMany({
          where: {
            tenantId,
            studentId: {
              in: activeStudentIds
            },
            session: {
              is: {
                hierarchyNodeId: centerScope.center.hierarchyNodeId,
                date: {
                  gte: previousAttendanceStart,
                  lt: nextDate
                }
              }
            }
          },
          select: {
            studentId: true,
            status: true,
            session: {
              select: {
                id: true,
                date: true,
                batchId: true
              }
            }
          }
        })
      : Promise.resolve([]),
    batchIds.length
      ? tx.attendanceSession.groupBy({
          by: ["batchId"],
          where: {
            tenantId,
            hierarchyNodeId: centerScope.center.hierarchyNodeId,
            batchId: {
              in: batchIds
            }
          },
          _max: {
            date: true
          }
        })
      : Promise.resolve([]),
    activeStudentIds.length
      ? tx.worksheetAssignment.findMany({
          where: {
            tenantId,
            studentId: {
              in: activeStudentIds
            },
            isActive: true,
            assignedAt: {
              lt: nextDate
            }
          },
          select: {
            worksheetId: true,
            studentId: true,
            assignedAt: true,
            dueDate: true,
            worksheet: {
              select: {
                id: true,
                title: true,
                examCycleId: true
              }
            }
          }
        })
      : Promise.resolve([]),
    activeStudentIds.length
      ? tx.worksheetSubmission.findMany({
          where: {
            tenantId,
            studentId: {
              in: activeStudentIds
            },
            submittedAt: {
              lt: nextDate
            }
          },
          select: {
            worksheetId: true,
            studentId: true,
            score: true,
            status: true,
            submittedAt: true,
            finalSubmittedAt: true,
            completionTimeSeconds: true
          }
        })
      : Promise.resolve([]),
    activeStudentIds.length
      ? tx.examEnrollmentEntry.findMany({
          where: {
            tenantId,
            studentId: {
              in: activeStudentIds
            },
            createdAt: {
              gte: examLookbackStart,
              lt: nextDate
            }
          },
          select: {
            studentId: true,
            createdAt: true
          }
        })
      : Promise.resolve([])
  ]);

  const batchById = new Map(activeBatches.map((batch) => [batch.id, batch]));
  const teacherByUserId = new Map(activeTeachers.map((teacher) => [teacher.authUserId, teacher]));
  const batchTeacherIds = new Map();
  const batchStudents = new Map();
  const teacherStudents = new Map();
  const teacherBatches = new Map();
  const studentInfo = new Map();

  for (const batch of activeBatches) {
    const teacherIds = new Set();
    if (batch.primaryTeacherUserId) {
      teacherIds.add(batch.primaryTeacherUserId);
    }
    batchTeacherIds.set(batch.id, teacherIds);
    batchStudents.set(batch.id, new Set());
  }

  for (const assignment of batchTeacherAssignments) {
    const teacherIds = batchTeacherIds.get(assignment.batchId) || new Set();
    teacherIds.add(assignment.teacherUserId);
    batchTeacherIds.set(assignment.batchId, teacherIds);
  }

  for (const enrollment of activeEnrollments) {
    studentInfo.set(enrollment.studentId, enrollment.student);
    if (!batchStudents.has(enrollment.batchId)) {
      batchStudents.set(enrollment.batchId, new Set());
    }
    batchStudents.get(enrollment.batchId).add(enrollment.studentId);

    const preferredTeacherId = enrollment.assignedTeacherUserId || enrollment.batch?.primaryTeacherUserId || null;
    if (preferredTeacherId) {
      if (!teacherStudents.has(preferredTeacherId)) {
        teacherStudents.set(preferredTeacherId, new Set());
      }
      teacherStudents.get(preferredTeacherId).add(enrollment.studentId);

      if (!teacherBatches.has(preferredTeacherId)) {
        teacherBatches.set(preferredTeacherId, new Set());
      }
      teacherBatches.get(preferredTeacherId).add(enrollment.batchId);

      const teacherIds = batchTeacherIds.get(enrollment.batchId) || new Set();
      teacherIds.add(preferredTeacherId);
      batchTeacherIds.set(enrollment.batchId, teacherIds);
    }
  }

  for (const [batchId, teacherIds] of batchTeacherIds.entries()) {
    for (const teacherUserId of teacherIds) {
      if (!teacherBatches.has(teacherUserId)) {
        teacherBatches.set(teacherUserId, new Set());
      }
      teacherBatches.get(teacherUserId).add(batchId);
    }
  }

  const activityBuckets = buildActivityBuckets(attendanceEntries, currentAttendanceStart, previousAttendanceStart);
  const batchLastAttendance = new Map(batchSessionMaxRows.map((row) => [row.batchId, row._max.date]));
  const submissionByKey = new Map(
    worksheetSubmissions.map((submission) => [`${submission.studentId}:${submission.worksheetId}`, submission])
  );

  const batchWorksheet = new Map();
  const teacherWorksheet = new Map();
  const studentWorksheet = new Map();
  const batchLastWorksheet = new Map();
  const teacherLastWorksheet = new Map();

  for (const assignment of worksheetAssignments) {
    const submission = submissionByKey.get(`${assignment.studentId}:${assignment.worksheetId}`) || null;
    const enrollment = activeEnrollments.find((item) => item.studentId === assignment.studentId);
    const batchId = enrollment?.batchId || null;
    const teacherUserId = enrollment?.assignedTeacherUserId || enrollment?.batch?.primaryTeacherUserId || null;
    const isCompleted = Boolean(submission);
    const isPendingReview = Boolean(submission && submission.status === "PENDING");
    const isDelayedReview = Boolean(isPendingReview && normalizeDate(submission.submittedAt) < worksheetReviewCutoff);
    const effectiveDueDate = assignment.dueDate || assignment.assignedAt;
    const isBacklog = !submission && normalizeDate(effectiveDueDate) < worksheetBacklogCutoff;

    if (!studentWorksheet.has(assignment.studentId)) {
      studentWorksheet.set(assignment.studentId, {
        assignedCount: 0,
        completedCount: 0
      });
    }
    studentWorksheet.get(assignment.studentId).assignedCount += 1;
    if (isCompleted) {
      studentWorksheet.get(assignment.studentId).completedCount += 1;
    }

    if (batchId) {
      const stats = batchWorksheet.get(batchId) || {
        assignedCount: 0,
        completedCount: 0,
        backlogCount: 0,
        pendingReviewCount: 0,
        delayedReviewCount: 0
      };
      stats.assignedCount += 1;
      if (isCompleted) {
        stats.completedCount += 1;
      }
      if (isBacklog) {
        stats.backlogCount += 1;
      }
      if (isPendingReview) {
        stats.pendingReviewCount += 1;
      }
      if (isDelayedReview) {
        stats.delayedReviewCount += 1;
      }
      batchWorksheet.set(batchId, stats);

      const lastActivityAt = submission?.submittedAt || assignment.assignedAt;
      const existingLastAt = batchLastWorksheet.get(batchId);
      if (!existingLastAt || normalizeDate(lastActivityAt) > normalizeDate(existingLastAt)) {
        batchLastWorksheet.set(batchId, lastActivityAt);
      }
    }

    if (teacherUserId) {
      const stats = teacherWorksheet.get(teacherUserId) || {
        assignedCount: 0,
        completedCount: 0,
        pendingReviewCount: 0,
        delayedReviewCount: 0
      };
      stats.assignedCount += 1;
      if (isCompleted) {
        stats.completedCount += 1;
      }
      if (isPendingReview) {
        stats.pendingReviewCount += 1;
      }
      if (isDelayedReview) {
        stats.delayedReviewCount += 1;
      }
      teacherWorksheet.set(teacherUserId, stats);

      const lastActivityAt = submission?.submittedAt || assignment.assignedAt;
      const existingLastAt = teacherLastWorksheet.get(teacherUserId);
      if (!existingLastAt || normalizeDate(lastActivityAt) > normalizeDate(existingLastAt)) {
        teacherLastWorksheet.set(teacherUserId, lastActivityAt);
      }
    }
  }

  const examParticipants = new Set(examEntries.map((entry) => entry.studentId));
  const batchExamParticipants = new Map();
  for (const [batchId, studentIds] of batchStudents.entries()) {
    const participants = [...studentIds].filter((studentId) => examParticipants.has(studentId));
    batchExamParticipants.set(batchId, new Set(participants));
  }

  const activeStudentCount = Math.max(snapshotContext.current?.activeStudents || 0, activeStudentIds.length);
  const activeTeacherCount = Math.max(snapshotContext.current?.teacherCount || 0, activeTeachers.length);
  const activeEnrollmentCount = activeEnrollments.length;
  const activeBatchCount = activeBatches.length;

  const overallCurrentAttendance = [...activityBuckets.current.entries()]
    .filter(([key]) => key.startsWith("student:"))
    .reduce((accumulator, [, stats]) => {
      accumulator.total += stats.total;
      accumulator.attended += stats.attended;
      return accumulator;
    }, { total: 0, attended: 0 });

  const overallPreviousAttendance = [...activityBuckets.previous.entries()]
    .filter(([key]) => key.startsWith("student:"))
    .reduce((accumulator, [, stats]) => {
      accumulator.total += stats.total;
      accumulator.attended += stats.attended;
      return accumulator;
    }, { total: 0, attended: 0 });

  const overallAttendancePercent = normalizeCountRate(
    overallCurrentAttendance.attended,
    overallCurrentAttendance.total,
    snapshotContext.current?.attendancePercent || 0
  );
  const previousAttendancePercent = normalizeCountRate(
    overallPreviousAttendance.attended,
    overallPreviousAttendance.total,
    snapshotContext.previous?.attendancePercent || snapshotContext.current?.attendancePercent || 0
  );

  const chronicAbsentees = activeStudentIds
    .map((studentId) => {
      const stats = activityBuckets.current.get(`student:${studentId}`) || { total: 0, attended: 0, absent: 0, late: 0, lastAt: null };
      const rate = normalizeCountRate(stats.attended, stats.total, 0);
      if (stats.total < 4 || (rate >= 60 && stats.absent < 3)) {
        return null;
      }

      const student = studentInfo.get(studentId);
      return {
        id: studentId,
        studentId,
        admissionNo: student?.admissionNo || null,
        studentName: `${student?.firstName || ""} ${student?.lastName || ""}`.trim(),
        attendanceRate: rate,
        absentCount: stats.absent,
        totalSessions: stats.total,
        lastAttendanceAt: serializeDate(stats.lastAt),
        severity: rate < 45 ? "CRITICAL" : "HIGH"
      };
    })
    .filter(Boolean);

  const inactiveStudents = activeStudentIds
    .filter((studentId) => {
      const stats = activityBuckets.current.get(`student:${studentId}`);
      return !stats || stats.total === 0;
    })
    .map((studentId) => {
      const student = studentInfo.get(studentId);
      return {
        id: studentId,
        studentId,
        admissionNo: student?.admissionNo || null,
        studentName: `${student?.firstName || ""} ${student?.lastName || ""}`.trim()
      };
    });

  const batchItems = activeBatches.map((batch) => {
    const currentAttendance = activityBuckets.current.get(`batch:${batch.id}`) || { total: 0, attended: 0, absent: 0, late: 0 };
    const previousAttendance = activityBuckets.previous.get(`batch:${batch.id}`) || { total: 0, attended: 0, absent: 0, late: 0 };
    const worksheetStats = batchWorksheet.get(batch.id) || {
      assignedCount: 0,
      completedCount: 0,
      backlogCount: 0,
      pendingReviewCount: 0,
      delayedReviewCount: 0
    };
    const enrolledCount = batchStudents.get(batch.id)?.size || 0;
    const teacherCount = batchTeacherIds.get(batch.id)?.size || 0;
    const attendanceRate = normalizeCountRate(currentAttendance.attended, currentAttendance.total, 0);
    const previousBatchAttendanceRate = normalizeCountRate(previousAttendance.attended, previousAttendance.total, attendanceRate);
    const worksheetCompletionRate = normalizeCountRate(worksheetStats.completedCount, worksheetStats.assignedCount, 0);
    const examParticipationRate = normalizeCountRate(batchExamParticipants.get(batch.id)?.size || 0, enrolledCount, 0);
    const lastActivityAt = [batchLastAttendance.get(batch.id), batchLastWorksheet.get(batch.id), batch.updatedAt]
      .filter(Boolean)
      .map((value) => normalizeDate(value))
      .sort((left, right) => right.getTime() - left.getTime())[0] || null;
    const inactiveDays = getDaysSince(asOfDate, lastActivityAt);
    const operationalHealthScore = clampScore(
      attendanceRate * 0.4
        + worksheetCompletionRate * 0.3
        + examParticipationRate * 0.15
        + (inactiveDays === null ? 50 : clampScore(100 - inactiveDays * 5)) * 0.15
    );

    return {
      id: batch.id,
      batchId: batch.id,
      batchName: batch.name,
      levelName: batch.level?.name || null,
      enrolledStudents: enrolledCount,
      assignedTeachers: teacherCount,
      attendanceRate,
      previousAttendanceRate: previousBatchAttendanceRate,
      worksheetCompletionRate,
      worksheetAssignedCount: worksheetStats.assignedCount,
      worksheetCompletedCount: worksheetStats.completedCount,
      worksheetBacklogCount: worksheetStats.backlogCount,
      delayedReviewCount: worksheetStats.delayedReviewCount,
      examParticipationRate,
      inactiveDays,
      lastActivityAt: serializeDate(lastActivityAt),
      operationalHealthScore,
      riskLevel: operationalHealthScore < 50 || attendanceRate < 60 ? "CRITICAL" : operationalHealthScore < 65 ? "HIGH" : "NORMAL"
    };
  });

  const attendanceAtRiskBatches = batchItems.filter((item) => item.attendanceRate < 70 || (item.inactiveDays !== null && item.inactiveDays >= BATCH_INACTIVE_DAYS));
  const attendanceCollapseDetected = overallAttendancePercent < 65 && (previousAttendancePercent - overallAttendancePercent) >= 15;
  const attendanceHealthScore = calculateAttendanceHealthScore({
    attendancePercent: overallAttendancePercent,
    activeStudents: activeStudentCount,
    chronicAbsenteeCount: chronicAbsentees.length,
    inactiveStudentCount: inactiveStudents.length,
    atRiskBatchCount: attendanceAtRiskBatches.length,
    batchCount: activeBatchCount,
    attendanceCollapseDetected
  });

  const totalWorksheetStats = [...batchWorksheet.values()].reduce(
    (accumulator, stats) => {
      accumulator.assignedCount += stats.assignedCount;
      accumulator.completedCount += stats.completedCount;
      accumulator.backlogCount += stats.backlogCount;
      accumulator.pendingReviewCount += stats.pendingReviewCount;
      accumulator.delayedReviewCount += stats.delayedReviewCount;
      return accumulator;
    },
    {
      assignedCount: 0,
      completedCount: 0,
      backlogCount: 0,
      pendingReviewCount: 0,
      delayedReviewCount: 0
    }
  );

  const worksheetCompletionRate = normalizeCountRate(
    totalWorksheetStats.completedCount,
    totalWorksheetStats.assignedCount,
    0
  );
  const worksheetOperationalScore = calculateWorksheetOperationalScore({
    completionRate: worksheetCompletionRate,
    backlogCount: totalWorksheetStats.backlogCount,
    delayedReviewCount: totalWorksheetStats.delayedReviewCount,
    pendingReviewCount: totalWorksheetStats.pendingReviewCount,
    assignmentCount: totalWorksheetStats.assignedCount,
    submissionCount: totalWorksheetStats.completedCount
  });

  const teacherItemsSeed = activeTeachers.map((teacher) => {
    const batchIdsForTeacher = [...(teacherBatches.get(teacher.authUserId) || new Set())];
    const studentIdsForTeacher = [...(teacherStudents.get(teacher.authUserId) || new Set())];
    const worksheetStats = teacherWorksheet.get(teacher.authUserId) || {
      assignedCount: 0,
      completedCount: 0,
      pendingReviewCount: 0,
      delayedReviewCount: 0
    };

    const complianceRates = studentIdsForTeacher.map((studentId) => {
      const stats = activityBuckets.current.get(`student:${studentId}`) || { total: 0, attended: 0 };
      return normalizeCountRate(stats.attended, stats.total, 0);
    });

    const lastAttendanceAt = batchIdsForTeacher
      .map((batchId) => batchLastAttendance.get(batchId))
      .filter(Boolean)
      .map((value) => normalizeDate(value))
      .sort((left, right) => right.getTime() - left.getTime())[0] || null;
    const lastWorksheetAt = teacherLastWorksheet.get(teacher.authUserId) || null;
    const lastActivityAt = [lastAttendanceAt, lastWorksheetAt, teacher.updatedAt]
      .filter(Boolean)
      .map((value) => normalizeDate(value))
      .sort((left, right) => right.getTime() - left.getTime())[0] || null;

    return {
      id: teacher.authUserId,
      teacherUserId: teacher.authUserId,
      teacherName: teacher.fullName,
      teacherUsername: teacher.authUser?.username || null,
      teacherEmail: teacher.authUser?.email || null,
      assignedBatches: batchIdsForTeacher.length,
      assignedStudents: studentIdsForTeacher.length,
      attendanceCompliance: average(complianceRates),
      worksheetAssignedCount: worksheetStats.assignedCount,
      worksheetCompletedCount: worksheetStats.completedCount,
      worksheetThroughput: normalizeCountRate(worksheetStats.completedCount, worksheetStats.assignedCount, 0),
      delayedReviewCount: worksheetStats.delayedReviewCount,
      pendingReviewCount: worksheetStats.pendingReviewCount,
      lastActivityAt: serializeDate(lastActivityAt),
      inactiveDays: getDaysSince(asOfDate, lastActivityAt)
    };
  });

  const workloadBalanceScore = calculateWorkloadBalanceScore(teacherItemsSeed);
  const teacherItems = teacherItemsSeed.map((teacher) => ({
    ...teacher,
    coordinationScore: calculateTeacherCoordinationScore({
      workloadBalanceScore,
      attendanceCompliance: teacher.attendanceCompliance,
      worksheetThroughput: teacher.worksheetThroughput,
      inactiveDays: teacher.inactiveDays,
      batchCount: teacher.assignedBatches
    })
  }));
  const inactiveTeachers = teacherItems.filter((teacher) => teacher.inactiveDays !== null && teacher.inactiveDays >= TEACHER_INACTIVE_DAYS);

  const teacherCoordinationScore = clampScore(
    average(teacherItems.map((teacher) => teacher.coordinationScore)) * 0.8
      + normalizeTeacherActivity({ teacherCount: activeTeacherCount, activeStudents: activeStudentCount }) * 0.2
  );

  const anomalies = [];
  if (attendanceCollapseDetected) {
    anomalies.push({
      id: `attendance-collapse:${centerScope.center.id}`,
      type: "ATTENDANCE_COLLAPSE",
      severity: "CRITICAL",
      title: `${centerScope.center.name} attendance collapsed`,
      message: `${centerScope.center.name} attendance dropped from ${previousAttendancePercent}% to ${overallAttendancePercent}% across the last two operational windows.`,
      metricKey: "attendancePercent",
      threshold: 65,
      observedValue: overallAttendancePercent,
      centerId: centerScope.center.id,
      centerName: centerScope.center.name
    });
  }

  if (activeStudentCount > 0 && chronicAbsentees.length / activeStudentCount >= 0.15) {
    anomalies.push({
      id: `chronic-absentee:${centerScope.center.id}`,
      type: "CHRONIC_ABSENTEE_SPIKE",
      severity: chronicAbsentees.length / activeStudentCount >= 0.25 ? "CRITICAL" : "HIGH",
      title: `${centerScope.center.name} chronic absenteeism is elevated`,
      message: `${chronicAbsentees.length} students in ${centerScope.center.name} are currently classified as chronic absentees.`,
      metricKey: "chronicAbsenteeCount",
      threshold: Math.max(1, Math.ceil(activeStudentCount * 0.15)),
      observedValue: chronicAbsentees.length,
      centerId: centerScope.center.id,
      centerName: centerScope.center.name
    });
  }

  if (totalWorksheetStats.backlogCount >= Math.max(3, Math.ceil(totalWorksheetStats.assignedCount * 0.2))) {
    anomalies.push({
      id: `worksheet-backlog:${centerScope.center.id}`,
      type: "WORKSHEET_BACKLOG",
      severity: totalWorksheetStats.backlogCount >= Math.max(6, Math.ceil(totalWorksheetStats.assignedCount * 0.35)) ? "HIGH" : "WARNING",
      title: `${centerScope.center.name} worksheet backlog is building`,
      message: `${totalWorksheetStats.backlogCount} worksheet assignments are overdue or stale in ${centerScope.center.name}.`,
      metricKey: "worksheetBacklogCount",
      threshold: Math.max(3, Math.ceil(totalWorksheetStats.assignedCount * 0.2)),
      observedValue: totalWorksheetStats.backlogCount,
      centerId: centerScope.center.id,
      centerName: centerScope.center.name
    });
  }

  if (totalWorksheetStats.delayedReviewCount >= 3) {
    anomalies.push({
      id: `delayed-review:${centerScope.center.id}`,
      type: "DELAYED_WORKSHEET_REVIEW",
      severity: totalWorksheetStats.delayedReviewCount >= 6 ? "HIGH" : "WARNING",
      title: `${centerScope.center.name} has delayed worksheet reviews`,
      message: `${totalWorksheetStats.delayedReviewCount} worksheet submissions have been pending review beyond the operational threshold.`,
      metricKey: "delayedReviewCount",
      threshold: 3,
      observedValue: totalWorksheetStats.delayedReviewCount,
      centerId: centerScope.center.id,
      centerName: centerScope.center.name
    });
  }

  const inactiveBatches = batchItems.filter((item) => item.inactiveDays !== null && item.inactiveDays >= BATCH_INACTIVE_DAYS);
  if (inactiveBatches.length) {
    anomalies.push({
      id: `inactive-batches:${centerScope.center.id}`,
      type: "INACTIVE_BATCHES",
      severity: inactiveBatches.length >= 3 ? "HIGH" : "WARNING",
      title: `${centerScope.center.name} has inactive batches`,
      message: `${inactiveBatches.length} active batches have no recent classroom activity in ${centerScope.center.name}.`,
      metricKey: "inactiveBatchCount",
      threshold: 1,
      observedValue: inactiveBatches.length,
      centerId: centerScope.center.id,
      centerName: centerScope.center.name
    });
  }

  if (inactiveTeachers.length) {
    anomalies.push({
      id: `teacher-inactivity:${centerScope.center.id}`,
      type: "TEACHER_INACTIVITY",
      severity: inactiveTeachers.length >= 2 ? "HIGH" : "WARNING",
      title: `${centerScope.center.name} has inactive teachers`,
      message: `${inactiveTeachers.length} teachers have not recorded recent operational activity in ${centerScope.center.name}.`,
      metricKey: "inactiveTeacherCount",
      threshold: 1,
      observedValue: inactiveTeachers.length,
      centerId: centerScope.center.id,
      centerName: centerScope.center.name
    });
  }

  const classroomRiskBatches = batchItems.filter((item) => item.operationalHealthScore < 55);
  if (classroomRiskBatches.length) {
    anomalies.push({
      id: `classroom-risk:${centerScope.center.id}`,
      type: "OPERATIONAL_CLASSROOM_RISK",
      severity: classroomRiskBatches.some((item) => item.operationalHealthScore < 40) ? "CRITICAL" : "HIGH",
      title: `${centerScope.center.name} has classroom operational risk`,
      message: `${classroomRiskBatches.length} batches in ${centerScope.center.name} are below the classroom operational health floor.`,
      metricKey: "operationalHealthScore",
      threshold: 55,
      observedValue: roundScore(Math.min(...classroomRiskBatches.map((item) => item.operationalHealthScore))),
      centerId: centerScope.center.id,
      centerName: centerScope.center.name
    });
  }

  return {
    asOfDate,
    centerScope,
    snapshot: snapshotContext.current,
    previousSnapshot: snapshotContext.previous,
    source: snapshotContext.source,
    summary: {
      activeStudents: activeStudentCount,
      activeTeachers: activeTeacherCount,
      activeEnrollments: activeEnrollmentCount,
      newAdmissions7d,
      activeBatches: activeBatchCount,
      overallAttendancePercent,
      previousAttendancePercent,
      worksheetCompletionRate,
      examParticipants: examParticipants.size,
      classroomParticipationRate: average(batchItems.map((item) => item.attendanceRate)),
      attendanceHealthScore,
      worksheetOperationalScore,
      teacherCoordinationScore,
      centerHealthScore: roundScore((toNumber(snapshotContext.current?.healthScore) + attendanceHealthScore + worksheetOperationalScore + teacherCoordinationScore) / 4, 2)
    },
    attendance: {
      chronicAbsentees,
      inactiveStudents,
      batchRisks: attendanceAtRiskBatches,
      attendanceCollapseDetected,
      attendanceHealthScore
    },
    worksheets: {
      ...totalWorksheetStats,
      worksheetCompletionRate,
      worksheetOperationalScore
    },
    teachers: {
      items: teacherItems,
      inactiveTeachers,
      workloadBalanceScore,
      teacherCoordinationScore
    },
    batches: batchItems,
    anomalies: stableSortItems(anomalies, "severity", "desc", "title"),
    thresholds: {
      teacherInactiveDays: TEACHER_INACTIVE_DAYS,
      batchInactiveDays: BATCH_INACTIVE_DAYS,
      worksheetBacklogDays: WORKSHEET_BACKLOG_DAYS,
      worksheetReviewDelayDays: WORKSHEET_REVIEW_DELAY_DAYS
    },
    windows: {
      attendanceCurrentStart: serializeDate(currentAttendanceStart),
      attendancePreviousStart: serializeDate(previousAttendanceStart),
      teacherInactiveCutoff: serializeDate(teacherInactiveCutoff),
      batchInactiveCutoff: serializeDate(batchInactiveCutoff)
    }
  };
}

function buildMeta({ tenantId, centerScope, asOfDate, source, filters = {}, range = null }) {
  return {
    generatedAt: new Date().toISOString(),
    tenantId,
    scope: buildScopeMeta(centerScope),
    asOf: serializeDate(asOfDate),
    range,
    filters,
    source
  };
}

async function getCenterOperationalOverviewAnalytics({ tenantId, authUserId, hierarchyNodeId, query = {}, tx = prisma } = {}) {
  const asOfDate = normalizeDate(query.asOf);
  const centerScope = await resolveCenterOperationalScope({ tenantId, authUserId, hierarchyNodeId, tx });
  const dataset = await buildCenterOperationalDataset({ tenantId, centerScope, asOfDate, tx });
  const snapshotHealth = toNumber(dataset.snapshot?.healthScore);

  return {
    activeStudents: dataset.summary.activeStudents,
    activeTeachers: dataset.summary.activeTeachers,
    newAdmissions7d: dataset.summary.newAdmissions7d,
    activeEnrollments: dataset.summary.activeEnrollments,
    overview: {
      centerId: centerScope.center.id,
      centerCode: centerScope.center.code,
      centerName: centerScope.center.name,
      activeBatches: dataset.summary.activeBatches,
      examParticipants: dataset.summary.examParticipants,
      classroomParticipationRate: dataset.summary.classroomParticipationRate,
      overallAttendancePercent: dataset.summary.overallAttendancePercent,
      snapshotHealthScore: snapshotHealth,
      operationalHealthScore: dataset.summary.centerHealthScore
    },
    kpis: {
      activeStudents: {
        label: "Active students",
        value: dataset.summary.activeStudents,
        unit: "count",
        deltaPercent: calculateDeltaPercent(dataset.summary.activeStudents, dataset.previousSnapshot?.activeStudents || 0)
      },
      attendanceHealth: {
        label: "Attendance health",
        value: dataset.summary.attendanceHealthScore,
        unit: "score",
        deltaPercent: roundScore(dataset.summary.overallAttendancePercent - toNumber(dataset.previousSnapshot?.attendancePercent), 2)
      },
      worksheetOperations: {
        label: "Worksheet operations",
        value: dataset.summary.worksheetOperationalScore,
        unit: "score",
        deltaPercent: roundScore(dataset.summary.worksheetCompletionRate - normalizeCountRate(dataset.worksheets.completedCount, dataset.worksheets.assignedCount, 0), 2)
      },
      teacherCoordination: {
        label: "Teacher coordination",
        value: dataset.summary.teacherCoordinationScore,
        unit: "score",
        deltaPercent: roundScore(dataset.summary.activeTeachers - toNumber(dataset.previousSnapshot?.teacherCount), 2)
      }
    },
    alerts: {
      total: dataset.anomalies.length,
      highSeverity: dataset.anomalies.filter((item) => ["CRITICAL", "HIGH"].includes(item.severity)).length,
      preview: dataset.anomalies.slice(0, 5)
    },
    meta: buildMeta({
      tenantId,
      centerScope,
      asOfDate,
      source: dataset.source,
      filters: {
        asOf: query.asOf || null
      }
    })
  };
}

async function getCenterAttendanceOperationalAnalytics({ tenantId, authUserId, hierarchyNodeId, query = {}, tx = prisma } = {}) {
  const asOfDate = normalizeDate(query.asOf);
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);
  const sortBy = query.sortBy || "attendanceRate";
  const sortDirection = normalizeSortDirection(query.sortDirection || query.sortOrder);
  const search = normalizeSearch(query.search || query.q);
  const centerScope = await resolveCenterOperationalScope({ tenantId, authUserId, hierarchyNodeId, tx });
  const dataset = await buildCenterOperationalDataset({ tenantId, centerScope, asOfDate, tx });

  let items = dataset.attendance.batchRisks.filter((item) => matchesSearch([item.batchName, item.levelName], search));
  items = stableSortItems(items, sortBy, sortDirection, "batchName");
  const pagination = paginateItems(items, { limit, offset });

  return {
    summary: {
      overallAttendancePercent: dataset.summary.overallAttendancePercent,
      previousAttendancePercent: dataset.summary.previousAttendancePercent,
      attendanceHealthScore: dataset.summary.attendanceHealthScore,
      chronicAbsenteeCount: dataset.attendance.chronicAbsentees.length,
      inactiveStudentCount: dataset.attendance.inactiveStudents.length,
      atRiskBatchCount: items.length,
      attendanceCollapseDetected: dataset.attendance.attendanceCollapseDetected
    },
    previews: {
      chronicAbsentees: dataset.attendance.chronicAbsentees.slice(0, 10),
      inactiveStudents: dataset.attendance.inactiveStudents.slice(0, 10)
    },
    ...pagination,
    meta: buildMeta({
      tenantId,
      centerScope,
      asOfDate,
      source: dataset.source,
      filters: {
        asOf: query.asOf || null,
        search: query.search || query.q || null,
        sortBy,
        sortDirection
      }
    })
  };
}

async function getCenterWorksheetOperationalAnalytics({ tenantId, authUserId, hierarchyNodeId, query = {}, tx = prisma } = {}) {
  const asOfDate = normalizeDate(query.asOf);
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);
  const sortBy = query.sortBy || "worksheetBacklogCount";
  const sortDirection = normalizeSortDirection(query.sortDirection || query.sortOrder);
  const search = normalizeSearch(query.search || query.q);
  const centerScope = await resolveCenterOperationalScope({ tenantId, authUserId, hierarchyNodeId, tx });
  const dataset = await buildCenterOperationalDataset({ tenantId, centerScope, asOfDate, tx });

  let items = dataset.batches.filter((item) => matchesSearch([item.batchName, item.levelName], search));
  items = stableSortItems(items, sortBy, sortDirection, "batchName");
  const pagination = paginateItems(items, { limit, offset });

  return {
    summary: {
      assignedCount: dataset.worksheets.assignedCount,
      completedCount: dataset.worksheets.completedCount,
      backlogCount: dataset.worksheets.backlogCount,
      pendingReviewCount: dataset.worksheets.pendingReviewCount,
      delayedReviewCount: dataset.worksheets.delayedReviewCount,
      worksheetCompletionRate: dataset.summary.worksheetCompletionRate,
      worksheetOperationalScore: dataset.summary.worksheetOperationalScore
    },
    ...pagination,
    meta: buildMeta({
      tenantId,
      centerScope,
      asOfDate,
      source: dataset.source,
      filters: {
        asOf: query.asOf || null,
        search: query.search || query.q || null,
        sortBy,
        sortDirection
      }
    })
  };
}

async function getCenterTeacherOperationalAnalytics({ tenantId, authUserId, hierarchyNodeId, query = {}, tx = prisma } = {}) {
  const asOfDate = normalizeDate(query.asOf);
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);
  const sortBy = query.sortBy || "coordinationScore";
  const sortDirection = normalizeSortDirection(query.sortDirection || query.sortOrder);
  const search = normalizeSearch(query.search || query.q);
  const inactiveOnly = String(query.inactiveOnly || "").toLowerCase() === "true";
  const centerScope = await resolveCenterOperationalScope({ tenantId, authUserId, hierarchyNodeId, tx });
  const dataset = await buildCenterOperationalDataset({ tenantId, centerScope, asOfDate, tx });

  let items = dataset.teachers.items.filter((item) => matchesSearch([item.teacherName, item.teacherUsername, item.teacherEmail], search));
  if (inactiveOnly) {
    items = items.filter((item) => item.inactiveDays !== null && item.inactiveDays >= TEACHER_INACTIVE_DAYS);
  }
  items = stableSortItems(items, sortBy, sortDirection, "teacherName");
  const pagination = paginateItems(items, { limit, offset });

  return {
    summary: {
      activeTeacherCount: dataset.summary.activeTeachers,
      inactiveTeacherCount: dataset.teachers.inactiveTeachers.length,
      teacherCoordinationScore: dataset.summary.teacherCoordinationScore,
      workloadBalanceScore: dataset.teachers.workloadBalanceScore,
      averageAttendanceCompliance: average(dataset.teachers.items.map((item) => item.attendanceCompliance))
    },
    ...pagination,
    meta: buildMeta({
      tenantId,
      centerScope,
      asOfDate,
      source: dataset.source,
      filters: {
        asOf: query.asOf || null,
        search: query.search || query.q || null,
        inactiveOnly,
        sortBy,
        sortDirection
      }
    })
  };
}

async function getCenterBatchHealthAnalytics({ tenantId, authUserId, hierarchyNodeId, query = {}, tx = prisma } = {}) {
  const asOfDate = normalizeDate(query.asOf);
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);
  const sortBy = query.sortBy || "operationalHealthScore";
  const sortDirection = normalizeSortDirection(query.sortDirection || query.sortOrder);
  const search = normalizeSearch(query.search || query.q);
  const riskOnly = String(query.riskOnly || "").toLowerCase() === "true";
  const centerScope = await resolveCenterOperationalScope({ tenantId, authUserId, hierarchyNodeId, tx });
  const dataset = await buildCenterOperationalDataset({ tenantId, centerScope, asOfDate, tx });

  let items = dataset.batches.filter((item) => matchesSearch([item.batchName, item.levelName], search));
  if (riskOnly) {
    items = items.filter((item) => item.operationalHealthScore < 65 || item.inactiveDays !== null && item.inactiveDays >= BATCH_INACTIVE_DAYS);
  }
  items = stableSortItems(items, sortBy, sortDirection, "batchName");
  const pagination = paginateItems(items, { limit, offset });

  return {
    summary: {
      activeBatchCount: dataset.summary.activeBatches,
      classroomParticipationRate: dataset.summary.classroomParticipationRate,
      averageOperationalHealthScore: average(dataset.batches.map((item) => item.operationalHealthScore)),
      riskBatchCount: dataset.batches.filter((item) => item.operationalHealthScore < 65).length,
      inactiveBatchCount: dataset.batches.filter((item) => item.inactiveDays !== null && item.inactiveDays >= BATCH_INACTIVE_DAYS).length
    },
    ...pagination,
    meta: buildMeta({
      tenantId,
      centerScope,
      asOfDate,
      source: dataset.source,
      filters: {
        asOf: query.asOf || null,
        search: query.search || query.q || null,
        riskOnly,
        sortBy,
        sortDirection
      }
    })
  };
}

async function getCenterOperationalAnomaliesAnalytics({ tenantId, authUserId, hierarchyNodeId, query = {}, tx = prisma } = {}) {
  const asOfDate = normalizeDate(query.asOf);
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);
  const sortBy = query.sortBy || "severity";
  const sortDirection = normalizeSortDirection(query.sortDirection || query.sortOrder);
  const search = normalizeSearch(query.search || query.q);
  const centerScope = await resolveCenterOperationalScope({ tenantId, authUserId, hierarchyNodeId, tx });
  const dataset = await buildCenterOperationalDataset({ tenantId, centerScope, asOfDate, tx });

  let items = dataset.anomalies.filter((item) => {
    const typeMatches = query.type ? item.type === query.type : true;
    const severityMatches = query.severity ? item.severity === query.severity : true;
    const searchMatches = matchesSearch([item.title, item.message, item.centerName, item.type], search);
    return typeMatches && severityMatches && searchMatches;
  });
  items = stableSortItems(
    items.map((item) => ({
      ...item,
      severity: item.severity,
      severityOrder: severityRank[item.severity] || 0
    })),
    sortBy === "severity" ? "severityOrder" : sortBy,
    sortDirection,
    "title"
  ).map(({ severityOrder, ...item }) => item);

  const pagination = paginateItems(items, { limit, offset });

  return {
    summary: {
      totalAnomalies: items.length,
      highSeverityAnomalyCount: items.filter((item) => ["CRITICAL", "HIGH"].includes(item.severity)).length,
      attendanceRelatedCount: items.filter((item) => ["ATTENDANCE_COLLAPSE", "CHRONIC_ABSENTEE_SPIKE"].includes(item.type)).length,
      worksheetRelatedCount: items.filter((item) => ["WORKSHEET_BACKLOG", "DELAYED_WORKSHEET_REVIEW"].includes(item.type)).length
    },
    ...pagination,
    meta: buildMeta({
      tenantId,
      centerScope,
      asOfDate,
      source: dataset.source,
      filters: {
        asOf: query.asOf || null,
        type: query.type || null,
        severity: query.severity || null,
        search: query.search || query.q || null,
        sortBy,
        sortDirection
      }
    })
  };
}

async function getCenterOperationalTrendsAnalytics({ tenantId, authUserId, hierarchyNodeId, query = {}, tx = prisma } = {}) {
  const asOfDate = normalizeDate(query.asOf);
  const months = normalizeMonths(query.months);
  const centerScope = await resolveCenterOperationalScope({ tenantId, authUserId, hierarchyNodeId, tx });
  const windows = buildMonthWindows(months, asOfDate);
  const oldestWindow = windows[0];

  const [snapshots, assignments, submissions, examEntries] = await Promise.all([
    tx.centerAnalyticsSnapshot.findMany({
      where: {
        tenantId,
        centerId: centerScope.center.id,
        snapshotDate: {
          gte: oldestWindow.start,
          lt: addUtcMonths(startOfUtcMonth(asOfDate), 1)
        }
      },
      orderBy: [{ snapshotDate: "asc" }],
      select: {
        snapshotDate: true,
        activeStudents: true,
        attendancePercent: true,
        teacherCount: true,
        healthScore: true
      }
    }),
    tx.worksheetAssignment.findMany({
      where: {
        tenantId,
        student: {
          is: {
            hierarchyNodeId: centerScope.center.hierarchyNodeId
          }
        },
        assignedAt: {
          gte: oldestWindow.start,
          lt: addUtcMonths(startOfUtcMonth(asOfDate), 1)
        }
      },
      select: {
        studentId: true,
        assignedAt: true
      }
    }),
    tx.worksheetSubmission.findMany({
      where: {
        tenantId,
        student: {
          is: {
            hierarchyNodeId: centerScope.center.hierarchyNodeId
          }
        },
        submittedAt: {
          gte: oldestWindow.start,
          lt: addUtcMonths(startOfUtcMonth(asOfDate), 1)
        }
      },
      select: {
        studentId: true,
        submittedAt: true
      }
    }),
    tx.examEnrollmentEntry.findMany({
      where: {
        tenantId,
        student: {
          is: {
            hierarchyNodeId: centerScope.center.hierarchyNodeId
          }
        },
        createdAt: {
          gte: oldestWindow.start,
          lt: addUtcMonths(startOfUtcMonth(asOfDate), 1)
        }
      },
      select: {
        studentId: true,
        createdAt: true
      }
    })
  ]);

  const snapshotByMonth = new Map(snapshots.map((snapshot) => [getMonthKey(snapshot.snapshotDate), snapshot]));
  const assignmentsByMonth = new Map();
  const submissionsByMonth = new Map();
  const examParticipantsByMonth = new Map();

  for (const assignment of assignments) {
    const key = getMonthKey(assignment.assignedAt);
    assignmentsByMonth.set(key, (assignmentsByMonth.get(key) || 0) + 1);
  }

  for (const submission of submissions) {
    const key = getMonthKey(submission.submittedAt);
    submissionsByMonth.set(key, (submissionsByMonth.get(key) || 0) + 1);
  }

  for (const entry of examEntries) {
    const key = getMonthKey(entry.createdAt);
    const participants = examParticipantsByMonth.get(key) || new Set();
    participants.add(entry.studentId);
    examParticipantsByMonth.set(key, participants);
  }

  const series = windows.map((window) => {
    const snapshot = snapshotByMonth.get(window.key);
    const assignedCount = assignmentsByMonth.get(window.key) || 0;
    const completedCount = submissionsByMonth.get(window.key) || 0;
    const activeStudents = Math.max(0, toNumber(snapshot?.activeStudents));
    const teacherCount = Math.max(0, toNumber(snapshot?.teacherCount));

    return {
      key: window.key,
      label: window.label,
      activeStudents,
      attendancePercent: roundScore(snapshot?.attendancePercent),
      healthScore: roundScore(snapshot?.healthScore),
      teacherActivityPercent: normalizeTeacherActivity({ teacherCount, activeStudents }),
      worksheetAssignedCount: assignedCount,
      worksheetCompletedCount: completedCount,
      worksheetCompletionRate: normalizeCountRate(completedCount, assignedCount, 0),
      examParticipants: examParticipantsByMonth.get(window.key)?.size || 0
    };
  });

  return {
    summary: {
      months,
      latestAttendancePercent: series.at(-1)?.attendancePercent || 0,
      latestActiveStudents: series.at(-1)?.activeStudents || 0,
      latestWorksheetCompletionRate: series.at(-1)?.worksheetCompletionRate || 0,
      latestExamParticipants: series.at(-1)?.examParticipants || 0
    },
    series,
    meta: buildMeta({
      tenantId,
      centerScope,
      asOfDate,
      source: {
        mode: "snapshot",
        liveFallback: false,
        snapshotDate: serializeDate(asOfDate)
      },
      filters: {
        asOf: query.asOf || null,
        months
      },
      range: {
        start: serializeDate(oldestWindow.start),
        end: serializeDate(windows.at(-1)?.end || asOfDate)
      }
    })
  };
}

export {
  getCenterAttendanceOperationalAnalytics,
  getCenterBatchHealthAnalytics,
  getCenterOperationalAnomaliesAnalytics,
  getCenterOperationalOverviewAnalytics,
  getCenterOperationalTrendsAnalytics,
  getCenterTeacherOperationalAnalytics,
  getCenterWorksheetOperationalAnalytics,
  resolveCenterOperationalScope
};