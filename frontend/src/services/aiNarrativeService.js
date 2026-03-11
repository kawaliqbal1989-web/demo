import { apiClient } from "./apiClient";

export async function getStudentAiNarrative() {
  const { data } = await apiClient.get("/student/ai/narrative");
  return data;
}

export async function getTeacherAiNarrative() {
  const { data } = await apiClient.get("/teacher/ai/narrative");
  return data;
}

export async function getCenterAiNarrative() {
  const { data } = await apiClient.get("/center/ai/narrative");
  return data;
}

export async function getFranchiseAiNarrative() {
  const { data } = await apiClient.get("/franchise/ai/narrative");
  return data;
}

export async function getBpAiNarrative() {
  const { data } = await apiClient.get("/partner/ai/narrative");
  return data;
}

export async function getSuperadminAiNarrative() {
  const { data } = await apiClient.get("/superadmin/ai/narrative");
  return data;
}
