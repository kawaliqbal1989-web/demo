import { apiClient } from "./apiClient";

async function listBatches({ limit = 50, offset = 0, q = "", status = "", centerId = "", assignedOnly } = {}) {
  const response = await apiClient.get("/batches", {
    params: {
      limit,
      offset,
      q: q || undefined,
      status: status || undefined,
      centerId: centerId || undefined,
      assignedOnly: assignedOnly === undefined ? undefined : String(Boolean(assignedOnly))
    }
  });
  return response.data;
}

async function createBatch(payload) {
  const response = await apiClient.post("/batches", payload);
  return response.data;
}

async function updateBatch(id, payload) {
  const response = await apiClient.put(`/batches/${id}`, payload);
  return response.data;
}

async function setBatchTeachers(id, teacherUserIds) {
  const response = await apiClient.put(`/batches/${id}/teachers`, { teacherUserIds });
  return response.data;
}

export { listBatches, createBatch, updateBatch, setBatchTeachers };
