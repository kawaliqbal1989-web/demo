import { apiClient } from "./apiClient";

async function getCenterCapacity(params = {}) {
  const response = await apiClient.get("/center/capacity", { params });
  return response.data;
}

async function getBpCenterCapacitySummary(params = {}) {
  const response = await apiClient.get("/bp/centers/capacity-summary", { params });
  return response.data;
}

async function updateBpCenterCapacity(centerId, payload) {
  const response = await apiClient.patch(`/bp/centers/${centerId}/capacity`, payload, {
    _skipGlobalLoading: true
  });
  return response.data;
}

export {
  getBpCenterCapacitySummary,
  getCenterCapacity,
  updateBpCenterCapacity
};