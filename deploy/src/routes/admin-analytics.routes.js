import { Router } from "express";
import {
  getCenterPerformanceAnalytics,
  getCompetitionStatsAnalytics,
  getLevelDistributionAnalytics,
  getPromotionRateAnalytics
} from "../controllers/admin-analytics.controller.js";
import { requireSuperadmin } from "../middleware/rbac.js";

const adminAnalyticsRouter = Router();

adminAnalyticsRouter.use(requireSuperadmin());

adminAnalyticsRouter.get("/level-distribution", getLevelDistributionAnalytics);
adminAnalyticsRouter.get("/promotion-rate", getPromotionRateAnalytics);
adminAnalyticsRouter.get("/competition-stats", getCompetitionStatsAnalytics);
adminAnalyticsRouter.get("/center-performance", getCenterPerformanceAnalytics);

export { adminAnalyticsRouter };
