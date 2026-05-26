import { apiClient } from "./apiClient";

function normalizeParams(params = {}) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

async function getStudentDashboardOverview() {
  return apiClient.get("/student/dashboard/overview");
}

async function getStudentDashboardStreaks() {
  return apiClient.get("/student/dashboard/streaks");
}

async function getStudentDashboardAchievements() {
  return apiClient.get("/student/dashboard/achievements");
}

async function getStudentDashboardPracticeTrends() {
  return apiClient.get("/student/dashboard/practice-trends");
}

async function getStudentDashboardAttendanceTrends() {
  return apiClient.get("/student/dashboard/attendance-trends");
}

async function getStudentDashboardWeakTopics({ threshold, lookback } = {}) {
  return apiClient.get("/student/dashboard/weak-topics", {
    params: normalizeParams({ threshold, lookback })
  });
}

async function getStudentDashboardReminders({ limit } = {}) {
  return apiClient.get("/student/dashboard/reminders", {
    params: normalizeParams({ limit })
  });
}

async function getStudentFinancialSummary() {
  return apiClient.get("/student/dashboard/financial-summary");
}

export {
  getStudentDashboardAchievements,
  getStudentDashboardAttendanceTrends,
  getStudentFinancialSummary,
  getStudentDashboardOverview,
  getStudentDashboardPracticeTrends,
  getStudentDashboardReminders,
  getStudentDashboardStreaks,
  getStudentDashboardWeakTopics
};