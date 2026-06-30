import { apiClient, baseURL } from "./apiClient";
import { getStoredAccessToken } from "../auth/tokenStorage";

async function listCompetitionQuestionBank({ competitionId, levelId, difficulty, q } = {}) {
  const response = await apiClient.get("/competition-question-bank", {
    params: {
      competitionId,
      levelId,
      ...(difficulty ? { difficulty } : {}),
      ...(q ? { q } : {})
    },
    _skipGlobalLoading: true
  });
  return response.data;
}

async function createCompetitionQuestionBankEntry(payload) {
  const response = await apiClient.post("/competition-question-bank", payload, { _skipGlobalLoading: true });
  return response.data;
}

async function updateCompetitionQuestionBankEntry(id, payload) {
  const response = await apiClient.patch(`/competition-question-bank/${id}`, payload, { _skipGlobalLoading: true });
  return response.data;
}

async function deleteCompetitionQuestionBankEntry(id) {
  const response = await apiClient.delete(`/competition-question-bank/${id}`, { _skipGlobalLoading: true });
  return response.data;
}

async function importCompetitionQuestionBank({ competitionId, levelId, items }) {
  const response = await apiClient.post(
    "/competition-question-bank/import",
    {
      competitionId,
      levelId,
      items
    },
    { _skipGlobalLoading: true }
  );
  return response.data;
}

async function exportCompetitionQuestionBankCsv({ competitionId, levelId }) {
  const token = getStoredAccessToken();
  const url = `${baseURL}/competition-question-bank/export.csv?competitionId=${encodeURIComponent(competitionId)}&levelId=${encodeURIComponent(levelId)}`;
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(text || "Failed to export CSV");
    error.status = response.status;
    throw error;
  }

  return response.blob();
}

export {
  listCompetitionQuestionBank,
  createCompetitionQuestionBankEntry,
  updateCompetitionQuestionBankEntry,
  deleteCompetitionQuestionBankEntry,
  importCompetitionQuestionBank,
  exportCompetitionQuestionBankCsv
};
