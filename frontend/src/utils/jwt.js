function parseJwtPayload(token) {
  if (!token) {
    return null;
  }

  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function getRoleFromToken(token) {
  return parseJwtPayload(token)?.role || null;
}

function getTenantFromToken(token) {
  return parseJwtPayload(token)?.tenantId || null;
}

function getUsernameFromToken(token) {
  return parseJwtPayload(token)?.username || null;
}

function getUserIdFromToken(token) {
  const payload = parseJwtPayload(token);
  return payload?.userId || payload?.sub || payload?.id || null;
}

function getStudentIdFromToken(token) {
  const payload = parseJwtPayload(token);
  return payload?.studentId || null;
}

function isTokenExpired(token) {
  const payload = parseJwtPayload(token);
  if (!payload?.exp) {
    return true;
  }

  return payload.exp * 1000 <= Date.now();
}

function isTokenExpiringSoon(token, thresholdMs = 60000) {
  const payload = parseJwtPayload(token);
  if (!payload?.exp) {
    return true;
  }

  return payload.exp * 1000 <= Date.now() + thresholdMs;
}

export {
  parseJwtPayload,
  getRoleFromToken,
  getTenantFromToken,
  getUsernameFromToken,
  getUserIdFromToken,
  getStudentIdFromToken,
  isTokenExpired,
  isTokenExpiringSoon
};
