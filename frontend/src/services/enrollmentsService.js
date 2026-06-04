import { apiClient } from "./apiClient";

async function listEnrollments({
  limit = 50,
  offset = 0,
  batchId = "",
  studentId = "",
  status = "",
  q = "",
  teacherUserId = "",
  levelId = "",
  studentActive = "",
  from = "",
  to = "",
  feeStatus = "",
  pendingInstallments = ""
} = {}) {
  const response = await apiClient.get("/enrollments", {
    params: {
      limit,
      offset,
      batchId: batchId || undefined,
      studentId: studentId || undefined,
      status: status || undefined,
      q: q || undefined,
      teacherUserId: teacherUserId || undefined,
      levelId: levelId || undefined,
      studentActive: studentActive || undefined,
      from: from || undefined,
      to: to || undefined,
      feeStatus: feeStatus || undefined,
      pendingInstallments: pendingInstallments || undefined
    }
  });
  return response.data;
}

async function createEnrollment(payload) {
  const response = await apiClient.post("/enrollments", payload);
  return response.data;
}

async function updateEnrollment(id, payload) {
  const response = await apiClient.put(`/enrollments/${id}`, payload);
  return response.data;
}

async function bulkUpdateEnrollments(payload) {
  const response = await apiClient.post("/enrollments/bulk-update", payload);
  return response.data;
}

async function exportEnrollmentsCsv(params = {}) {
  return apiClient.get("/enrollments/export.csv", {
    params,
    responseType: "blob"
  });
}

export { listEnrollments, createEnrollment, updateEnrollment, bulkUpdateEnrollments, exportEnrollmentsCsv };
