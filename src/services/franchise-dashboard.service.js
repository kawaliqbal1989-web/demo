import {
  BP_DASHBOARD_CACHE_TTL_MS,
  clearBpDashboardCache,
  invalidateBpDashboardCache,
  resolveCachedBpDashboardSlice
} from "./snapshot-cache.service.js";
import {
  getFranchiseCenterHealthAnalytics,
  getFranchiseOperationalAnomaliesAnalytics,
  getFranchiseOperationalTrendsAnalytics,
  getFranchiseOverviewAnalytics,
  getFranchiseTeacherOperationalAnalytics
} from "./franchise-analytics.service.js";

function buildCacheScope(franchiseScope) {
  return {
    businessPartner: {
      id: franchiseScope?.franchise?.businessPartnerId || null
    },
    franchiseIds: franchiseScope?.franchise?.id ? [franchiseScope.franchise.id] : [],
    centerIds: [],
    hierarchyNodeIds: [...(franchiseScope?.hierarchyNodeIds || [])].sort()
  };
}

async function getFranchiseDashboardOverview({ tenantId, franchiseScope, query = {}, tx } = {}) {
  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope: buildCacheScope(franchiseScope),
    segment: "franchise-dashboard-overview",
    filters: {
      franchiseId: franchiseScope?.franchise?.id || null,
      asOf: query.asOf || null
    },
    loader: () => getFranchiseOverviewAnalytics({ tenantId, franchiseScope, query, tx })
  });
}

async function getFranchiseDashboardCenterHealth({ tenantId, franchiseScope, query = {}, tx } = {}) {
  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope: buildCacheScope(franchiseScope),
    segment: "franchise-dashboard-center-health",
    filters: {
      franchiseId: franchiseScope?.franchise?.id || null,
      asOf: query.asOf || null,
      limit: query.limit || null,
      offset: query.offset || null,
      sortBy: query.sortBy || null,
      sortDirection: query.sortDirection || null,
      weakOnly: query.weakOnly || null,
      inactiveOnly: query.inactiveOnly || null,
      search: query.search || query.q || null,
      status: query.status || null
    },
    loader: () => getFranchiseCenterHealthAnalytics({ tenantId, franchiseScope, query, tx })
  });
}

async function getFranchiseDashboardTeacherOps({ tenantId, franchiseScope, query = {}, tx } = {}) {
  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope: buildCacheScope(franchiseScope),
    segment: "franchise-dashboard-teacher-ops",
    filters: {
      franchiseId: franchiseScope?.franchise?.id || null,
      asOf: query.asOf || null,
      limit: query.limit || null,
      offset: query.offset || null,
      sortBy: query.sortBy || null,
      sortDirection: query.sortDirection || null,
      inactiveOnly: query.inactiveOnly || null,
      centerId: query.centerId || null,
      search: query.search || query.q || null
    },
    loader: () => getFranchiseTeacherOperationalAnalytics({ tenantId, franchiseScope, query, tx })
  });
}

async function getFranchiseDashboardAnomalies({ tenantId, franchiseScope, query = {}, tx } = {}) {
  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope: buildCacheScope(franchiseScope),
    segment: "franchise-dashboard-anomalies",
    filters: {
      franchiseId: franchiseScope?.franchise?.id || null,
      asOf: query.asOf || null,
      limit: query.limit || null,
      offset: query.offset || null,
      sortBy: query.sortBy || null,
      sortDirection: query.sortDirection || null,
      type: query.type || null,
      severity: query.severity || null,
      search: query.search || query.q || null
    },
    loader: () => getFranchiseOperationalAnomaliesAnalytics({ tenantId, franchiseScope, query, tx })
  });
}

async function getFranchiseDashboardTrends({ tenantId, franchiseScope, query = {}, tx } = {}) {
  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope: buildCacheScope(franchiseScope),
    segment: "franchise-dashboard-trends",
    filters: {
      franchiseId: franchiseScope?.franchise?.id || null,
      asOf: query.asOf || null,
      months: query.months || null
    },
    loader: () => getFranchiseOperationalTrendsAnalytics({ tenantId, franchiseScope, query, tx })
  });
}

export {
  BP_DASHBOARD_CACHE_TTL_MS,
  clearBpDashboardCache,
  getFranchiseDashboardAnomalies,
  getFranchiseDashboardCenterHealth,
  getFranchiseDashboardOverview,
  getFranchiseDashboardTeacherOps,
  getFranchiseDashboardTrends,
  invalidateBpDashboardCache
};