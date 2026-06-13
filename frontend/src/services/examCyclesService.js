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

async function getExamCycleDeleteImpact(examCycleId) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/delete-impact`);
  return response.data;
}

async function getExamCycleAuditCheck(examCycleId) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/audit-check`);
  return response.data;
}

async function deleteExamCycle(examCycleId, { password, confirmCode } = {}) {
  const response = await apiClient.delete(`/exam-cycles/${examCycleId}`, {
    data: {
      password: String(password || ""),
      confirmCode: String(confirmCode || "")
    }
  });
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

async function getExamCycleLevels(examCycleId, { listId } = {}) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/levels`, {
    params: {
      ...(listId ? { listId } : {})
    }
  });
  return response.data;
}

async function getExamCycleAssessmentConfig(examCycleId, { listId } = {}) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/assessment-config`, {
    params: {
      ...(listId ? { listId } : {})
    }
  });
  return response.data;
}

async function saveExamCycleAssessmentConfig(examCycleId, payload = {}) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/assessment-config`, payload);
  return response.data;
}

async function updateExamCycleAssessmentConfig(examCycleId, payload = {}) {
  const response = await apiClient.put(`/exam-cycles/${examCycleId}/assessment-config`, payload);
  return response.data;
}

async function generateExamCycleQuestionSet(examCycleId, payload = {}) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/generate-question-set`, payload);
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
  getExamCycleDeleteImpact,
  getExamCycleAuditCheck,
  deleteExamCycle,
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
  getExamCycleLevels,
  getExamCycleAssessmentConfig,
  saveExamCycleAssessmentConfig,
  updateExamCycleAssessmentConfig,
  generateExamCycleQuestionSet,
  approveEnrollmentListAsSuperadmin,
  getExamResults,
  publishExamResults,
  unpublishExamResults,
  exportEnrollmentListCsv,
  exportExamResultsCsv
};
