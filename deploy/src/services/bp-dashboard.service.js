import {
  getCenterHealthAnalytics,
  getFranchiseRankingAnalytics,
  getOverviewAnalytics,
  getRevenueTrendAnalytics,
  getStudentGrowthTrendAnalytics
} from "./bp-analytics.service.js";
import {
  BP_DASHBOARD_CACHE_TTL_MS,
  clearBpDashboardCache,
  invalidateBpDashboardCache,
  resolveCachedBpDashboardSlice
} from "./snapshot-cache.service.js";

async function getBusinessPartnerDashboardOverview({ tenantId, bpScope, query = {} }) {
  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope,
    segment: "overview",
    filters: {
      asOf: query.asOf || null
    },
    loader: () => getOverviewAnalytics({ tenantId, bpScope, asOf: query.asOf })
  });
}

async function getBusinessPartnerRevenueTrend({ tenantId, bpScope, query = {} }) {
  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope,
    segment: "revenue-trend",
    filters: {
      asOf: query.asOf || null,
      months: query.months || null
    },
    loader: () =>
      getRevenueTrendAnalytics({
        tenantId,
        bpScope,
        asOf: query.asOf,
        months: query.months
      })
  });
}

async function getBusinessPartnerStudentGrowthTrend({ tenantId, bpScope, query = {} }) {
  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope,
    segment: "student-growth-trend",
    filters: {
      asOf: query.asOf || null,
      months: query.months || null
    },
    loader: () =>
      getStudentGrowthTrendAnalytics({
        tenantId,
        bpScope,
        asOf: query.asOf,
        months: query.months
      })
  });
}

async function getBusinessPartnerFranchiseRanking({ tenantId, bpScope, query = {} }) {
  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope,
    segment: "franchise-ranking",
    filters: {
      asOf: query.asOf || null,
      limit: query.limit || null,
      offset: query.offset || null,
      sortBy: query.sortBy || null,
      sortDirection: query.sortDirection || null
    },
    loader: () =>
      getFranchiseRankingAnalytics({
        tenantId,
        bpScope,
        asOf: query.asOf,
        limit: query.limit,
        offset: query.offset,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection
      })
  });
}

async function getBusinessPartnerCenterHealth({ tenantId, bpScope, query = {} }) {
  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope,
    segment: "center-health",
    filters: {
      asOf: query.asOf || null,
      franchiseId: query.franchiseId || null,
      limit: query.limit || null,
      offset: query.offset || null,
      sortBy: query.sortBy || null,
      sortDirection: query.sortDirection || null
    },
    loader: () =>
      getCenterHealthAnalytics({
        tenantId,
        bpScope,
        asOf: query.asOf,
        franchiseId: query.franchiseId,
        limit: query.limit,
        offset: query.offset,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection
      })
  });
}

export {
  BP_DASHBOARD_CACHE_TTL_MS,
  clearBpDashboardCache,
  invalidateBpDashboardCache,
  getBusinessPartnerCenterHealth,
  getBusinessPartnerDashboardOverview,
  getBusinessPartnerFranchiseRanking,
  getBusinessPartnerRevenueTrend,
  getBusinessPartnerStudentGrowthTrend
};