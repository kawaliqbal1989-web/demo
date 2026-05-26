import { Router } from "express";
import { auditAction } from "../middleware/audit-logger.js";
import { requireParent } from "../middleware/require-parent.js";
import {
  getParentDashboardAchievementsController,
  getParentDashboardAttendanceController,
  getParentDashboardEngagementController,
  getParentFinancialOverviewController,
  getParentDashboardOverviewController,
  getParentDashboardRemindersController,
  getParentDashboardWorksheetProgressController
} from "../controllers/parent-dashboard.controller.js";

const parentRouter = Router();

parentRouter.use(requireParent);

parentRouter.get(
  "/dashboard/overview",
  auditAction("PARENT_VIEW_DASHBOARD_OVERVIEW", "PARENT", (req) => req.parent.id),
  getParentDashboardOverviewController
);

parentRouter.get(
  "/dashboard/attendance",
  auditAction("PARENT_VIEW_ATTENDANCE", "PARENT", (req) => req.parent.id),
  getParentDashboardAttendanceController
);

parentRouter.get(
  "/dashboard/worksheet-progress",
  auditAction("PARENT_VIEW_WORKSHEET_PROGRESS", "PARENT", (req) => req.parent.id),
  getParentDashboardWorksheetProgressController
);

parentRouter.get(
  "/dashboard/engagement",
  auditAction("PARENT_VIEW_ENGAGEMENT", "PARENT", (req) => req.parent.id),
  getParentDashboardEngagementController
);

parentRouter.get(
  "/dashboard/achievements",
  auditAction("PARENT_VIEW_ACHIEVEMENTS", "PARENT", (req) => req.parent.id),
  getParentDashboardAchievementsController
);

parentRouter.get(
  "/dashboard/reminders",
  auditAction("PARENT_VIEW_REMINDERS", "PARENT", (req) => req.parent.id),
  getParentDashboardRemindersController
);

parentRouter.get(
  "/dashboard/financial-summary",
  auditAction("PARENT_VIEW_DASHBOARD_FINANCIAL", "PARENT", (req) => req.parent.id),
  getParentFinancialOverviewController
);

export { parentRouter };