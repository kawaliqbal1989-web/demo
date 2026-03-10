import { apiClient } from "./apiClient";

async function getKpis({ signal } = {}) {
  const response = await apiClient.get("/superadmin/kpis", {
    signal,
    _skipGlobalLoading: true
  });
  return response.data;
}

async function recordDashboardAction({ actionType, metadata } = {}) {
  const response = await apiClient.post(
    "/superadmin/dashboard/actions",
    {
      actionType,
      ...(metadata ? { metadata } : {})
    },
    {
      _skipGlobalLoading: true
    }
  );
  return response.data;
}

async function listUsersByRole({ role, limit = 50, offset = 0, q, status, parentId } = {}) {
  const response = await apiClient.get("/superadmin/users", {
    params: {
      ...(role ? { role } : {}),
      limit,
      offset,
      ...(q ? { q } : {}),
      ...(status ? { status } : {}),
      ...(parentId ? { parentId } : {})
    }
  });
  return response.data;
}

async function updateUserRole(userId, role) {
  const response = await apiClient.patch(`/superadmin/${userId}/role`, { role });
  return response.data;
}

async function createSuperadminUser({ email, password, fullName }) {
  const response = await apiClient.post("/superadmin", { email, password, fullName });
  return response.data;
}

async function listSuperadminCertificates({ limit = 20, offset = 0, q, status, levelId, centerId, bpId, issuedFrom, issuedTo } = {}) {
  const response = await apiClient.get("/superadmin/certificates", {
    params: {
      limit, offset,
      ...(q ? { q } : {}),
      ...(status ? { status } : {}),
      ...(levelId ? { levelId } : {}),
      ...(centerId ? { centerId } : {}),
      ...(bpId ? { bpId } : {}),
      ...(issuedFrom ? { issuedFrom } : {}),
      ...(issuedTo ? { issuedTo } : {})
    }
  });
  return response.data;
}

async function revokeSuperadminCertificate(id, reason) {
  const response = await apiClient.patch(`/superadmin/certificates/${id}/revoke`, { reason });
  return response.data;
}

async function exportSuperadminCertificatesCsv({ q, status, levelId, centerId, bpId, issuedFrom, issuedTo } = {}) {
  const response = await apiClient.get("/superadmin/certificates/export.csv", {
    params: {
      ...(q ? { q } : {}),
      ...(status ? { status } : {}),
      ...(levelId ? { levelId } : {}),
      ...(centerId ? { centerId } : {}),
      ...(bpId ? { bpId } : {}),
      ...(issuedFrom ? { issuedFrom } : {}),
      ...(issuedTo ? { issuedTo } : {})
    },
    responseType: "blob"
  });
  return response.data;
}

async function getSuperadminBpCertificateTemplate(bpId) {
  const response = await apiClient.get(`/superadmin/business-partners/${bpId}/certificate-template`);
  return response.data;
}

async function updateSuperadminBpCertificateTemplate(bpId, data) {
  const response = await apiClient.put(`/superadmin/business-partners/${bpId}/certificate-template`, data);
  return response.data;
}

async function getHierarchyTree() {
  const response = await apiClient.get("/superadmin/hierarchy-tree");
  return response.data;
}

async function getHierarchyDashboard(bpId) {
  const response = await apiClient.get(`/superadmin/hierarchy-dashboard?bpId=${bpId}`);
  return response.data;
}

async function getSystemHealth() {
  const response = await apiClient.get("/superadmin/system-health");
  return response.data;
}

// Hierarchy Management – Franchise
async function saCreateFranchise(data) {
  const response = await apiClient.post("/superadmin/franchises", data);
  return response.data;
}

async function saSetFranchiseStatus(id, status) {
  const response = await apiClient.patch(`/superadmin/franchises/${id}/status`, { status });
  return response.data;
}

async function saGetFranchiseDetail(id) {
  const response = await apiClient.get(`/superadmin/franchises/${id}`);
  return response.data;
}

// Hierarchy Management – Center
async function saCreateCenter(data) {
  const response = await apiClient.post("/superadmin/centers", data);
  return response.data;
}

async function saSetCenterStatus(id, status) {
  const response = await apiClient.patch(`/superadmin/centers/${id}/status`, { status });
  return response.data;
}

async function saGetCenterDetail(id) {
  const response = await apiClient.get(`/superadmin/centers/${id}`);
  return response.data;
}

export {
  getKpis, recordDashboardAction, listUsersByRole, updateUserRole, createSuperadminUser,
  listSuperadminCertificates, revokeSuperadminCertificate, exportSuperadminCertificatesCsv,
  getSuperadminBpCertificateTemplate, updateSuperadminBpCertificateTemplate,
  getHierarchyTree, getHierarchyDashboard, getSystemHealth,
  saCreateFranchise, saSetFranchiseStatus, saGetFranchiseDetail,
  saCreateCenter, saSetCenterStatus, saGetCenterDetail
};
