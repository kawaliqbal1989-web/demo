import { apiClient } from "./apiClient";

async function getCenterAssignWorksheets(studentId) {
  return apiClient.get(`/center/students/${studentId}/assign-worksheets`);
}

async function saveCenterAssignWorksheets(studentId, { worksheetIds } = {}) {
  return apiClient.post(`/center/students/${studentId}/assign-worksheets`, {
    worksheetIds: Array.isArray(worksheetIds) ? worksheetIds : []
  });
}

export { getCenterAssignWorksheets, saveCenterAssignWorksheets };
