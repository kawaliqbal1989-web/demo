import { apiClient, baseURL } from "./apiClient";
import { getStoredAccessToken } from "../auth/tokenStorage";

async function listQuestionBank({ levelId, difficulty, q, courseId, levelNumber } = {}) {
  const response = await apiClient.get("/question-bank", {
    params: {
      levelId,
      ...(courseId ? { courseId } : {}),
      ...(levelNumber ? { levelNumber } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(q ? { q } : {})
    },
    _skipGlobalLoading: true
  });
  return response.data;
}

async function createQuestionBankEntry(payload, { courseId, levelNumber } = {}) {
  const response = await apiClient.post(
    "/question-bank",
    {
      ...payload,
      ...(courseId ? { courseId } : {}),
      ...(levelNumber ? { levelNumber } : {})
    },
    { _skipGlobalLoading: true }
  );
  return response.data;
}

async function updateQuestionBankEntry(id, payload, { courseId, levelNumber } = {}) {
  const response = await apiClient.patch(
    `/question-bank/${id}`,
    {
      ...payload,
      ...(courseId ? { courseId } : {}),
      ...(levelNumber ? { levelNumber } : {})
    },
    { _skipGlobalLoading: true }
  );
  return response.data;
}

async function deleteQuestionBankEntry(id, { courseId, levelNumber } = {}) {
  const response = await apiClient.delete(`/question-bank/${id}`, {
    params: {
      ...(courseId ? { courseId } : {}),
      ...(levelNumber ? { levelNumber } : {})
    },
    _skipGlobalLoading: true
  });
  return response.data;
}

async function bulkDeleteQuestionBankEntries({ levelId, courseId, levelNumber, mode, questionIds } = {}) {
  const response = await apiClient.post(
    "/question-bank/bulk-delete",
    {
      levelId,
      courseId,
      levelNumber,
      mode,
      ...(Array.isArray(questionIds) ? { questionIds } : {})
    },
    { _skipGlobalLoading: true }
  );
  return response.data;
}

async function importQuestionBank({ levelId, items, courseId, levelNumber, workspaceScope }) {
  const response = await apiClient.post(
    "/question-bank/import",
    {
      levelId,
      items,
      ...(courseId ? { courseId } : {}),
      ...(levelNumber ? { levelNumber } : {}),
      ...(workspaceScope ? { workspaceScope } : {})
    },
    { _skipGlobalLoading: true }
  );
  return response.data;
}

async function exportQuestionBankCsv({ levelId, courseId, levelNumber }) {
  const token = getStoredAccessToken();
  const params = new URLSearchParams({ levelId: String(levelId) });
  if (courseId) {
    params.set("courseId", String(courseId));
  }
  if (levelNumber) {
    params.set("levelNumber", String(levelNumber));
  }
  const url = `${baseURL}/question-bank/export.csv?${params.toString()}`;
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
  bulkDeleteQuestionBankEntries,
  importQuestionBank,
  exportQuestionBankCsv
};
