import { apiClient } from "./apiClient";

/**
 * Get the center's practice feature allocation status
 */
export async function getCenterPracticeFeatures() {
  const response = await apiClient.get("/center/practice-features");
  return response.data;
}

/**
 * List students with their practice feature assignments
 * @param {Object} params
 * @param {string} [params.featureKey] - Filter by PRACTICE or ABACUS_PRACTICE
 * @param {string} [params.query] - Filter by student name or admission number
 * @param {number} [params.limit]
 * @param {number} [params.offset]
 */
export async function listStudentsWithPracticeFeatures({ featureKey, query, limit, offset } = {}) {
  const response = await apiClient.get("/center/practice-features/students", {
    params: {
      ...(featureKey ? { feature: featureKey } : {}),
      ...(query ? { q: query } : {}),
      ...(typeof limit === "number" ? { limit } : {}),
      ...(typeof offset === "number" ? { offset } : {})
    }
  });
  return response.data;
}

/**
 * Assign a practice feature to a student
 * @param {Object} params
 * @param {number} params.studentId
 * @param {'PRACTICE'|'ABACUS_PRACTICE'} params.featureKey
 */
export async function assignStudentFeature({ studentId, featureKey }) {
  const response = await apiClient.post(`/center/students/${studentId}/practice-features`, { featureKey });
  return response.data;
}

/**
 * Remove a practice feature from a student
 * @param {Object} params
 * @param {number} params.studentId
 * @param {'PRACTICE'|'ABACUS_PRACTICE'} params.featureKey
 */
export async function unassignStudentFeature({ studentId, featureKey }) {
  const response = await apiClient.delete(`/center/students/${studentId}/practice-features/${featureKey}`);
  return response.data;
}
