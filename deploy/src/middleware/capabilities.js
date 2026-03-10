import { sendError } from "../utils/api-response.js";
import { getRoleCapabilities } from "../utils/capabilities.js";

function requireCapability(...capabilities) {
  return function capabilityGuard(req, res, next) {
    const role = req.auth?.role;
    if (!role) {
      return sendError(res, 401, "Unauthorized", "AUTH_REQUIRED");
    }

    const caps = getRoleCapabilities(role);
    const allowed = capabilities.every((cap) => Boolean(caps?.[cap]));

    if (!allowed) {
      return sendError(res, 403, "Forbidden", "CAPABILITY_FORBIDDEN");
    }

    return next();
  };
}

export { requireCapability };
