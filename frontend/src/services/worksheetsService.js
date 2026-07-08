import { apiClient } from "./apiClient";

async function listWorksheets({ levelId, limit = 50, offset = 0, published, difficulty, q, courseId, levelNumber } = {}) {
  const response = await apiClient.get("/worksheets", {
    params: {
      limit,
      offset,
      ...(levelId ? { levelId } : {}),
      ...(courseId ? { courseId } : {}),
      ...(levelNumber ? { levelNumber } : {}),
      ...(published === undefined ? {} : { published }),
      ...(difficulty ? { difficulty } : {}),
      ...(q ? { q } : {})
    },
    _skipGlobalLoading: true
  });
  return response.data;
}

async function createWorksheet(payload, { courseId, levelNumber } = {}) {
  const response = await apiClient.post(
    "/worksheets",
    {
      ...payload,
      ...(courseId ? { courseId } : {}),
      ...(levelNumber ? { levelNumber } : {})
    },
    { _skipGlobalLoading: true }
  );
  return response.data;
}

async function duplicateWorksheet(id) {
  const response = await apiClient.post(`/worksheets/${id}/duplicate`, {}, { _skipGlobalLoading: true });
  return response.data;
}

async function getWorksheet(id, { courseId, levelNumber } = {}) {
  const response = await apiClient.get(`/worksheets/${id}`, {
    params: {
      ...(courseId ? { courseId } : {}),
      ...(levelNumber ? { levelNumber } : {})
    },
    _skipGlobalLoading: true
  });
  return response.data;
}

async function updateWorksheet(id, payload, { courseId, levelNumber } = {}) {
  const response = await apiClient.patch(
    `/worksheets/${id}`,
    {
      ...payload,
      ...(courseId ? { courseId } : {}),
      ...(levelNumber ? { levelNumber } : {})
    },
    { _skipGlobalLoading: true }
  );
  return response.data;
}

async function deleteWorksheet(id, { courseId, levelNumber } = {}) {
  const response = await apiClient.delete(`/worksheets/${id}`, {
    params: {
      ...(courseId ? { courseId } : {}),
      ...(levelNumber ? { levelNumber } : {})
    },
    _skipGlobalLoading: true
  });
  return response.data;
}

async function addWorksheetQuestion(worksheetId, payload, { courseId, levelNumber } = {}) {
  const response = await apiClient.post(
    `/worksheets/${worksheetId}/questions`,
    {
      ...payload,
      ...(courseId ? { courseId } : {}),
      ...(levelNumber ? { levelNumber } : {})
    },
    { _skipGlobalLoading: true }
  );
  return response.data;
}

async function addWorksheetQuestionsBulk(worksheetId, questionBankIds, { courseId, levelNumber } = {}) {
  const response = await apiClient.post(
    `/worksheets/${worksheetId}/questions/bulk`,
    {
      questionBankIds,
      ...(courseId ? { courseId } : {}),
      ...(levelNumber ? { levelNumber } : {})
    },
    { _skipGlobalLoading: true }
  );
  return response.data;
}

async function deleteWorksheetQuestion(worksheetId, questionId, { courseId, levelNumber } = {}) {
  const response = await apiClient.delete(`/worksheets/${worksheetId}/questions/${questionId}`, {
    params: {
      ...(courseId ? { courseId } : {}),
      ...(levelNumber ? { levelNumber } : {})
    },
    _skipGlobalLoading: true
  });
  return response.data;
}

async function reorderWorksheetQuestions(worksheetId, orderedIds, { courseId, levelNumber } = {}) {
  const response = await apiClient.patch(
    `/worksheets/${worksheetId}/questions/reorder`,
    {
      orderedIds,
      ...(courseId ? { courseId } : {}),
      ...(levelNumber ? { levelNumber } : {})
    },
    { _skipGlobalLoading: true }
  );
  return response.data;
}

export {
  listWorksheets,
  createWorksheet,
  duplicateWorksheet,
  getWorksheet,
  updateWorksheet,
  deleteWorksheet,
  addWorksheetQuestion,
  addWorksheetQuestionsBulk,
  deleteWorksheetQuestion,
  reorderWorksheetQuestions
};
