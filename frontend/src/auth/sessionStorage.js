const MUST_CHANGE_KEY = "abacus_must_change_password";
const BRANDING_KEY = "abacus_branding";
const SUBSCRIPTION_BLOCKED_KEY = "abacus_subscription_blocked";
const CAPABILITIES_KEY = "abacus_capabilities";
const PARTNER_ID_KEY = "abacus_partner_id";
const FRANCHISE_ID_KEY = "abacus_franchise_id";

function getStoredMustChangePassword() {
  return localStorage.getItem(MUST_CHANGE_KEY) === "true";
}

function setStoredMustChangePassword(value) {
  localStorage.setItem(MUST_CHANGE_KEY, value ? "true" : "false");
}

function getStoredBranding() {
  try {
    const raw = sessionStorage.getItem(BRANDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStoredBranding(value) {
  try {
    if (!value) {
      sessionStorage.removeItem(BRANDING_KEY);
      return;
    }
    sessionStorage.setItem(BRANDING_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function clearStoredBranding() {
  try {
    sessionStorage.removeItem(BRANDING_KEY);
  } catch {
    // ignore
  }
}

function clearStoredMustChangePassword() {
  localStorage.removeItem(MUST_CHANGE_KEY);
}

function getStoredSubscriptionBlocked() {
  return localStorage.getItem(SUBSCRIPTION_BLOCKED_KEY) === "true";
}

function setStoredSubscriptionBlocked(value) {
  localStorage.setItem(SUBSCRIPTION_BLOCKED_KEY, value ? "true" : "false");
}

function clearStoredSubscriptionBlocked() {
  localStorage.removeItem(SUBSCRIPTION_BLOCKED_KEY);
}

function getStoredCapabilities() {
  const raw = localStorage.getItem(CAPABILITIES_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setStoredCapabilities(value) {
  if (!value) {
    localStorage.removeItem(CAPABILITIES_KEY);
    return;
  }

  localStorage.setItem(CAPABILITIES_KEY, JSON.stringify(value));
}

function clearStoredCapabilities() {
  localStorage.removeItem(CAPABILITIES_KEY);
}

function getStoredPartnerId() {
  return localStorage.getItem(PARTNER_ID_KEY) || null;
}

function setStoredPartnerId(value) {
  if (!value) {
    localStorage.removeItem(PARTNER_ID_KEY);
    return;
  }
  localStorage.setItem(PARTNER_ID_KEY, String(value));
}

function clearStoredPartnerId() {
  localStorage.removeItem(PARTNER_ID_KEY);
}

function getStoredFranchiseId() {
  return localStorage.getItem(FRANCHISE_ID_KEY) || null;
}

function setStoredFranchiseId(value) {
  if (!value) {
    localStorage.removeItem(FRANCHISE_ID_KEY);
    return;
  }
  localStorage.setItem(FRANCHISE_ID_KEY, String(value));
}

function clearStoredFranchiseId() {
  localStorage.removeItem(FRANCHISE_ID_KEY);
}

export {
  getStoredMustChangePassword,
  setStoredMustChangePassword,
  clearStoredMustChangePassword,
  getStoredBranding,
  setStoredBranding,
  clearStoredBranding,
  getStoredSubscriptionBlocked,
  setStoredSubscriptionBlocked,
  clearStoredSubscriptionBlocked,
  getStoredCapabilities,
  setStoredCapabilities,
  clearStoredCapabilities,
  getStoredPartnerId,
  setStoredPartnerId,
  clearStoredPartnerId,
  getStoredFranchiseId,
  setStoredFranchiseId,
  clearStoredFranchiseId
};
