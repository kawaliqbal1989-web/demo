import {
  getCenterHealthAnalytics,
  getFranchiseAlertsAnalytics,
  getFranchiseOverviewAnalytics,
  getFranchiseRankingAnalytics,
  getFranchiseRevenueTrendAnalytics,
  getFranchiseStudentGrowthAnalytics,
  getOverviewAnalytics,
  getRevenueTrendAnalytics,
  getStudentGrowthTrendAnalytics
} from "./bp-analytics.service.js";
import { assertBusinessPartnerFranchiseAccess } from "./bp-scope.service.js";
import {
  BP_DASHBOARD_CACHE_TTL_MS,
  clearBpDashboardCache,
  invalidateBpDashboardCache,
  resolveCachedBpDashboardSlice
} from "./snapshot-cache.service.js";

function resolveScopedFranchiseId({ tenantId, bpScope, franchiseId }) {
  return assertBusinessPartnerFranchiseAccess({ tenantId, bpScope, franchiseId });
}

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

async function getBusinessPartnerFranchiseOverview({ tenantId, bpScope, franchiseId, query = {} }) {
  const scopedFranchiseId = resolveScopedFranchiseId({ tenantId, bpScope, franchiseId });

  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope,
    segment: "franchise-overview",
    filters: {
      franchiseId: scopedFranchiseId,
      asOf: query.asOf || null
    },
    loader: () =>
      getFranchiseOverviewAnalytics({
        tenantId,
        bpScope,
        franchiseId: scopedFranchiseId,
        asOf: query.asOf
      })
  });
}

async function getBusinessPartnerFranchiseRevenueTrend({ tenantId, bpScope, franchiseId, query = {} }) {
  const scopedFranchiseId = resolveScopedFranchiseId({ tenantId, bpScope, franchiseId });

  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope,
    segment: "franchise-revenue-trend",
    filters: {
      franchiseId: scopedFranchiseId,
      asOf: query.asOf || null,
      months: query.months || null
    },
    loader: () =>
      getFranchiseRevenueTrendAnalytics({
        tenantId,
        bpScope,
        franchiseId: scopedFranchiseId,
        asOf: query.asOf,
        months: query.months
      })
  });
}

async function getBusinessPartnerFranchiseStudentGrowth({ tenantId, bpScope, franchiseId, query = {} }) {
  const scopedFranchiseId = resolveScopedFranchiseId({ tenantId, bpScope, franchiseId });

  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope,
    segment: "franchise-student-growth",
    filters: {
      franchiseId: scopedFranchiseId,
      asOf: query.asOf || null,
      months: query.months || null
    },
    loader: () =>
      getFranchiseStudentGrowthAnalytics({
        tenantId,
        bpScope,
        franchiseId: scopedFranchiseId,
        asOf: query.asOf,
        months: query.months
      })
  });
}

async function getBusinessPartnerFranchiseCenters({ tenantId, bpScope, franchiseId, query = {} }) {
  const scopedFranchiseId = resolveScopedFranchiseId({ tenantId, bpScope, franchiseId });

  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope,
    segment: "franchise-centers",
    filters: {
      franchiseId: scopedFranchiseId,
      asOf: query.asOf || null,
      limit: query.limit || null,
      offset: query.offset || null,
      sortBy: query.sortBy || null,
      sortDirection: query.sortDirection || null
    },
    loader: () =>
      getCenterHealthAnalytics({
        tenantId,
        bpScope,
        franchiseId: scopedFranchiseId,
        asOf: query.asOf,
        limit: query.limit,
        offset: query.offset,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection
      })
  });
}

async function getBusinessPartnerFranchiseAlerts({ tenantId, bpScope, franchiseId, query = {} }) {
  const scopedFranchiseId = resolveScopedFranchiseId({ tenantId, bpScope, franchiseId });

  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope,
    segment: "franchise-alerts",
    filters: {
      franchiseId: scopedFranchiseId,
      asOf: query.asOf || null
    },
    loader: () =>
      getFranchiseAlertsAnalytics({
        tenantId,
        bpScope,
        franchiseId: scopedFranchiseId,
        asOf: query.asOf
      })
  });
}

export {
  BP_DASHBOARD_CACHE_TTL_MS,
  clearBpDashboardCache,
  invalidateBpDashboardCache,
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
};