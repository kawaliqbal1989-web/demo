import { asyncHandler } from "../utils/async-handler.js";
import {
  getCenterPerformance,
  getCompetitionStats,
  getLevelDistribution,
  getPromotionRate
} from "../services/admin-analytics.service.js";

const getLevelDistributionAnalytics = asyncHandler(async (req, res) => {
  const data = await getLevelDistribution({
    authTenantId: req.auth.tenantId,
    queryTenantId: req.query.tenantId,
    from: req.query.from,
    to: req.query.to
  });

  return res.apiSuccess("Level distribution analytics fetched", data);
});

const getPromotionRateAnalytics = asyncHandler(async (req, res) => {
  const data = await getPromotionRate({
    authTenantId: req.auth.tenantId,
    queryTenantId: req.query.tenantId,
    from: req.query.from,
    to: req.query.to
  });

  return res.apiSuccess("Promotion rate analytics fetched", data);
});

const getCompetitionStatsAnalytics = asyncHandler(async (req, res) => {
  const data = await getCompetitionStats({
    authTenantId: req.auth.tenantId,
    queryTenantId: req.query.tenantId,
    from: req.query.from,
    to: req.query.to
  });

  return res.apiSuccess("Competition stats analytics fetched", data);
});

const getCenterPerformanceAnalytics = asyncHandler(async (req, res) => {
  const data = await getCenterPerformance({
    authTenantId: req.auth.tenantId,
    queryTenantId: req.query.tenantId,
    from: req.query.from,
    to: req.query.to
  });

  return res.apiSuccess("Center performance analytics fetched", data);
});

export {
  getLevelDistributionAnalytics,
  getPromotionRateAnalytics,
  getCompetitionStatsAnalytics,
  getCenterPerformanceAnalytics
};
