import { apiClient } from "./apiClient";

async function listWorksheets({ levelId, limit = 50, offset = 0, published, difficulty, q } = {}) {
  const response = await apiClient.get("/worksheets", {
    params: {
      limit,
      offset,
      ...(levelId ? { levelId } : {}),
      ...(published === undefined ? {} : { published }),
      ...(difficulty ? { difficulty } : {}),
      ...(q ? { q } : {})
    },
    _skipGlobalLoading: true
  });
  return response.data;
}

async function createWorksheet(payload) {
  const response = await apiClient.post("/worksheets", payload, { _skipGlobalLoading: true });
  return response.data;
}

async function duplicateWorksheet(id) {
  const response = await apiClient.post(`/worksheets/${id}/duplicate`, {}, { _skipGlobalLoading: true });
  return response.data;
}

async function getWorksheet(id) {
  const response = await apiClient.get(`/worksheets/${id}`, { _skipGlobalLoading: true });
  return response.data;
}

async function updateWorksheet(id, payload) {
  const response = await apiClient.patch(`/worksheets/${id}`, payload, { _skipGlobalLoading: true });
  return response.data;
}

async function deleteWorksheet(id) {
  const response = await apiClient.delete(`/worksheets/${id}`, { _skipGlobalLoading: true });
  return response.data;
}

async function addWorksheetQuestion(worksheetId, payload) {
  const response = await apiClient.post(`/worksheets/${worksheetId}/questions`, payload, { _skipGlobalLoading: true });
  return response.data;
}

async function addWorksheetQuestionsBulk(worksheetId, questionBankIds) {
  const response = await apiClient.post(
    `/worksheets/${worksheetId}/questions/bulk`,
    { questionBankIds },
    { _skipGlobalLoading: true }
  );
  return response.data;
}

async function deleteWorksheetQuestion(worksheetId, questionId) {
  const response = await apiClient.delete(`/worksheets/${worksheetId}/questions/${questionId}`, { _skipGlobalLoading: true });
  return response.data;
}

async function reorderWorksheetQuestions(worksheetId, orderedIds) {
  const response = await apiClient.patch(
    `/worksheets/${worksheetId}/questions/reorder`,
    { orderedIds },
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
