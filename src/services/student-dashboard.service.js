import { listOperationalNotifications } from "./operational-notification.service.js";
import {
  getStudentAchievementsAnalytics,
  getStudentAttendanceTrendsAnalytics,
  getStudentEngagementAnalyticsBundle,
  getStudentPracticeTrendsAnalytics,
  getStudentStreakAnalytics,
  getStudentWeakTopicVisibilityAnalytics,
  resolveStudentEngagementScope
} from "./student-engagement-analytics.service.js";

const STUDENT_ENGAGEMENT_REMINDER_TYPES = new Set([
  "STUDENT_ENGAGEMENT_INACTIVE",
  "STUDENT_ENGAGEMENT_STREAK_RISK",
  "STUDENT_ENGAGEMENT_PRACTICE_GAP",
  "STUDENT_ENGAGEMENT_PENDING_WORKSHEETS",
  "STUDENT_ENGAGEMENT_EXAM_GAP",
  "STUDENT_ENGAGEMENT_ATTENDANCE_DECLINE"
]);

function isStudentEngagementReminder(item, studentId) {
  if (!item) {
    return false;
  }

  if (STUDENT_ENGAGEMENT_REMINDER_TYPES.has(item.type)) {
    return !studentId || item.metadata?.studentId === studentId;
  }

  return item.metadata?.reminderScope === "STUDENT_ENGAGEMENT"
    && (!studentId || item.metadata?.studentId === studentId);
}

async function listStudentDashboardReminders({ tenantId, authUserId, studentId, limit = 10 }) {
  const scope = await resolveStudentEngagementScope({ tenantId, authUserId, studentId });
  const recipientUserId = authUserId || scope.studentAuthUserId;

  if (!recipientUserId) {
    return {
      data: {
        items: [],
        total: 0,
        unreadCount: 0
      },
      meta: {
        scope,
        remindersSource: "none"
      }
    };
  }

  const notifications = await listOperationalNotifications({
    tenantId,
    recipientUserId,
    filters: {
      status: ["ACTIVE"],
      limit: Math.max(1, Math.min(Number(limit) || 10, 25)),
      offset: 0
    }
  });

  const items = notifications.items.filter((item) => isStudentEngagementReminder(item, scope.studentId));

  return {
    data: {
      items,
      total: items.length,
      unreadCount: items.filter((item) => item.isUnread).length
    },
    meta: {
      scope,
      remindersSource: "operational-notifications"
    }
  };
}

async function getStudentDashboardOverview({ tenantId, authUserId, studentId } = {}) {
  const [bundle, reminders] = await Promise.all([
    getStudentEngagementAnalyticsBundle({ tenantId, authUserId, studentId }),
    listStudentDashboardReminders({ tenantId, authUserId, studentId, limit: 6 })
  ]);

  return {
    data: {
      student: bundle.meta.scope,
      overview: bundle.overview,
      streaks: bundle.streaks,
      practiceSummary: bundle.practiceTrends.summary,
      attendanceSummary: bundle.attendanceTrends.summary,
      weakTopicSummary: bundle.weakTopics.summary,
      achievementsPreview: bundle.achievements.items.slice(0, 6),
      reminderSummary: {
        total: reminders.data.total,
        unreadCount: reminders.data.unreadCount,
        topItems: reminders.data.items.slice(0, 3)
      }
    },
    meta: bundle.meta
  };
}

async function getStudentDashboardStreaks(payload = {}) {
  return getStudentStreakAnalytics(payload);
}

async function getStudentDashboardAchievements(payload = {}) {
  return getStudentAchievementsAnalytics(payload);
}

async function getStudentDashboardPracticeTrends(payload = {}) {
  return getStudentPracticeTrendsAnalytics(payload);
}

async function getStudentDashboardAttendanceTrends(payload = {}) {
  return getStudentAttendanceTrendsAnalytics(payload);
}

async function getStudentDashboardWeakTopics(payload = {}) {
  return getStudentWeakTopicVisibilityAnalytics(payload);
}

async function getStudentDashboardReminders(payload = {}) {
  return listStudentDashboardReminders(payload);
}

export {
  STUDENT_ENGAGEMENT_REMINDER_TYPES,
  getStudentDashboardAchievements,
  getStudentDashboardAttendanceTrends,
  getStudentDashboardOverview,
  getStudentDashboardPracticeTrends,
  getStudentDashboardReminders,
  getStudentDashboardStreaks,
  getStudentDashboardWeakTopics,
  isStudentEngagementReminder,
  listStudentDashboardReminders
};