import { apiClient } from "./apiClient";

async function listNotifications({ unread, limit = 20, offset = 0 } = {}) {
  const params = { limit, offset };
  if (unread) {
    params.unread = "true";
  }
  return apiClient.get("/notifications", {
    params,
    _skipGlobalLoading: true,
    _suppressErrorLogging: true
  });
}

async function markNotificationRead(id) {
  return apiClient.patch(`/notifications/${id}/read`);
}

async function markAllNotificationsRead() {
  return apiClient.patch("/notifications/mark-all-read");
}

export { listNotifications, markNotificationRead, markAllNotificationsRead };
