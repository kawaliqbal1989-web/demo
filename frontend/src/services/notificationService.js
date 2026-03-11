import { apiClient } from "./apiClient";

async function listNotifications({ unread, category, priority, limit = 20, offset = 0 } = {}) {
  const params = { limit, offset };
  if (unread) params.unread = "true";
  if (category) params.category = category;
  if (priority) params.priority = priority;
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

async function getNotificationPreferences() {
  return apiClient.get("/notifications/preferences", { _skipGlobalLoading: true });
}

async function updateNotificationPreferences(preferences) {
  return apiClient.put("/notifications/preferences", { preferences });
}

async function triggerAutomationRun() {
  return apiClient.post("/notifications/automation/run");
}

async function triggerAutomationCleanup() {
  return apiClient.post("/notifications/automation/cleanup");
}

export {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
  triggerAutomationRun,
  triggerAutomationCleanup
};
