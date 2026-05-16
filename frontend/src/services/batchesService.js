import { apiClient } from "./apiClient";

async function listBatches({
  limit = 50,
  offset = 0,
  page,
  pageSize,
  q = "",
  status = "",
  statuses,
  modality = "",
  teacherId = "",
  levelId = "",
  dayType = "",
  includeArchived,
  fullOnly,
  centerId = "",
  assignedOnly,
  sortBy = "",
  sortDir = ""
} = {}) {
  const response = await apiClient.get("/batches", {
    params: {
      limit,
      offset,
      page: page === undefined ? undefined : page,
      pageSize: pageSize === undefined ? undefined : pageSize,
      q: q || undefined,
      status: status || undefined,
      statuses: Array.isArray(statuses) ? statuses : undefined,
      modality: modality || undefined,
      teacherId: teacherId || undefined,
      levelId: levelId || undefined,
      dayType: dayType || undefined,
      includeArchived: includeArchived === undefined ? undefined : String(Boolean(includeArchived)),
      fullOnly: fullOnly === undefined ? undefined : String(Boolean(fullOnly)),
      centerId: centerId || undefined,
      assignedOnly: assignedOnly === undefined ? undefined : String(Boolean(assignedOnly)),
      sortBy: sortBy || undefined,
      sortDir: sortDir || undefined
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

async function archiveBatch(id) {
  return updateBatch(id, { status: "ARCHIVED" });
}

async function restoreBatch(id) {
  return updateBatch(id, { status: "ACTIVE" });
}

async function duplicateBatch(payload) {
  const { teacherUserIds = [], ...batchPayload } = payload || {};
  const created = await createBatch(batchPayload);
  const createdBatchId = created?.data?.id || created?.id;
  if (createdBatchId && teacherUserIds.length) {
    await setBatchTeachers(createdBatchId, teacherUserIds);
  }
  return created;
}

export { listBatches, createBatch, updateBatch, setBatchTeachers, archiveBatch, restoreBatch, duplicateBatch };
