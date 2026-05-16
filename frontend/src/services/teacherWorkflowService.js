import { apiClient } from "./apiClient";

async function listTeacherWorkflowQueue(
  { limit = 20, offset = 0, q, status, severity, type, sortBy, sortOrder } = {},
  config = {}
) {
  const response = await apiClient.get("/teacher/workflows/queues", {
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

async function listTeacherAttendanceWorkflowQueue(
  { limit = 20, offset = 0, q, status, severity, type, sortBy, sortOrder } = {},
  config = {}
) {
  const response = await apiClient.get("/teacher/workflows/queues/attendance", {
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

async function listTeacherGradingWorkflowQueue(
  { limit = 20, offset = 0, q, status, severity, type, sortBy, sortOrder } = {},
  config = {}
) {
  const response = await apiClient.get("/teacher/workflows/queues/grading", {
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

async function listTeacherAnomalyWorkflowQueue(
  { limit = 20, offset = 0, q, status, severity, type, sortBy, sortOrder } = {},
  config = {}
) {
  const response = await apiClient.get("/teacher/workflows/queues/anomalies", {
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

async function getTeacherWorkflowDetail(id, config = {}) {
  const response = await apiClient.get(`/teacher/workflows/${id}`, config);
  return response.data;
}

async function getTeacherWorkflowHistory(id, { limit = 20, offset = 0 } = {}, config = {}) {
  const response = await apiClient.get(`/teacher/workflows/${id}/history`, {
    ...config,
    params: {
      limit,
      offset
    }
  });
  return response.data;
}

async function postTeacherWorkflowAction(id, actionPath, payload = {}) {
  const response = await apiClient.post(`/teacher/workflows/${id}/actions/${actionPath}`, payload);
  return response.data;
}

async function reviewTeacherWorkflow(id, payload = {}) {
  return postTeacherWorkflowAction(id, "review", payload);
}

async function acknowledgeTeacherWorkflow(id, payload = {}) {
  return postTeacherWorkflowAction(id, "acknowledge", payload);
}

async function startTeacherWorkflowRecovery(id, payload = {}) {
  return postTeacherWorkflowAction(id, "start-recovery", payload);
}

async function markTeacherWorkflowAttendance(id, payload = {}) {
  return postTeacherWorkflowAction(id, "mark-attendance", payload);
}

async function completeTeacherWorkflowGrading(id, payload = {}) {
  return postTeacherWorkflowAction(id, "complete-grading", payload);
}

async function bulkGradeTeacherWorkflow(id, payload = {}) {
  return postTeacherWorkflowAction(id, "bulk-grade", payload);
}

async function resolveTeacherWorkflow(id, payload = {}) {
  return postTeacherWorkflowAction(id, "resolve", payload);
}

async function reopenTeacherWorkflow(id, payload = {}) {
  return postTeacherWorkflowAction(id, "reopen", payload);
}

export {
  acknowledgeTeacherWorkflow,
  bulkGradeTeacherWorkflow,
  completeTeacherWorkflowGrading,
  getTeacherWorkflowDetail,
  getTeacherWorkflowHistory,
  listTeacherAnomalyWorkflowQueue,
  listTeacherAttendanceWorkflowQueue,
  listTeacherGradingWorkflowQueue,
  listTeacherWorkflowQueue,
  markTeacherWorkflowAttendance,
  reopenTeacherWorkflow,
  resolveTeacherWorkflow,
  reviewTeacherWorkflow,
  startTeacherWorkflowRecovery
};