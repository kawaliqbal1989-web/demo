import { apiClient } from "./apiClient";

async function getExamTextbookLevel(levelId) {
  return apiClient.get(`/exam-textbook/levels/${levelId}`);
}

async function saveExamTextbookLevel(levelId, { content }) {
  return apiClient.put(`/exam-textbook/levels/${levelId}`, { content });
}

export { getExamTextbookLevel, saveExamTextbookLevel };
