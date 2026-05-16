import { prisma } from "../lib/prisma.js";
import { resolveCachedBpDashboardSlice } from "./snapshot-cache.service.js";
import { clampScore, roundScore, toNumber } from "./health-score.service.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_MONTHS = 7;
const MAX_MONTHS = 14;
const ATTENDANCE_DELAY_DAYS = 1;
const ATTENDANCE_INACTIVE_DAYS = 3;
const GRADING_OVERDUE_DAYS = 5;
const GRADING_BACKLOG_THRESHOLD = 8;
const CLASSROOM_INACTIVE_DAYS = 7;
const ALERT_QUERY_LIMIT = 50;

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
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

  return Math.max(2, Math.min(MAX_MONTHS, parsed));
}

function normalizeSortDirection(value) {
  return String(value || "desc").trim().toLowerCase() === "asc" ? "asc" : "desc";
}

function normalizeSearch(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.length ? normalized : null;
}

function roundMetric(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(toNumber(value) * factor) / factor;
}

function studentName(row) {
  const firstName = row?.firstName ? String(row.firstName).trim() : "";
  const lastName = row?.lastName ? String(row.lastName).trim() : "";
  return `${firstName} ${lastName}`.trim();
}

function getDaysSince(referenceDate, value) {
  if (!value) {
    return null;
  }

  return Math.max(0, Math.floor((referenceDate.getTime() - normalizeDate(value).getTime()) / (24 * 60 * 60 * 1000)));
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

function stableSortItems(items, sortBy, sortDirection, fallbackKey = "title") {
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

    const fallback = String(left?.[fallbackKey] || left?.name || left?.id || "").localeCompare(
      String(right?.[fallbackKey] || right?.name || right?.id || "")
    );
    if (fallback !== 0) {
      return fallback;
    }

    return String(left?.id || "").localeCompare(String(right?.id || ""));
  });
}

function formatMonthLabel(value) {
  return normalizeDate(value).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
}

function buildMonthWindows(months, asOfDate = new Date()) {
  const currentMonthStart = startOfUtcMonth(asOfDate);
  const windows = [];

  for (let index = months - 1; index >= 0; index -= 1) {
    const start = addUtcMonths(currentMonthStart, -index);
    const end = addUtcMonths(start, 1);
    windows.push({
      key: start.toISOString().slice(0, 7),
      label: formatMonthLabel(start),
      start,
      end
    });
  }

  return windows;
}

function buildTeacherProductivityCacheScope(scope) {
  return {
    businessPartner: { id: scope.businessPartnerId },
    franchiseIds: [scope.franchiseId],
    centerIds: [scope.centerId],
    hierarchyNodeIds: [scope.hierarchyNodeId]
  };
}

function buildProductivityMeta({ scope, source, asOf }) {
  return {
    scope: {
      teacherUserId: scope.teacherUserId,
      teacherProfileId: scope.teacherProfileId,
      teacherName: scope.teacherName,
      hierarchyNodeId: scope.hierarchyNodeId,
      centerId: scope.centerId,
      centerName: scope.centerName,
      franchiseId: scope.franchiseId,
      businessPartnerId: scope.businessPartnerId
    },
    source,
    asOf: normalizeDate(asOf).toISOString()
  };
}

async function resolveTeacherOperationalScope({ tenantId, authUserId, hierarchyNodeId, tx = prisma } = {}) {
  if (!tenantId || !authUserId) {
    throw createHttpError(400, "Teacher scope missing", "TEACHER_SCOPE_REQUIRED");
  }

  const teacher = await tx.teacherProfile.findFirst({
    where: {
      tenantId,
      authUserId,
      isActive: true,
      status: { not: "ARCHIVED" }
    },
    select: {
      id: true,
      fullName: true,
      hierarchyNodeId: true,
      authUserId: true,
      authUser: {
        select: {
          username: true,
          email: true,
          hierarchyNodeId: true,
          isActive: true
        }
      }
    }
  });

  if (!teacher?.authUser?.isActive) {
    throw createHttpError(403, "Teacher scope unavailable", "TEACHER_SCOPE_UNAVAILABLE");
  }

  const resolvedHierarchyNodeId = teacher.hierarchyNodeId || teacher.authUser.hierarchyNodeId || hierarchyNodeId || null;
  if (!resolvedHierarchyNodeId) {
    throw createHttpError(409, "Teacher hierarchy node is required", "TEACHER_HIERARCHY_REQUIRED");
  }

  if (hierarchyNodeId && hierarchyNodeId !== resolvedHierarchyNodeId) {
    throw createHttpError(403, "Teacher scope mismatch", "TEACHER_SCOPE_MISMATCH");
  }

  const center = await tx.centerProfile.findFirst({
    where: {
      tenantId,
      authUser: {
        is: {
          hierarchyNodeId: resolvedHierarchyNodeId
        }
      },
      status: { not: "ARCHIVED" }
    },
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      franchiseProfileId: true,
      franchiseProfile: {
        select: {
          businessPartnerId: true
        }
      }
    }
  });

  if (!center?.franchiseProfileId || !center?.franchiseProfile?.businessPartnerId) {
    throw createHttpError(409, "Teacher center scope unavailable", "TEACHER_CENTER_SCOPE_REQUIRED");
  }

  return {
    tenantId,
    teacherUserId: authUserId,
    teacherProfileId: teacher.id,
    teacherName: teacher.fullName || teacher.authUser.username || teacher.authUser.email || "Teacher",
    hierarchyNodeId: resolvedHierarchyNodeId,
    centerId: center.id,
    centerName: center.displayName || center.name || center.code || "Center",
    franchiseId: center.franchiseProfileId,
    businessPartnerId: center.franchiseProfile.businessPartnerId
  };
}

async function resolveTeacherProductivitySnapshotContext({ scope, asOf, tx = prisma } = {}) {
  const normalizedAsOf = startOfUtcDay(asOf || new Date());
  const snapshot = await tx.centerAnalyticsSnapshot.findFirst({
    where: {
      tenantId: scope.tenantId,
      businessPartnerId: scope.businessPartnerId,
      franchiseId: scope.franchiseId,
      centerId: scope.centerId,
      snapshotDate: { lte: normalizedAsOf }
    },
    orderBy: [{ snapshotDate: "desc" }],
    select: {
      snapshotDate: true,
      activeStudents: true,
      attendancePercent: true,
      teacherCount: true,
      healthScore: true,
      updatedAt: true
    }
  });

  return {
    asOf: normalizedAsOf,
    source: snapshot
      ? {
          mode: "snapshot-first-live-teacher",
          snapshotDate: snapshot.snapshotDate.toISOString(),
          liveFallback: false,
          centerSnapshot: {
            activeStudents: toNumber(snapshot.activeStudents),
            attendancePercent: roundMetric(snapshot.attendancePercent),
            teacherCount: toNumber(snapshot.teacherCount),
            healthScore: roundMetric(snapshot.healthScore),
            updatedAt: snapshot.updatedAt?.toISOString?.() || null
          }
        }
      : {
          mode: "live-fallback",
          snapshotDate: normalizedAsOf.toISOString(),
          liveFallback: true,
          centerSnapshot: null
        }
  };
}

async function listTeacherAssignedStudents(scope, tx = prisma) {
  return tx.student.findMany({
    where: {
      tenantId: scope.tenantId,
      hierarchyNodeId: scope.hierarchyNodeId,
      currentTeacherUserId: scope.teacherUserId,
      isActive: true
    },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      updatedAt: true,
      createdAt: true,
      level: {
        select: {
          name: true
        }
      }
    },
    orderBy: [{ createdAt: "asc" }]
  });
}

async function listTeacherAssignedBatches(scope, tx = prisma) {
  return tx.batch.findMany({
    where: {
      tenantId: scope.tenantId,
      hierarchyNodeId: scope.hierarchyNodeId,
      isActive: true,
      teacherAssignments: {
        some: {
          tenantId: scope.tenantId,
          teacherUserId: scope.teacherUserId
        }
      }
    },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      enrollments: {
        where: {
          tenantId: scope.tenantId,
          assignedTeacherUserId: scope.teacherUserId,
          status: "ACTIVE"
        },
        select: {
          studentId: true
        }
      }
    },
    orderBy: [{ createdAt: "asc" }]
  });
}

async function getTeacherAttendanceProductivityAnalytics({ tenantId, authUserId, hierarchyNodeId, query = {}, tx = prisma } = {}) {
  const scope = await resolveTeacherOperationalScope({ tenantId, authUserId, hierarchyNodeId, tx });
  const snapshotContext = await resolveTeacherProductivitySnapshotContext({ scope, asOf: query.asOf, tx });
  const referenceDate = normalizeDate(query.asOf || snapshotContext.asOf);
  const delayedCutoff = addUtcDays(startOfUtcDay(referenceDate), -ATTENDANCE_DELAY_DAYS);
  const batches = await listTeacherAssignedBatches(scope, tx);
  const batchIds = batches.map((batch) => batch.id);

  const [sessions, absenteeEntries] = batchIds.length
    ? await Promise.all([
        tx.attendanceSession.findMany({
          where: {
            tenantId: scope.tenantId,
            hierarchyNodeId: scope.hierarchyNodeId,
            batchId: { in: batchIds },
            date: { lte: referenceDate }
          },
          select: {
            id: true,
            batchId: true,
            date: true,
            status: true,
            publishedAt: true,
            updatedAt: true
          },
          orderBy: [{ date: "desc" }]
        }),
        tx.attendanceEntry.findMany({
          where: {
            tenantId: scope.tenantId,
            status: "ABSENT",
            student: {
              tenantId: scope.tenantId,
              hierarchyNodeId: scope.hierarchyNodeId,
              currentTeacherUserId: scope.teacherUserId
            },
            session: {
              batchId: { in: batchIds },
              date: { gte: addUtcDays(referenceDate, -14), lte: referenceDate }
            }
          },
          select: {
            studentId: true,
            session: {
              select: {
                date: true,
                batchId: true,
                batch: {
                  select: {
                    name: true
                  }
                }
              }
            },
            student: {
              select: {
                admissionNo: true,
                firstName: true,
                lastName: true
              }
            }
          }
        })
      ])
    : [[], []];

  const completedSessions = sessions.filter((session) => session.status === "PUBLISHED" || session.status === "LOCKED");
  const delayedSessions = sessions.filter((session) => session.status === "DRAFT" && normalizeDate(session.date) < delayedCutoff);
  const lastCompletedSession = completedSessions[0] || null;
  const assignedBatchCount = batches.length;
  const expectedSessionCount = assignedBatchCount;
  const completedSessionCount = completedSessions.length;
  const delayedAttendanceCount = delayedSessions.length;
  const absenteeFollowUpCount = new Set(absenteeEntries.map((entry) => entry.studentId)).size;
  const attendanceCompletionRate = expectedSessionCount > 0
    ? roundMetric((completedSessionCount / expectedSessionCount) * 100)
    : 100;
  const delayedAttendanceRate = sessions.length > 0 ? roundMetric((delayedAttendanceCount / sessions.length) * 100) : 0;
  const absenteeFollowUpRate = absenteeEntries.length > 0
    ? roundMetric((absenteeFollowUpCount / Math.max(1, absenteeEntries.length)) * 100)
    : 100;
  const lastActivityDays = getDaysSince(referenceDate, lastCompletedSession?.publishedAt || lastCompletedSession?.updatedAt || null);
  const responsivenessScore = clampScore(100 - (delayedAttendanceRate * 0.8) - Math.max(0, toNumber(lastActivityDays) - 1) * 8);
  const completionScore = clampScore((attendanceCompletionRate * 0.65) + (responsivenessScore * 0.35));

  return {
    summary: {
      assignedBatchCount,
      expectedSessionCount,
      completedSessionCount,
      delayedAttendanceCount,
      absenteeFollowUpCount,
      attendanceCompletionRate,
      delayedAttendanceRate,
      absenteeFollowUpRate,
      responsivenessScore,
      completionScore,
      inactiveTaskDetected: lastActivityDays !== null && lastActivityDays >= ATTENDANCE_INACTIVE_DAYS,
      lastRecordedAttendanceAt: lastCompletedSession?.publishedAt || lastCompletedSession?.updatedAt || null
    },
    delayedSessions: delayedSessions.slice(0, 10).map((session) => ({
      sessionId: session.id,
      batchId: session.batchId,
      batchName: batches.find((batch) => batch.id === session.batchId)?.name || null,
      date: session.date,
      status: session.status,
      delayedDays: getDaysSince(referenceDate, session.date),
      updatedAt: session.updatedAt
    })),
    absenteePreview: absenteeEntries.slice(0, 10).map((entry) => ({
      studentId: entry.studentId,
      studentName: studentName(entry.student),
      admissionNo: entry.student.admissionNo,
      batchId: entry.session.batchId,
      batchName: entry.session.batch?.name || null,
      sessionDate: entry.session.date
    })),
    meta: buildProductivityMeta({ scope, source: snapshotContext.source, asOf: referenceDate })
  };
}

async function getTeacherGradingProductivityAnalytics({ tenantId, authUserId, hierarchyNodeId, query = {}, tx = prisma } = {}) {
  const scope = await resolveTeacherOperationalScope({ tenantId, authUserId, hierarchyNodeId, tx });
  const snapshotContext = await resolveTeacherProductivitySnapshotContext({ scope, asOf: query.asOf, tx });
  const referenceDate = normalizeDate(query.asOf || snapshotContext.asOf);
  const overdueCutoff = addUtcDays(startOfUtcDay(referenceDate), -GRADING_OVERDUE_DAYS);
  const students = await listTeacherAssignedStudents(scope, tx);
  const studentIds = students.map((student) => student.id);

  const [assignments, submissions] = studentIds.length
    ? await Promise.all([
        tx.worksheetAssignment.findMany({
          where: {
            tenantId: scope.tenantId,
            studentId: { in: studentIds },
            isActive: true,
            unassignedAt: null,
            assignedAt: { lte: referenceDate }
          },
          select: {
            worksheetId: true,
            studentId: true,
            assignedAt: true,
            student: {
              select: {
                admissionNo: true,
                firstName: true,
                lastName: true,
                level: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        }),
        tx.worksheetSubmission.findMany({
          where: {
            tenantId: scope.tenantId,
            studentId: { in: studentIds },
            submittedAt: { lte: referenceDate }
          },
          select: {
            id: true,
            worksheetId: true,
            studentId: true,
            score: true,
            submittedAt: true,
            status: true,
            updatedAt: true,
            student: {
              select: {
                admissionNo: true,
                firstName: true,
                lastName: true,
                level: {
                  select: {
                    name: true
                  }
                }
              }
            }
          },
          orderBy: [{ submittedAt: "desc" }]
        })
      ])
    : [[], []];

  const submissionByKey = new Map(submissions.map((submission) => [`${submission.studentId}:${submission.worksheetId}`, submission]));
  const completedAssignments = assignments.filter((assignment) => submissionByKey.has(`${assignment.studentId}:${assignment.worksheetId}`));
  const pendingAssignments = assignments.filter((assignment) => !submissionByKey.has(`${assignment.studentId}:${assignment.worksheetId}`));
  const pendingReviews = submissions.filter((submission) => submission.status !== "REVIEWED");
  const overdueReviews = pendingReviews.filter((submission) => normalizeDate(submission.submittedAt) < overdueCutoff);
  const assignedWorksheetCount = assignments.length;
  const completedWorksheetCount = completedAssignments.length;
  const pendingWorksheetCount = pendingAssignments.length;
  const pendingReviewCount = pendingReviews.length;
  const overdueReviewCount = overdueReviews.length;
  const gradingThroughputRate = assignedWorksheetCount > 0
    ? roundMetric((completedWorksheetCount / assignedWorksheetCount) * 100)
    : 100;
  const worksheetReviewCompletionRate = submissions.length > 0
    ? roundMetric(((submissions.length - pendingReviewCount) / submissions.length) * 100)
    : 100;
  const overdueReviewRate = submissions.length > 0
    ? roundMetric((overdueReviewCount / submissions.length) * 100)
    : 0;
  const gradingThroughputScore = clampScore((gradingThroughputRate * 0.55) + (worksheetReviewCompletionRate * 0.45));
  const reviewRecoveryScore = clampScore(100 - overdueReviewRate - Math.max(0, pendingReviewCount - 2) * 4);
  const gradingProductivityScore = clampScore((gradingThroughputScore * 0.6) + (reviewRecoveryScore * 0.4));

  return {
    summary: {
      assignedWorksheetCount,
      completedWorksheetCount,
      pendingWorksheetCount,
      pendingReviewCount,
      overdueReviewCount,
      gradingThroughputRate,
      worksheetReviewCompletionRate,
      overdueReviewRate,
      gradingThroughputScore,
      reviewRecoveryScore,
      gradingProductivityScore,
      backlogDetected: pendingReviewCount >= GRADING_BACKLOG_THRESHOLD
    },
    backlogPreview: pendingReviews.slice(0, 10).map((submission) => ({
      submissionId: submission.id,
      worksheetId: submission.worksheetId,
      studentId: submission.studentId,
      studentName: studentName(submission.student),
      admissionNo: submission.student.admissionNo,
      levelName: submission.student.level?.name || null,
      submittedAt: submission.submittedAt,
      pendingDays: getDaysSince(referenceDate, submission.submittedAt),
      status: submission.status || "PENDING"
    })),
    overduePreview: overdueReviews.slice(0, 10).map((submission) => ({
      submissionId: submission.id,
      worksheetId: submission.worksheetId,
      studentId: submission.studentId,
      studentName: studentName(submission.student),
      admissionNo: submission.student.admissionNo,
      submittedAt: submission.submittedAt,
      overdueDays: getDaysSince(referenceDate, submission.submittedAt),
      status: submission.status || "PENDING"
    })),
    meta: buildProductivityMeta({ scope, source: snapshotContext.source, asOf: referenceDate })
  };
}

async function computeTeacherProductivityDataset({ tenantId, authUserId, hierarchyNodeId, query = {}, tx = prisma } = {}) {
  const scope = await resolveTeacherOperationalScope({ tenantId, authUserId, hierarchyNodeId, tx });
  const snapshotContext = await resolveTeacherProductivitySnapshotContext({ scope, asOf: query.asOf, tx });
  const referenceDate = normalizeDate(query.asOf || snapshotContext.asOf);
  const students = await listTeacherAssignedStudents(scope, tx);
  const studentIds = students.map((student) => student.id);
  const batches = await listTeacherAssignedBatches(scope, tx);
  const batchIds = batches.map((batch) => batch.id);

  const [attendanceAnalytics, gradingAnalytics, attendanceSessions, worksheetSubmissions] = await Promise.all([
    getTeacherAttendanceProductivityAnalytics({ tenantId, authUserId, hierarchyNodeId, query, tx }),
    getTeacherGradingProductivityAnalytics({ tenantId, authUserId, hierarchyNodeId, query, tx }),
    batchIds.length
      ? tx.attendanceSession.findMany({
          where: {
            tenantId: scope.tenantId,
            hierarchyNodeId: scope.hierarchyNodeId,
            batchId: { in: batchIds },
            date: { lte: referenceDate }
          },
          select: {
            id: true,
            batchId: true,
            date: true,
            status: true,
            updatedAt: true
          }
        })
      : [],
    studentIds.length
      ? tx.worksheetSubmission.findMany({
          where: {
            tenantId: scope.tenantId,
            studentId: { in: studentIds },
            submittedAt: { lte: referenceDate }
          },
          select: {
            id: true,
            studentId: true,
            worksheetId: true,
            submittedAt: true,
            status: true,
            updatedAt: true
          }
        })
      : []
  ]);

  const lastStudentActivityAt = students.reduce((latest, student) => {
    const value = normalizeDate(student.updatedAt || student.createdAt, null);
    if (!value) {
      return latest;
    }
    return !latest || value > latest ? value : latest;
  }, null);

  const classroomActivityDays = getDaysSince(referenceDate, lastStudentActivityAt);
  const classroomActivityScore = clampScore(100 - Math.max(0, toNumber(classroomActivityDays) - 1) * 10);
  const operationalResponsivenessScore = clampScore(
    (attendanceAnalytics.summary.responsivenessScore * 0.5) + (gradingAnalytics.summary.reviewRecoveryScore * 0.5)
  );
  const overallProductivityScore = clampScore(
    (attendanceAnalytics.summary.completionScore * 0.35)
      + (gradingAnalytics.summary.gradingProductivityScore * 0.4)
      + (classroomActivityScore * 0.25)
  );

  const queueItems = [];

  for (const delayedSession of attendanceAnalytics.delayedSessions) {
    queueItems.push({
      id: `attendance:${delayedSession.sessionId}`,
      queueType: "ATTENDANCE",
      itemType: "DELAYED_ATTENDANCE_SUBMISSION",
      title: `Attendance pending for ${delayedSession.batchName || "assigned batch"}`,
      summary: `Attendance for ${normalizeDate(delayedSession.date).toISOString().slice(0, 10)} is still in ${delayedSession.status}.`,
      severity: delayedSession.delayedDays >= 3 ? "HIGH" : "WARNING",
      priorityScore: clampScore(65 + toNumber(delayedSession.delayedDays) * 8),
      delayedDays: delayedSession.delayedDays,
      sessionId: delayedSession.sessionId,
      batchId: delayedSession.batchId,
      batchName: delayedSession.batchName,
      dueAt: addUtcDays(normalizeDate(delayedSession.date), ATTENDANCE_DELAY_DAYS),
      createdAt: delayedSession.date,
      updatedAt: delayedSession.updatedAt,
      status: "OPEN"
    });
  }

  for (const overdueReview of gradingAnalytics.overduePreview) {
    queueItems.push({
      id: `grading:${overdueReview.submissionId}`,
      queueType: "GRADING",
      itemType: "OVERDUE_WORKSHEET_REVIEW",
      title: `Review overdue for ${overdueReview.studentName}`,
      summary: `Worksheet review has been pending for ${overdueReview.overdueDays} days.`,
      severity: overdueReview.overdueDays >= 7 ? "HIGH" : "WARNING",
      priorityScore: clampScore(60 + toNumber(overdueReview.overdueDays) * 6),
      delayedDays: overdueReview.overdueDays,
      submissionId: overdueReview.submissionId,
      studentId: overdueReview.studentId,
      studentName: overdueReview.studentName,
      dueAt: addUtcDays(normalizeDate(overdueReview.submittedAt), GRADING_OVERDUE_DAYS),
      createdAt: overdueReview.submittedAt,
      updatedAt: overdueReview.submittedAt,
      status: "OPEN"
    });
  }

  if (classroomActivityDays !== null && classroomActivityDays >= CLASSROOM_INACTIVE_DAYS) {
    queueItems.push({
      id: `classroom:${scope.teacherUserId}`,
      queueType: "CLASSROOM",
      itemType: "INACTIVE_CLASSROOM_ACTIVITY",
      title: "Classroom activity is stale",
      summary: `No recent assigned-student updates were detected for ${classroomActivityDays} days.`,
      severity: classroomActivityDays >= 10 ? "HIGH" : "WARNING",
      priorityScore: clampScore(55 + toNumber(classroomActivityDays) * 5),
      delayedDays: classroomActivityDays,
      dueAt: addUtcDays(referenceDate, 1),
      createdAt: lastStudentActivityAt,
      updatedAt: lastStudentActivityAt,
      status: "OPEN"
    });
  }

  if (gradingAnalytics.summary.backlogDetected) {
    queueItems.push({
      id: `grading-backlog:${scope.teacherUserId}`,
      queueType: "GRADING",
      itemType: "GRADING_BACKLOG",
      title: "Grading backlog requires recovery",
      summary: `${gradingAnalytics.summary.pendingReviewCount} worksheet submissions are still pending review.`,
      severity: gradingAnalytics.summary.pendingReviewCount >= 12 ? "HIGH" : "WARNING",
      priorityScore: clampScore(58 + gradingAnalytics.summary.pendingReviewCount * 3),
      delayedDays: null,
      dueAt: addUtcDays(referenceDate, 1),
      createdAt: referenceDate,
      updatedAt: referenceDate,
      status: "OPEN"
    });
  }

  if (queueItems.length >= 3) {
    queueItems.push({
      id: `operational-pending:${scope.teacherUserId}`,
      queueType: "WORKFLOW",
      itemType: "PENDING_OPERATIONAL_TASKS",
      title: "Operational task queue requires attention",
      summary: `${queueItems.length} operational actions are currently open.`,
      severity: queueItems.length >= 5 ? "HIGH" : "WARNING",
      priorityScore: clampScore(50 + queueItems.length * 4),
      delayedDays: null,
      dueAt: addUtcDays(referenceDate, 1),
      createdAt: referenceDate,
      updatedAt: referenceDate,
      status: "OPEN"
    });
  }

  if (queueItems.length > 0) {
    queueItems.push({
      id: `classroom-anomalies:${scope.teacherUserId}`,
      queueType: "WORKFLOW",
      itemType: "UNRESOLVED_CLASSROOM_ANOMALIES",
      title: "Classroom anomalies remain unresolved",
      summary: `${queueItems.length} classroom productivity anomalies are still active.`,
      severity: queueItems.some((item) => item.severity === "HIGH") ? "HIGH" : "WARNING",
      priorityScore: clampScore(52 + queueItems.length * 3),
      delayedDays: null,
      dueAt: addUtcDays(referenceDate, 1),
      createdAt: referenceDate,
      updatedAt: referenceDate,
      status: "OPEN"
    });
  }

  const months = normalizeMonths(query.months);
  const monthWindows = buildMonthWindows(months, referenceDate);
  const attendanceByMonth = new Map();
  const gradingByMonth = new Map();

  for (const session of attendanceSessions) {
    const key = normalizeDate(session.date).toISOString().slice(0, 7);
    if (!attendanceByMonth.has(key)) {
      attendanceByMonth.set(key, { total: 0, completed: 0, delayed: 0 });
    }

    const bucket = attendanceByMonth.get(key);
    bucket.total += 1;
    if (session.status === "PUBLISHED" || session.status === "LOCKED") {
      bucket.completed += 1;
    }
    if (session.status === "DRAFT") {
      bucket.delayed += 1;
    }
  }

  for (const submission of worksheetSubmissions) {
    const key = normalizeDate(submission.submittedAt).toISOString().slice(0, 7);
    if (!gradingByMonth.has(key)) {
      gradingByMonth.set(key, { submitted: 0, overdue: 0 });
    }

    const bucket = gradingByMonth.get(key);
    bucket.submitted += 1;
    if (submission.status !== "REVIEWED" && normalizeDate(submission.submittedAt) < addUtcDays(referenceDate, -GRADING_OVERDUE_DAYS)) {
      bucket.overdue += 1;
    }
  }

  const trends = monthWindows.map((window) => {
    const attendance = attendanceByMonth.get(window.key) || { total: 0, completed: 0, delayed: 0 };
    const grading = gradingByMonth.get(window.key) || { submitted: 0, overdue: 0 };
    const attendanceCompletionRate = attendance.total > 0 ? roundMetric((attendance.completed / attendance.total) * 100) : 100;
    const gradingRecoveryRate = grading.submitted > 0 ? roundMetric(((grading.submitted - grading.overdue) / grading.submitted) * 100) : 100;

    return {
      key: window.key,
      label: window.label,
      attendanceCompletionRate,
      delayedAttendanceCount: attendance.delayed,
      gradingRecoveryRate,
      overdueReviewCount: grading.overdue,
      productivityScore: clampScore((attendanceCompletionRate * 0.45) + (gradingRecoveryRate * 0.55))
    };
  });

  return {
    scope,
    source: snapshotContext.source,
    overview: {
      assignedStudentCount: students.length,
      assignedBatchCount: batches.length,
      attendanceCompletionRate: attendanceAnalytics.summary.attendanceCompletionRate,
      gradingThroughputRate: gradingAnalytics.summary.gradingThroughputRate,
      worksheetReviewCompletionRate: gradingAnalytics.summary.worksheetReviewCompletionRate,
      overdueActionCount: queueItems.length,
      classroomActivityScore,
      operationalResponsivenessScore,
      overallProductivityScore,
      inactiveTaskDetected: queueItems.some((item) => item.itemType === "INACTIVE_CLASSROOM_ACTIVITY")
    },
    attendance: attendanceAnalytics,
    grading: gradingAnalytics,
    queue: queueItems,
    trends,
    meta: buildProductivityMeta({ scope, source: snapshotContext.source, asOf: referenceDate })
  };
}

async function getTeacherOperationalOverviewAnalytics({ tenantId, authUserId, hierarchyNodeId, query = {}, tx = prisma } = {}) {
  const dataset = await computeTeacherProductivityDataset({ tenantId, authUserId, hierarchyNodeId, query, tx });
  return {
    data: dataset.overview,
    meta: dataset.meta
  };
}

async function getTeacherOperationalTaskQueue({ tenantId, authUserId, hierarchyNodeId, query = {}, tx = prisma } = {}) {
  const dataset = await computeTeacherProductivityDataset({ tenantId, authUserId, hierarchyNodeId, query, tx });
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);
  const search = normalizeSearch(query.search || query.q);
  const sortBy = String(query.sortBy || "priorityScore").trim();
  const sortDirection = normalizeSortDirection(query.sortDirection || query.sortOrder);

  const filtered = dataset.queue.filter((item) =>
    matchesSearch([item.title, item.summary, item.queueType, item.itemType, item.studentName, item.batchName], search)
  );

  const sorted = stableSortItems(filtered, sortBy, sortDirection, "title");
  return {
    data: {
      summary: {
        total: dataset.queue.length,
        attendanceCount: dataset.queue.filter((item) => item.queueType === "ATTENDANCE").length,
        gradingCount: dataset.queue.filter((item) => item.queueType === "GRADING").length,
        classroomCount: dataset.queue.filter((item) => item.queueType === "CLASSROOM").length,
        workflowCount: dataset.queue.filter((item) => item.queueType === "WORKFLOW").length
      },
      ...paginateItems(sorted, { limit, offset })
    },
    meta: dataset.meta
  };
}

async function getTeacherOperationalAnomaliesAnalytics({ tenantId, authUserId, hierarchyNodeId, query = {}, tx = prisma } = {}) {
  const dataset = await computeTeacherProductivityDataset({ tenantId, authUserId, hierarchyNodeId, query, tx });
  const limit = normalizeLimit(query.limit || ALERT_QUERY_LIMIT);
  const offset = normalizeOffset(query.offset);
  const search = normalizeSearch(query.search || query.q);
  const sortBy = String(query.sortBy || "priorityScore").trim();
  const sortDirection = normalizeSortDirection(query.sortDirection || query.sortOrder);
  const typeFilter = query.type ? String(query.type).trim().toUpperCase() : null;
  const severityFilter = query.severity ? String(query.severity).trim().toUpperCase() : null;

  const filtered = dataset.queue.filter((item) => {
    if (typeFilter && item.itemType !== typeFilter) {
      return false;
    }
    if (severityFilter && item.severity !== severityFilter) {
      return false;
    }

    return matchesSearch([item.title, item.summary, item.queueType, item.itemType, item.studentName, item.batchName], search);
  });

  const sorted = stableSortItems(filtered, sortBy, sortDirection, "title");
  const paginated = paginateItems(sorted, { limit, offset });

  return {
    items: paginated.items,
    total: paginated.total,
    limit,
    offset,
    summary: {
      total: dataset.queue.length,
      highSeverityCount: dataset.queue.filter((item) => item.severity === "HIGH").length,
      warningCount: dataset.queue.filter((item) => item.severity === "WARNING").length,
      inactiveClassroomDetected: dataset.queue.some((item) => item.itemType === "INACTIVE_CLASSROOM_ACTIVITY")
    },
    meta: dataset.meta
  };
}

async function getTeacherOperationalTrendsAnalytics({ tenantId, authUserId, hierarchyNodeId, query = {}, tx = prisma } = {}) {
  const dataset = await computeTeacherProductivityDataset({ tenantId, authUserId, hierarchyNodeId, query, tx });
  const bestMonth = dataset.trends.reduce(
    (best, item) => (!best || item.productivityScore > best.productivityScore ? item : best),
    null
  );
  const weakestMonth = dataset.trends.reduce(
    (worst, item) => (!worst || item.productivityScore < worst.productivityScore ? item : worst),
    null
  );

  return {
    items: dataset.trends,
    summary: {
      latestProductivityScore: dataset.trends[dataset.trends.length - 1]?.productivityScore || dataset.overview.overallProductivityScore,
      bestMonth,
      weakestMonth
    },
    meta: dataset.meta
  };
}

async function getTeacherAttendanceProductivityDashboardSlice({ tenantId, authUserId, hierarchyNodeId, query = {}, tx = prisma } = {}) {
  const data = await getTeacherAttendanceProductivityAnalytics({ tenantId, authUserId, hierarchyNodeId, query, tx });
  return {
    data: {
      summary: data.summary,
      delayedSessions: data.delayedSessions,
      absenteePreview: data.absenteePreview
    },
    meta: data.meta
  };
}

async function getTeacherGradingProductivityDashboardSlice({ tenantId, authUserId, hierarchyNodeId, query = {}, tx = prisma } = {}) {
  const data = await getTeacherGradingProductivityAnalytics({ tenantId, authUserId, hierarchyNodeId, query, tx });
  return {
    data: {
      summary: data.summary,
      backlogPreview: data.backlogPreview,
      overduePreview: data.overduePreview
    },
    meta: data.meta
  };
}

async function resolveCachedTeacherDashboardSlice({ tenantId, authUserId, hierarchyNodeId, query = {}, segment, loader, tx = prisma } = {}) {
  const scope = await resolveTeacherOperationalScope({ tenantId, authUserId, hierarchyNodeId, tx });
  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope: buildTeacherProductivityCacheScope(scope),
    segment,
    filters: {
      teacherUserId: scope.teacherUserId,
      asOf: query.asOf || null,
      limit: query.limit || null,
      offset: query.offset || null,
      months: query.months || null,
      type: query.type || null,
      severity: query.severity || null,
      sortBy: query.sortBy || null,
      sortDirection: query.sortDirection || query.sortOrder || null,
      search: query.search || query.q || null
    },
    loader: () => loader(scope)
  });
}

export {
  ALERT_QUERY_LIMIT,
  resolveTeacherOperationalScope,
  getTeacherAttendanceProductivityAnalytics,
  getTeacherGradingProductivityAnalytics,
  getTeacherOperationalOverviewAnalytics,
  getTeacherOperationalTaskQueue,
  getTeacherOperationalAnomaliesAnalytics,
  getTeacherOperationalTrendsAnalytics,
  getTeacherAttendanceProductivityDashboardSlice,
  getTeacherGradingProductivityDashboardSlice,
  resolveCachedTeacherDashboardSlice
};