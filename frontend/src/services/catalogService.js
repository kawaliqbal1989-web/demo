import { apiClient } from "./apiClient";

async function listCatalogCourses({ limit = 50, offset = 0, status } = {}) {
  const response = await apiClient.get("/catalog/courses", {
    params: {
      limit,
      offset,
      ...(status ? { status } : {})
    },
    _skipGlobalLoading: true
  });
  return response.data;
}

async function listCatalogCourseLevels({ courseId, limit = 50, offset = 0, status } = {}) {
  const response = await apiClient.get(`/catalog/courses/${courseId}/levels`, {
    params: {
      limit,
      offset,
      ...(status ? { status } : {})
    },
    _skipGlobalLoading: true
  });
  return response.data;
}

export { listCatalogCourses, listCatalogCourseLevels };
