import { apiClient, baseURL } from "./apiClient";

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

function exportEnrollmentsCsvUrl({ batchId = "", status = "", q = "", teacherUserId = "", levelId = "", studentActive = "", from = "", to = "", feeStatus = "", pendingInstallments = "" } = {}) {
  const params = new URLSearchParams();
  if (batchId) params.set("batchId", batchId);
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  if (teacherUserId) params.set("teacherUserId", teacherUserId);
  if (levelId) params.set("levelId", levelId);
  if (studentActive) params.set("studentActive", studentActive);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (feeStatus) params.set("feeStatus", feeStatus);
  if (pendingInstallments) params.set("pendingInstallments", pendingInstallments);
  return `${baseURL}/enrollments/export.csv?${params.toString()}`;
}

export { listEnrollments, createEnrollment, updateEnrollment, bulkUpdateEnrollments, exportEnrollmentsCsvUrl };
