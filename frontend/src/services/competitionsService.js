import { apiClient } from "./apiClient";

async function listCompetitions({ limit = 20, offset = 0 } = {}) {
  const response = await apiClient.get("/competitions", {
    params: { limit, offset }
  });
  return response.data;
}

async function enrollCompetitionStudent({ competitionId, studentId, competitionFeeAmount }) {
  const response = await apiClient.post(`/competitions/${competitionId}/enrollments`, {
    studentId,
    competitionFeeAmount
  });
  return response.data;
}

async function createCompetition(payload) {
  const response = await apiClient.post("/competitions", payload);
  return response.data;
}

async function getCompetitionDetail(id) {
  const response = await apiClient.get(`/competitions/${id}`);
  return response.data;
}

async function forwardCompetitionRequest(id) {
  const response = await apiClient.post(`/competitions/${id}/forward-request`);
  return response.data;
}

async function rejectCompetitionRequest(id, reason) {
  const response = await apiClient.post(`/competitions/${id}/reject`, { reason });
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
  const response = await apiClient.post(`/competitions/${id}/results/unpublish`);
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
  enrollCompetitionStudent,
  createCompetition,
  forwardCompetitionRequest,
  rejectCompetitionRequest,
  getLeaderboard,
  getCompetitionResults,
  publishCompetitionResults,
  unpublishCompetitionResults,
  exportCompetitionResultsCsv
};
