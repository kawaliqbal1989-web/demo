import { asyncHandler } from "../utils/async-handler.js";
import { sendSuccess } from "../utils/api-response.js";
import { getParentFinancialVisibility } from "../services/financial-visibility.service.js";
import {
  getParentAchievementVisibility,
  getParentAttendanceVisibility,
  getParentDashboardOverview,
  getParentEngagementVisibility,
  getParentWorksheetProgressVisibility,
  listParentDashboardReminders
} from "../services/parent-visibility.service.js";

function resolveStudentId(req) {
  return String(req.query.studentId || "").trim() || undefined;
}

function parseLimit(req, fallback = 10) {
  const parsed = Number(req.query.limit);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const getParentDashboardOverviewController = asyncHandler(async (req, res) => {
  const result = await getParentDashboardOverview({
    tenantId: req.auth.tenantId,
    authUserId: req.auth.userId,
    studentId: resolveStudentId(req)
  });

  return sendSuccess(res, "Parent dashboard overview fetched", result);
});

const getParentDashboardAttendanceController = asyncHandler(async (req, res) => {
  const result = await getParentAttendanceVisibility({
    tenantId: req.auth.tenantId,
    authUserId: req.auth.userId,
    studentId: resolveStudentId(req)
  });

  return sendSuccess(res, "Parent attendance visibility fetched", result);
});

const getParentDashboardWorksheetProgressController = asyncHandler(async (req, res) => {
  const result = await getParentWorksheetProgressVisibility({
    tenantId: req.auth.tenantId,
    authUserId: req.auth.userId,
    studentId: resolveStudentId(req)
  });

  return sendSuccess(res, "Parent worksheet progress fetched", result);
});

const getParentDashboardEngagementController = asyncHandler(async (req, res) => {
  const result = await getParentEngagementVisibility({
    tenantId: req.auth.tenantId,
    authUserId: req.auth.userId,
    studentId: resolveStudentId(req)
  });

  return sendSuccess(res, "Parent engagement visibility fetched", result);
});

const getParentDashboardAchievementsController = asyncHandler(async (req, res) => {
  const result = await getParentAchievementVisibility({
    tenantId: req.auth.tenantId,
    authUserId: req.auth.userId,
    studentId: resolveStudentId(req)
  });

  return sendSuccess(res, "Parent achievement visibility fetched", result);
});

const getParentDashboardRemindersController = asyncHandler(async (req, res) => {
  const result = await listParentDashboardReminders({
    tenantId: req.auth.tenantId,
    authUserId: req.auth.userId,
    studentId: resolveStudentId(req),
    limit: parseLimit(req)
  });

  return sendSuccess(res, "Parent reminders fetched", result);
});

const getParentFinancialOverviewController = asyncHandler(async (req, res) => {
  const requestedStudentId = resolveStudentId(req);
  const result = await getParentFinancialVisibility({
    tenantId: req.auth.tenantId,
    authUserId: req.auth.userId,
    studentId: requestedStudentId
  });

  return sendSuccess(res, "Parent financial overview fetched", result);
});

export {
  getParentDashboardAchievementsController,
  getParentDashboardAttendanceController,
  getParentDashboardEngagementController,
  getParentDashboardOverviewController,
  getParentDashboardRemindersController,
  getParentDashboardWorksheetProgressController,
  getParentFinancialOverviewController
};