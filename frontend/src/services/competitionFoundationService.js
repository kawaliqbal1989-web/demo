import { apiClient } from "./apiClient";

async function listCompetitionFoundationTemplates({ includeInactive = true } = {}) {
  try {
    const response = await apiClient.get("/competitions/foundation/templates", {
      params: includeInactive ? { includeInactive: true } : undefined
    });
    return response.data;
  } catch (error) {
    // Some environments expose templates endpoint without query support.
    if (!includeInactive || error?.response?.status < 500) {
      throw error;
    }

    const fallbackResponse = await apiClient.get("/competitions/foundation/templates");
    return fallbackResponse.data;
  }
}

async function createCompetitionFoundationTemplate(payload) {
  const response = await apiClient.post("/competitions/foundation/templates", payload);
  return response.data;
}

async function updateCompetitionFoundationTemplate(templateId, payload) {
  try {
    const response = await apiClient.put(`/competitions/foundation/templates/${templateId}`, payload);
    return response.data;
  } catch (error) {
    if (error?.response?.status !== 404) {
      throw error;
    }
  }

  const response = await apiClient.patch(`/competitions/foundation/templates/${templateId}`, payload);
  return response.data;
}

async function archiveCompetitionFoundationTemplate(templateId) {
  try {
    const response = await apiClient.post(`/competitions/foundation/templates/${templateId}/archive`);
    return response.data;
  } catch (error) {
    if (error?.response?.status !== 404) {
      throw error;
    }
  }

  const response = await apiClient.patch(`/competitions/foundation/templates/${templateId}`, { isActive: false });
  return response.data;
}

async function deleteCompetitionFoundationTemplate(templateId) {
  const response = await apiClient.delete(`/competitions/foundation/templates/${templateId}`);
  return response.data;
}

export {
  listCompetitionFoundationTemplates,
  createCompetitionFoundationTemplate,
  updateCompetitionFoundationTemplate,
  archiveCompetitionFoundationTemplate,
  deleteCompetitionFoundationTemplate
};
