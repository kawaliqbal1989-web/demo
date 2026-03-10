import { apiClient, baseURL } from "./apiClient";

async function listEnrollments({ limit = 50, offset = 0, batchId = "", studentId = "", status = "" } = {}) {
  const response = await apiClient.get("/enrollments", {
    params: {
      limit,
      offset,
      batchId: batchId || undefined,
      studentId: studentId || undefined,
      status: status || undefined
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

function exportEnrollmentsCsvUrl({ batchId = "" } = {}) {
  const params = new URLSearchParams();
  if (batchId) params.set("batchId", batchId);
  return `${baseURL}/enrollments/export.csv?${params.toString()}`;
}

export { listEnrollments, createEnrollment, updateEnrollment, exportEnrollmentsCsvUrl };
