import { apiClient } from "./apiClient";

async function getMyFranchise() {
  const res = await apiClient.get("/franchise/me");
  return res.data;
}

async function getFranchiseDashboard() {
  const res = await apiClient.get("/franchise/dashboard");
  return res.data;
}

async function listFranchiseCenters({ limit = 20, offset = 0, q, status } = {}) {
  const res = await apiClient.get("/franchise/centers", {
    params: {
      limit,
      offset,
      q: q || undefined,
      status: status || undefined
    }
  });
  return res.data;
}

async function createFranchiseCenter(payload) {
  const res = await apiClient.post("/franchise/centers", payload);
  return res.data;
}

async function updateFranchiseCenter({ id, ...payload }) {
  const res = await apiClient.put(`/franchise/centers/${id}`, payload);
  return res.data;
}

async function deleteFranchiseCenter(id) {
  const res = await apiClient.delete(`/franchise/centers/${id}`);
  return res.data;
}

async function resetFranchiseCenterPassword({ id, newPassword, mustChangePassword = true }) {
  const res = await apiClient.post(`/franchise/centers/${id}/reset-password`, {
    newPassword,
    mustChangePassword
  });
  return res.data;
}

async function listFranchiseStudents({ limit = 20, offset = 0, q, centerId } = {}) {
  const res = await apiClient.get("/franchise/students", {
    params: {
      limit,
      offset,
      q: q || undefined,
      centerId: centerId || undefined
    }
  });
  return res.data;
}

async function exportFranchiseStudentsCsv({ q, centerId } = {}) {
  const res = await apiClient.get("/franchise/students/export.csv", {
    params: {
      q: q || undefined,
      centerId: centerId || undefined
    },
    responseType: "blob",
    _skipGlobalLoading: true
  });
  return res;
}

async function getFranchiseReports() {
  const res = await apiClient.get("/franchise/reports");
  return res.data;
}

async function exportFranchiseReportsCsv() {
  const res = await apiClient.get("/franchise/reports/export.csv", {
    responseType: "blob",
    _skipGlobalLoading: true
  });
  return res;
}

async function listFranchiseCompetitionRequests({ limit = 50, offset = 0 } = {}) {
  const res = await apiClient.get("/franchise/competition_requests", {
    params: { limit, offset }
  });
  return res.data;
}

async function forwardFranchiseCompetitionRequest(id) {
  const res = await apiClient.post(`/franchise/competition_requests/${id}/forward`);
  return res.data;
}

async function rejectFranchiseCompetitionRequest(id, reason) {
  const res = await apiClient.post(`/franchise/competition_requests/${id}/reject`, {
    reason: reason || undefined
  });
  return res.data;
}

async function updateFranchiseProfile(data) {
  const res = await apiClient.patch("/franchise/profile", data);
  return res.data;
}

async function listFranchiseMargins() {
  const res = await apiClient.get("/franchise/margins");
  return res.data;
}

async function listFranchiseSettlements({ limit = 20, offset = 0 } = {}) {
  const res = await apiClient.get("/franchise/settlements", {
    params: { limit, offset }
  });
  return res.data;
}

async function listFranchiseCourses() {
  const res = await apiClient.get("/franchise/courses");
  return res.data;
}

export {
  getMyFranchise,
  getFranchiseDashboard,
  listFranchiseCenters,
  createFranchiseCenter,
  updateFranchiseCenter,
  deleteFranchiseCenter,
  resetFranchiseCenterPassword,
  listFranchiseStudents,
  exportFranchiseStudentsCsv,
  getFranchiseReports,
  exportFranchiseReportsCsv,
  listFranchiseCompetitionRequests,
  forwardFranchiseCompetitionRequest,
  rejectFranchiseCompetitionRequest,
  updateFranchiseProfile,
  listFranchiseMargins,
  listFranchiseSettlements,
  listFranchiseCourses
};
