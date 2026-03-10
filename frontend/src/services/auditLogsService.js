import { apiClient } from "./apiClient";

async function listAuditLogs(params = {}) {
  const response = await apiClient.get("/audit-logs", {
    params
  });

  return response.data;
}

export { listAuditLogs };
