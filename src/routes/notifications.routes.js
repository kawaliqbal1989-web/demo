import { Router } from "express";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "../controllers/notifications.controller.js";

const notificationsRouter = Router();

notificationsRouter.get("/", listNotifications);
notificationsRouter.patch("/mark-all-read", markAllNotificationsRead);
notificationsRouter.patch("/:id/read", markNotificationRead);

export { notificationsRouter };
