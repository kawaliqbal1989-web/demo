const STORAGE_KEY = "abacus_client_session_id";

function randomId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }

  // Fallback: good-enough randomness for session correlation (not security).
  return `sess_${Date.now()}_${Math.random().toString(16).slice(2)}_${Math.random().toString(16).slice(2)}`;
}

function getOrCreateClientSessionId() {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && typeof existing === "string" && existing.trim()) {
      return existing.trim();
    }

    const created = randomId();
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    // If storage is blocked, fall back to in-memory id per page load.
    return randomId();
  }
}

export { getOrCreateClientSessionId };
