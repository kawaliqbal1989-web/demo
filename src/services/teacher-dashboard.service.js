import {
  getTeacherAttendanceProductivityDashboardSlice,
  getTeacherGradingProductivityDashboardSlice,
  getTeacherOperationalAnomaliesAnalytics,
  getTeacherOperationalOverviewAnalytics,
  getTeacherOperationalTaskQueue,
  getTeacherOperationalTrendsAnalytics,
  resolveCachedTeacherDashboardSlice
} from "./teacher-analytics.service.js";

async function getTeacherDashboardOverview({ tenantId, authUserId, hierarchyNodeId, query = {}, tx } = {}) {
  return resolveCachedTeacherDashboardSlice({
    tenantId,
    authUserId,
    hierarchyNodeId,
    query,
    tx,
    segment: "teacher-dashboard-overview",
    loader: () => getTeacherOperationalOverviewAnalytics({ tenantId, authUserId, hierarchyNodeId, query, tx })
  });
}

async function getTeacherDashboardAttendanceProductivity({ tenantId, authUserId, hierarchyNodeId, query = {}, tx } = {}) {
  return resolveCachedTeacherDashboardSlice({
    tenantId,
    authUserId,
    hierarchyNodeId,
    query,
    tx,
    segment: "teacher-dashboard-attendance-productivity",
    loader: () => getTeacherAttendanceProductivityDashboardSlice({ tenantId, authUserId, hierarchyNodeId, query, tx })
  });
}

async function getTeacherDashboardGradingProductivity({ tenantId, authUserId, hierarchyNodeId, query = {}, tx } = {}) {
  return resolveCachedTeacherDashboardSlice({
    tenantId,
    authUserId,
    hierarchyNodeId,
    query,
    tx,
    segment: "teacher-dashboard-grading-productivity",
    loader: () => getTeacherGradingProductivityDashboardSlice({ tenantId, authUserId, hierarchyNodeId, query, tx })
  });
}

async function getTeacherDashboardTaskQueue({ tenantId, authUserId, hierarchyNodeId, query = {}, tx } = {}) {
  return resolveCachedTeacherDashboardSlice({
    tenantId,
    authUserId,
    hierarchyNodeId,
    query,
    tx,
    segment: "teacher-dashboard-task-queue",
    loader: () => getTeacherOperationalTaskQueue({ tenantId, authUserId, hierarchyNodeId, query, tx })
  });
}

async function getTeacherDashboardAnomalies({ tenantId, authUserId, hierarchyNodeId, query = {}, tx } = {}) {
  return resolveCachedTeacherDashboardSlice({
    tenantId,
    authUserId,
    hierarchyNodeId,
    query,
    tx,
    segment: "teacher-dashboard-anomalies",
    loader: () => getTeacherOperationalAnomaliesAnalytics({ tenantId, authUserId, hierarchyNodeId, query, tx })
  });
}

async function getTeacherDashboardTrends({ tenantId, authUserId, hierarchyNodeId, query = {}, tx } = {}) {
  return resolveCachedTeacherDashboardSlice({
    tenantId,
    authUserId,
    hierarchyNodeId,
    query,
    tx,
    segment: "teacher-dashboard-trends",
    loader: () => getTeacherOperationalTrendsAnalytics({ tenantId, authUserId, hierarchyNodeId, query, tx })
  });
}

export {
  getTeacherDashboardOverview,
  getTeacherDashboardAttendanceProductivity,
  getTeacherDashboardGradingProductivity,
  getTeacherDashboardTaskQueue,
  getTeacherDashboardAnomalies,
  getTeacherDashboardTrends
};