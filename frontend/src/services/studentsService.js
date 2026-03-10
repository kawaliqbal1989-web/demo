import { apiClient } from "./apiClient";

function getDownloadFilename(contentDisposition, fallback) {
  const header = String(contentDisposition || "");
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }
  return fallback;
}

function triggerBlobDownload(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

async function listStudents({
  limit = 20,
  offset = 0,
  q = "",
  status = "",
  teacherUserId = "",
  levelId = "",
  courseCode = ""
} = {}) {
  const response = await apiClient.get("/students", {
    params: {
      limit,
      offset,
      q: q || undefined,
      status: status || undefined,
      teacherUserId: teacherUserId || undefined,
      levelId: levelId || undefined,
      courseCode: courseCode || undefined
    }
  });
  return response.data;
}

async function createStudent(payload) {
  const response = await apiClient.post("/students", payload);
  return response.data;
}

async function getNextStudentCode() {
  const response = await apiClient.get("/students/next-code");
  return response.data;
}

async function updateStudent(id, payload) {
  const response = await apiClient.put(`/students/${id}`, payload);
  return response.data;
}

async function getStudent(id) {
  const response = await apiClient.get(`/students/${id}`);
  return response.data;
}

async function createStudentLogin(id, payload) {
  const response = await apiClient.post(`/students/${id}/create-login`, payload);
  return response.data;
}

async function resetStudentPassword(id, payload) {
  const response = await apiClient.post(`/students/${id}/reset-password`, payload);
  return response.data;
}

async function assignStudentLevel(id, payload) {
  const response = await apiClient.patch(`/students/${id}/assign-level`, payload);
  return response.data;
}

async function assignStudentCourse(id, courseIdOrCourseIds) {
  const payload = Array.isArray(courseIdOrCourseIds)
    ? { courseIds: courseIdOrCourseIds }
    : { courseId: courseIdOrCourseIds };
  const response = await apiClient.patch(`/students/${id}/assign-course`, payload);
  return response.data;
}

async function uploadStudentPhoto(id, file) {
  const form = new FormData();
  form.append("file", file);
  const response = await apiClient.post(`/students/${id}/photo`, form, {
    headers: {
      // Let browser set multipart boundary.
    }
  });
  return response.data;
}

async function recordStudentPayment(id, payload) {
  const response = await apiClient.post(`/students/${id}/fees/payments`, payload);
  return response.data;
}

async function getStudentFeesContext(id) {
  const response = await apiClient.get(`/students/${id}/fees`);
  return response.data;
}

async function createStudentInstallment(id, payload) {
  const response = await apiClient.post(`/students/${id}/fees/installments`, payload);
  return response.data;
}

async function deleteStudentInstallment(id, installmentId) {
  const response = await apiClient.delete(`/students/${id}/fees/installments/${installmentId}`);
  return response.data;
}

async function exportStudentsCsv(params = {}) {
  const response = await apiClient.get("/students/export.csv", {
    params,
    responseType: "blob"
  });
  const filename = getDownloadFilename(response.headers?.["content-disposition"], "students_detailed.csv");
  triggerBlobDownload(response.data, filename);
}

async function exportStudentsExcel(params = {}) {
  const response = await apiClient.get("/students/export.xlsx", {
    params,
    responseType: "blob"
  });
  const filename = getDownloadFilename(response.headers?.["content-disposition"], "students_detailed.xlsx");
  triggerBlobDownload(response.data, filename);
}

async function bulkImportStudentsCsv(file, options = {}) {
  const form = new FormData();
  form.append("file", file);
  if (options.batchId) form.append("batchId", options.batchId);
  if (options.levelId) form.append("levelId", options.levelId);
  if (options.assignedTeacherUserId) form.append("assignedTeacherUserId", options.assignedTeacherUserId);
  if (options.startDate) form.append("startDate", options.startDate);
  const response = await apiClient.post("/students/import-csv", form);
  return response.data;
}

async function getStudentPerformanceSummary(id, params = {}) {
  const response = await apiClient.get(`/students/${id}/performance-summary`, { params });
  return response.data;
}

async function getStudentPromotionStatus(id) {
  const response = await apiClient.get(`/students/${id}/promotion-status`);
  return response.data;
}

async function confirmStudentPromotion(id, payload = {}) {
  const response = await apiClient.post(`/students/${id}/confirm-promotion`, payload);
  return response.data;
}

export {
  listStudents,
  createStudent,
  getNextStudentCode,
  getStudent,
  updateStudent,
  createStudentLogin,
  resetStudentPassword,
  assignStudentLevel,
  assignStudentCourse,
  uploadStudentPhoto,
  exportStudentsCsv,
  exportStudentsExcel,
  recordStudentPayment,
  getStudentFeesContext,
  createStudentInstallment,
  deleteStudentInstallment,
  bulkImportStudentsCsv,
  getStudentPerformanceSummary,
  getStudentPromotionStatus,
  confirmStudentPromotion
};
