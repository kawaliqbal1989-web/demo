import { asyncHandler } from "../utils/async-handler.js";
import {
  getBusinessPartnerCenterHealth,
  getBusinessPartnerDashboardOverview,
  getBusinessPartnerFranchiseAlerts,
  getBusinessPartnerFranchiseCenters,
  getBusinessPartnerFranchiseOverview,
  getBusinessPartnerFranchiseRanking,
  getBusinessPartnerFranchiseRevenueTrend,
  getBusinessPartnerFranchiseStudentGrowth,
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

const getBpFranchiseOverview = asyncHandler(async (req, res) => {
  const data = await getBusinessPartnerFranchiseOverview({
    tenantId: req.auth.tenantId,
    bpScope: req.bpScope,
    franchiseId: req.params.id,
    query: req.query
  });

  return res.apiSuccess("BP franchise overview fetched", data);
});

const getBpFranchiseRevenueTrend = asyncHandler(async (req, res) => {
  const data = await getBusinessPartnerFranchiseRevenueTrend({
    tenantId: req.auth.tenantId,
    bpScope: req.bpScope,
    franchiseId: req.params.id,
    query: req.query
  });

  return res.apiSuccess("BP franchise revenue trend fetched", data);
});

const getBpFranchiseStudentGrowth = asyncHandler(async (req, res) => {
  const data = await getBusinessPartnerFranchiseStudentGrowth({
    tenantId: req.auth.tenantId,
    bpScope: req.bpScope,
    franchiseId: req.params.id,
    query: req.query
  });

  return res.apiSuccess("BP franchise student growth fetched", data);
});

const getBpFranchiseCenters = asyncHandler(async (req, res) => {
  const data = await getBusinessPartnerFranchiseCenters({
    tenantId: req.auth.tenantId,
    bpScope: req.bpScope,
    franchiseId: req.params.id,
    query: req.query
  });

  return res.apiSuccess("BP franchise centers fetched", data);
});

const getBpFranchiseAlerts = asyncHandler(async (req, res) => {
  const data = await getBusinessPartnerFranchiseAlerts({
    tenantId: req.auth.tenantId,
    bpScope: req.bpScope,
    franchiseId: req.params.id,
    query: req.query
  });

  return res.apiSuccess("BP franchise alerts fetched", data);
});

export {
  getBpDashboardCenterHealth,
  getBpDashboardFranchiseRanking,
  getBpDashboardOverview,
  getBpDashboardRevenueTrend,
  getBpDashboardStudentGrowthTrend,
  getBpFranchiseAlerts,
  getBpFranchiseCenters,
  getBpFranchiseOverview,
  getBpFranchiseRevenueTrend,
  getBpFranchiseStudentGrowth
};