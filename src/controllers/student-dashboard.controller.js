import { asyncHandler } from "../utils/async-handler.js";
import { sendSuccess } from "../utils/api-response.js";
import { logger } from "../lib/logger.js";
import { isSchemaMismatchError } from "../utils/schema-mismatch.js";
import { getStudentFinancialVisibility } from "../services/financial-visibility.service.js";
import {
  getStudentDashboardAchievements,
  getStudentDashboardAttendanceTrends,
  getStudentDashboardOverview,
  getStudentDashboardPracticeTrends,
  getStudentDashboardReminders,
  getStudentDashboardStreaks,
  getStudentDashboardWeakTopics
} from "../services/student-dashboard.service.js";

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dashboardFallback(kind, threshold, lookback) {
  if (kind === "overview") {
    return {
      data: {
        student: null,
        overview: {
          engagementScore: 0,
          consistencyScore: 0,
          streakScore: 0,
          participationScore: 0,
          completionScore: 0,
          inactivityRiskScore: 0,
          momentumScore: 0,
          engagementBand: "WATCH",
          totalCompletedWorksheets: 0,
          pendingWorksheetCount: 0,
          attendanceRate: null,
          examParticipationCount: 0,
          practiceActiveDays: 0,
          inactiveDays: null,
          weakTopicCount: 0,
          achievementCount: 0,
          lastActivityAt: null
        },
        streaks: {
          attendance: { current: 0, best: 0, weeklyCurrent: 0, target: 30 },
          practice: { current: 0, best: 0, weeklyCurrent: 0, target: 14 }
        },
        practiceSummary: {
          totalCompleted: 0,
          pendingAssignments: 0,
          practiceActiveDays: 0,
          lastSubmissionAt: null,
          averageScore: null
        },
        attendanceSummary: {
          attendanceRate: null,
          totalSessions: 0,
          presentCount: 0,
          lateCount: 0,
          absentCount: 0
        },
        weakTopicSummary: {
          weakTopicCount: 0,
          weakestTopic: null
        },
        achievementsPreview: [],
        reminderSummary: {
          total: 0,
          unreadCount: 0,
          topItems: []
        }
      },
      meta: {
        source: { mode: "controller-fallback", degraded: true },
        asOf: new Date().toISOString()
      }
    };
  }

  if (kind === "streaks") {
    return {
      data: {
        attendance: { current: 0, best: 0, weeklyCurrent: 0, target: 30 },
        practice: { current: 0, best: 0, weeklyCurrent: 0, target: 14 }
      },
      meta: {
        source: { mode: "controller-fallback", degraded: true },
        asOf: new Date().toISOString()
      }
    };
  }

  if (kind === "achievements") {
    return {
      data: {
        items: [],
        newlyEarned: [],
        nextHints: [],
        summary: { total: 0, latestKey: null }
      },
      meta: {
        source: { mode: "controller-fallback", degraded: true },
        asOf: new Date().toISOString()
      }
    };
  }

  if (kind === "practice-trends") {
    return {
      data: {
        items: [],
        summary: {
          totalCompleted: 0,
          pendingAssignments: 0,
          practiceActiveDays: 0,
          lastSubmissionAt: null,
          averageScore: null
        }
      },
      meta: {
        source: { mode: "controller-fallback", degraded: true },
        asOf: new Date().toISOString()
      }
    };
  }

  if (kind === "attendance-trends") {
    return {
      data: {
        items: [],
        summary: {
          attendanceRate: null,
          totalSessions: 0,
          presentCount: 0,
          lateCount: 0,
          absentCount: 0
        }
      },
      meta: {
        source: { mode: "controller-fallback", degraded: true },
        asOf: new Date().toISOString()
      }
    };
  }

  if (kind === "weak-topics") {
    const normalizedThreshold = Number.isFinite(Number(threshold)) ? Number(threshold) : 60;
    const normalizedLookback = Number.isFinite(Number(lookback)) ? Number(lookback) : 20;
    return {
      data: {
        threshold: normalizedThreshold,
        lookback: normalizedLookback,
        items: [],
        summary: {
          weakTopicCount: 0,
          weakestTopic: null
        }
      },
      meta: {
        source: { mode: "controller-fallback", degraded: true },
        asOf: new Date().toISOString()
      }
    };
  }

  return {
    data: {
      items: [],
      total: 0,
      unreadCount: 0
    },
    meta: {
      source: { mode: "controller-fallback", degraded: true },
      asOf: new Date().toISOString()
    }
  };
}

function isRecoverableStudentDashboardError(error) {
  const statusCode = Number(error?.statusCode || 0);
  if (statusCode > 0 && statusCode < 500) {
    return false;
  }

  if (isSchemaMismatchError(error)) {
    return true;
  }

  const code = String(error?.code || "").toUpperCase();
  return code === "P2021" || code === "P2022" || code === "P2010";
}

const getStudentDashboardOverviewController = asyncHandler(async (req, res) => {
  let result;
  try {
    result = await getStudentDashboardOverview({
      tenantId: req.auth.tenantId,
      authUserId: req.auth.userId,
      studentId: req.student.id
    });
  } catch (error) {
    if (!isRecoverableStudentDashboardError(error)) {
      throw error;
    }

    logger.warn("student_dashboard_overview_fallback", {
      tenantId: req.auth?.tenantId,
      studentId: req.student?.id,
      path: req.originalUrl,
      code: error?.code || null,
      detail: String(error?.message || "").slice(0, 300)
    });
    result = dashboardFallback("overview");
  }

  return sendSuccess(res, "Student dashboard overview fetched", result);
});

const getStudentDashboardStreaksController = asyncHandler(async (req, res) => {
  let result;
  try {
    result = await getStudentDashboardStreaks({
      tenantId: req.auth.tenantId,
      authUserId: req.auth.userId,
      studentId: req.student.id
    });
  } catch (error) {
    if (!isRecoverableStudentDashboardError(error)) {
      throw error;
    }
    logger.warn("student_dashboard_streaks_fallback", {
      tenantId: req.auth?.tenantId,
      studentId: req.student?.id,
      path: req.originalUrl,
      code: error?.code || null,
      detail: String(error?.message || "").slice(0, 300)
    });
    result = dashboardFallback("streaks");
  }

  return sendSuccess(res, "Student streak analytics fetched", result);
});

const getStudentDashboardAchievementsController = asyncHandler(async (req, res) => {
  let result;
  try {
    result = await getStudentDashboardAchievements({
      tenantId: req.auth.tenantId,
      authUserId: req.auth.userId,
      studentId: req.student.id
    });
  } catch (error) {
    if (!isRecoverableStudentDashboardError(error)) {
      throw error;
    }
    logger.warn("student_dashboard_achievements_fallback", {
      tenantId: req.auth?.tenantId,
      studentId: req.student?.id,
      path: req.originalUrl,
      code: error?.code || null,
      detail: String(error?.message || "").slice(0, 300)
    });
    result = dashboardFallback("achievements");
  }

  return sendSuccess(res, "Student achievements fetched", result);
});

const getStudentDashboardPracticeTrendsController = asyncHandler(async (req, res) => {
  let result;
  try {
    result = await getStudentDashboardPracticeTrends({
      tenantId: req.auth.tenantId,
      authUserId: req.auth.userId,
      studentId: req.student.id
    });
  } catch (error) {
    if (!isRecoverableStudentDashboardError(error)) {
      throw error;
    }
    logger.warn("student_dashboard_practice_trends_fallback", {
      tenantId: req.auth?.tenantId,
      studentId: req.student?.id,
      path: req.originalUrl,
      code: error?.code || null,
      detail: String(error?.message || "").slice(0, 300)
    });
    result = dashboardFallback("practice-trends");
  }

  return sendSuccess(res, "Student practice trends fetched", result);
});

const getStudentDashboardAttendanceTrendsController = asyncHandler(async (req, res) => {
  let result;
  try {
    result = await getStudentDashboardAttendanceTrends({
      tenantId: req.auth.tenantId,
      authUserId: req.auth.userId,
      studentId: req.student.id
    });
  } catch (error) {
    if (!isRecoverableStudentDashboardError(error)) {
      throw error;
    }
    logger.warn("student_dashboard_attendance_trends_fallback", {
      tenantId: req.auth?.tenantId,
      studentId: req.student?.id,
      path: req.originalUrl,
      code: error?.code || null,
      detail: String(error?.message || "").slice(0, 300)
    });
    result = dashboardFallback("attendance-trends");
  }

  return sendSuccess(res, "Student attendance trends fetched", result);
});

const getStudentDashboardWeakTopicsController = asyncHandler(async (req, res) => {
  const threshold = parseNumber(req.query.threshold, undefined);
  const lookback = parseNumber(req.query.lookback, undefined);

  let result;
  try {
    result = await getStudentDashboardWeakTopics({
      tenantId: req.auth.tenantId,
      authUserId: req.auth.userId,
      studentId: req.student.id,
      threshold,
      lookback
    });
  } catch (error) {
    if (!isRecoverableStudentDashboardError(error)) {
      throw error;
    }
    logger.warn("student_dashboard_weak_topics_fallback", {
      tenantId: req.auth?.tenantId,
      studentId: req.student?.id,
      path: req.originalUrl,
      code: error?.code || null,
      detail: String(error?.message || "").slice(0, 300)
    });
    result = dashboardFallback("weak-topics", threshold, lookback);
  }

  return sendSuccess(res, "Student weak topics fetched", result);
});

const getStudentDashboardRemindersController = asyncHandler(async (req, res) => {
  const limit = parseNumber(req.query.limit, 10);

  let result;
  try {
    result = await getStudentDashboardReminders({
      tenantId: req.auth.tenantId,
      authUserId: req.auth.userId,
      studentId: req.student.id,
      limit
    });
  } catch (error) {
    if (!isRecoverableStudentDashboardError(error)) {
      throw error;
    }
    logger.warn("student_dashboard_reminders_fallback", {
      tenantId: req.auth?.tenantId,
      studentId: req.student?.id,
      path: req.originalUrl,
      code: error?.code || null,
      detail: String(error?.message || "").slice(0, 300)
    });
    result = dashboardFallback("reminders", undefined, limit);
  }

  return sendSuccess(res, "Student engagement reminders fetched", result);
});

const getStudentFinancialOverviewController = asyncHandler(async (req, res) => {
  const result = await getStudentFinancialVisibility({
    tenantId: req.auth.tenantId,
    studentId: req.student.id
  });

  return sendSuccess(res, "Student financial overview fetched", result);
});

export {
  getStudentDashboardAchievementsController,
  getStudentDashboardAttendanceTrendsController,
  getStudentFinancialOverviewController,
  getStudentDashboardOverviewController,
  getStudentDashboardPracticeTrendsController,
  getStudentDashboardRemindersController,
  getStudentDashboardStreaksController,
  getStudentDashboardWeakTopicsController
};