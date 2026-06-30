import { apiClient } from "./apiClient";

async function listLevels({ limit = 100, offset = 0 } = {}) {
  const response = await apiClient.get("/levels", {
    params: { limit, offset },
    _skipGlobalLoading: true
  });
  return response.data;
}

async function createLevel(payload) {
  const response = await apiClient.post("/levels", payload, { _skipGlobalLoading: true });
  return response.data;
}

async function updateLevel(id, payload) {
  const response = await apiClient.patch(`/levels/${id}`, payload, { _skipGlobalLoading: true });
  return response.data;
}

async function updateLevelFeeDefaults(id, payload) {
  const response = await apiClient.patch(`/levels/${id}/fee-defaults`, payload);
  return response.data;
}

export { listLevels, createLevel, updateLevel, updateLevelFeeDefaults };
