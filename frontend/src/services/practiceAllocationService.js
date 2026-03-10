import { apiClient } from "./apiClient";

/**
 * Get list of centers and their practice allocations for the current BP/Franchise
 */
export async function listCenterAllocations({ featureKey } = {}) {
  const response = await apiClient.get("/practice-allocations", {
    params: featureKey ? { feature: featureKey } : undefined
  });
  return response.data;
}

/**
 * Update allocation for a specific center
 * @param {Object} params
 * @param {number} params.centerId
 * @param {'PRACTICE'|'ABACUS_PRACTICE'} params.featureKey
 * @param {boolean} params.isEnabled
 * @param {number} params.allocatedSeats
 */
export async function updateCenterAllocation({ centerId, featureKey, isEnabled, allocatedSeats }) {
  const body = featureKey === "ABACUS_PRACTICE"
    ? { abacusPractice: allocatedSeats }
    : { practice: allocatedSeats };

  const response = await apiClient.patch(`/practice-allocations/${centerId}`, body);
  return response.data;
}

/**
 * Get own usage summary (how much is allocated vs used)
 */
export async function getOwnUsage() {
  const response = await apiClient.get("/practice-allocations/usage");
  return response.data;
}

/**
 * Get list of available centers that can receive allocations
 */
export async function listAvailableCenters() {
  const response = await apiClient.get("/practice-allocations/centers");
  return response.data;
}
