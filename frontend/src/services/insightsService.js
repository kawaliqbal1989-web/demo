import { apiClient } from "./apiClient";

async function getInsights() {
  const response = await apiClient.get("/insights");
  return response.data;
}

async function getInsightSummary() {
  const response = await apiClient.get("/insights/summary");
  return response.data;
}

async function dismissInsight(id) {
  const response = await apiClient.patch(`/insights/${encodeURIComponent(id)}/dismiss`);
  return response.data;
}

async function actionInsight(id) {
  const response = await apiClient.patch(`/insights/${encodeURIComponent(id)}/action`);
  return response.data;
}

export { getInsights, getInsightSummary, dismissInsight, actionInsight };
