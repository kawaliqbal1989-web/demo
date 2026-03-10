import { apiClient } from "./apiClient";

async function getMyBranding() {
  const response = await apiClient.get("/branding/me");
  return response.data;
}

export { getMyBranding };
