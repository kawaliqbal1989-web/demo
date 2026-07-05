import { apiClient } from "./apiClient";

async function listExamCycles({ limit = 20, offset = 0, filter } = {}) {
  const response = await apiClient.get("/exam-cycles", {
    params: {
      limit,
      offset,
      ...(filter ? { filter } : {})
    }
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

async function getExamCycleArchiveImpact(examCycleId) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/archive-impact`);
  return response.data;
}

async function archiveExamCycle(examCycleId, { password, confirmCode, archiveReason } = {}) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/archive`, {
    password: String(password || ""),
    confirmCode: String(confirmCode || ""),
    archiveReason: String(archiveReason || "")
  });
  return response.data;
}

async function restoreExamCycle(examCycleId, { password } = {}) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/restore`, {
    password: String(password || "")
  });
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

async function getExamResults(examCycleId, params = {}) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/results`, {
    params
  });
  return response.data;
}

async function getExamResultsControlCenter({ limit = 20, offset = 0, status = "ALL", q = "" } = {}) {
  const response = await apiClient.get("/exam-cycles/results/control-center", {
    params: {
      limit,
      offset,
      status,
      ...(q ? { q } : {})
    }
  });
  return response.data;
}

async function getExamResultsReview(examCycleId) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/results/review`);
  return response.data;
}

async function getExamResultPublicationAudit(examCycleId) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/results/publication-audit`);
  return response.data;
}

async function publishExamResults(examCycleId, payload = {}) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/results/publish`, payload);
  return response.data;
}

async function unpublishExamResults(examCycleId, payload = {}) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/results/unpublish`, payload);
  return response.data;
}

async function grantSecondAttempt(examCycleId, studentId) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/students/${studentId}/second-attempt/grant`);
  return response.data;
}

async function revokeSecondAttempt(examCycleId, studentId) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/students/${studentId}/second-attempt/revoke`);
  return response.data;
}

async function exportEnrollmentListCsv(examCycleId, listId) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/enrollment-lists/${listId}/export.csv`, {
    responseType: "blob",
    _skipGlobalLoading: true
  });
  return response;
}

async function exportExamResultsCsv(examCycleId, params = {}) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/results/export.csv`, {
    params,
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

async function getLateEnrollmentEligibleStudents(examCycleId, { levelId } = {}) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/late-enrollment/eligible-students`, {
    params: {
      ...(levelId ? { levelId } : {})
    }
  });
  return response.data;
}

async function createLateEnrollmentRequest(examCycleId, payload = {}) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/late-enrollment/requests`, payload);
  return response.data;
}

async function listLateEnrollmentRequests(examCycleId, { status = "ALL" } = {}) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/late-enrollment/requests`, {
    params: {
      ...(status ? { status } : {})
    }
  });
  return response.data;
}

async function reviewLateEnrollmentRequest(examCycleId, requestId, payload = {}) {
  const response = await apiClient.post(`/exam-cycles/${examCycleId}/late-enrollment/requests/${requestId}/review`, payload);
  return response.data;
}

async function getLateEnrollmentAudit(examCycleId) {
  const response = await apiClient.get(`/exam-cycles/${examCycleId}/late-enrollment/audit`);
  return response.data;
}

export {
  listExamCycles,
  createExamCycle,
  getExamCycleArchiveImpact,
  archiveExamCycle,
  restoreExamCycle,
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
  getExamResultsControlCenter,
  getExamResultsReview,
  getExamResultPublicationAudit,
  publishExamResults,
  unpublishExamResults,
  grantSecondAttempt,
  revokeSecondAttempt,
  exportEnrollmentListCsv,
  exportExamResultsCsv,
  getLateEnrollmentEligibleStudents,
  createLateEnrollmentRequest,
  listLateEnrollmentRequests,
  reviewLateEnrollmentRequest,
  getLateEnrollmentAudit
};
