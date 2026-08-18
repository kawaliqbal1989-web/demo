import { apiClient } from "./apiClient";

async function listCompetitions({ limit = 20, offset = 0 } = {}) {
  const response = await apiClient.get("/competitions", {
    params: { limit, offset }
  });
  return response.data;
}

async function getCompetitionDetail(id) {
  const response = await apiClient.get(`/competitions/${id}`);
  return response.data;
}

async function createCompetition(payload) {
  const response = await apiClient.post("/competitions", payload);
  return response.data;
}

async function updateCompetitionSchedule(competitionId, payload) {
  const response = await apiClient.patch(
    `/competitions/${competitionId}/schedule`,
    payload
  );
  return response.data;
}

async function listCompetitionSeasons(params = {}) {
  const response = await apiClient.get("/competitions/seasons", { params });
  return response.data;
}

async function listCompetitionCourses(competitionId, params = {}) {
  const response = await apiClient.get(
    `/competitions/${competitionId}/courses`,
    { params }
  );
  return response.data;
}

async function listCompetitionReuseSources(competitionId) {
  const response = await apiClient.get(
    `/competitions/${competitionId}/reuse-sources`
  );
  return response.data;
}

async function copyCompetitionResources(competitionId, payload) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/reuse-resources`,
    payload
  );
  return response.data;
}

async function createCompetitionCourse(competitionId, payload) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/courses`,
    payload
  );
  return response.data;
}

async function updateCompetitionCourse(competitionId, courseId, payload) {
  const response = await apiClient.patch(
    `/competitions/${competitionId}/courses/${courseId}`,
    payload
  );
  return response.data;
}

async function archiveCompetitionCourse(competitionId, courseId) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/courses/${courseId}/archive`
  );
  return response.data;
}
async function restoreCompetitionCourse(competitionId, courseId) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/courses/${courseId}/restore`
  );
  return response.data;
}

async function listCompetitionCourseLevels(competitionId, courseId) {
  const response = await apiClient.get(
    `/competitions/${competitionId}/courses/${courseId}/levels`
  );
  return response.data;
}

async function addCompetitionCourseLevel(competitionId, courseId, payload) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/courses/${courseId}/levels`,
    payload
  );
  return response.data;
}

async function removeCompetitionCourseLevel(
  competitionId,
  courseId,
  courseLevelId
) {
  const response = await apiClient.delete(
    `/competitions/${competitionId}/courses/${courseId}/levels/${courseLevelId}`
  );
  return response.data;
}

async function reorderCompetitionCourseLevels(
  competitionId,
  courseId,
  orderedLevelIds
) {
  const response = await apiClient.put(
    `/competitions/${competitionId}/courses/${courseId}/levels/reorder`,
    { orderedLevelIds }
  );
  return response.data;
}

async function listCompetitionQuestionBanks(
  competitionId,
  courseId,
  courseLevelId,
  params = {}
) {
  const response = await apiClient.get(
    `/competitions/${competitionId}/courses/${courseId}/levels/${courseLevelId}/question-banks`,
    { params }
  );
  return response.data;
}

async function createCompetitionQuestionBank(
  competitionId,
  courseId,
  courseLevelId,
  payload
) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/courses/${courseId}/levels/${courseLevelId}/question-banks`,
    payload
  );
  return response.data;
}

async function updateCompetitionQuestionBank(
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  payload
) {
  const response = await apiClient.patch(
    `/competitions/${competitionId}/courses/${courseId}/levels/${courseLevelId}/question-banks/${questionBankId}`,
    payload
  );
  return response.data;
}

async function archiveCompetitionQuestionBank(
  competitionId,
  courseId,
  courseLevelId,
  questionBankId
) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/courses/${courseId}/levels/${courseLevelId}/question-banks/${questionBankId}/archive`
  );
  return response.data;
}


async function listCompetitionQuestionBankQuestions(
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  params = {}
) {
  const response = await apiClient.get(
    `/competitions/${competitionId}/courses/${courseId}/levels/${courseLevelId}/question-banks/${questionBankId}/questions`,
    { params }
  );
  return response.data;
}

async function createCompetitionQuestionBankQuestion(
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  payload
) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/courses/${courseId}/levels/${courseLevelId}/question-banks/${questionBankId}/questions`,
    payload
  );
  return response.data;
}

async function importCompetitionQuestionBankQuestions(
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  questions
) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/courses/${courseId}/levels/${courseLevelId}/question-banks/${questionBankId}/questions/import`,
    { questions }
  );
  return response.data;
}

async function updateCompetitionQuestionBankQuestion(
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  questionId,
  payload
) {
  const response = await apiClient.patch(
    `/competitions/${competitionId}/courses/${courseId}/levels/${courseLevelId}/question-banks/${questionBankId}/questions/${questionId}`,
    payload
  );
  return response.data;
}

async function removeCompetitionQuestionBankQuestion(
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  questionId
) {
  const response = await apiClient.delete(
    `/competitions/${competitionId}/courses/${courseId}/levels/${courseLevelId}/question-banks/${questionBankId}/questions/${questionId}`
  );
  return response.data;
}

async function listCompetitionWorksheets(
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  params = {}
) {
  const response = await apiClient.get(
    `/competitions/${competitionId}/courses/${courseId}/levels/${courseLevelId}/question-banks/${questionBankId}/worksheets`,
    { params }
  );
  return response.data;
}


async function buildCompetitionWorksheetFromQuestions(
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  payload
) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/courses/${courseId}/levels/${courseLevelId}/question-banks/${questionBankId}/worksheets/build`,
    payload
  );
  return response.data;
}

async function createCompetitionWorksheet(
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  payload
) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/courses/${courseId}/levels/${courseLevelId}/question-banks/${questionBankId}/worksheets`,
    payload
  );
  return response.data;
}

async function updateCompetitionWorksheet(
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  worksheetId,
  payload
) {
  const response = await apiClient.patch(
    `/competitions/${competitionId}/courses/${courseId}/levels/${courseLevelId}/question-banks/${questionBankId}/worksheets/${worksheetId}`,
    payload
  );
  return response.data;
}

async function archiveCompetitionWorksheet(
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  worksheetId
) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/courses/${courseId}/levels/${courseLevelId}/question-banks/${questionBankId}/worksheets/${worksheetId}/archive`
  );
  return response.data;
}

async function listCompetitionWorksheetAssignments(
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  worksheetId
) {
  const response = await apiClient.get(
    `/competitions/${competitionId}/courses/${courseId}/levels/${courseLevelId}/question-banks/${questionBankId}/worksheets/${worksheetId}/assignments`
  );
  return response.data;
}

async function replaceCompetitionWorksheetAssignments(
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  worksheetId,
  businessPartnerIds
) {
  const response = await apiClient.put(
    `/competitions/${competitionId}/courses/${courseId}/levels/${courseLevelId}/question-banks/${questionBankId}/worksheets/${worksheetId}/assignments`,
    { businessPartnerIds }
  );
  return response.data;
}

async function enrollCompetitionStudent({
  competitionId,
  studentId,
  competitionCourseLevelIds
}) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/enrollments`,
    {
      studentId,
      competitionCourseLevelIds
    }
  );
  return response.data;
}

async function createCompetitionTemporaryStudents({
  competitionId,
  students
}) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/temporary-students`,
    { students }
  );
  return response.data;
}

async function listCompetitionEnrollmentLists(competitionId) {
  const response = await apiClient.get(
    `/competitions/${competitionId}/enrollment-lists`
  );
  return response.data;
}

async function getCompetitionEnrollmentList(competitionId, listId) {
  const response = await apiClient.get(
    `/competitions/${competitionId}/enrollment-lists/${listId}`
  );
  return response.data;
}

async function forwardCompetitionEnrollmentList(competitionId, listId) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/enrollment-lists/${listId}/forward`
  );
  return response.data;
}

async function returnCompetitionEnrollmentList(
  competitionId,
  listId,
  reason
) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/enrollment-lists/${listId}/return`,
    { reason }
  );
  return response.data;
}

async function updateCompetitionEnrollmentInclusion({
  competitionId,
  listId,
  enrollmentId,
  included,
  reason
}) {
  const response = await apiClient.patch(
    `/competitions/${competitionId}/enrollment-lists/${listId}/enrollments/${enrollmentId}/inclusion`,
    {
      included,
      reason
    }
  );
  return response.data;
}

async function approveCompetitionEnrollmentList(competitionId, listId) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/enrollment-lists/${listId}/approve`
  );
  return response.data;
}

async function grantCompetitionExtraAttempt({
  competitionId,
  enrollmentId,
  reason
}) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/enrollments/${enrollmentId}/extra-attempt`,
    { reason }
  );
  return response.data;
}

async function listCompetitionQuotas(competitionId) {
  const response = await apiClient.get(`/competitions/${competitionId}/quotas`);
  return response.data;
}

async function updateCompetitionQuota({ competitionId, businessPartnerId, quotaLimit, reason }) {
  const response = await apiClient.put(
    `/competitions/${competitionId}/quotas/${businessPartnerId}`,
    { quotaLimit, reason }
  );
  return response.data;
}

async function reprocessCompetitionQuota({ competitionId, businessPartnerId }) {
  const response = await apiClient.post(
    `/competitions/${competitionId}/quotas/${businessPartnerId}/reprocess`
  );
  return response.data;
}

// Temporary compatibility exports for legacy pages.
// Keep these until their remaining consumers are audited separately.
async function forwardCompetitionRequest(id) {
  const response = await apiClient.post(`/competitions/${id}/forward-request`);
  return response.data;
}

async function rejectCompetitionRequest(id, reason) {
  const response = await apiClient.post(`/competitions/${id}/reject`, {
    reason
  });
  return response.data;
}

async function getLeaderboard(id) {
  const response = await apiClient.get(`/competitions/${id}/leaderboard`);
  return response.data;
}

async function getCompetitionResults(id) {
  const response = await apiClient.get(`/competitions/${id}/results`);
  return response.data;
}

async function publishCompetitionResults(id) {
  const response = await apiClient.post(`/competitions/${id}/results/publish`);
  return response.data;
}

async function unpublishCompetitionResults(id) {
  const response = await apiClient.post(
    `/competitions/${id}/results/unpublish`
  );
  return response.data;
}

async function exportCompetitionResultsCsv(id) {
  const response = await apiClient.get(`/competitions/${id}/results.csv`, {
    responseType: "blob"
  });
  return response.data;
}

export {
  listCompetitions,
  getCompetitionDetail,
  createCompetition,
  updateCompetitionSchedule,
  listCompetitionSeasons,
  listCompetitionCourses,
  listCompetitionReuseSources,
  copyCompetitionResources,
  createCompetitionCourse,
  updateCompetitionCourse,
  archiveCompetitionCourse,
  restoreCompetitionCourse,
  listCompetitionCourseLevels,
  addCompetitionCourseLevel,
  removeCompetitionCourseLevel,
  reorderCompetitionCourseLevels,
  listCompetitionQuestionBanks,
  createCompetitionQuestionBank,
  updateCompetitionQuestionBank,
  archiveCompetitionQuestionBank,
  listCompetitionQuestionBankQuestions,
  createCompetitionQuestionBankQuestion,
  importCompetitionQuestionBankQuestions,
  updateCompetitionQuestionBankQuestion,
  removeCompetitionQuestionBankQuestion,
  listCompetitionWorksheets,
  createCompetitionWorksheet,
  buildCompetitionWorksheetFromQuestions,
  updateCompetitionWorksheet,
  archiveCompetitionWorksheet,
  listCompetitionWorksheetAssignments,
  replaceCompetitionWorksheetAssignments,
  enrollCompetitionStudent,
  createCompetitionTemporaryStudents,
  listCompetitionEnrollmentLists,
  getCompetitionEnrollmentList,
  forwardCompetitionEnrollmentList,
  returnCompetitionEnrollmentList,
  updateCompetitionEnrollmentInclusion,
  approveCompetitionEnrollmentList,
  grantCompetitionExtraAttempt,
  listCompetitionQuotas,
  reprocessCompetitionQuota,
  updateCompetitionQuota,
  forwardCompetitionRequest,
  rejectCompetitionRequest,
  getLeaderboard,
  getCompetitionResults,
  publishCompetitionResults,
  unpublishCompetitionResults,
  exportCompetitionResultsCsv
};
