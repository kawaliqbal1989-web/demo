import { apiClient } from "./apiClient";

async function listAttendanceSessions({ limit = 50, offset = 0, batchId = "", status = "", from = "", to = "" } = {}) {
  const response = await apiClient.get("/attendance/sessions", {
    params: {
      limit,
      offset,
      batchId: batchId || undefined,
      status: status || undefined,
      from: from || undefined,
      to: to || undefined
    }
  });
  return response.data;
}

async function createAttendanceSession(payload) {
  const key = payload?.idempotencyKey || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const response = await apiClient.post("/attendance/sessions", payload, { headers: { "Idempotency-Key": key } });
  return response.data;
}

async function getAttendanceSession(id) {
  const response = await apiClient.get(`/attendance/sessions/${id}`);
  return response.data;
}

async function updateAttendanceEntries(sessionId, payload) {
  const response = await apiClient.put(`/attendance/sessions/${sessionId}/entries`, payload);
  return response.data;
}

async function publishAttendanceSession(sessionId) {
  const response = await apiClient.post(`/attendance/sessions/${sessionId}/publish`);
  return response.data;
}

async function lockAttendanceSession(sessionId) {
  const response = await apiClient.post(`/attendance/sessions/${sessionId}/lock`);
  return response.data;
}

async function requestAttendanceCorrection(sessionId, payload) {
  const response = await apiClient.post(`/attendance/sessions/${sessionId}/corrections`, payload);
  return response.data;
}

async function listAttendanceCorrections({ limit = 50, offset = 0, status = "", sessionId = "" } = {}) {
  const response = await apiClient.get("/attendance/corrections", {
    params: {
      limit,
      offset,
      status: status || undefined,
      sessionId: sessionId || undefined
    }
  });
  return response.data;
}

async function reviewAttendanceCorrection(requestId, action) {
  const response = await apiClient.post(`/attendance/corrections/${requestId}/review`, { action });
  return response.data;
}

async function cancelAttendanceSession(sessionId) {
  const response = await apiClient.post(`/attendance/sessions/${sessionId}/cancel`);
  return response.data;
}

async function reopenAttendanceSession(sessionId, payload) {
  const response = await apiClient.post(`/attendance/sessions/${sessionId}/reopen`, payload);
  return response.data;
}

export {
  listAttendanceSessions,
  listAttendanceCorrections,
  createAttendanceSession,
  getAttendanceSession,
  updateAttendanceEntries,
  publishAttendanceSession,
  lockAttendanceSession,
  requestAttendanceCorrection,
  reviewAttendanceCorrection,
  cancelAttendanceSession,
  reopenAttendanceSession
};
