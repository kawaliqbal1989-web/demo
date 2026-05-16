import { asyncHandler } from "../utils/async-handler.js";
import { sendSuccess } from "../utils/api-response.js";
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

const getStudentDashboardOverviewController = asyncHandler(async (req, res) => {
  const result = await getStudentDashboardOverview({
    tenantId: req.auth.tenantId,
    authUserId: req.auth.userId,
    studentId: req.student.id
  });

  return sendSuccess(res, "Student dashboard overview fetched", result);
});

const getStudentDashboardStreaksController = asyncHandler(async (req, res) => {
  const result = await getStudentDashboardStreaks({
    tenantId: req.auth.tenantId,
    authUserId: req.auth.userId,
    studentId: req.student.id
  });

  return sendSuccess(res, "Student streak analytics fetched", result);
});

const getStudentDashboardAchievementsController = asyncHandler(async (req, res) => {
  const result = await getStudentDashboardAchievements({
    tenantId: req.auth.tenantId,
    authUserId: req.auth.userId,
    studentId: req.student.id
  });

  return sendSuccess(res, "Student achievements fetched", result);
});

const getStudentDashboardPracticeTrendsController = asyncHandler(async (req, res) => {
  const result = await getStudentDashboardPracticeTrends({
    tenantId: req.auth.tenantId,
    authUserId: req.auth.userId,
    studentId: req.student.id
  });

  return sendSuccess(res, "Student practice trends fetched", result);
});

const getStudentDashboardAttendanceTrendsController = asyncHandler(async (req, res) => {
  const result = await getStudentDashboardAttendanceTrends({
    tenantId: req.auth.tenantId,
    authUserId: req.auth.userId,
    studentId: req.student.id
  });

  return sendSuccess(res, "Student attendance trends fetched", result);
});

const getStudentDashboardWeakTopicsController = asyncHandler(async (req, res) => {
  const result = await getStudentDashboardWeakTopics({
    tenantId: req.auth.tenantId,
    authUserId: req.auth.userId,
    studentId: req.student.id,
    threshold: parseNumber(req.query.threshold, undefined),
    lookback: parseNumber(req.query.lookback, undefined)
  });

  return sendSuccess(res, "Student weak topics fetched", result);
});

const getStudentDashboardRemindersController = asyncHandler(async (req, res) => {
  const result = await getStudentDashboardReminders({
    tenantId: req.auth.tenantId,
    authUserId: req.auth.userId,
    studentId: req.student.id,
    limit: parseNumber(req.query.limit, 10)
  });

  return sendSuccess(res, "Student engagement reminders fetched", result);
});

export {
  getStudentDashboardAchievementsController,
  getStudentDashboardAttendanceTrendsController,
  getStudentDashboardOverviewController,
  getStudentDashboardPracticeTrendsController,
  getStudentDashboardRemindersController,
  getStudentDashboardStreaksController,
  getStudentDashboardWeakTopicsController
};