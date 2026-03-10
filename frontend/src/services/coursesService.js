import { apiClient } from "./apiClient";

async function listCourses({ limit = 20, offset = 0, q, status } = {}) {
  const response = await apiClient.get("/courses", {
    params: {
      limit,
      offset,
      ...(q ? { q } : {}),
      ...(status ? { status } : {})
    }
  });
  return response.data;
}

async function createCourse({ code, name, status, description }) {
  const response = await apiClient.post("/courses", { code, name, status, description });
  return response.data;
}

async function getCourse(id) {
  const response = await apiClient.get(`/courses/${id}`);
  return response.data;
}

async function updateCourse({ id, name, status, description }) {
  const response = await apiClient.patch(`/courses/${id}`, { name, status, description });
  return response.data;
}

async function archiveCourse(id) {
  const response = await apiClient.post(`/courses/${id}/archive`);
  return response.data;
}

export { listCourses, createCourse, getCourse, updateCourse, archiveCourse };
