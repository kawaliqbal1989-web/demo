import { apiClient } from "./apiClient";
import { baseURL } from "./apiClient";
import { getStoredAccessToken } from "../auth/tokenStorage";

async function listCompetitionCourses({ limit = 20, offset = 0, q, status } = {}) {
  const response = await apiClient.get("/competition-courses", {
    params: {
      limit,
      offset,
      ...(q ? { q } : {}),
      ...(status ? { status } : {})
    }
  });
  return response.data;
}

async function createCompetitionCourse({ code, name, status, description }) {
  const response = await apiClient.post("/competition-courses", { code, name, status, description });
  return response.data;
}

async function getCompetitionCourse(id) {
  const response = await apiClient.get(`/competition-courses/${id}`);
  return response.data;
}

async function updateCompetitionCourse({ id, code, name, status, description }) {
  const response = await apiClient.patch(`/competition-courses/${id}`, { code, name, status, description });
  return response.data;
}

async function archiveCompetitionCourse(id) {
  const response = await apiClient.post(`/competition-courses/${id}/archive`);
  return response.data;
}

async function listCompetitionCourseLevels({ courseId, limit = 20, offset = 0, status } = {}) {
  const response = await apiClient.get(`/competition-courses/${courseId}/levels`, {
    params: {
      limit,
      offset,
      ...(status ? { status } : {})
    }
  });
  return response.data;
}

async function listCompetitionCoursePapers({ courseId, levelId, limit = 20, offset = 0, status, q } = {}) {
  const response = await apiClient.get(`/competition-courses/${courseId}/levels/${levelId}/papers`, {
    params: {
      limit,
      offset,
      ...(status ? { status } : {}),
      ...(q ? { q } : {})
    }
  });
  return response.data;
}

async function createCompetitionCoursePaper({ courseId, levelId, title, code, description, sortOrder, status }) {
  const response = await apiClient.post(`/competition-courses/${courseId}/levels/${levelId}/papers`, {
    title,
    code,
    description,
    sortOrder,
    status
  });
  return response.data;
}

async function updateCompetitionCoursePaper({ courseId, levelId, paperId, title, code, description, sortOrder, status }) {
  const response = await apiClient.patch(`/competition-courses/${courseId}/levels/${levelId}/papers/${paperId}`, {
    title,
    code,
    description,
    sortOrder,
    status
  });
  return response.data;
}

async function archiveCompetitionCoursePaper({ courseId, levelId, paperId }) {
  const response = await apiClient.post(`/competition-courses/${courseId}/levels/${levelId}/papers/${paperId}/archive`);
  return response.data;
}

async function listCompetitionCoursePaperBlueprints({ courseId, levelId, paperId, limit = 20, offset = 0, status, q } = {}) {
  const response = await apiClient.get(`/competition-courses/${courseId}/levels/${levelId}/papers/${paperId}/blueprints`, {
    params: {
      limit,
      offset,
      ...(status ? { status } : {}),
      ...(q ? { q } : {})
    }
  });
  return response.data;
}

async function createCompetitionCoursePaperBlueprint({ courseId, levelId, paperId, payload }) {
  const response = await apiClient.post(
    `/competition-courses/${courseId}/levels/${levelId}/papers/${paperId}/blueprints`,
    payload
  );
  return response.data;
}

async function updateCompetitionCoursePaperBlueprint({ courseId, levelId, paperId, blueprintId, payload }) {
  const response = await apiClient.patch(
    `/competition-courses/${courseId}/levels/${levelId}/papers/${paperId}/blueprints/${blueprintId}`,
    payload
  );
  return response.data;
}

async function archiveCompetitionCoursePaperBlueprint({ courseId, levelId, paperId, blueprintId }) {
  const response = await apiClient.post(
    `/competition-courses/${courseId}/levels/${levelId}/papers/${paperId}/blueprints/${blueprintId}/archive`
  );
  return response.data;
}

async function generateCompetitionCoursePaperWorksheet({ courseId, levelId, paperId, blueprintId, payload }) {
  const response = await apiClient.post(
    `/competition-courses/${courseId}/levels/${levelId}/papers/${paperId}/blueprints/${blueprintId}/generate-worksheet`,
    payload
  );
  return response.data;
}

async function createCompetitionCourseLevel({ courseId, levelNumber, title, sortOrder, status }) {
  const response = await apiClient.post(`/competition-courses/${courseId}/levels`, {
    levelNumber,
    title,
    sortOrder,
    status
  });
  return response.data;
}

async function updateCompetitionCourseLevel({ courseId, id, title, sortOrder, status }) {
  const response = await apiClient.patch(`/competition-courses/${courseId}/levels/${id}`, {
    title,
    sortOrder,
    status
  });
  return response.data;
}

async function listCompetitionCourseLevelQuestionBank({ courseId, levelId, difficulty, q } = {}) {
  const response = await apiClient.get(`/competition-courses/${courseId}/levels/${levelId}/question-bank`, {
    params: {
      ...(difficulty ? { difficulty } : {}),
      ...(q ? { q } : {})
    },
    _skipGlobalLoading: true
  });
  return response.data;
}

async function createCompetitionCourseLevelQuestionBankEntry({ courseId, levelId, payload }) {
  const response = await apiClient.post(
    `/competition-courses/${courseId}/levels/${levelId}/question-bank`,
    payload,
    { _skipGlobalLoading: true }
  );
  return response.data;
}

async function updateCompetitionCourseLevelQuestionBankEntry({ courseId, levelId, mappingId, payload }) {
  const response = await apiClient.patch(
    `/competition-courses/${courseId}/levels/${levelId}/question-bank/${mappingId}`,
    payload,
    { _skipGlobalLoading: true }
  );
  return response.data;
}

async function deleteCompetitionCourseLevelQuestionBankEntry({ courseId, levelId, mappingId }) {
  const response = await apiClient.delete(
    `/competition-courses/${courseId}/levels/${levelId}/question-bank/${mappingId}`,
    { _skipGlobalLoading: true }
  );
  return response.data;
}

async function importCompetitionCourseLevelQuestionBank({ courseId, levelId, items }) {
  const response = await apiClient.post(
    `/competition-courses/${courseId}/levels/${levelId}/question-bank/import`,
    {
      levelId,
      items
    },
    { _skipGlobalLoading: true }
  );
  return response.data;
}

async function exportCompetitionCourseLevelQuestionBankCsv({ courseId, levelId }) {
  const token = getStoredAccessToken();
  const url = `${baseURL}/competition-courses/${courseId}/levels/${levelId}/question-bank/export.csv`;
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(text || "Failed to export CSV");
    error.status = response.status;
    throw error;
  }

  const blob = await response.blob();
  return blob;
}

export {
  archiveCompetitionCourse,
  createCompetitionCourse,
  createCompetitionCourseLevelQuestionBankEntry,
  createCompetitionCoursePaper,
  createCompetitionCourseLevel,
  deleteCompetitionCourseLevelQuestionBankEntry,
  exportCompetitionCourseLevelQuestionBankCsv,
  archiveCompetitionCoursePaper,
  archiveCompetitionCoursePaperBlueprint,
  generateCompetitionCoursePaperWorksheet,
  getCompetitionCourse,
  createCompetitionCoursePaperBlueprint,
  importCompetitionCourseLevelQuestionBank,
  listCompetitionCoursePaperBlueprints,
  listCompetitionCoursePapers,
  listCompetitionCourseLevelQuestionBank,
  listCompetitionCourseLevels,
  listCompetitionCourses,
  updateCompetitionCourse,
  updateCompetitionCoursePaperBlueprint,
  updateCompetitionCoursePaper,
  updateCompetitionCourseLevelQuestionBankEntry,
  updateCompetitionCourseLevel
};
