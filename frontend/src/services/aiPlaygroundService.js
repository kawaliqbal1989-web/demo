import { apiClient } from "./apiClient";

async function callAiPlayground({ tool, prompt }) {
  const response = await apiClient.post("/student/ai-playground", { tool, prompt });
  return response.data;
}

async function getAiPlaygroundUsage() {
  const response = await apiClient.get("/student/ai-playground/usage");
  return response.data;
}

async function getAiPlaygroundHistory() {
  const response = await apiClient.get("/student/ai-playground/history");
  return response.data;
}

export { callAiPlayground, getAiPlaygroundUsage, getAiPlaygroundHistory };
