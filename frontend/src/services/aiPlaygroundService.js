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

async function suggestPlaygroundImprovements() {
  const response = await apiClient.post("/student/ai-playground/suggest-improvements");
  return response.data;
}

async function createCustomTool({ description }) {
  const response = await apiClient.post("/student/ai-playground/custom-tools", { description });
  return response.data;
}

async function listCustomTools() {
  const response = await apiClient.get("/student/ai-playground/custom-tools");
  return response.data;
}

async function deleteCustomTool(id) {
  const response = await apiClient.delete(`/student/ai-playground/custom-tools/${id}`);
  return response.data;
}

async function runCustomTool(id, prompt) {
  const response = await apiClient.post(`/student/ai-playground/custom-tools/${id}/run`, { prompt });
  return response.data;
}

export {
  callAiPlayground,
  getAiPlaygroundUsage,
  getAiPlaygroundHistory,
  suggestPlaygroundImprovements,
  createCustomTool,
  listCustomTools,
  deleteCustomTool,
  runCustomTool
};
