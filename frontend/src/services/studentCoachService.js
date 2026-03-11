import { apiClient } from "./apiClient";

async function getCoachDashboard() {
  return apiClient.get("/student/coach/dashboard");
}

async function getDailyMission() {
  return apiClient.get("/student/coach/daily-mission");
}

async function getWeeklyPlan() {
  return apiClient.get("/student/coach/weekly-plan");
}

async function getReadiness() {
  return apiClient.get("/student/coach/readiness");
}

async function getPerformanceExplainer() {
  return apiClient.get("/student/coach/performance");
}

export {
  getCoachDashboard,
  getDailyMission,
  getWeeklyPlan,
  getReadiness,
  getPerformanceExplainer,
};
