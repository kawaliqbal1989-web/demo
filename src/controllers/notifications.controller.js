import { asyncHandler } from "../utils/async-handler.js";
import {
  getUserNotifications,
  markAllAsRead,
  markAsRead
} from "../services/notification.service.js";

const listNotifications = asyncHandler(async (req, res) => {
  const data = await getUserNotifications(req.auth.userId, req.auth.tenantId, {
    page: req.query.page,
    offset: req.query.offset,
    limit: req.query.limit,
    unread: req.query.unread
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

export { listNotifications, markNotificationRead, markAllNotificationsRead };
