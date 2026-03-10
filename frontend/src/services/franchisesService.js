import { apiClient } from "./apiClient";

async function listFranchises({ limit = 20, offset = 0, q, status } = {}) {
  const response = await apiClient.get("/franchises", {
    params: {
      limit,
      offset,
      q: q || undefined,
      status: status || undefined
    }
  });

  return response.data;
}

async function createFranchise({
  name,
  displayName,
  status,
  phonePrimary,
  phoneAlternate,
  emailOfficial,
  emailSupport,
  websiteUrl,
  onboardingDate,
  whatsappEnabled,
  type,
  parentId,
  addressLine1,
  addressLine2,
  city,
  district,
  state,
  country,
  pincode,
  inheritBranding,
  logoUrl,
  password
} = {}) {
  const response = await apiClient.post("/franchises", {
    name,
    displayName: displayName || undefined,
    // Backend creates as ACTIVE always; caller can follow-up with update if needed.
    status: status || undefined,
    phonePrimary: phonePrimary || undefined,
    phoneAlternate: phoneAlternate || undefined,
    emailOfficial,
    emailSupport: emailSupport || undefined,
    websiteUrl: websiteUrl || undefined,
    onboardingDate: onboardingDate || undefined,
    whatsappEnabled: typeof whatsappEnabled === "boolean" ? whatsappEnabled : undefined,
    type: type || undefined,
    parentId: parentId || undefined,
    addressLine1: addressLine1 || undefined,
    addressLine2: addressLine2 || undefined,
    city: city || undefined,
    district: district || undefined,
    state: state || undefined,
    country: country || undefined,
    pincode: pincode || undefined,
    inheritBranding: typeof inheritBranding === "boolean" ? inheritBranding : undefined,
    logoUrl: logoUrl || undefined,
    password
  });

  return response.data;
}

async function updateFranchise({
  id,
  name,
  displayName,
  status,
  phonePrimary,
  phoneAlternate,
  emailOfficial,
  emailSupport,
  websiteUrl,
  onboardingDate,
  whatsappEnabled,
  inheritBranding,
  logoUrl,
  addressLine1,
  addressLine2,
  city,
  district,
  state,
  country,
  pincode,
  isActive
} = {}) {
  const response = await apiClient.patch(`/franchises/${id}`, {
    name: name || undefined,
    displayName: displayName === "" ? "" : displayName || undefined,
    status: status || undefined,
    phonePrimary: phonePrimary === "" ? "" : phonePrimary || undefined,
    phoneAlternate: phoneAlternate === "" ? "" : phoneAlternate || undefined,
    emailOfficial: emailOfficial || undefined,
    emailSupport: emailSupport === "" ? "" : emailSupport || undefined,
    websiteUrl: websiteUrl === "" ? "" : websiteUrl || undefined,
    onboardingDate: onboardingDate === "" ? null : onboardingDate || undefined,
    whatsappEnabled: typeof whatsappEnabled === "boolean" ? whatsappEnabled : undefined,
    inheritBranding: typeof inheritBranding === "boolean" ? inheritBranding : undefined,
    logoUrl: logoUrl === "" ? "" : logoUrl || undefined,
    addressLine1: addressLine1 === "" ? "" : addressLine1 || undefined,
    addressLine2: addressLine2 === "" ? "" : addressLine2 || undefined,
    city: city === "" ? "" : city || undefined,
    district: district === "" ? "" : district || undefined,
    state: state === "" ? "" : state || undefined,
    country: country === "" ? "" : country || undefined,
    pincode: pincode === "" ? "" : pincode || undefined,
    ...(typeof isActive === "boolean" ? { isActive } : {})
  });

  return response.data;
}

async function deleteFranchise(id) {
  const response = await apiClient.delete(`/franchises/${id}`);
  return response.data;
}

export { listFranchises, createFranchise, updateFranchise, deleteFranchise };
