import { prisma } from "../../lib/prisma.js";
import { recordAudit } from "../../utils/audit.js";

const CAPACITY_ENTITY_TYPE = "CENTER_CAPACITY";
const CAPACITY_AUDIT_ACTIONS = {
  UPDATED: "CENTER_CAPACITY_UPDATED",
  LIMIT_BLOCKED: "CENTER_CAPACITY_LIMIT_BLOCKED",
  OVERALLOCATED: "CENTER_CAPACITY_OVERALLOCATED"
};

async function recordCenterCapacityAudit({ tenantId, userId, role, action, centerId, metadata }) {
  await recordAudit(
    {
      tenantId,
      userId: userId || null,
      role: role || null,
      action,
      entityType: CAPACITY_ENTITY_TYPE,
      entityId: centerId || null,
      metadata: metadata || null
    },
    { strict: false }
  );
}

async function listCenterCapacityAuditHistory({ tenantId, centerId, limit = 10, tx = prisma }) {
  return tx.auditLog.findMany({
    where: {
      tenantId,
      entityType: CAPACITY_ENTITY_TYPE,
      entityId: centerId
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      action: true,
      createdAt: true,
      role: true,
      metadata: true,
      user: {
        select: {
          id: true,
          username: true,
          email: true
        }
      }
    }
  });
}

export {
  CAPACITY_AUDIT_ACTIONS,
  CAPACITY_ENTITY_TYPE,
  listCenterCapacityAuditHistory,
  recordCenterCapacityAudit
};