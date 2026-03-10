import { apiClient } from "./apiClient";

async function listUsersByRole(role, params = {}) {
  const response = await apiClient.get("/superadmins/users", {
    params: { role, ...params }
  });
  return response.data;
}

export { listUsersByRole };