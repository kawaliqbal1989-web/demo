import { apiClient } from "./apiClient";

async function getStudentMe() {
  return apiClient.get("/student/me");
}

async function listStudentEnrollments({ status } = {}) {
  const params = {};
  if (status) {
    params.status = status;
  }
  return apiClient.get("/student/enrollments", { params });
}

async function listStudentExamEnrollments() {
  return apiClient.get("/student/exam-enrollments");
}

async function listStudentExamsOverview() {
  return apiClient.get("/student/exams");
}

async function listStudentMockTests() {
  return apiClient.get("/student/mock-tests");
}

async function getStudentMockTest(mockTestId) {
  return apiClient.get(`/student/mock-tests/${mockTestId}`);
}

async function startStudentMockTestAttempt(mockTestId) {
  return apiClient.post(`/student/mock-tests/${mockTestId}/attempt/start`);
}

async function submitStudentMockTestAttempt(mockTestId, { answersByQuestionId } = {}) {
  return apiClient.post(`/student/mock-tests/${mockTestId}/attempt/submit`, {
    answersByQuestionId: answersByQuestionId && typeof answersByQuestionId === "object" ? answersByQuestionId : {}
  });
}

async function getStudentExamResult(examCycleId) {
  return apiClient.get(`/student/exam-cycles/${examCycleId}/result`);
}

async function listStudentWorksheets({ search, page = 1, pageSize = 20 } = {}) {
  const safePage = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safePageSize = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Number(pageSize) : 20;

  const limit = safePageSize;
  const offset = (safePage - 1) * safePageSize;

  const params = { limit, offset };
  if (search) {
    params.search = search;
  }
  return apiClient.get("/student/worksheets", { params });
}

async function getStudentWorksheet(worksheetId) {
  return apiClient.get(`/student/worksheets/${worksheetId}`);
}

async function startOrResumeStudentWorksheetAttempt(worksheetId) {
  return apiClient.post(`/student/worksheets/${worksheetId}/attempts/start`);
}

async function saveStudentAttemptAnswers(attemptId, { version = 0, answersByQuestionId } = {}) {
  return apiClient.patch(`/student/attempts/${attemptId}/answers`, {
    version,
    answersByQuestionId: answersByQuestionId && typeof answersByQuestionId === "object" ? answersByQuestionId : {}
  });
}

async function submitStudentAttempt(attemptId, { answersByQuestionId } = {}) {
  return apiClient.post(`/student/attempts/${attemptId}/submit`, {
    answersByQuestionId: answersByQuestionId && typeof answersByQuestionId === "object" ? answersByQuestionId : {}
  });
}

async function listStudentWorksheetAttempts(worksheetId) {
  return apiClient.get(`/student/worksheets/${worksheetId}/attempts`);
}

async function listStudentMaterials({ courseCode } = {}) {
  const params = {};
  if (courseCode) {
    params.courseCode = courseCode;
  }
  return apiClient.get("/student/materials", { params });
}

async function getStudentPracticeReport({ limit } = {}) {
  const params = {};
  if (limit !== null && limit !== undefined) {
    params.limit = limit;
  }
  return apiClient.get("/student/practice-report", { params });
}

async function getStudentPracticeWorksheetOptions() {
  return apiClient.get("/student/practice-worksheets/options");
}

async function getStudentPracticeFeatureStatus() {
  return apiClient.get("/student/practice-features/status");
}

async function getStudentAbacusPracticeWorksheetOptions() {
  return apiClient.get("/student/abacus-practice-worksheets/options");
}

async function createStudentAbacusPracticeWorksheet({
  timeLimitSeconds,
  termCount,
  digitsMode,
  operations,
  totalQuestions
} = {}) {
  return apiClient.post("/student/abacus-practice-worksheets", {
    timeLimitSeconds,
    termCount,
    digitsMode,
    operations: Array.isArray(operations) ? operations : [],
    totalQuestions
  });
}

async function createStudentPracticeWorksheet({ totalQuestions, timeLimitSeconds, operations, topics } = {}) {
  return apiClient.post("/student/practice-worksheets", {
    totalQuestions,
    timeLimitSeconds,
    operations: Array.isArray(operations) ? operations : [],
    topics: Array.isArray(topics) ? topics : [],
    allowRepeats: true
  });
}

async function listStudentAttendance({ limit = 7 } = {}) {
  return apiClient.get("/student/attendance", { params: { limit } });
}

async function getStudentWeakTopics({ threshold = 60 } = {}) {
  return apiClient.get("/student/weak-topics", { params: { threshold } });
}

async function getStudentFees() {
  return apiClient.get("/student/fees");
}

async function getStudentMyCourse() {
  return apiClient.get("/student/my-course");
}

async function changeStudentPassword({ oldPassword, newPassword }) {
  return apiClient.post("/student/change-password", { oldPassword, newPassword });
}

async function getStudentLeaderboard() {
  return apiClient.get("/student/leaderboard");
}

async function listStudentCertificates() {
  return apiClient.get("/student/certificates");
}

async function updateStudentProfile(data) {
  return apiClient.patch("/student/me", data);
}

async function getStudentPerformanceTrends() {
  return apiClient.get("/student/performance-trends");
}

// ── Reassignment Requests ──
async function createStudentReassignmentRequest(data) {
  return apiClient.post("/student/reassignment-requests", data);
}
async function listStudentReassignmentRequests(params = {}) {
  return apiClient.get("/student/reassignment-requests", { params });
}
async function cancelStudentReassignmentRequest(requestId) {
  return apiClient.post(`/student/reassignment-requests/${requestId}/cancel`);
}

export {
  getStudentMe,
  listStudentEnrollments,
  listStudentExamEnrollments,
  listStudentExamsOverview,
  listStudentMockTests,
  getStudentMockTest,
  startStudentMockTestAttempt,
  submitStudentMockTestAttempt,
  getStudentExamResult,
  listStudentWorksheets,
  getStudentWorksheet,
  startOrResumeStudentWorksheetAttempt,
  listStudentWorksheetAttempts,
  saveStudentAttemptAnswers,
  submitStudentAttempt,
  listStudentMaterials,
  getStudentPracticeReport,
  getStudentPracticeFeatureStatus,
  getStudentPracticeWorksheetOptions,
  createStudentPracticeWorksheet,
  getStudentAbacusPracticeWorksheetOptions,
  createStudentAbacusPracticeWorksheet,
  listStudentAttendance,
  getStudentWeakTopics,
  getStudentFees,
  getStudentMyCourse,
  changeStudentPassword,
  getStudentLeaderboard,
  listStudentCertificates,
  updateStudentProfile,
  getStudentPerformanceTrends,
  createStudentReassignmentRequest,
  listStudentReassignmentRequests,
  cancelStudentReassignmentRequest,
};
