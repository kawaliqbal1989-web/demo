import { recordAudit } from "../utils/audit.js";
import { logger } from "../lib/logger.js";

function auditAction(action, entityType, entityIdResolver = null) {
  return function auditMiddleware(req, res, next) {
    res.on("finish", () => {
      if (res.statusCode >= 400 || !req.auth?.tenantId) {
        return;
      }

      const entityId =
        typeof entityIdResolver === "function"
          ? entityIdResolver(req, res)
          : req.params.id || res.locals.entityId || null;

      void recordAudit({
        tenantId: req.auth.tenantId,
        userId: req.auth.userId,
        role: req.auth.role,
        action,
        entityType,
        entityId,
        metadata: {
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          ...(res.locals.auditMetadata && typeof res.locals.auditMetadata === "object" ? res.locals.auditMetadata : {})
        }
      }).catch((error) => {
        logger.error("audit_middleware_failed", {
          action,
          entityType,
          reason: error.message,
          path: req.originalUrl,
          method: req.method
        });
      });
    });

    next();
  };
}

export { auditAction };
