import { apiClient } from "./apiClient";

async function listCompetitions({ limit = 20, offset = 0, q, status } = {}) {
  const response = await apiClient.get("/competitions", {
    params: {
      limit,
      offset,
      q: q || undefined,
      status: status || undefined
    }
  });
  return {
    ...response.data,
    data: response.data,
    headers: response.headers
  };
}

async function enrollCompetitionStudent({ competitionId, studentId, competitionFeeAmount, levelId }) {
  const response = await apiClient.post(`/competitions/${competitionId}/enrollments`, {
    studentId,
    competitionFeeAmount,
    levelId
  });
  return response.data;
}

async function createCompetition(payload) {
  const normalizedBusinessPartnerIds = Array.isArray(payload?.businessPartnerIds)
    ? [...new Set(payload.businessPartnerIds.map((value) => String(value || "").trim()).filter(Boolean))]
    : [];

  const response = await apiClient.post("/competitions", {
    ...payload,
    businessPartnerIds: normalizedBusinessPartnerIds
  });
  return response.data;
}

async function getCompetitionDetail(id) {
  const response = await apiClient.get(`/competitions/${id}`);
  return response.data;
}

async function createCompetitionWorksheetAssignments(id, payload) {
  const response = await apiClient.post(`/competitions/${id}/worksheet-assignments`, payload);
  return response.data;
}

async function cancelCompetitionWorksheetAssignment(id, assignmentId) {
  const response = await apiClient.patch(`/competitions/${id}/worksheet-assignments/${assignmentId}/cancel`);
  return response.data;
}

async function publishCompetitionWorksheetResults(id, payload) {
  const response = await apiClient.post(`/competitions/${id}/worksheet-assignments/publish`, payload);
  return response.data;
}

async function getCompetitionWorkflow(id) {
  // Reuse the competition detail API to surface workflow-related fields.
  const data = await getCompetitionDetail(id);
  // Accept multiple possible shapes from backend: data.workflow, data.workflowState, data.state
  const workflow = data?.workflow || { state: data?.workflowState || data?.workflowStage || data?.state };
  const owner = workflow?.owner || data?.workflowOwner || null;
  const updatedAt = workflow?.updatedAt || data?.workflowUpdatedAt || data?.updatedAt || null;
  return { workflow: { ...workflow, state: workflow?.state }, owner, updatedAt, raw: data };
}

async function getCompetitionRegistrations(id) {
  const response = await apiClient.get(`/competitions/${id}/registrations`);
  return response.data;
}

async function updateCompetitionRegistrationLevel(id, registrationId, payload) {
  const response = await apiClient.patch(`/competitions/${id}/registrations/${registrationId}/level`, payload);
  return response.data;
}

async function updateCompetitionRegistrationTeacher(id, registrationId, payload) {
  const response = await apiClient.patch(`/competitions/${id}/registrations/${registrationId}/teacher`, payload);
  return response.data;
}

async function removeCompetitionRegistration(id, registrationId) {
  const response = await apiClient.delete(`/competitions/${id}/registrations/${registrationId}`);
  return response.data;
}

function createIdempotencyKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createCompetitionTemporaryStudent(id, payload) {
  const idempotencyKey = payload?.idempotencyKey || createIdempotencyKey();
  const body = { ...(payload || {}) };
  delete body.idempotencyKey;
  const response = await apiClient.post(`/competitions/${id}/temporary-students`, body, {
    headers: { "Idempotency-Key": idempotencyKey }
  });
  return response.data;
}

async function lockCompetitionCenterRegistration(id) {
  const response = await apiClient.post(`/competitions/${id}/center-lock`);
  return response.data;
}

async function forwardCompetitionRequest(id) {
  const response = await apiClient.post(`/competitions/${id}/forward-request`);
  return response.data;
}

async function submitCenterUnlockRequest(id, payload = {}) {
  const response = await apiClient.post(`/competitions/${id}/unlock-requests`, payload);
  return response.data;
}

async function rejectCompetitionRequest(id, reason) {
  const response = await apiClient.post(`/competitions/${id}/reject`, { reason });
  return response.data;
}

async function getLeaderboard(id) {
  const response = await apiClient.get(`/competitions/${id}/leaderboard`);
  return response.data;
}

async function getCompetitionResults(id) {
  const response = await apiClient.get(`/competitions/${id}/results`);
  return response.data;
}

async function publishCompetitionResults(id) {
  const response = await apiClient.post(`/competitions/${id}/results/publish`);
  return response.data;
}

async function finalizeCompetitionAwards(id) {
  const response = await apiClient.post(`/competitions/${id}/awards/finalize`);
  return response.data;
}

async function listCompetitionCertificates(id) {
  const response = await apiClient.get(`/competitions/${id}/certificates`);
  return response.data;
}

async function generateCompetitionCertificates(id, payload = {}) {
  const response = await apiClient.post(`/competitions/${id}/certificates/generate`, payload);
  return response.data;
}

async function publishCompetitionCertificates(id, payload = {}) {
  const response = await apiClient.post(`/competitions/${id}/certificates/publish`, payload);
  return response.data;
}

async function unpublishCompetitionResults(id) {
  const response = await apiClient.post(`/competitions/${id}/results/unpublish`);
  return response.data;
}

async function exportCompetitionResultsCsv(id) {
  const response = await apiClient.get(`/competitions/${id}/results.csv`, {
    responseType: "blob"
  });
  return response.data;
}

async function listCompetitionBusinessPartners(id) {
  const response = await apiClient.get(`/competitions/${id}/business-partners`);
  return response.data;
}

async function assignCompetitionBusinessPartners(id, payload) {
  const response = await apiClient.post(`/competitions/${id}/business-partners`, payload);
  return response.data;
}

async function removeCompetitionBusinessPartner(id, businessPartnerId) {
  const response = await apiClient.delete(`/competitions/${id}/business-partners/${businessPartnerId}`);
  return response.data;
}

export {
  listCompetitions,
  getCompetitionDetail,
  getCompetitionRegistrations,
  updateCompetitionRegistrationLevel,
  updateCompetitionRegistrationTeacher,
  removeCompetitionRegistration,
  createCompetitionTemporaryStudent,
  lockCompetitionCenterRegistration,
  enrollCompetitionStudent,
  createCompetition,
  forwardCompetitionRequest,
  submitCenterUnlockRequest,
  rejectCompetitionRequest,
  getLeaderboard,
  getCompetitionResults,
  publishCompetitionResults,
  finalizeCompetitionAwards,
  listCompetitionCertificates,
  generateCompetitionCertificates,
  publishCompetitionCertificates,
  unpublishCompetitionResults,
  exportCompetitionResultsCsv,
  listCompetitionBusinessPartners,
  assignCompetitionBusinessPartners,
  removeCompetitionBusinessPartner,
  createCompetitionWorksheetAssignments,
  cancelCompetitionWorksheetAssignment,
  publishCompetitionWorksheetResults,
  getCompetitionWorkflow
};
