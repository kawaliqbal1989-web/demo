import { prisma } from "../lib/prisma.js";
import { clampScore, normalizeGrowthPercent, roundScore, toNumber } from "./health-score.service.js";
import { checkAndAwardMilestones, computeStreaks } from "./student-coach.service.js";
import { getLevelPerformance } from "./student-performance.service.js";

const ENGAGEMENT_CACHE_TTL_MS = 30_000;
const DEFAULT_LOOKBACK_DAYS = 14;
const DEFAULT_WEAK_TOPIC_LOOKBACK = 20;
const MAX_WEAK_TOPIC_LOOKBACK = 100;
const DEFAULT_THRESHOLD = 60;
const PRACTICE_STREAK_TARGET = 14;
const ATTENDANCE_STREAK_TARGET = 30;
const INACTIVITY_RISK_DAYS = 14;
const engagementCache = new Map();
const engagementInflightCache = new Map();

const EXTRA_ACHIEVEMENT_DEFS = Object.freeze([
  {
    key: "attendance_consistency_90",
    title: "Attendance Anchor",
    description: "Maintained at least 90% attendance consistency.",
    icon: "📗"
  },
  {
    key: "practice_consistency_7",
    title: "Practice Rhythm",
    description: "Reached 7 active practice days in the last two weeks.",
    icon: "🎵"
  },
  {
    key: "exam_participation_1",
    title: "Exam Ready",
    description: "Participated in your first exam cycle.",
    icon: "🎯"
  },
  {
    key: "exam_participation_3",
    title: "Exam Explorer",
    description: "Participated in three exam cycles.",
    icon: "🏁"
  }
]);

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
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

function startOfUtcWeek(value = new Date()) {
  const normalized = startOfUtcDay(value);
  const day = normalized.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  return new Date(normalized.getTime() - offset * 24 * 60 * 60 * 1000);
}

function addUtcDays(value, days) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function buildDayWindows(days, asOf = new Date()) {
  const end = startOfUtcDay(asOf);
  const windows = [];

  for (let index = days - 1; index >= 0; index -= 1) {
    const start = addUtcDays(end, -index);
    windows.push({
      key: start.toISOString().slice(0, 10),
      label: start.toISOString().slice(5, 10),
      start,
      end: addUtcDays(start, 1)
    });
  }

  return windows;
}

function pruneExpiredCache(now = Date.now()) {
  for (const [key, entry] of engagementCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      engagementCache.delete(key);
    }
  }
}

function buildCacheKey({ tenantId, studentId, segment, filters = {} }) {
  return JSON.stringify({ tenantId, studentId, segment, filters });
}

async function resolveCachedStudentEngagementSlice({ tenantId, studentId, segment, filters = {}, loader }) {
  pruneExpiredCache();
  const cacheKey = buildCacheKey({ tenantId, studentId, segment, filters });
  const cached = engagementCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cloneData(cached.payload);
  }

  const inflight = engagementInflightCache.get(cacheKey);
  if (inflight) {
    return cloneData(await inflight);
  }

  const pendingLoad = (async () => {
    const payload = await loader();
    engagementCache.set(cacheKey, {
      payload: cloneData(payload),
      expiresAt: now + ENGAGEMENT_CACHE_TTL_MS
    });
    return payload;
  })();

  engagementInflightCache.set(cacheKey, pendingLoad);

  try {
    return cloneData(await pendingLoad);
  } finally {
    engagementInflightCache.delete(cacheKey);
  }
}

function safeName(firstName, lastName) {
  return [String(firstName || "").trim(), String(lastName || "").trim()].filter(Boolean).join(" ").trim();
}

function getDaysSince(asOf, value) {
  if (!value) {
    return null;
  }

  return Math.max(0, Math.floor((startOfUtcDay(asOf).getTime() - startOfUtcDay(value).getTime()) / (24 * 60 * 60 * 1000)));
}

function scoreFromStreak(value, target) {
  if (!target || target <= 0) {
    return 50;
  }

  return clampScore((Math.max(0, toNumber(value)) / target) * 100);
}

function computeEngagementScoring({
  attendanceRate,
  practiceActiveDays,
  dayWindowCount,
  practiceStreakCurrent,
  attendanceStreakCurrent,
  completedWorksheetCount,
  pendingWorksheetCount,
  examParticipationCount,
  inactiveDays,
  momentumPercent
}) {
  const practiceConsistency = dayWindowCount > 0 ? clampScore((practiceActiveDays / dayWindowCount) * 100) : 50;
  const consistencyScore = roundScore((clampScore(attendanceRate ?? 50) * 0.45) + (practiceConsistency * 0.55), 2);
  const streakScore = roundScore(
    (scoreFromStreak(practiceStreakCurrent, PRACTICE_STREAK_TARGET) * 0.55)
      + (scoreFromStreak(attendanceStreakCurrent, ATTENDANCE_STREAK_TARGET) * 0.45),
    2
  );

  const totalWorksheetScope = completedWorksheetCount + pendingWorksheetCount;
  const completionScore = totalWorksheetScope > 0
    ? clampScore((completedWorksheetCount / totalWorksheetScope) * 100)
    : 50;
  const participationScore = examParticipationCount > 0
    ? clampScore(Math.min(examParticipationCount, 4) * 25)
    : 35;
  const inactivityRiskScore = inactiveDays === null || inactiveDays === undefined
    ? 25
    : clampScore((Math.min(inactiveDays, INACTIVITY_RISK_DAYS) / INACTIVITY_RISK_DAYS) * 100);
  const momentumScore = normalizeGrowthPercent(momentumPercent, { neutral: 50, positiveCap: 20, negativeCap: -20 });

  const engagementScore = roundScore(
    (consistencyScore * 0.24)
      + (streakScore * 0.18)
      + (participationScore * 0.14)
      + (completionScore * 0.18)
      + ((100 - inactivityRiskScore) * 0.16)
      + (momentumScore * 0.10),
    2
  );

  return {
    engagementScore,
    consistencyScore,
    streakScore,
    participationScore,
    completionScore,
    inactivityRiskScore,
    momentumScore,
    practiceConsistencyScore: practiceConsistency
  };
}

function deriveEngagementBand(score) {
  if (score >= 85) {
    return "THRIVING";
  }
  if (score >= 70) {
    return "STEADY";
  }
  if (score >= 50) {
    return "WATCH";
  }
  return "AT_RISK";
}

function buildTrendItems(windows, grouped, valueKey, secondaryKey = null) {
  return windows.map((window) => {
    const item = grouped.get(window.key) || null;
    return {
      key: window.key,
      label: window.label,
      [valueKey]: item?.[valueKey] || 0,
      ...(secondaryKey ? { [secondaryKey]: item?.[secondaryKey] ?? null } : {})
    };
  });
}

function computeWeeklyStreak(dayKeys = [], minimumActiveDays = 3, asOf = new Date()) {
  const uniqueKeys = Array.from(new Set(dayKeys.filter(Boolean))).sort((left, right) => right.localeCompare(left));
  if (!uniqueKeys.length) {
    return 0;
  }

  const weeks = new Map();
  for (const key of uniqueKeys) {
    const weekKey = startOfUtcWeek(new Date(`${key}T00:00:00.000Z`)).toISOString().slice(0, 10);
    weeks.set(weekKey, (weeks.get(weekKey) || 0) + 1);
  }

  const sortedWeeks = Array.from(weeks.entries()).sort((left, right) => right[0].localeCompare(left[0]));
  const currentWeekKey = startOfUtcWeek(asOf).toISOString().slice(0, 10);
  const previousWeekKey = startOfUtcWeek(addUtcDays(asOf, -7)).toISOString().slice(0, 10);
  if (sortedWeeks[0]?.[0] !== currentWeekKey && sortedWeeks[0]?.[0] !== previousWeekKey) {
    return 0;
  }

  let streak = 0;
  let expectedStart = startOfUtcWeek(asOf);

  for (const [weekKey, activeDays] of sortedWeeks) {
    const expectedKey = expectedStart.toISOString().slice(0, 10);
    if (weekKey !== expectedKey || activeDays < minimumActiveDays) {
      break;
    }
    streak += 1;
    expectedStart = addUtcDays(expectedStart, -7);
  }

  return streak;
}

async function resolveStudentEngagementScope({ tenantId, authUserId, studentId, tx = prisma } = {}) {
  if (!tenantId) {
    throw createHttpError(400, "tenantId is required", "TENANT_REQUIRED");
  }

  let resolvedStudentId = studentId || null;

  if (!resolvedStudentId && authUserId) {
    const authUser = await tx.authUser.findFirst({
      where: {
        tenantId,
        id: authUserId,
        role: "STUDENT",
        isActive: true
      },
      select: {
        studentId: true
      }
    });

    resolvedStudentId = authUser?.studentId || null;
  }

  if (!resolvedStudentId) {
    throw createHttpError(403, "Student scope is required", "STUDENT_SCOPE_REQUIRED");
  }

  const student = await tx.student.findFirst({
    where: {
      tenantId,
      id: resolvedStudentId,
      isActive: true
    },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianEmail: true,
      guardianPhone: true,
      hierarchyNodeId: true,
      levelId: true,
      authUsers: {
        where: {
          tenantId,
          role: "STUDENT",
          isActive: true
        },
        orderBy: [{ createdAt: "asc" }],
        take: 1,
        select: {
          id: true,
          email: true,
          username: true
        }
      },
      level: {
        select: {
          id: true,
          name: true,
          rank: true
        }
      },
      hierarchyNode: {
        select: {
          id: true,
          name: true,
          code: true
        }
      }
    }
  });

  if (!student) {
    throw createHttpError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  return {
    tenantId,
    studentId: student.id,
    studentCode: student.admissionNo,
    studentName: safeName(student.firstName, student.lastName) || student.admissionNo,
    hierarchyNodeId: student.hierarchyNodeId,
    hierarchyNodeName: student.hierarchyNode?.name || null,
    hierarchyNodeCode: student.hierarchyNode?.code || null,
    levelId: student.levelId,
    levelName: student.level?.name || null,
    levelRank: student.level?.rank ?? null,
    studentAuthUserId: student.authUsers[0]?.id || null,
    studentAuthUsername: student.authUsers[0]?.username || null,
    studentAuthEmail: student.authUsers[0]?.email || null,
    guardianName: student.guardianName || null,
    guardianEmail: student.guardianEmail || null,
    guardianPhone: student.guardianPhone || null
  };
}

async function loadLatestEngagementSnapshot({ scope, asOf, tx = prisma } = {}) {
  return tx.studentEngagementSnapshot.findFirst({
    where: {
      tenantId: scope.tenantId,
      studentId: scope.studentId,
      snapshotDate: {
        lte: startOfUtcDay(asOf)
      }
    },
    orderBy: [{ snapshotDate: "desc" }]
  });
}

function normalizeWeakTopics(threshold, lookback) {
  const normalizedThreshold = Number.isFinite(Number(threshold)) ? Math.min(100, Math.max(0, Number(threshold))) : DEFAULT_THRESHOLD;
  const normalizedLookback = Number.isFinite(Number(lookback))
    ? Math.min(MAX_WEAK_TOPIC_LOOKBACK, Math.max(1, Number(lookback)))
    : DEFAULT_WEAK_TOPIC_LOOKBACK;

  return {
    threshold: normalizedThreshold,
    lookback: normalizedLookback
  };
}

async function computeWeakTopicsLive({ scope, threshold = DEFAULT_THRESHOLD, lookback = DEFAULT_WEAK_TOPIC_LOOKBACK, tx = prisma } = {}) {
  const normalized = normalizeWeakTopics(threshold, lookback);
  const submissions = await tx.worksheetSubmission.findMany({
    where: {
      tenantId: scope.tenantId,
      studentId: scope.studentId,
      finalSubmittedAt: { not: null }
    },
    orderBy: [{ finalSubmittedAt: "desc" }],
    take: normalized.lookback,
    select: {
      submittedAnswers: true,
      worksheet: {
        select: {
          questions: {
            select: {
              questionNumber: true,
              operation: true,
              correctAnswer: true
            }
          }
        }
      }
    }
  });

  const byOperation = new Map();

  for (const submission of submissions) {
    const answers = Array.isArray(submission.submittedAnswers) ? submission.submittedAnswers : [];
    const answerByNumber = new Map();

    for (const answer of answers) {
      const questionNumber = Number(answer?.questionNumber);
      const value = Number(answer?.answer);
      if (Number.isFinite(questionNumber) && Number.isFinite(value)) {
        answerByNumber.set(questionNumber, value);
      }
    }

    for (const question of submission.worksheet?.questions || []) {
      if (!answerByNumber.has(question.questionNumber)) {
        continue;
      }

      const operation = String(question.operation || "").trim();
      if (!operation) {
        continue;
      }

      const stats = byOperation.get(operation) || { topic: operation, attempted: 0, correct: 0 };
      stats.attempted += 1;
      if (answerByNumber.get(question.questionNumber) === question.correctAnswer) {
        stats.correct += 1;
      }
      byOperation.set(operation, stats);
    }
  }

  const items = Array.from(byOperation.values())
    .map((item) => ({
      topic: item.topic,
      attempted: item.attempted,
      correct: item.correct,
      accuracy: item.attempted ? roundScore((item.correct / item.attempted) * 100, 2) : null
    }))
    .filter((item) => item.accuracy !== null && item.accuracy < normalized.threshold)
    .sort((left, right) => (left.accuracy ?? 0) - (right.accuracy ?? 0))
    .slice(0, 10);

  return {
    threshold: normalized.threshold,
    lookback: normalized.lookback,
    items,
    summary: {
      weakTopicCount: items.length,
      weakestTopic: items[0]?.topic || null
    }
  };
}

async function awardEngagementAchievements({ scope, totals, streaks, attendanceRate, weakTopicCount, examParticipationCount, tx = prisma } = {}) {
  const coachAchievements = await checkAndAwardMilestones(scope.studentId, scope.tenantId, scope.levelId);
  const existing = await tx.studentMilestone.findMany({
    where: {
      tenantId: scope.tenantId,
      studentId: scope.studentId
    },
    select: {
      key: true
    }
  });

  const earnedKeys = new Set(existing.map((item) => item.key));
  const additionalKeys = [];

  if (attendanceRate >= 90 && !earnedKeys.has("attendance_consistency_90")) {
    additionalKeys.push("attendance_consistency_90");
  }
  if (totals.practiceActiveDays >= 7 && !earnedKeys.has("practice_consistency_7")) {
    additionalKeys.push("practice_consistency_7");
  }
  if (examParticipationCount >= 1 && !earnedKeys.has("exam_participation_1")) {
    additionalKeys.push("exam_participation_1");
  }
  if (examParticipationCount >= 3 && !earnedKeys.has("exam_participation_3")) {
    additionalKeys.push("exam_participation_3");
  }

  if (additionalKeys.length) {
    await Promise.allSettled(
      additionalKeys.map((key) => {
        const def = EXTRA_ACHIEVEMENT_DEFS.find((item) => item.key === key);
        return tx.studentMilestone.create({
          data: {
            tenantId: scope.tenantId,
            studentId: scope.studentId,
            key,
            title: def?.title || key,
            description: def?.description || null,
            icon: def?.icon || "🏅"
          }
        });
      })
    );
  }

  const items = await tx.studentMilestone.findMany({
    where: {
      tenantId: scope.tenantId,
      studentId: scope.studentId
    },
    orderBy: [{ earnedAt: "desc" }],
    select: {
      key: true,
      title: true,
      description: true,
      icon: true,
      earnedAt: true
    }
  });

  return {
    items,
    newlyEarned: [
      ...(coachAchievements?.newlyEarned || []),
      ...additionalKeys.map((key) => EXTRA_ACHIEVEMENT_DEFS.find((item) => item.key === key)).filter(Boolean)
    ],
    nextHints: coachAchievements?.nextHints || [],
    summary: {
      total: items.length,
      latestKey: items[0]?.key || null,
      attendanceRate,
      practiceStreak: streaks.practice.current,
      weakTopicCount
    }
  };
}

async function buildLiveEngagementBundle({ scope, asOf = new Date(), tx = prisma, weakTopicThreshold, weakTopicLookback } = {}) {
  const normalizedAsOf = startOfUtcDay(asOf);
  const practiceWindows = buildDayWindows(DEFAULT_LOOKBACK_DAYS, normalizedAsOf);
  const practiceWindowStart = practiceWindows[0]?.start || addUtcDays(normalizedAsOf, -(DEFAULT_LOOKBACK_DAYS - 1));
  const attendanceWindowStart = addUtcDays(normalizedAsOf, -89);

  const [recentSubmissions, totalSubmissions, assignments, attendanceEntries, examEnrollments, weakTopics, streaks, levelPerformance] = await Promise.all([
    tx.worksheetSubmission.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId: scope.studentId,
        finalSubmittedAt: {
          not: null,
          gte: practiceWindowStart
        }
      },
      orderBy: [{ finalSubmittedAt: "desc" }],
      select: {
        id: true,
        worksheetId: true,
        score: true,
        submittedAt: true,
        finalSubmittedAt: true,
        remarks: true,
        worksheet: {
          select: {
            id: true,
            title: true,
            isPublished: true
          }
        }
      }
    }),
    tx.worksheetSubmission.count({
      where: {
        tenantId: scope.tenantId,
        studentId: scope.studentId,
        finalSubmittedAt: { not: null }
      }
    }),
    tx.worksheetAssignment.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId: scope.studentId,
        isActive: true
      },
      orderBy: [{ assignedAt: "desc" }],
      select: {
        worksheetId: true,
        assignedAt: true,
        dueDate: true,
        worksheet: {
          select: {
            id: true,
            title: true
          }
        }
      }
    }),
    tx.attendanceEntry.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId: scope.studentId,
        session: {
          status: { in: ["PUBLISHED", "LOCKED"] },
          date: {
            gte: attendanceWindowStart
          }
        }
      },
      orderBy: [{ session: { date: "desc" } }],
      select: {
        status: true,
        markedAt: true,
        session: {
          select: {
            id: true,
            date: true,
            status: true
          }
        }
      }
    }),
    tx.examEnrollmentEntry.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId: scope.studentId
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        createdAt: true,
        examCycle: {
          select: {
            id: true,
            name: true,
            examStartsAt: true,
            resultStatus: true
          }
        }
      }
    }),
    computeWeakTopicsLive({
      scope,
      threshold: weakTopicThreshold,
      lookback: weakTopicLookback,
      tx
    }),
    computeStreaks(scope.studentId, scope.tenantId),
    getLevelPerformance(scope.studentId, scope.levelId, scope.tenantId).catch(() => ({ improvementTrendPercentage: null }))
  ]);

  const submissionIds = recentSubmissions.map((item) => item.worksheetId);
  const completedWorksheetIds = new Set(recentSubmissions.filter((item) => item.finalSubmittedAt).map((item) => item.worksheetId));
  const pendingAssignments = assignments.filter((item) => !completedWorksheetIds.has(item.worksheetId));
  const attendancePresentCount = attendanceEntries.filter((item) => item.status === "PRESENT" || item.status === "LATE").length;
  const attendanceRate = attendanceEntries.length ? roundScore((attendancePresentCount / attendanceEntries.length) * 100, 2) : null;
  const practiceDays = Array.from(new Set(recentSubmissions.map((item) => item.finalSubmittedAt?.toISOString().slice(0, 10)).filter(Boolean)));
  const weeklyPracticeStreak = computeWeeklyStreak(practiceDays, 3, normalizedAsOf);
  const attendanceDays = Array.from(new Set(attendanceEntries.map((item) => item.session?.date?.toISOString?.().slice(0, 10)).filter(Boolean)));
  const weeklyAttendanceStreak = computeWeeklyStreak(attendanceDays, 2, normalizedAsOf);
  const lastActivityCandidates = [
    recentSubmissions[0]?.finalSubmittedAt || null,
    attendanceEntries[0]?.session?.date || null,
    examEnrollments[0]?.createdAt || null
  ].filter(Boolean);
  const lastActivityAt = lastActivityCandidates.length
    ? new Date(Math.max(...lastActivityCandidates.map((value) => new Date(value).getTime())))
    : null;
  const inactiveDays = getDaysSince(normalizedAsOf, lastActivityAt);

  const groupedPractice = new Map();
  for (const item of recentSubmissions) {
    const key = item.finalSubmittedAt?.toISOString().slice(0, 10);
    if (!key) {
      continue;
    }
    const existing = groupedPractice.get(key) || { completedCount: 0, averageScore: null, scoreTotal: 0, scoreCount: 0 };
    existing.completedCount += 1;
    if (item.score !== null && item.score !== undefined) {
      existing.scoreTotal += Number(item.score);
      existing.scoreCount += 1;
      existing.averageScore = roundScore(existing.scoreTotal / existing.scoreCount, 2);
    }
    groupedPractice.set(key, existing);
  }

  const groupedAttendance = new Map();
  for (const item of attendanceEntries) {
    const key = item.session?.date?.toISOString?.().slice(0, 10);
    if (!key) {
      continue;
    }
    const existing = groupedAttendance.get(key) || { totalSessions: 0, presentSessions: 0, rate: null };
    existing.totalSessions += 1;
    if (item.status === "PRESENT" || item.status === "LATE") {
      existing.presentSessions += 1;
    }
    existing.rate = roundScore((existing.presentSessions / existing.totalSessions) * 100, 2);
    groupedAttendance.set(key, existing);
  }

  const practiceTrend = buildTrendItems(practiceWindows, groupedPractice, "completedCount", "averageScore");
  const attendanceTrend = buildTrendItems(practiceWindows, groupedAttendance, "totalSessions", "rate").map((item) => ({
    key: item.key,
    label: item.label,
    sessionCount: item.totalSessions,
    attendanceRate: item.rate
  }));

  const scores = computeEngagementScoring({
    attendanceRate,
    practiceActiveDays: practiceDays.length,
    dayWindowCount: practiceWindows.length,
    practiceStreakCurrent: streaks.practice.current,
    attendanceStreakCurrent: streaks.attendance.current,
    completedWorksheetCount: totalSubmissions,
    pendingWorksheetCount: pendingAssignments.length,
    examParticipationCount: examEnrollments.length,
    inactiveDays,
    momentumPercent: levelPerformance?.improvementTrendPercentage ?? null
  });

  const achievements = await awardEngagementAchievements({
    scope,
    totals: {
      practiceActiveDays: practiceDays.length,
      totalSubmissions
    },
    streaks,
    attendanceRate: attendanceRate ?? 0,
    weakTopicCount: weakTopics.summary.weakTopicCount,
    examParticipationCount: examEnrollments.length,
    tx
  });

  const summary = {
    ...scores,
    engagementBand: deriveEngagementBand(scores.engagementScore),
    totalCompletedWorksheets: totalSubmissions,
    pendingWorksheetCount: pendingAssignments.length,
    attendanceRate,
    examParticipationCount: examEnrollments.length,
    practiceActiveDays: practiceDays.length,
    inactiveDays,
    weakTopicCount: weakTopics.summary.weakTopicCount,
    achievementCount: achievements.summary.total,
    lastActivityAt: lastActivityAt?.toISOString?.() || null
  };

  const streakSummary = {
    attendance: {
      current: streaks.attendance.current,
      best: streaks.attendance.best,
      weeklyCurrent: weeklyAttendanceStreak,
      target: ATTENDANCE_STREAK_TARGET
    },
    practice: {
      current: streaks.practice.current,
      best: practiceDays.length ? Math.max(streaks.practice.current, practiceDays.length) : streaks.practice.current,
      weeklyCurrent: weeklyPracticeStreak,
      target: PRACTICE_STREAK_TARGET
    }
  };

  const practiceSummary = {
    totalCompleted: totalSubmissions,
    pendingAssignments: pendingAssignments.length,
    practiceActiveDays: practiceDays.length,
    lastSubmissionAt: recentSubmissions[0]?.finalSubmittedAt || null,
    averageScore: practiceTrend.filter((item) => item.averageScore !== null).length
      ? roundScore(
          practiceTrend
            .filter((item) => item.averageScore !== null)
            .reduce((total, item) => total + Number(item.averageScore), 0)
            / practiceTrend.filter((item) => item.averageScore !== null).length,
          2
        )
      : null
  };

  const attendanceSummary = {
    attendanceRate,
    presentCount: attendancePresentCount,
    totalSessions: attendanceEntries.length,
    lateCount: attendanceEntries.filter((item) => item.status === "LATE").length,
    absentCount: attendanceEntries.filter((item) => item.status === "ABSENT").length
  };

  return {
    meta: {
      source: {
        mode: "live-fallback",
        liveFallback: true,
        snapshotDate: normalizedAsOf.toISOString()
      },
      scope: {
        studentId: scope.studentId,
        studentCode: scope.studentCode,
        studentName: scope.studentName,
        hierarchyNodeId: scope.hierarchyNodeId,
        hierarchyNodeName: scope.hierarchyNodeName,
        levelId: scope.levelId,
        levelName: scope.levelName
      },
      asOf: normalizedAsOf.toISOString()
    },
    overview: summary,
    streaks: streakSummary,
    achievements,
    practiceTrends: {
      items: practiceTrend,
      summary: practiceSummary
    },
    attendanceTrends: {
      items: attendanceTrend,
      summary: attendanceSummary
    },
    weakTopics,
    examParticipation: {
      items: examEnrollments.map((item) => ({
        examCycleId: item.examCycle?.id || null,
        examCycleTitle: item.examCycle?.name || null,
        status: item.examCycle?.resultStatus || null,
        startDate: item.examCycle?.examStartsAt || null,
        enrolledAt: item.createdAt
      })),
      summary: {
        totalEnrollments: examEnrollments.length,
        latestEnrollmentAt: examEnrollments[0]?.createdAt || null
      }
    }
  };
}

async function persistStudentEngagementSnapshot({ scope, bundle, asOf = new Date(), tx = prisma } = {}) {
  const snapshotDate = startOfUtcDay(asOf);

  await tx.studentEngagementSnapshot.upsert({
    where: {
      tenantId_studentId_snapshotDate: {
        tenantId: scope.tenantId,
        studentId: scope.studentId,
        snapshotDate
      }
    },
    update: {
      hierarchyNodeId: scope.hierarchyNodeId,
      sourceWindowKey: bundle.meta?.source?.snapshotDate || snapshotDate.toISOString(),
      engagementScore: bundle.overview.engagementScore,
      consistencyScore: bundle.overview.consistencyScore,
      streakScore: bundle.overview.streakScore,
      participationScore: bundle.overview.participationScore,
      completionScore: bundle.overview.completionScore,
      inactivityRiskScore: bundle.overview.inactivityRiskScore,
      momentumScore: bundle.overview.momentumScore,
      currentPracticeStreak: bundle.streaks.practice.current,
      bestPracticeStreak: bundle.streaks.practice.best,
      currentAttendanceStreak: bundle.streaks.attendance.current,
      bestAttendanceStreak: bundle.streaks.attendance.best,
      completedWorksheetCount: bundle.overview.totalCompletedWorksheets,
      pendingWorksheetCount: bundle.overview.pendingWorksheetCount,
      attendanceRate: bundle.overview.attendanceRate,
      examParticipationRate: bundle.overview.participationScore,
      inactiveDays: bundle.overview.inactiveDays,
      weakTopicCount: bundle.overview.weakTopicCount,
      achievementsCount: bundle.overview.achievementCount,
      practiceTrend: bundle.practiceTrends.items,
      attendanceTrend: bundle.attendanceTrends.items,
      weakTopics: bundle.weakTopics.items,
      achievementsPreview: bundle.achievements.items.slice(0, 6),
      remindersPreview: null,
      metadata: {
        overview: bundle.overview,
        streaks: bundle.streaks,
        examParticipation: bundle.examParticipation.summary,
        practiceSummary: bundle.practiceTrends.summary,
        attendanceSummary: bundle.attendanceTrends.summary
      }
    },
    create: {
      tenantId: scope.tenantId,
      studentId: scope.studentId,
      hierarchyNodeId: scope.hierarchyNodeId,
      snapshotDate,
      sourceWindowKey: bundle.meta?.source?.snapshotDate || snapshotDate.toISOString(),
      engagementScore: bundle.overview.engagementScore,
      consistencyScore: bundle.overview.consistencyScore,
      streakScore: bundle.overview.streakScore,
      participationScore: bundle.overview.participationScore,
      completionScore: bundle.overview.completionScore,
      inactivityRiskScore: bundle.overview.inactivityRiskScore,
      momentumScore: bundle.overview.momentumScore,
      currentPracticeStreak: bundle.streaks.practice.current,
      bestPracticeStreak: bundle.streaks.practice.best,
      currentAttendanceStreak: bundle.streaks.attendance.current,
      bestAttendanceStreak: bundle.streaks.attendance.best,
      completedWorksheetCount: bundle.overview.totalCompletedWorksheets,
      pendingWorksheetCount: bundle.overview.pendingWorksheetCount,
      attendanceRate: bundle.overview.attendanceRate,
      examParticipationRate: bundle.overview.participationScore,
      inactiveDays: bundle.overview.inactiveDays,
      weakTopicCount: bundle.overview.weakTopicCount,
      achievementsCount: bundle.overview.achievementCount,
      practiceTrend: bundle.practiceTrends.items,
      attendanceTrend: bundle.attendanceTrends.items,
      weakTopics: bundle.weakTopics.items,
      achievementsPreview: bundle.achievements.items.slice(0, 6),
      remindersPreview: null,
      metadata: {
        overview: bundle.overview,
        streaks: bundle.streaks,
        examParticipation: bundle.examParticipation.summary,
        practiceSummary: bundle.practiceTrends.summary,
        attendanceSummary: bundle.attendanceTrends.summary
      }
    }
  });
}

function buildSnapshotBundle({ scope, snapshot, asOf }) {
  return {
    meta: {
      source: {
        mode: "snapshot-first",
        liveFallback: false,
        snapshotDate: snapshot.snapshotDate.toISOString()
      },
      scope: {
        studentId: scope.studentId,
        studentCode: scope.studentCode,
        studentName: scope.studentName,
        hierarchyNodeId: scope.hierarchyNodeId,
        hierarchyNodeName: scope.hierarchyNodeName,
        levelId: scope.levelId,
        levelName: scope.levelName
      },
      asOf: startOfUtcDay(asOf).toISOString()
    },
    overview: {
      engagementScore: toNumber(snapshot.engagementScore),
      consistencyScore: toNumber(snapshot.consistencyScore),
      streakScore: toNumber(snapshot.streakScore),
      participationScore: toNumber(snapshot.participationScore),
      completionScore: toNumber(snapshot.completionScore),
      inactivityRiskScore: toNumber(snapshot.inactivityRiskScore),
      momentumScore: toNumber(snapshot.momentumScore),
      engagementBand: deriveEngagementBand(toNumber(snapshot.engagementScore)),
      totalCompletedWorksheets: snapshot.completedWorksheetCount,
      pendingWorksheetCount: snapshot.pendingWorksheetCount,
      attendanceRate: toNumber(snapshot.attendanceRate),
      examParticipationCount: Math.round((toNumber(snapshot.examParticipationRate, 0) || 0) / 25),
      practiceActiveDays: Array.isArray(snapshot.practiceTrend) ? snapshot.practiceTrend.filter((item) => item.completedCount > 0).length : 0,
      inactiveDays: snapshot.inactiveDays,
      weakTopicCount: snapshot.weakTopicCount,
      achievementCount: snapshot.achievementsCount,
      lastActivityAt: null
    },
    streaks: {
      attendance: {
        current: snapshot.currentAttendanceStreak,
        best: snapshot.bestAttendanceStreak,
        weeklyCurrent: 0,
        target: ATTENDANCE_STREAK_TARGET
      },
      practice: {
        current: snapshot.currentPracticeStreak,
        best: snapshot.bestPracticeStreak,
        weeklyCurrent: 0,
        target: PRACTICE_STREAK_TARGET
      }
    },
    achievements: {
      items: Array.isArray(snapshot.achievementsPreview) ? snapshot.achievementsPreview : [],
      newlyEarned: [],
      nextHints: [],
      summary: {
        total: snapshot.achievementsCount,
        latestKey: Array.isArray(snapshot.achievementsPreview) ? snapshot.achievementsPreview[0]?.key || null : null
      }
    },
    practiceTrends: {
      items: Array.isArray(snapshot.practiceTrend) ? snapshot.practiceTrend : [],
      summary: snapshot.metadata?.practiceSummary || {
        totalCompleted: snapshot.completedWorksheetCount,
        pendingAssignments: snapshot.pendingWorksheetCount,
        practiceActiveDays: Array.isArray(snapshot.practiceTrend) ? snapshot.practiceTrend.filter((item) => item.completedCount > 0).length : 0,
        lastSubmissionAt: null,
        averageScore: null
      }
    },
    attendanceTrends: {
      items: Array.isArray(snapshot.attendanceTrend) ? snapshot.attendanceTrend : [],
      summary: snapshot.metadata?.attendanceSummary || {
        attendanceRate: toNumber(snapshot.attendanceRate),
        totalSessions: 0,
        presentCount: 0,
        lateCount: 0,
        absentCount: 0
      }
    },
    weakTopics: {
      threshold: DEFAULT_THRESHOLD,
      lookback: DEFAULT_WEAK_TOPIC_LOOKBACK,
      items: Array.isArray(snapshot.weakTopics) ? snapshot.weakTopics : [],
      summary: {
        weakTopicCount: snapshot.weakTopicCount,
        weakestTopic: Array.isArray(snapshot.weakTopics) ? snapshot.weakTopics[0]?.topic || null : null
      }
    },
    examParticipation: {
      items: [],
      summary: snapshot.metadata?.examParticipation || {
        totalEnrollments: Math.round((toNumber(snapshot.examParticipationRate, 0) || 0) / 25),
        latestEnrollmentAt: null
      }
    }
  };
}

async function getStudentEngagementAnalyticsBundle({
  tenantId,
  authUserId,
  studentId,
  asOf = new Date(),
  threshold = DEFAULT_THRESHOLD,
  lookback = DEFAULT_WEAK_TOPIC_LOOKBACK,
  tx = prisma,
  forceLive = false
} = {}) {
  const scope = await resolveStudentEngagementScope({ tenantId, authUserId, studentId, tx });
  const filters = {
    asOf: startOfUtcDay(asOf).toISOString(),
    threshold,
    lookback,
    forceLive: Boolean(forceLive)
  };

  return resolveCachedStudentEngagementSlice({
    tenantId: scope.tenantId,
    studentId: scope.studentId,
    segment: "bundle",
    filters,
    loader: async () => {
      if (!forceLive) {
        const snapshot = await loadLatestEngagementSnapshot({ scope, asOf, tx });
        if (snapshot) {
          const bundle = buildSnapshotBundle({ scope, snapshot, asOf });
          const liveAchievements = await prisma.studentMilestone.findMany({
            where: {
              tenantId: scope.tenantId,
              studentId: scope.studentId
            },
            orderBy: [{ earnedAt: "desc" }],
            select: {
              key: true,
              title: true,
              description: true,
              icon: true,
              earnedAt: true
            }
          });
          bundle.achievements.items = liveAchievements;
          bundle.achievements.summary.total = liveAchievements.length;
          return bundle;
        }
      }

      const bundle = await buildLiveEngagementBundle({
        scope,
        asOf,
        tx,
        weakTopicThreshold: threshold,
        weakTopicLookback: lookback
      });
      await persistStudentEngagementSnapshot({ scope, bundle, asOf, tx });
      return bundle;
    }
  });
}

async function getStudentEngagementOverviewAnalytics(payload = {}) {
  const bundle = await getStudentEngagementAnalyticsBundle(payload);
  return {
    data: bundle.overview,
    meta: bundle.meta
  };
}

async function getStudentStreakAnalytics(payload = {}) {
  const bundle = await getStudentEngagementAnalyticsBundle(payload);
  return {
    data: bundle.streaks,
    meta: bundle.meta
  };
}

async function getStudentAchievementsAnalytics(payload = {}) {
  const bundle = await getStudentEngagementAnalyticsBundle(payload);
  return {
    data: bundle.achievements,
    meta: bundle.meta
  };
}

async function getStudentPracticeTrendsAnalytics(payload = {}) {
  const bundle = await getStudentEngagementAnalyticsBundle(payload);
  return {
    data: bundle.practiceTrends,
    meta: bundle.meta
  };
}

async function getStudentAttendanceTrendsAnalytics(payload = {}) {
  const bundle = await getStudentEngagementAnalyticsBundle(payload);
  return {
    data: bundle.attendanceTrends,
    meta: bundle.meta
  };
}

async function getStudentWeakTopicVisibilityAnalytics(payload = {}) {
  const bundle = await getStudentEngagementAnalyticsBundle(payload);
  return {
    data: bundle.weakTopics,
    meta: bundle.meta
  };
}

async function listStudentEngagementCandidates({ tenantId, studentIds, limit = 200, tx = prisma } = {}) {
  if (!tenantId) {
    throw createHttpError(400, "tenantId is required", "TENANT_REQUIRED");
  }

  return tx.student.findMany({
    where: {
      tenantId,
      isActive: true,
      ...(Array.isArray(studentIds) && studentIds.length ? { id: { in: studentIds } } : {})
    },
    orderBy: [{ createdAt: "asc" }],
    take: limit,
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      hierarchyNodeId: true,
      levelId: true,
      authUsers: {
        where: {
          tenantId,
          role: "STUDENT",
          isActive: true
        },
        take: 1,
        orderBy: [{ createdAt: "asc" }],
        select: {
          id: true,
          email: true
        }
      },
      parentLinks: {
        where: {
          tenantId,
          isActive: true,
          parentUser: {
            is: {
              role: "PARENT",
              isActive: true
            }
          }
        },
        select: {
          parentUserId: true
        }
      }
    }
  });
}

export {
  DEFAULT_THRESHOLD,
  DEFAULT_WEAK_TOPIC_LOOKBACK,
  computeEngagementScoring,
  getStudentAchievementsAnalytics,
  getStudentAttendanceTrendsAnalytics,
  getStudentEngagementAnalyticsBundle,
  getStudentEngagementOverviewAnalytics,
  getStudentPracticeTrendsAnalytics,
  getStudentStreakAnalytics,
  getStudentWeakTopicVisibilityAnalytics,
  listStudentEngagementCandidates,
  resolveStudentEngagementScope
};