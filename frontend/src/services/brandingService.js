import { apiClient } from "./apiClient";

async function getMyBranding(config = {}) {
  const response = await apiClient.get("/branding/me", config);
  return response.data;
}

export { getMyBranding };
