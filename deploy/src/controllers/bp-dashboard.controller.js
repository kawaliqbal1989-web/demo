import { asyncHandler } from "../utils/async-handler.js";
import {
  getBusinessPartnerCenterHealth,
  getBusinessPartnerDashboardOverview,
  getBusinessPartnerFranchiseRanking,
  getBusinessPartnerRevenueTrend,
  getBusinessPartnerStudentGrowthTrend
} from "../services/bp-dashboard.service.js";

const getBpDashboardOverview = asyncHandler(async (req, res) => {
  const data = await getBusinessPartnerDashboardOverview({
    tenantId: req.auth.tenantId,
    bpScope: req.bpScope,
    query: req.query
  });

  return res.apiSuccess("BP dashboard overview fetched", data);
});

const getBpDashboardRevenueTrend = asyncHandler(async (req, res) => {
  const data = await getBusinessPartnerRevenueTrend({
    tenantId: req.auth.tenantId,
    bpScope: req.bpScope,
    query: req.query
  });

  return res.apiSuccess("BP dashboard revenue trend fetched", data);
});

const getBpDashboardStudentGrowthTrend = asyncHandler(async (req, res) => {
  const data = await getBusinessPartnerStudentGrowthTrend({
    tenantId: req.auth.tenantId,
    bpScope: req.bpScope,
    query: req.query
  });

  return res.apiSuccess("BP dashboard student growth trend fetched", data);
});

const getBpDashboardFranchiseRanking = asyncHandler(async (req, res) => {
  const data = await getBusinessPartnerFranchiseRanking({
    tenantId: req.auth.tenantId,
    bpScope: req.bpScope,
    query: req.query
  });

  return res.apiSuccess("BP dashboard franchise ranking fetched", data);
});

const getBpDashboardCenterHealth = asyncHandler(async (req, res) => {
  const data = await getBusinessPartnerCenterHealth({
    tenantId: req.auth.tenantId,
    bpScope: req.bpScope,
    query: req.query
  });

  return res.apiSuccess("BP dashboard center health fetched", data);
});

export {
  getBpDashboardCenterHealth,
  getBpDashboardFranchiseRanking,
  getBpDashboardOverview,
  getBpDashboardRevenueTrend,
  getBpDashboardStudentGrowthTrend
};