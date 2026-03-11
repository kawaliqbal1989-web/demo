import { asyncHandler } from "../utils/async-handler.js";
import {
  getUserNotifications,
  markAllAsRead,
  markAsRead
} from "../services/notification.service.js";
import {
  runAllAutomationRules,
  cleanupExpiredNotifications,
  getUserPreferences,
  updateUserPreferencesBulk
} from "../services/notification-automation.service.js";

const listNotifications = asyncHandler(async (req, res) => {
  const data = await getUserNotifications(req.auth.userId, req.auth.tenantId, {
    page: req.query.page,
    offset: req.query.offset,
    limit: req.query.limit,
    unread: req.query.unread,
    category: req.query.category,
    priority: req.query.priority
  });

  return res.apiSuccess("Notifications fetched", data);
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const updated = await markAsRead(String(req.params.id || "").trim(), req.auth.userId, req.auth.tenantId);

  return res.apiSuccess("Notification marked as read", updated);
});

const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const result = await markAllAsRead(req.auth.userId, req.auth.tenantId);

  return res.apiSuccess("All notifications marked as read", {
    updatedCount: result.count
  });
});

const getNotificationPreferences = asyncHandler(async (req, res) => {
  const prefs = await getUserPreferences(req.auth.userId, req.auth.tenantId);
  return res.apiSuccess("Notification preferences fetched", prefs);
});

const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const { preferences } = req.body;
  if (!Array.isArray(preferences)) {
    return res.status(400).json({ success: false, message: "preferences must be an array" });
  }
  const results = await updateUserPreferencesBulk(req.auth.userId, req.auth.tenantId, preferences);
  return res.apiSuccess("Notification preferences updated", { updated: results.length });
});

const triggerAutomation = asyncHandler(async (req, res) => {
  const results = await runAllAutomationRules(req.auth.tenantId);
  return res.apiSuccess("Automation rules executed", results);
});

const triggerCleanup = asyncHandler(async (req, res) => {
  const result = await cleanupExpiredNotifications(req.auth.tenantId);
  return res.apiSuccess("Expired notifications cleaned up", result);
});

export {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
  triggerAutomation,
  triggerCleanup
};
