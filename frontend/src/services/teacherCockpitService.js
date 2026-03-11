import { apiClient } from "./apiClient";

export async function getCockpitDashboard() {
  const response = await apiClient.get("/teacher/cockpit/dashboard");
  return response.data;
}

export async function getAtRiskQueue() {
  const response = await apiClient.get("/teacher/cockpit/at-risk");
  return response.data;
}

export async function getCockpitBatches() {
  const response = await apiClient.get("/teacher/cockpit/batches");
  return response.data;
}

export async function getCockpitRecommendations() {
  const response = await apiClient.get("/teacher/cockpit/recommendations");
  return response.data;
}

export async function getCockpitInterventions() {
  const response = await apiClient.get("/teacher/cockpit/interventions");
  return response.data;
}
