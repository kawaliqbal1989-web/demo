import { apiClient } from "./apiClient";

async function listLedger({ limit = 50, offset = 0, type = "", studentId = "" } = {}) {
  const resp = await apiClient.get("/ledger", {
    params: {
      limit,
      offset,
      ...(type ? { type } : {}),
      ...(studentId ? { studentId } : {})
    }
  });

  return resp.data;
}

async function exportLedgerCsv({ type = "", studentId = "" } = {}) {
  const resp = await apiClient.get("/ledger/export.csv", {
    responseType: "blob",
    params: {
      ...(type ? { type } : {}),
      ...(studentId ? { studentId } : {})
    }
  });
  return resp;
}

export { listLedger, exportLedgerCsv };
