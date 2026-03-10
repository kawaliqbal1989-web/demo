import { apiClient } from "./apiClient";

async function listCenters({ limit = 20, offset = 0 } = {}) {
  const response = await apiClient.get("/centers", {
    params: { limit, offset }
  });
  return response.data;
}

export { listCenters };
