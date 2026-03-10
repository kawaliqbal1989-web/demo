import { apiClient } from "./apiClient";

async function listHierarchyNodes(params = {}) {
  const response = await apiClient.get("/hierarchy", { params });
  return response.data;
}

export { listHierarchyNodes };