import { apiClient } from "./apiClient";

async function listMargins({ businessPartnerId } = {}) {
  const resp = await apiClient.get("/margins", {
    params: {
      ...(businessPartnerId ? { businessPartnerId } : {})
    }
  });
  return resp.data;
}

async function setMargin(businessPartnerId, { marginPercent, effectiveFrom }) {
  const resp = await apiClient.put(`/margins/${businessPartnerId}`, {
    marginPercent,
    ...(effectiveFrom ? { effectiveFrom } : {})
  });
  return resp.data;
}

export { listMargins, setMargin };
