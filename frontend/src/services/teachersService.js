import { apiClient } from "./apiClient";

async function listTeachers({ limit = 50, offset = 0, q = "", status = "" } = {}) {
  const response = await apiClient.get("/teachers", {
    params: {
      limit,
      offset,
      q: q || undefined,
      status: status || undefined
    }
  });
  return response.data;
}

async function createTeacher(payload) {
  const response = await apiClient.post("/teachers", payload);
  return response.data;
}

async function updateTeacher(id, payload) {
  const response = await apiClient.put(`/teachers/${id}`, payload);
  return response.data;
}

async function shiftTeacherStudents(id, payload) {
  const response = await apiClient.post(`/teachers/${id}/shift-students`, payload);
  return response.data;
}

async function resetTeacherPassword(id, payload) {
  const response = await apiClient.post(`/teachers/${id}/reset-password`, payload);
  return response.data;
}

async function uploadTeacherPhoto(id, file) {
  const form = new FormData();
  form.append("file", file);
  const response = await apiClient.post(`/teachers/${id}/photo`, form, {
    headers: {
      // Let browser set multipart boundary.
    }
  });
  return response.data;
}

export { listTeachers, createTeacher, updateTeacher, shiftTeacherStudents, resetTeacherPassword, uploadTeacherPhoto };
