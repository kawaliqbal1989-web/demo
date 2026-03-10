import { apiClient } from "./apiClient";

async function listExamCycles({ limit = 20, offset = 0 } = {}) {
  const response = await apiClient.get("/exam-cycles", {
    params: { limit, offset }
  });
  return response.data;
}

async function createExamCycle(payload) {
  const response = await apiClient.post("/exam-cycles", payload);
  return response.data;
}

async function getTeacherExamEnrollmentList(examCycleId) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/teacher-list`);
  return response.data;
}

async function enrollTeacherStudents(examCycleId, { studentIds } = {}) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/teacher-list/enroll`, {
    studentIds: Array.isArray(studentIds) ? studentIds : []
  });
  return response.data;
}

async function submitTeacherExamEnrollmentList(examCycleId) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/teacher-list/submit`);
  return response.data;
}

async function prepareCenterCombinedEnrollmentList(examCycleId) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/center-list/prepare`);
  return response.data;
}

async function submitCenterCombinedEnrollmentList(examCycleId) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/center-list/submit`);
  return response.data;
}

async function setCenterCombinedListItemIncluded(examCycleId, entryId, { included } = {}) {
  const response = await apiClient.patch(`/exam-cycles/${examCycleId}/center-list/items/${entryId}`, {
    included: Boolean(included)
  });
  return response.data;
}

async function createCenterTemporaryStudents(examCycleId, { students } = {}) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/temporary-students`, {
    students: Array.isArray(students) ? students : []
  });
  return response.data;
}

async function listPendingEnrollmentLists(examCycleId) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/enrollment-lists/pending`);
  return response.data;
}

async function forwardPendingEnrollmentList(examCycleId, listId) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/enrollment-lists/${listId}/forward`);
  return response.data;
}

async function rejectPendingEnrollmentList(examCycleId, listId, { remark } = {}) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/enrollment-lists/${listId}/reject`, {
    remark: remark ?? null
  });
  return response.data;
}

async function getEnrollmentListLevelBreakdown(examCycleId, listId) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/enrollment-lists/${listId}/level-breakdown`);
  return response.data;
}

async function approveEnrollmentListAsSuperadmin(examCycleId, listId, payload = {}) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/enrollment-lists/${listId}/approve`, payload);
  return response.data;
}

async function getExamResults(examCycleId) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/results`);
  return response.data;
}

async function publishExamResults(examCycleId) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/results/publish`);
  return response.data;
}

async function unpublishExamResults(examCycleId) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/results/unpublish`);
  return response.data;
}

async function exportEnrollmentListCsv(examCycleId, listId) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/enrollment-lists/${listId}/export.csv`, {
    responseType: "blob",
    _skipGlobalLoading: true
  });
  return response;
}

async function exportExamResultsCsv(examCycleId) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/results/export.csv`, {
    responseType: "blob",
    _skipGlobalLoading: true
  });
  return response;
}

async function centerRejectTeacherList(examCycleId, listId, { remark } = {}) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/teacher-lists/${listId}/reject`, {
    remark: remark ?? null
  });
  return response.data;
}

export {
  listExamCycles,
  createExamCycle,
  getTeacherExamEnrollmentList,
  enrollTeacherStudents,
  submitTeacherExamEnrollmentList,
  prepareCenterCombinedEnrollmentList,
  submitCenterCombinedEnrollmentList,
  setCenterCombinedListItemIncluded,
  createCenterTemporaryStudents,
  listPendingEnrollmentLists,
  forwardPendingEnrollmentList,
  rejectPendingEnrollmentList,
  centerRejectTeacherList,
  getEnrollmentListLevelBreakdown,
  approveEnrollmentListAsSuperadmin,
  getExamResults,
  publishExamResults,
  unpublishExamResults,
  exportEnrollmentListCsv,
  exportExamResultsCsv
};
