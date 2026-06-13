import { apiClient } from "./apiClient";

async function getExamPlatformAudit() {
  const response = await apiClient.get("/exam-platform/audit");
  return response.data;
}

async function listSubjects() {
  const response = await apiClient.get("/exam-platform/subjects");
  return response.data;
}

async function createSubject(payload) {
  const response = await apiClient.post("/exam-platform/subjects", payload);
  return response.data;
}

async function updateSubject(id, payload) {
  const response = await apiClient.patch(`/exam-platform/subjects/${id}`, payload);
  return response.data;
}

async function deleteSubject(id) {
  const response = await apiClient.delete(`/exam-platform/subjects/${id}`);
  return response.data;
}

async function listQuestionBank(params = {}) {
  const response = await apiClient.get("/exam-platform/question-bank", { params });
  return response.data;
}

async function createQuestion(payload) {
  const response = await apiClient.post("/exam-platform/question-bank", payload);
  return response.data;
}

async function updateQuestion(id, payload) {
  const response = await apiClient.patch(`/exam-platform/question-bank/${id}`, payload);
  return response.data;
}

async function deleteQuestion(id) {
  const response = await apiClient.delete(`/exam-platform/question-bank/${id}`);
  return response.data;
}

async function archiveQuestion(id) {
  const response = await apiClient.post(`/exam-platform/question-bank/${id}/archive`);
  return response.data;
}

async function bulkUploadQuestions(items) {
  const response = await apiClient.post("/exam-platform/question-bank/bulk-upload", { items });
  return response.data;
}

async function importQuestionCsv(csvText) {
  const response = await apiClient.post("/exam-platform/question-bank/import-csv", { csvText });
  return response.data;
}

async function exportQuestionCsv() {
  const response = await apiClient.get("/exam-platform/question-bank/export-csv", {
    responseType: "blob",
    _skipGlobalLoading: true
  });
  return response;
}

async function listExams() {
  const response = await apiClient.get("/exam-platform/exams");
  return response.data;
}

async function createExam(payload) {
  const response = await apiClient.post("/exam-platform/exams", payload);
  return response.data;
}

async function publishExam(id) {
  const response = await apiClient.post(`/exam-platform/exams/${id}/publish`);
  return response.data;
}

async function cloneExam(id) {
  const response = await apiClient.post(`/exam-platform/exams/${id}/clone`);
  return response.data;
}

async function archiveExam(id) {
  const response = await apiClient.post(`/exam-platform/exams/${id}/archive`);
  return response.data;
}

async function previewExam(id) {
  const response = await apiClient.get(`/exam-platform/exams/${id}/preview`);
  return response.data;
}

async function generateExamPaper(id) {
  const response = await apiClient.post(`/exam-platform/exams/${id}/generate-paper`);
  return response.data;
}

async function generateResults(examId) {
  const response = await apiClient.post("/exam-platform/results/generate", { examId });
  return response.data;
}

async function listResults(examId) {
  const response = await apiClient.get(`/exam-platform/results/${examId}`);
  return response.data;
}

async function generateCertificates(examId, certificateType) {
  const response = await apiClient.post("/exam-platform/certificates/generate", { examId, certificateType });
  return response.data;
}

async function listCertificates(examId) {
  const response = await apiClient.get(`/exam-platform/certificates/${examId}`);
  return response.data;
}

async function reissueCertificate(id) {
  const response = await apiClient.post(`/exam-platform/certificates/${id}/reissue`);
  return response.data;
}

async function listCompetitions() {
  const response = await apiClient.get("/exam-platform/competitions");
  return response.data;
}

async function createCompetition(payload) {
  const response = await apiClient.post("/exam-platform/competitions", payload);
  return response.data;
}

async function registerCompetitionParticipant(id, studentId) {
  const response = await apiClient.post(`/exam-platform/competitions/${id}/register`, { studentId });
  return response.data;
}

async function advanceCompetitionStage(id, stage) {
  const response = await apiClient.post(`/exam-platform/competitions/${id}/advance-stage`, { stage });
  return response.data;
}

async function judgeCompetition(id, scores) {
  const response = await apiClient.post(`/exam-platform/competitions/${id}/judge`, { scores });
  return response.data;
}

async function publishCompetitionWinners(id) {
  const response = await apiClient.post(`/exam-platform/competitions/${id}/publish-winners`);
  return response.data;
}

async function getCompetitionLeaderboard(id) {
  const response = await apiClient.get(`/exam-platform/competitions/${id}/leaderboard`);
  return response.data;
}

async function getExamPlatformDashboard() {
  const response = await apiClient.get("/exam-platform/dashboards/summary");
  return response.data;
}

export {
  getExamPlatformAudit,
  listSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  listQuestionBank,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  archiveQuestion,
  bulkUploadQuestions,
  importQuestionCsv,
  exportQuestionCsv,
  listExams,
  createExam,
  publishExam,
  cloneExam,
  archiveExam,
  previewExam,
  generateExamPaper,
  generateResults,
  listResults,
  generateCertificates,
  listCertificates,
  reissueCertificate,
  listCompetitions,
  createCompetition,
  registerCompetitionParticipant,
  advanceCompetitionStage,
  judgeCompetition,
  publishCompetitionWinners,
  getCompetitionLeaderboard,
  getExamPlatformDashboard
};
