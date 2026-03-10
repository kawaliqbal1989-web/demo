import { sendError } from "../utils/api-response.js";

const operationalRoles = ["SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER"];

function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    const currentRole = req.auth?.role;

    if (!currentRole || !roles.includes(currentRole)) {
      return sendError(res, 403, "Forbidden", "ROLE_FORBIDDEN");
    }

    return next();
  };
}

function requireSuperadmin() {
  return requireRole("SUPERADMIN");
}

function requireOperationalRoles() {
  return requireRole(...operationalRoles);
}

export { requireRole, requireSuperadmin, requireOperationalRoles };
