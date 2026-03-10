import { apiClient } from "./apiClient";

async function getWorksheetTemplate(levelId) {
  const response = await apiClient.get(`/levels/${levelId}/worksheet-template`, { _skipGlobalLoading: true });
  return response.data;
}

async function upsertWorksheetTemplate(levelId, data) {
  const response = await apiClient.put(`/levels/${levelId}/worksheet-template`, data, { _skipGlobalLoading: true });
  return response.data;
}

export { getWorksheetTemplate, upsertWorksheetTemplate };
