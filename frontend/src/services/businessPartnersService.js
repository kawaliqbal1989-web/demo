import { apiClient } from "./apiClient";

async function listBusinessPartners({ limit = 20, offset = 0, q, status } = {}) {
  const response = await apiClient.get("/business-partners", {
    params: {
      limit,
      offset,
      ...(q ? { q } : {}),
      ...(status ? { status } : {})
    }
  });
  return response.data;
}

async function createBusinessPartner(data) {
  const response = await apiClient.post("/partners", data);
  return response.data;
}

async function getBusinessPartner(id) {
  const response = await apiClient.get(`/business-partners/${id}`);
  return response.data;
}

async function updateBusinessPartner({ id, data }) {
  const response = await apiClient.patch(`/business-partners/${id}`, data);
  return response.data;
}

async function uploadBusinessPartnerLogo({ id, file }) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post(`/business-partners/${id}/logo`, formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    },
    // Upload is already visually obvious; avoid blocking the whole app with a global loader.
    _skipGlobalLoading: true
  });

  return response.data;
}

async function setBusinessPartnerStatus({ id, status }) {
  const response = await apiClient.patch(`/business-partners/${id}/status`, { status });
  return response.data;
}

async function resetBusinessPartnerPassword({ id, password }) {
  const response = await apiClient.post(`/business-partners/${id}/reset-password`, { password });
  return response.data;
}

async function renewBusinessPartner({ id, extendDays = 30 }) {
  const response = await apiClient.patch(`/business-partners/${id}/renew`, { extendDays });
  return response.data;
}

async function getMyBusinessPartner() {
  const response = await apiClient.get("/business-partners/me");
  return response.data;
}

async function updateRevenueSplit({ id, centerSharePercent, franchiseSharePercent, bpSharePercent, platformSharePercent }) {
  const response = await apiClient.patch(`/business-partners/${id}/revenue-split`, {
    centerSharePercent,
    franchiseSharePercent,
    bpSharePercent,
    platformSharePercent
  });
  return response.data;
}

// Practice Feature Entitlements

async function getBPPracticeEntitlements(id) {
  const response = await apiClient.get(`/business-partners/${id}/practice-entitlements`);
  return response.data;
}

async function updateBPPracticeEntitlements({ id, practice, abacusPractice }) {
  const response = await apiClient.patch(`/business-partners/${id}/practice-entitlements`, {
    practice,
    abacusPractice
  });
  return response.data;
}

async function getBPPracticeUsage(id) {
  const response = await apiClient.get(`/business-partners/${id}/practice-usage`);
  return response.data;
}

export {
  listBusinessPartners,
  createBusinessPartner,
  getBusinessPartner,
  updateBusinessPartner,
  uploadBusinessPartnerLogo,
  setBusinessPartnerStatus,
  resetBusinessPartnerPassword,
  renewBusinessPartner,
  getMyBusinessPartner,
  updateRevenueSplit,
  getBPPracticeEntitlements,
  updateBPPracticeEntitlements,
  getBPPracticeUsage
};
