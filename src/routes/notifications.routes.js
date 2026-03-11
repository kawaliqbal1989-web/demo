import { Router } from "express";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  getNotificationPreferences,
  updateNotificationPreferences,
  triggerAutomation,
  triggerCleanup
} from "../controllers/notifications.controller.js";
import { requireSuperadmin } from "../middleware/rbac.js";

const notificationsRouter = Router();

notificationsRouter.get("/", listNotifications);
notificationsRouter.patch("/mark-all-read", markAllNotificationsRead);
notificationsRouter.patch("/:id/read", markNotificationRead);

// Notification preferences
notificationsRouter.get("/preferences", getNotificationPreferences);
notificationsRouter.put("/preferences", updateNotificationPreferences);

// Superadmin-only: trigger automation rules and cleanup
notificationsRouter.post("/automation/run", requireSuperadmin(), triggerAutomation);
notificationsRouter.post("/automation/cleanup", requireSuperadmin(), triggerCleanup);

export { notificationsRouter };
