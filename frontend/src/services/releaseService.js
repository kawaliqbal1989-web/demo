import { apiClient } from "./apiClient";

export async function getWaveStatus() {
  const res = await apiClient.get("/superadmin/release/waves");
  return res.data?.data?.waves ?? [];
}

export async function getFeatureStatus() {
  const res = await apiClient.get("/superadmin/release/features");
  return res.data?.data?.features ?? {};
}

export async function toggleWave(waveKey, enabled) {
  const res = await apiClient.patch(`/superadmin/release/waves/${waveKey}`, { enabled });
  return res.data?.data;
}

export async function getDeployInfo() {
  const res = await apiClient.get("/superadmin/release/deploy-info");
  return res.data?.data;
}

export async function getMigrationSequence(wave) {
  const params = wave ? { wave } : {};
  const res = await apiClient.get("/superadmin/release/migrations", { params });
  return res.data?.data;
}
