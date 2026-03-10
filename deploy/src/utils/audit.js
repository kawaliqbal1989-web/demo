import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

async function recordAudit({
  tenantId,
  userId = null,
  role = null,
  action,
  entityType,
  entityId = null,
  metadata = null
}, options = {}) {
  const { strict = false } = options;

  if (!tenantId || !action || !entityType) {
    if (strict) {
      const error = new Error("Missing required audit fields");
      error.statusCode = 500;
      error.errorCode = "AUDIT_WRITE_FAILED";
      throw error;
    }

    return;
  }

  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        role,
        action,
        entityType,
        entityId,
        metadata
      }
    });
  } catch (error) {
    logger.error("audit_write_failed", {
      action,
      entityType,
      entityId,
      tenantId,
      reason: error.message
    });

    if (strict) {
      const wrappedError = new Error("Critical audit write failed");
      wrappedError.statusCode = 500;
      wrappedError.errorCode = "AUDIT_WRITE_FAILED";
      throw wrappedError;
    }
  }
}

export { recordAudit };
