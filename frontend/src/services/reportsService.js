import { apiClient } from "./apiClient";

async function getDashboardSummary(params = {}) {
  const response = await apiClient.get("/reports/dashboard-summary", { params });
  return response.data;
}

async function getHealthMetrics(params = {}) {
  const response = await apiClient.get("/reports/health-metrics", { params });
  return response.data;
}

async function getRevenueSummary(params = {}) {
  const response = await apiClient.get("/reports/revenue/summary", { params });
  return response.data;
}

async function getRevenueByType(params = {}) {
  const response = await apiClient.get("/reports/revenue/by-type", { params });
  return response.data;
}

async function getMonthlyRevenue(params = {}) {
  const response = await apiClient.get("/reports/revenue/monthly", { params });
  return response.data;
}

async function getRevenueByBusinessPartner(params = {}) {
  const response = await apiClient.get("/reports/revenue/by-business-partner", { params });
  return response.data;
}

async function getRevenueByCenter(params = {}) {
  const response = await apiClient.get("/reports/revenue/by-center", { params });
  return response.data;
}

async function getFeesPendingInstallments(params = {}) {
  const response = await apiClient.get("/reports/fees/pending-installments", { params });
  return response.data;
}

async function getFeesStudentWise(params = {}) {
  const response = await apiClient.get("/reports/fees/student-wise", { params });
  return response.data;
}

async function getFeesMonthlyDues(params = {}) {
  const response = await apiClient.get("/reports/fees/monthly-dues", { params });
  return response.data;
}

async function getFeesReminders(params = {}) {
  const response = await apiClient.get("/reports/fees/reminders", { params });
  return response.data;
}

export {
  getDashboardSummary,
  getHealthMetrics,
  getRevenueSummary,
  getRevenueByType,
  getMonthlyRevenue,
  getRevenueByBusinessPartner,
  getRevenueByCenter,
  getFeesPendingInstallments,
  getFeesStudentWise,
  getFeesMonthlyDues,
  getFeesReminders
};
