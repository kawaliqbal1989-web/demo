import { apiClient } from "./apiClient";

async function getTeacherMe() {
  const response = await apiClient.get("/teacher/me");
  return response.data;
}

async function updateTeacherProfile(data) {
  const response = await apiClient.patch("/teacher/profile", data);
  return response.data;
}

async function listMyBatches() {
  const response = await apiClient.get("/teacher/batches");
  return response.data;
}

async function getBatchRoster(batchId) {
  const response = await apiClient.get(`/teacher/batches/${batchId}/roster`);
  return response.data;
}

async function getTeacherBatchWorksheetsContext(batchId) {
  const response = await apiClient.get(`/teacher/batches/${batchId}/worksheets/context`);
  return response.data;
}

async function assignWorksheetToBatch(batchId, payload) {
  const response = await apiClient.post(`/teacher/batches/${batchId}/worksheets/assign`, payload);
  return response.data;
}

async function listTeacherBatchMockTests(batchId, { limit = 50, offset = 0 } = {}) {
  const response = await apiClient.get(`/teacher/batches/${batchId}/mock-tests`, {
    params: {
      limit,
      offset
    }
  });
  return response.data;
}

async function getTeacherMockTest(mockTestId) {
  const response = await apiClient.get(`/teacher/mock-tests/${mockTestId}`);
  return response.data;
}

async function saveTeacherMockTestResults(mockTestId, results) {
  const response = await apiClient.put(`/teacher/mock-tests/${mockTestId}/results`, { results });
  return response.data;
}

async function listMyStudents({ q = "" } = {}) {
  const response = await apiClient.get("/teacher/students", {
    params: {
      q: q || undefined
    }
  });
  return response.data;
}

async function getStudent(studentId) {
  const response = await apiClient.get(`/teacher/students/${studentId}`);
  return response.data;
}

async function getTeacherStudentMaterials(studentId) {
  const response = await apiClient.get(`/teacher/students/${studentId}/materials`);
  return response.data;
}

async function getTeacherStudentPracticeReport(studentId, { limit } = {}) {
  const response = await apiClient.get(`/teacher/students/${studentId}/practice-report`, {
    params: {
      limit: limit === undefined || limit === null ? undefined : limit
    }
  });
  return response.data;
}

async function getTeacherStudentAttempts(studentId, { limit, offset, status, passed, from, to } = {}) {
  const response = await apiClient.get(`/teacher/students/${studentId}/attempts`, {
    params: {
      limit: limit === undefined || limit === null ? undefined : limit,
      offset: offset === undefined || offset === null ? undefined : offset,
      status: status || undefined,
      passed: passed === undefined || passed === null || passed === "" ? undefined : passed,
      from: from || undefined,
      to: to || undefined
    }
  });
  return response.data;
}

async function exportTeacherStudentAttemptsCsv(studentId, { limit, offset, status, passed, from, to } = {}) {
  const response = await apiClient.get(`/teacher/students/${studentId}/attempts/export.csv`, {
    params: {
      limit: limit === undefined || limit === null ? undefined : limit,
      offset: offset === undefined || offset === null ? undefined : offset,
      status: status || undefined,
      passed: passed === undefined || passed === null || passed === "" ? undefined : passed,
      from: from || undefined,
      to: to || undefined
    },
    responseType: "blob"
  });
  return response;
}

async function overrideTeacherStudentPromotion(studentId, payload) {
  const response = await apiClient.post(`/teacher/students/${studentId}/override-promotion`, payload);
  return response.data;
}

async function getTeacherAssignWorksheets(studentId) {
  return apiClient.get(`/teacher/students/${studentId}/assign-worksheets`);
}

async function saveTeacherAssignWorksheets(studentId, payload) {
  return apiClient.post(`/teacher/students/${studentId}/assign-worksheets`, payload);
}

async function listStudentNotes(studentId, { limit = 50, offset = 0, from = "", to = "" } = {}) {
  const response = await apiClient.get(`/teacher/students/${studentId}/notes`, {
    params: {
      limit,
      offset,
      from: from || undefined,
      to: to || undefined
    }
  });
  return response.data;
}

async function createStudentNote(studentId, payload) {
  const response = await apiClient.post(`/teacher/students/${studentId}/notes`, payload);
  return response.data;
}

async function updateNote(noteId, payload) {
  const response = await apiClient.put(`/teacher/notes/${noteId}`, payload);
  return response.data;
}

async function deleteNote(noteId) {
  const response = await apiClient.delete(`/teacher/notes/${noteId}`);
  return response.data;
}

async function listAttendanceSessions({ batchId = "", date = "", limit = 50, offset = 0 } = {}) {
  const response = await apiClient.get("/teacher/attendance/sessions", {
    params: {
      batchId: batchId || undefined,
      date: date || undefined,
      limit,
      offset
    }
  });
  return response.data;
}

async function createAttendanceSession(payload) {
  // Ensure an Idempotency-Key is sent for create to let server deduplicate concurrent creates.
  const key = payload?.idempotencyKey || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    const response = await apiClient.post("/teacher/attendance/sessions", payload, { headers: { "Idempotency-Key": key } });
    return response.data;
  } catch (err) {
    const code = err?.response?.data?.error_code;
    if (code === "SESSION_ALREADY_EXISTS") {
      // If another actor created the session concurrently, try to fetch it.
      try {
        const list = await listAttendanceSessions({ batchId: payload.batchId, date: payload.date, limit: 1, offset: 0 });
        const items = list?.data?.items || list?.items || [];
        if (items.length) {
          return list;
        }

        // Edge case: server reported SESSION_ALREADY_EXISTS but listing returned nothing
        // (race between DB commit and read). Wait briefly then retry create once.
        await new Promise((res) => setTimeout(res, 150));
        const retryResp = await apiClient.post("/teacher/attendance/sessions", payload);
        return retryResp.data;
      } catch (e) {
        // If retry/listing fails, rethrow original error so caller can handle UI.
        throw err;
      }
    }

    throw err;
  }
}

async function getAttendanceSession(sessionId) {
  const response = await apiClient.get(`/teacher/attendance/sessions/${sessionId}`);
  return response.data;
}

async function updateAttendanceEntries(sessionId, payload) {
  const response = await apiClient.put(`/teacher/attendance/sessions/${sessionId}/entries`, payload);
  return response.data;
}

async function publishAttendanceSession(sessionId) {
  const response = await apiClient.post(`/teacher/attendance/sessions/${sessionId}/publish`);
  return response.data;
}

async function getBatchAttendanceHistory({ batchId, from, to, sessionStatus, limit = 20, offset = 0 } = {}) {
  const response = await apiClient.get("/teacher/attendance/history", {
    params: {
      batchId: batchId || undefined,
      from: from || undefined,
      to: to || undefined,
      sessionStatus: sessionStatus || undefined,
      limit,
      offset
    }
  });
  return response.data;
}

async function exportBatchAttendanceHistoryCsv({ batchId, from, to, sessionStatus, limit = 5000, offset = 0 } = {}) {
  return apiClient.get("/teacher/attendance/history/export.csv", {
    params: {
      batchId: batchId || undefined,
      from: from || undefined,
      to: to || undefined,
      sessionStatus: sessionStatus || undefined,
      limit,
      offset
    },
    responseType: "blob"
  });
}

// ── Analytics ────────────────────────────────────────────────────────

async function getAnalyticsAttendance(params = {}) {
  const response = await apiClient.get("/teacher/analytics/attendance", { params });
  return response.data;
}

async function exportAnalyticsAttendanceCsv(params = {}) {
  return apiClient.get("/teacher/analytics/attendance/export.csv", { params, responseType: "blob" });
}

async function getAnalyticsWorksheets(params = {}) {
  const response = await apiClient.get("/teacher/analytics/worksheets", { params });
  return response.data;
}

async function exportAnalyticsWorksheetsCsv(params = {}) {
  return apiClient.get("/teacher/analytics/worksheets/export.csv", { params, responseType: "blob" });
}

async function getAnalyticsMockTests(params = {}) {
  const response = await apiClient.get("/teacher/analytics/mock-tests", { params });
  return response.data;
}

async function exportAnalyticsMockTestsCsv(params = {}) {
  return apiClient.get("/teacher/analytics/mock-tests/export.csv", { params, responseType: "blob" });
}

async function getAnalyticsExams(params = {}) {
  const response = await apiClient.get("/teacher/analytics/exams", { params });
  return response.data;
}

async function exportAnalyticsExamsCsv(params = {}) {
  return apiClient.get("/teacher/analytics/exams/export.csv", { params, responseType: "blob" });
}

async function getAnalyticsCompetitions(params = {}) {
  const response = await apiClient.get("/teacher/analytics/competitions", { params });
  return response.data;
}

async function exportAnalyticsCompetitionsCsv(params = {}) {
  return apiClient.get("/teacher/analytics/competitions/export.csv", { params, responseType: "blob" });
}

async function getAnalyticsStudentProgress(params = {}) {
  const response = await apiClient.get("/teacher/analytics/student-progress", { params });
  return response.data;
}

async function exportAnalyticsStudentProgressCsv(params = {}) {
  return apiClient.get("/teacher/analytics/student-progress/export.csv", { params, responseType: "blob" });
}

// ── Reassignment ──
async function listTeacherReassignmentRequests(params = {}) {
  const response = await apiClient.get("/teacher/reassignment-requests", { params });
  return response.data;
}
async function reviewTeacherReassignmentRequest(requestId, data) {
  const response = await apiClient.post(`/teacher/reassignment-requests/${requestId}/review`, data);
  return response.data;
}
async function teacherDirectReassign(studentId, data) {
  const response = await apiClient.post(`/teacher/students/${studentId}/reassign`, data);
  return response.data;
}
async function bulkAssignWorksheetToStudents(data) {
  const response = await apiClient.post("/teacher/worksheets/bulk-assign", data);
  return response.data;
}

async function getStudentAttendanceHistory(studentId, params = {}) {
  const response = await apiClient.get(`/teacher/students/${studentId}/attendance-history`, { params });
  return response.data;
}

async function getStudent360(studentId) {
  const response = await apiClient.get(`/teacher/students/${studentId}/360`);
  return response.data;
}

export {
  getTeacherMe,
  updateTeacherProfile,
  listMyBatches,
  getBatchRoster,
  getTeacherBatchWorksheetsContext,
  assignWorksheetToBatch,
  listTeacherBatchMockTests,
  getTeacherMockTest,
  saveTeacherMockTestResults,
  listMyStudents,
  getStudent,
  getTeacherStudentMaterials,
  getTeacherStudentPracticeReport,
  getTeacherStudentAttempts,
  exportTeacherStudentAttemptsCsv,
  overrideTeacherStudentPromotion,
  getTeacherAssignWorksheets,
  saveTeacherAssignWorksheets,
  listStudentNotes,
  createStudentNote,
  updateNote,
  deleteNote,
  listAttendanceSessions,
  createAttendanceSession,
  getAttendanceSession,
  updateAttendanceEntries,
  publishAttendanceSession,
  getBatchAttendanceHistory,
  exportBatchAttendanceHistoryCsv,
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
  listTeacherReassignmentRequests,
  reviewTeacherReassignmentRequest,
  teacherDirectReassign,
  bulkAssignWorksheetToStudents,
  getStudentAttendanceHistory,
  getStudent360,
};
