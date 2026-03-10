import { apiClient } from "./apiClient";

async function listAbuseFlags({ page = 1, limit = 20, flagType, from, to } = {}) {
  const response = await apiClient.get("/admin/abuse-flags", {
    params: {
      page,
      limit,
      ...(flagType ? { flagType } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {})
    },
    _skipGlobalLoading: true
  });
  return response.data;
}

async function resolveAbuseFlag(id) {
  const response = await apiClient.patch(`/admin/abuse-flags/${id}/resolve`, null, {
    _skipGlobalLoading: true
  });
  return response.data;
}

export { listAbuseFlags, resolveAbuseFlag };
