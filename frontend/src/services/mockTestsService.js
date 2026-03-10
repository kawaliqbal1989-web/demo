import { apiClient } from "./apiClient";

async function listMockTests({ limit = 50, offset = 0, batchId = "" } = {}) {
  const response = await apiClient.get("/center/mock-tests", {
    params: {
      limit,
      offset,
      batchId: batchId || undefined
    }
  });
  return response.data;
}

async function createMockTest(payload) {
  const response = await apiClient.post("/center/mock-tests", payload);
  return response.data;
}

async function getMockTest(id) {
  const response = await apiClient.get(`/center/mock-tests/${id}`);
  return response.data;
}

async function saveMockTestResults(id, results) {
  const response = await apiClient.put(`/center/mock-tests/${id}/results`, { results });
  return response.data;
}

async function updateMockTestStatus(id, status) {
  const response = await apiClient.patch(`/center/mock-tests/${id}/status`, { status });
  return response.data;
}

export { listMockTests, createMockTest, getMockTest, saveMockTestResults, updateMockTestStatus };
