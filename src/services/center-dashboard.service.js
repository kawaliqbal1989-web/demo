import {
  BP_DASHBOARD_CACHE_TTL_MS,
  clearBpDashboardCache,
  invalidateBpDashboardCache,
  resolveCachedBpDashboardSlice
} from "./snapshot-cache.service.js";
import {
  getCenterAttendanceOperationalAnalytics,
  getCenterBatchHealthAnalytics,
  getCenterOperationalAnomaliesAnalytics,
  getCenterOperationalOverviewAnalytics,
  getCenterOperationalTrendsAnalytics,
  getCenterTeacherOperationalAnalytics,
  getCenterWorksheetOperationalAnalytics,
  resolveCenterOperationalScope
} from "./center-operational-analytics.service.js";

async function buildCacheScope({ tenantId, authUserId, hierarchyNodeId, tx }) {
  const centerScope = await resolveCenterOperationalScope({ tenantId, authUserId, hierarchyNodeId, tx });
  return {
    businessPartner: {
      id: centerScope.center.businessPartnerId
    },
    franchiseIds: [centerScope.center.franchiseId],
    centerIds: [centerScope.center.id],
    hierarchyNodeIds: [centerScope.center.hierarchyNodeId],
    centerScope
  };
}

async function getCenterDashboardOverview({ tenantId, authUserId, hierarchyNodeId, query = {}, tx } = {}) {
  const scope = await buildCacheScope({ tenantId, authUserId, hierarchyNodeId, tx });
  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope: scope,
    segment: "center-dashboard-overview",
    filters: {
      asOf: query.asOf || null,
      centerId: scope.centerScope.center.id
    },
    loader: () => getCenterOperationalOverviewAnalytics({ tenantId, authUserId, hierarchyNodeId, query, tx })
  });
}

async function getCenterDashboardAttendanceHealth({ tenantId, authUserId, hierarchyNodeId, query = {}, tx } = {}) {
  const scope = await buildCacheScope({ tenantId, authUserId, hierarchyNodeId, tx });
  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope: scope,
    segment: "center-dashboard-attendance-health",
    filters: {
      asOf: query.asOf || null,
      limit: query.limit || null,
      offset: query.offset || null,
      sortBy: query.sortBy || null,
      sortDirection: query.sortDirection || query.sortOrder || null,
      search: query.search || query.q || null
    },
    loader: () => getCenterAttendanceOperationalAnalytics({ tenantId, authUserId, hierarchyNodeId, query, tx })
  });
}

async function getCenterDashboardWorksheetOps({ tenantId, authUserId, hierarchyNodeId, query = {}, tx } = {}) {
  const scope = await buildCacheScope({ tenantId, authUserId, hierarchyNodeId, tx });
  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope: scope,
    segment: "center-dashboard-worksheet-ops",
    filters: {
      asOf: query.asOf || null,
      limit: query.limit || null,
      offset: query.offset || null,
      sortBy: query.sortBy || null,
      sortDirection: query.sortDirection || query.sortOrder || null,
      search: query.search || query.q || null
    },
    loader: () => getCenterWorksheetOperationalAnalytics({ tenantId, authUserId, hierarchyNodeId, query, tx })
  });
}

async function getCenterDashboardTeacherOps({ tenantId, authUserId, hierarchyNodeId, query = {}, tx } = {}) {
  const scope = await buildCacheScope({ tenantId, authUserId, hierarchyNodeId, tx });
  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope: scope,
    segment: "center-dashboard-teacher-ops",
    filters: {
      asOf: query.asOf || null,
      limit: query.limit || null,
      offset: query.offset || null,
      sortBy: query.sortBy || null,
      sortDirection: query.sortDirection || query.sortOrder || null,
      inactiveOnly: query.inactiveOnly || null,
      search: query.search || query.q || null
    },
    loader: () => getCenterTeacherOperationalAnalytics({ tenantId, authUserId, hierarchyNodeId, query, tx })
  });
}

async function getCenterDashboardBatchHealth({ tenantId, authUserId, hierarchyNodeId, query = {}, tx } = {}) {
  const scope = await buildCacheScope({ tenantId, authUserId, hierarchyNodeId, tx });
  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope: scope,
    segment: "center-dashboard-batch-health",
    filters: {
      asOf: query.asOf || null,
      limit: query.limit || null,
      offset: query.offset || null,
      sortBy: query.sortBy || null,
      sortDirection: query.sortDirection || query.sortOrder || null,
      riskOnly: query.riskOnly || null,
      search: query.search || query.q || null
    },
    loader: () => getCenterBatchHealthAnalytics({ tenantId, authUserId, hierarchyNodeId, query, tx })
  });
}

async function getCenterDashboardAnomalies({ tenantId, authUserId, hierarchyNodeId, query = {}, tx } = {}) {
  const scope = await buildCacheScope({ tenantId, authUserId, hierarchyNodeId, tx });
  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope: scope,
    segment: "center-dashboard-anomalies",
    filters: {
      asOf: query.asOf || null,
      limit: query.limit || null,
      offset: query.offset || null,
      sortBy: query.sortBy || null,
      sortDirection: query.sortDirection || query.sortOrder || null,
      type: query.type || null,
      severity: query.severity || null,
      search: query.search || query.q || null
    },
    loader: () => getCenterOperationalAnomaliesAnalytics({ tenantId, authUserId, hierarchyNodeId, query, tx })
  });
}

async function getCenterDashboardTrends({ tenantId, authUserId, hierarchyNodeId, query = {}, tx } = {}) {
  const scope = await buildCacheScope({ tenantId, authUserId, hierarchyNodeId, tx });
  return resolveCachedBpDashboardSlice({
    tenantId,
    bpScope: scope,
    segment: "center-dashboard-trends",
    filters: {
      asOf: query.asOf || null,
      months: query.months || null
    },
    loader: () => getCenterOperationalTrendsAnalytics({ tenantId, authUserId, hierarchyNodeId, query, tx })
  });
}

export {
  BP_DASHBOARD_CACHE_TTL_MS,
  clearBpDashboardCache,
  getCenterDashboardAnomalies,
  getCenterDashboardAttendanceHealth,
  getCenterDashboardBatchHealth,
  getCenterDashboardOverview,
  getCenterDashboardTeacherOps,
  getCenterDashboardTrends,
  getCenterDashboardWorksheetOps,
  invalidateBpDashboardCache
};