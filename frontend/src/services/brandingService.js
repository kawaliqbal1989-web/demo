import { apiClient } from "./apiClient";

async function getMyBranding(config = {}) {
  const fresh = Boolean(config.fresh);
  const response = await apiClient.get("/branding/me", {
    ...config,
    params: {
      ...(config.params || {}),
      ...(fresh ? { _ts: Date.now() } : {})
    }
  });
  return response.data;
}

export { getMyBranding };
