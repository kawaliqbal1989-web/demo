import { apiClient } from "./apiClient";

function normalizeParams(params = {}) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

async function getParentDashboardOverview({ studentId } = {}) {
  return apiClient.get("/parent/dashboard/overview", {
    params: normalizeParams({ studentId })
  });
}

async function getParentDashboardAttendance({ studentId } = {}) {
  return apiClient.get("/parent/dashboard/attendance", {
    params: normalizeParams({ studentId })
  });
}

async function getParentDashboardWorksheetProgress({ studentId } = {}) {
  return apiClient.get("/parent/dashboard/worksheet-progress", {
    params: normalizeParams({ studentId })
  });
}

async function getParentDashboardEngagement({ studentId } = {}) {
  return apiClient.get("/parent/dashboard/engagement", {
    params: normalizeParams({ studentId })
  });
}

async function getParentDashboardAchievements({ studentId } = {}) {
  return apiClient.get("/parent/dashboard/achievements", {
    params: normalizeParams({ studentId })
  });
}

async function getParentDashboardReminders({ studentId, limit } = {}) {
  return apiClient.get("/parent/dashboard/reminders", {
    params: normalizeParams({ studentId, limit })
  });
}

async function getParentFinancialSummary({ studentId } = {}) {
  return apiClient.get("/parent/dashboard/financial-summary", {
    params: normalizeParams({ studentId })
  });
}

export {
  getParentDashboardAchievements,
  getParentDashboardAttendance,
  getParentDashboardEngagement,
  getParentFinancialSummary,
  getParentDashboardOverview,
  getParentDashboardReminders,
  getParentDashboardWorksheetProgress
};