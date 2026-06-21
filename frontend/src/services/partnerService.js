import { apiClient } from "./apiClient";

async function getPartnerDashboard() {
  const response = await apiClient.get("/partner/dashboard");
  return response.data;
}

async function listPartnerStudents({ page, pageSize, limit = 20, offset = 0, q, status } = {}) {
  const response = await apiClient.get("/partner/students", {
    params: {
      page: page || undefined,
      pageSize: pageSize || undefined,
      limit,
      offset,
      q: q || undefined,
      status: status || undefined
    }
  });
  return response.data;
}

async function exportPartnerStudentsCsv({ q, status } = {}) {
  const response = await apiClient.get("/partner/students/export.csv", {
    params: {
      q: q || undefined,
      status: status || undefined
    },
    responseType: "blob",
    _skipGlobalLoading: true
  });

  return response;
}

async function listPartnerCertificates({ page, pageSize, limit = 20, offset = 0, q, status, levelId, centerId, issuedFrom, issuedTo, includeSummary } = {}) {
  const response = await apiClient.get("/partner/certificates", {
    params: {
      page: page || undefined,
      pageSize: pageSize || undefined,
      limit,
      offset,
      q: q || undefined,
      status: status || undefined,
      levelId: levelId || undefined,
      centerId: centerId || undefined,
      issuedFrom: issuedFrom || undefined,
      issuedTo: issuedTo || undefined,
      includeSummary: includeSummary === undefined ? undefined : (includeSummary ? "1" : "0")
    }
  });
  return response.data;
}

async function issuePartnerCertificate({ studentId, levelId, certificateNumber, reason }) {
  const response = await apiClient.post("/partner/certificates", {
    studentId,
    levelId,
    certificateNumber: certificateNumber || undefined,
    reason: reason || undefined
  });
  return response.data;
}

async function revokePartnerCertificate({ id, reason }) {
  const response = await apiClient.patch(`/partner/certificates/${id}/revoke`, {
    reason: reason || undefined
  });
  return response.data;
}

async function exportPartnerCertificatesCsv({ q, status, levelId, centerId, issuedFrom, issuedTo } = {}) {
  const response = await apiClient.get("/partner/certificates/export.csv", {
    params: {
      q: q || undefined,
      status: status || undefined,
      levelId: levelId || undefined,
      centerId: centerId || undefined,
      issuedFrom: issuedFrom || undefined,
      issuedTo: issuedTo || undefined
    },
    responseType: "blob",
    _skipGlobalLoading: true
  });

  return response;
}

async function bulkIssuePartnerCertificates({ studentIds, levelId, reason }) {
  const response = await apiClient.post("/partner/certificates/bulk", {
    studentIds,
    levelId,
    reason: reason || undefined
  });
  return response.data;
}

async function listEligibleStudentsForCertificate(levelId, { page, pageSize, limit, offset } = {}) {
  const response = await apiClient.get("/partner/certificates/eligible", {
    params: {
      levelId,
      page: page || undefined,
      pageSize: pageSize || undefined,
      limit: limit || undefined,
      offset: offset || undefined
    }
  });
  return response.data;
}

async function listPartnerCompetitionRequests({ limit = 50, offset = 0 } = {}) {
  const response = await apiClient.get("/partner/competition_requests", {
    params: { limit, offset }
  });
  return response.data;
}

async function submitPartnerCompetitionRequest(payload) {
  const response = await apiClient.post("/partner/competition_requests", payload);
  return response.data;
}

async function forwardPartnerCompetitionRequest(id) {
  const response = await apiClient.post(`/partner/competition_requests/${id}/forward`);
  return response.data;
}

async function listPartnerCourses() {
  const response = await apiClient.get("/partner/courses");
  return response.data;
}

async function listPartnerHierarchy() {
  const response = await apiClient.get("/partner/hierarchy");
  return response.data;
}

async function updatePartnerProfile(data) {
  const response = await apiClient.patch("/partner/profile", data);
  return response.data;
}

async function getPartnerProfile(config = {}) {
  const brandingResponse = await apiClient
    .get("/branding/me", { ...config, _suppressErrorLogging: true })
    .catch(() => null);

  const brandingData = brandingResponse?.data;
  const brandingPartner = brandingData?.data?.businessPartner || brandingData?.businessPartner || null;
  if (brandingPartner) {
    return {
      success: true,
      message: "Partner profile fetched",
      data: brandingPartner
    };
  }

  try {
    const response = await apiClient.get("/partner/profile", config);
    return response.data;
  } catch (error) {
    const status = error?.response?.status;
    const code = error?.response?.data?.error_code;
    const shouldFallback =
      status === 500 ||
      (status === 404 && (code === "BP_NOT_FOUND" || code === "BUSINESS_PARTNER_NOT_FOUND"));

    if (!shouldFallback) {
      throw error;
    }

    throw error;
  }
}

async function getCertificateTemplate(options = {}) {
  const response = await apiClient.get("/partner/certificate-template", {
    params: options.fresh ? { _ts: Date.now() } : undefined
  });
  return response.data;
}

async function upsertCertificateTemplate({ title, signatoryName, signatoryDesignation, layout }) {
  const response = await apiClient.put("/partner/certificate-template", {
    title: title || undefined,
    signatoryName: signatoryName !== undefined ? signatoryName : undefined,
    signatoryDesignation: signatoryDesignation !== undefined ? signatoryDesignation : undefined,
    layout: layout !== undefined ? layout : undefined
  });
  return response.data;
}

async function uploadCertificateAsset(assetType, file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiClient.post(`/partner/certificate-template/${assetType}`, formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data;
}

export {
  getPartnerDashboard,
  listPartnerStudents,
  exportPartnerStudentsCsv,
  listPartnerCertificates,
  issuePartnerCertificate,
  bulkIssuePartnerCertificates,
  listEligibleStudentsForCertificate,
  revokePartnerCertificate,
  exportPartnerCertificatesCsv,
  listPartnerCompetitionRequests,
  submitPartnerCompetitionRequest,
  forwardPartnerCompetitionRequest,
  listPartnerCourses,
  listPartnerHierarchy,
  getPartnerProfile,
  updatePartnerProfile,
  getCertificateTemplate,
  upsertCertificateTemplate,
  uploadCertificateAsset
};
