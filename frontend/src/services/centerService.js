import { apiClient } from "./apiClient";

async function getCenterMe() {
  const response = await apiClient.get("/center/me");
  return response.data;
}

async function getCenterDashboard() {
  const response = await apiClient.get("/center/dashboard");
  return response.data;
}

async function listCenterAvailableCourses() {
  const response = await apiClient.get("/center/available-courses");
  return response.data;
}

// ── Analytics ────────────────────────────────────────────────────────

async function getAnalyticsAttendance(params = {}) {
  const response = await apiClient.get("/center/analytics/attendance", { params });
  return response.data;
}

async function exportAnalyticsAttendanceCsv(params = {}) {
  return apiClient.get("/center/analytics/attendance/export.csv", { params, responseType: "blob" });
}

async function getAnalyticsWorksheets(params = {}) {
  const response = await apiClient.get("/center/analytics/worksheets", { params });
  return response.data;
}

async function exportAnalyticsWorksheetsCsv(params = {}) {
  return apiClient.get("/center/analytics/worksheets/export.csv", { params, responseType: "blob" });
}

async function getAnalyticsMockTests(params = {}) {
  const response = await apiClient.get("/center/analytics/mock-tests", { params });
  return response.data;
}

async function exportAnalyticsMockTestsCsv(params = {}) {
  return apiClient.get("/center/analytics/mock-tests/export.csv", { params, responseType: "blob" });
}

async function getAnalyticsExams(params = {}) {
  const response = await apiClient.get("/center/analytics/exams", { params });
  return response.data;
}

async function exportAnalyticsExamsCsv(params = {}) {
  return apiClient.get("/center/analytics/exams/export.csv", { params, responseType: "blob" });
}

async function getAnalyticsCompetitions(params = {}) {
  const response = await apiClient.get("/center/analytics/competitions", { params });
  return response.data;
}

async function exportAnalyticsCompetitionsCsv(params = {}) {
  return apiClient.get("/center/analytics/competitions/export.csv", { params, responseType: "blob" });
}

async function getAnalyticsStudentProgress(params = {}) {
  const response = await apiClient.get("/center/analytics/student-progress", { params });
  return response.data;
}

async function exportAnalyticsStudentProgressCsv(params = {}) {
  return apiClient.get("/center/analytics/student-progress/export.csv", { params, responseType: "blob" });
}

// ── Reassignment ──
async function listCenterReassignmentRequests(params = {}) {
  const response = await apiClient.get("/center/reassignment-requests", { params });
  return response.data;
}
async function reviewCenterReassignmentRequest(requestId, data) {
  const response = await apiClient.post(`/center/reassignment-requests/${requestId}/review`, data);
  return response.data;
}
async function centerDirectReassign(studentId, data) {
  const response = await apiClient.post(`/center/students/${studentId}/reassign`, data);
  return response.data;
}
async function centerBulkAssignWorksheet(data) {
  const response = await apiClient.post("/center/worksheets/bulk-assign", data);
  return response.data;
}

async function getStudentAttendanceHistory(studentId, params = {}) {
  const response = await apiClient.get(`/center/students/${studentId}/attendance-history`, { params });
  return response.data;
}

async function listAttendanceHistory(params = {}) {
  const response = await apiClient.get("/center/attendance-history", { params });
  return response.data;
}

async function getStudent360(studentId) {
  const response = await apiClient.get(`/center/students/${studentId}/360`);
  return response.data;
}

async function listCenterWorkflowQueue(
  { limit = 20, offset = 0, q, status, severity, type, sortBy, sortOrder } = {},
  config = {}
) {
  const response = await apiClient.get("/center/workflows/queues", {
    ...config,
    params: {
      limit,
      offset,
      q: q || undefined,
      status: status || undefined,
      severity: severity || undefined,
      type: type || undefined,
      sortBy: sortBy || undefined,
      sortOrder: sortOrder || undefined
    }
  });
  return response.data;
}

async function listCenterAttendanceWorkflowQueue(
  { limit = 20, offset = 0, q, status, severity, type, sortBy, sortOrder } = {},
  config = {}
) {
  const response = await apiClient.get("/center/workflows/queues/attendance", {
    ...config,
    params: {
      limit,
      offset,
      q: q || undefined,
      status: status || undefined,
      severity: severity || undefined,
      type: type || undefined,
      sortBy: sortBy || undefined,
      sortOrder: sortOrder || undefined
    }
  });
  return response.data;
}

async function listCenterWorksheetWorkflowQueue(
  { limit = 20, offset = 0, q, status, severity, type, sortBy, sortOrder } = {},
  config = {}
) {
  const response = await apiClient.get("/center/workflows/queues/worksheets", {
    ...config,
    params: {
      limit,
      offset,
      q: q || undefined,
      status: status || undefined,
      severity: severity || undefined,
      type: type || undefined,
      sortBy: sortBy || undefined,
      sortOrder: sortOrder || undefined
    }
  });
  return response.data;
}

async function listCenterTeacherWorkflowQueue(
  { limit = 20, offset = 0, q, status, severity, type, sortBy, sortOrder } = {},
  config = {}
) {
  const response = await apiClient.get("/center/workflows/queues/teachers", {
    ...config,
    params: {
      limit,
      offset,
      q: q || undefined,
      status: status || undefined,
      severity: severity || undefined,
      type: type || undefined,
      sortBy: sortBy || undefined,
      sortOrder: sortOrder || undefined
    }
  });
  return response.data;
}

async function listCenterAnomalyWorkflowQueue(
  { limit = 20, offset = 0, q, status, severity, type, sortBy, sortOrder } = {},
  config = {}
) {
  const response = await apiClient.get("/center/workflows/queues/anomalies", {
    ...config,
    params: {
      limit,
      offset,
      q: q || undefined,
      status: status || undefined,
      severity: severity || undefined,
      type: type || undefined,
      sortBy: sortBy || undefined,
      sortOrder: sortOrder || undefined
    }
  });
  return response.data;
}

async function getCenterWorkflowDetail(id, config = {}) {
  const response = await apiClient.get(`/center/workflows/${id}`, config);
  return response.data;
}

async function getCenterWorkflowHistory(id, { limit = 20, offset = 0 } = {}, config = {}) {
  const response = await apiClient.get(`/center/workflows/${id}/history`, {
    ...config,
    params: {
      limit,
      offset
    }
  });
  return response.data;
}

async function postCenterWorkflowAction(id, actionPath, payload = {}) {
  const response = await apiClient.post(`/center/workflows/${id}/actions/${actionPath}`, payload);
  return response.data;
}

async function reviewCenterWorkflow(id, payload = {}) {
  return postCenterWorkflowAction(id, "review", payload);
}

async function acknowledgeCenterWorkflow(id, payload = {}) {
  return postCenterWorkflowAction(id, "acknowledge", payload);
}

async function startCenterWorkflowRecovery(id, payload = {}) {
  return postCenterWorkflowAction(id, "start-recovery", payload);
}

async function scheduleCenterWorkflowFollowUp(id, payload = {}) {
  return postCenterWorkflowAction(id, "schedule-follow-up", payload);
}

async function escalateCenterWorkflow(id, payload = {}) {
  return postCenterWorkflowAction(id, "escalate", payload);
}

async function resolveCenterWorkflow(id, payload = {}) {
  return postCenterWorkflowAction(id, "resolve", payload);
}

async function reopenCenterWorkflow(id, payload = {}) {
  return postCenterWorkflowAction(id, "reopen", payload);
}

export {
  getCenterMe,
  getCenterDashboard,
  listCenterAvailableCourses,
  getAnalyticsAttendance,
  exportAnalyticsAttendanceCsv,
  getAnalyticsWorksheets,
  exportAnalyticsWorksheetsCsv,
  getAnalyticsMockTests,
  exportAnalyticsMockTestsCsv,
  getAnalyticsExams,
  exportAnalyticsExamsCsv,
  getAnalyticsCompetitions,
  exportAnalyticsCompetitionsCsv,
  getAnalyticsStudentProgress,
  exportAnalyticsStudentProgressCsv,
  listCenterReassignmentRequests,
  reviewCenterReassignmentRequest,
  centerDirectReassign,
  centerBulkAssignWorksheet,
  getStudentAttendanceHistory,
  listAttendanceHistory,
  getStudent360,
  listCenterWorkflowQueue,
  listCenterAttendanceWorkflowQueue,
  listCenterWorksheetWorkflowQueue,
  listCenterTeacherWorkflowQueue,
  listCenterAnomalyWorkflowQueue,
  getCenterWorkflowDetail,
  getCenterWorkflowHistory,
  reviewCenterWorkflow,
  acknowledgeCenterWorkflow,
  startCenterWorkflowRecovery,
  scheduleCenterWorkflowFollowUp,
  escalateCenterWorkflow,
  resolveCenterWorkflow,
  reopenCenterWorkflow,
};
