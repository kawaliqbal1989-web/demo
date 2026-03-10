import { apiClient, baseURL } from "./apiClient";
import { getStoredAccessToken } from "../auth/tokenStorage";

async function listQuestionBank({ levelId, difficulty, q } = {}) {
  const response = await apiClient.get("/question-bank", {
    params: {
      levelId,
      ...(difficulty ? { difficulty } : {}),
      ...(q ? { q } : {})
    },
    _skipGlobalLoading: true
  });
  return response.data;
}

async function createQuestionBankEntry(payload) {
  const response = await apiClient.post("/question-bank", payload, { _skipGlobalLoading: true });
  return response.data;
}

async function updateQuestionBankEntry(id, payload) {
  const response = await apiClient.patch(`/question-bank/${id}`, payload, { _skipGlobalLoading: true });
  return response.data;
}

async function deleteQuestionBankEntry(id) {
  const response = await apiClient.delete(`/question-bank/${id}`, { _skipGlobalLoading: true });
  return response.data;
}

async function importQuestionBank({ levelId, items }) {
  const response = await apiClient.post(
    "/question-bank/import",
    {
      levelId,
      items
    },
    { _skipGlobalLoading: true }
  );
  return response.data;
}

async function exportQuestionBankCsv({ levelId }) {
  const token = getStoredAccessToken();
  const url = `${baseURL}/question-bank/export.csv?levelId=${encodeURIComponent(levelId)}`;
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(text || "Failed to export CSV");
    error.status = response.status;
    throw error;
  }

  const blob = await response.blob();
  return blob;
}

export {
  listQuestionBank,
  createQuestionBankEntry,
  updateQuestionBankEntry,
  deleteQuestionBankEntry,
  importQuestionBank,
  exportQuestionBankCsv
};
