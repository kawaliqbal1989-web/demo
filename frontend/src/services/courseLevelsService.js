import { apiClient } from "./apiClient";

async function listCourseLevels({ courseId, limit = 20, offset = 0, status } = {}) {
  const response = await apiClient.get(`/courses/${courseId}/levels`, {
    params: {
      limit,
      offset,
      ...(status ? { status } : {})
    }
  });
  return response.data;
}

async function createCourseLevel({ courseId, levelNumber, title, sortOrder, status }) {
  const response = await apiClient.post(`/courses/${courseId}/levels`, {
    levelNumber,
    title,
    sortOrder,
    status
  });
  return response.data;
}

async function updateCourseLevel({ courseId, id, title, sortOrder, status }) {
  const response = await apiClient.patch(`/courses/${courseId}/levels/${id}`, {
    title,
    sortOrder,
    status
  });
  return response.data;
}

export { listCourseLevels, createCourseLevel, updateCourseLevel };
