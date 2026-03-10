import { apiClient } from "./apiClient";

async function listLevels() {
  const response = await apiClient.get("/levels", { _skipGlobalLoading: true });
  return response.data;
}

async function updateLevelFeeDefaults(id, payload) {
  const response = await apiClient.patch(`/levels/${id}/fee-defaults`, payload);
  return response.data;
}

export { listLevels, updateLevelFeeDefaults };
