import { apiClient } from "./apiClient";

// ── Center intelligence ─────────────────────────────────────────────
export async function getCenterIntelDashboard() {
  const response = await apiClient.get("/center/intel/dashboard");
  return response.data;
}

export async function getCenterHealthScore() {
  const response = await apiClient.get("/center/intel/health");
  return response.data;
}

export async function getCenterTeacherWorkload() {
  const response = await apiClient.get("/center/intel/teacher-workload");
  return response.data;
}

export async function getCenterAnomalies() {
  const response = await apiClient.get("/center/intel/anomalies");
  return response.data;
}

export async function getCenterFeePulse() {
  const response = await apiClient.get("/center/intel/fee-pulse");
  return response.data;
}

// ── Franchise intelligence ──────────────────────────────────────────
export async function getFranchiseNetworkPulse() {
  const response = await apiClient.get("/franchise/intel/network-pulse");
  return response.data;
}

// ── BP intelligence ─────────────────────────────────────────────────
export async function getBpNetworkPulse() {
  const response = await apiClient.get("/partner/intel/network-pulse");
  return response.data;
}

// ── Superadmin intelligence ─────────────────────────────────────────
export async function getSuperadminNetworkPulse() {
  const response = await apiClient.get("/superadmin/intel/network-pulse");
  return response.data;
}
