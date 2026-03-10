import { apiClient } from "./apiClient";

async function listSettlements({ limit = 20, offset = 0, businessPartnerId } = {}) {
  const res = await apiClient.get("/settlements", {
    params: { limit, offset, ...(businessPartnerId ? { businessPartnerId } : {}) }
  });
  return res.data;
}

async function generateSettlements({ year, month }) {
  const res = await apiClient.post("/settlements/generate", { year, month });
  return res.data;
}

async function markSettlementPaid(id) {
  const res = await apiClient.post(`/settlements/${id}/mark-paid`);
  return res.data;
}

export { listSettlements, generateSettlements, markSettlementPaid };