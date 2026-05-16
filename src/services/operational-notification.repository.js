import { prisma } from "../lib/prisma.js";

const OPERATIONAL_NOTIFICATION_SELECT = {
  id: true,
  tenantId: true,
  businessPartnerId: true,
  franchiseId: true,
  centerId: true,
  type: true,
  category: true,
  severity: true,
  status: true,
  title: true,
  message: true,
  metricKey: true,
  thresholdValue: true,
  observedValue: true,
  deltaPercent: true,
  sourceKind: true,
  sourceSnapshotDate: true,
  sourceWindowKey: true,
  fingerprint: true,
  activeFingerprint: true,
  cooldownUntil: true,
  firstTriggeredAt: true,
  lastTriggeredAt: true,
  resolvedAt: true,
  expiresAt: true,
  occurrenceCount: true,
  deepLinkPath: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  franchise: {
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true
    }
  },
  center: {
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true
    }
  }
};

const OPERATIONAL_TARGET_SELECT = {
  id: true,
  tenantId: true,
  notificationId: true,
  recipientUserId: true,
  recipientRole: true,
  businessPartnerId: true,
  franchiseId: true,
  centerId: true,
  targetKey: true,
  readAt: true,
  deliveredAt: true,
  reopenedAt: true,
  dismissedAt: true,
  lastSeenAt: true,
  actionPathOverride: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  notification: {
    select: OPERATIONAL_NOTIFICATION_SELECT
  }
};

function getDb(dbClient) {
  return dbClient || prisma;
}

function pickDefined(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

function normalizeToArray(value) {
  if (!value && value !== 0) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizePagination(filters = {}) {
  const offsetRaw = Number(filters.offset);
  const hasOffset = Number.isFinite(offsetRaw) && offsetRaw >= 0;
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const page = hasOffset
    ? Math.floor(offsetRaw / limit) + 1
    : Math.max(1, Number(filters.page) || 1);
  const skip = hasOffset ? Math.floor(offsetRaw) : (page - 1) * limit;

  return { page, limit, skip };
}

function buildNotificationRelationWhere(filters = {}) {
  const where = {};
  const severityList = normalizeToArray(filters.severity).filter(Boolean);
  const categoryList = normalizeToArray(filters.category).filter(Boolean);
  const statusList = normalizeToArray(filters.status).filter(Boolean);

  if (severityList.length === 1) {
    where.severity = severityList[0];
  } else if (severityList.length > 1) {
    where.severity = { in: severityList };
  }

  if (categoryList.length === 1) {
    where.category = categoryList[0];
  } else if (categoryList.length > 1) {
    where.category = { in: categoryList };
  }

  if (statusList.length === 1) {
    where.status = statusList[0];
  } else if (statusList.length > 1) {
    where.status = { in: statusList };
  }

  if (filters.franchiseId) {
    where.franchiseId = filters.franchiseId;
  }

  if (filters.centerId) {
    where.centerId = filters.centerId;
  }

  if (filters.businessPartnerId) {
    where.businessPartnerId = filters.businessPartnerId;
  }

  return where;
}

function buildTargetWhere({ tenantId, recipientUserId, filters = {} }) {
  const where = {
    tenantId,
    recipientUserId
  };

  if (!filters.includeDismissed) {
    where.dismissedAt = null;
  }

  if (filters.notificationId) {
    where.notificationId = filters.notificationId;
  }

  if (String(filters.unread) === "true") {
    where.readAt = null;
    where.dismissedAt = null;
  } else if (String(filters.unread) === "false") {
    where.OR = filters.includeDismissed
      ? [{ readAt: { not: null } }, { dismissedAt: { not: null } }]
      : [{ readAt: { not: null } }];
  }

  const notificationWhere = buildNotificationRelationWhere(filters);
  if (Object.keys(notificationWhere).length > 0) {
    where.notification = notificationWhere;
  }

  return where;
}

async function findOperationalEventByActiveFingerprint({ tenantId, activeFingerprint }, dbClient) {
  if (!activeFingerprint) {
    return null;
  }

  const db = getDb(dbClient);
  return db.operationalNotification.findFirst({
    where: {
      tenantId,
      activeFingerprint
    },
    select: OPERATIONAL_NOTIFICATION_SELECT
  });
}

async function findOperationalNotificationById({ tenantId, notificationId }, dbClient) {
  const db = getDb(dbClient);
  return db.operationalNotification.findFirst({
    where: {
      id: notificationId,
      tenantId
    },
    select: {
      ...OPERATIONAL_NOTIFICATION_SELECT,
      targets: {
        select: {
          id: true,
          recipientUserId: true,
          recipientRole: true,
          targetKey: true,
          readAt: true,
          deliveredAt: true,
          reopenedAt: true,
          dismissedAt: true,
          lastSeenAt: true,
          actionPathOverride: true,
          metadata: true,
          createdAt: true,
          updatedAt: true
        }
      }
    }
  });
}

async function createOperationalEvent(data, dbClient) {
  const db = getDb(dbClient);
  return db.operationalNotification.create({
    data,
    select: OPERATIONAL_NOTIFICATION_SELECT
  });
}

async function updateOperationalEvent({ tenantId, notificationId, data }, dbClient) {
  const db = getDb(dbClient);
  return db.operationalNotification.update({
    where: {
      id: notificationId
    },
    data,
    select: OPERATIONAL_NOTIFICATION_SELECT
  });
}

async function findTargetsByNotificationAndKeys({ tenantId, notificationId, targetKeys }, dbClient) {
  const db = getDb(dbClient);
  return db.operationalNotificationTarget.findMany({
    where: {
      tenantId,
      notificationId,
      targetKey: {
        in: targetKeys
      }
    },
    select: {
      id: true,
      targetKey: true,
      readAt: true,
      deliveredAt: true,
      reopenedAt: true,
      dismissedAt: true,
      lastSeenAt: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

async function createOperationalTargets(records, dbClient) {
  if (!Array.isArray(records) || !records.length) {
    return { count: 0 };
  }

  const db = getDb(dbClient);
  return db.operationalNotificationTarget.createMany({
    data: records,
    skipDuplicates: true
  });
}

async function updateOperationalTarget({ targetId, data }, dbClient) {
  const db = getDb(dbClient);
  return db.operationalNotificationTarget.update({
    where: {
      id: targetId
    },
    data,
    select: OPERATIONAL_TARGET_SELECT
  });
}

async function listOperationalTargetsForNotification({ tenantId, notificationId }, dbClient) {
  const db = getDb(dbClient);
  return db.operationalNotificationTarget.findMany({
    where: {
      tenantId,
      notificationId
    },
    select: OPERATIONAL_TARGET_SELECT,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
}

async function reopenOperationalTargets({ tenantId, notificationId, targetKeys, reopenedAt }, dbClient) {
  const db = getDb(dbClient);
  return db.operationalNotificationTarget.updateMany({
    where: {
      tenantId,
      notificationId,
      ...(Array.isArray(targetKeys) && targetKeys.length
        ? {
            targetKey: {
              in: targetKeys
            }
          }
        : {}),
      OR: [{ readAt: { not: null } }, { dismissedAt: { not: null } }]
    },
    data: {
      readAt: null,
      dismissedAt: null,
      reopenedAt
    }
  });
}

async function findRecipientOperationalTarget({ tenantId, notificationId, recipientUserId }, dbClient) {
  const db = getDb(dbClient);
  return db.operationalNotificationTarget.findFirst({
    where: {
      tenantId,
      notificationId,
      recipientUserId
    },
    select: OPERATIONAL_TARGET_SELECT
  });
}

async function markOperationalTargetRead({ targetId, readAt, lastSeenAt }, dbClient) {
  const db = getDb(dbClient);
  return db.operationalNotificationTarget.update({
    where: {
      id: targetId
    },
    data: {
      readAt,
      lastSeenAt
    },
    select: OPERATIONAL_TARGET_SELECT
  });
}

async function findOperationalTargetIdsForMarkAll({ tenantId, recipientUserId, filters = {}, limit = 200 }, dbClient) {
  const db = getDb(dbClient);
  const where = buildTargetWhere({
    tenantId,
    recipientUserId,
    filters: {
      ...filters,
      unread: true,
      includeDismissed: false
    }
  });

  return db.operationalNotificationTarget.findMany({
    where,
    select: { id: true },
    take: limit,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
}

async function markOperationalTargetsReadByIds({ targetIds, readAt, lastSeenAt }, dbClient) {
  if (!Array.isArray(targetIds) || !targetIds.length) {
    return { count: 0 };
  }

  const db = getDb(dbClient);
  return db.operationalNotificationTarget.updateMany({
    where: {
      id: {
        in: targetIds
      }
    },
    data: {
      readAt,
      lastSeenAt
    }
  });
}

async function countOperationalTargets({ tenantId, recipientUserId, filters = {} }, dbClient) {
  const db = getDb(dbClient);
  return db.operationalNotificationTarget.count({
    where: buildTargetWhere({ tenantId, recipientUserId, filters })
  });
}

async function listOperationalNotificationTargets({ tenantId, recipientUserId, filters = {} }, dbClient) {
  const db = getDb(dbClient);
  const { page, limit, skip } = normalizePagination(filters);
  const sortBy = filters.sortBy === "createdAt" ? "createdAt" : "lastTriggeredAt";
  const sortOrder = String(filters.sortOrder).toLowerCase() === "asc" ? "asc" : "desc";

  const orderBy =
    sortBy === "createdAt"
      ? [{ notification: { createdAt: sortOrder } }, { notificationId: sortOrder }, { id: sortOrder }]
      : [{ notification: { lastTriggeredAt: sortOrder } }, { notificationId: sortOrder }, { id: sortOrder }];

  const where = buildTargetWhere({ tenantId, recipientUserId, filters });

  const [total, items] = await Promise.all([
    db.operationalNotificationTarget.count({ where }),
    db.operationalNotificationTarget.findMany({
      where,
      select: OPERATIONAL_TARGET_SELECT,
      orderBy,
      skip,
      take: limit
    })
  ]);

  return {
    page,
    limit,
    offset: skip,
    total,
    items
  };
}

async function expireOperationalNotifications({ tenantId, now }, dbClient) {
  const db = getDb(dbClient);
  return db.operationalNotification.updateMany({
    where: {
      tenantId,
      status: "ACTIVE",
      expiresAt: {
        not: null,
        lte: now
      }
    },
    data: {
      status: "EXPIRED",
      activeFingerprint: null,
      resolvedAt: now
    }
  });
}

async function findOperationalNotificationIdsForCleanup(
  { tenantId, batchSize, resolvedBefore, expiredBefore },
  dbClient
) {
  const db = getDb(dbClient);
  const records = await db.operationalNotification.findMany({
    where: {
      tenantId,
      OR: [
        {
          status: {
            in: ["RESOLVED", "SUPPRESSED"]
          },
          updatedAt: {
            lt: resolvedBefore
          },
          targets: {
            none: {
              readAt: null,
              dismissedAt: null
            }
          }
        },
        {
          status: "EXPIRED",
          updatedAt: {
            lt: expiredBefore
          },
          targets: {
            none: {
              readAt: null,
              dismissedAt: null
            }
          }
        }
      ]
    },
    select: {
      id: true
    },
    take: batchSize,
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }]
  });

  return records.map((record) => record.id);
}

async function deleteOperationalNotificationsByIds({ tenantId, notificationIds }, dbClient) {
  if (!Array.isArray(notificationIds) || !notificationIds.length) {
    return { count: 0 };
  }

  const db = getDb(dbClient);
  return db.operationalNotification.deleteMany({
    where: {
      tenantId,
      id: {
        in: notificationIds
      }
    }
  });
}

async function countNotificationsForFingerprint({ tenantId, activeFingerprint }, dbClient) {
  const db = getDb(dbClient);
  return db.operationalNotification.count({
    where: {
      tenantId,
      activeFingerprint
    }
  });
}

export {
  OPERATIONAL_NOTIFICATION_SELECT,
  OPERATIONAL_TARGET_SELECT,
  getDb,
  pickDefined,
  findOperationalEventByActiveFingerprint,
  findOperationalNotificationById,
  createOperationalEvent,
  updateOperationalEvent,
  findTargetsByNotificationAndKeys,
  createOperationalTargets,
  updateOperationalTarget,
  listOperationalTargetsForNotification,
  reopenOperationalTargets,
  findRecipientOperationalTarget,
  markOperationalTargetRead,
  findOperationalTargetIdsForMarkAll,
  markOperationalTargetsReadByIds,
  countOperationalTargets,
  listOperationalNotificationTargets,
  expireOperationalNotifications,
  findOperationalNotificationIdsForCleanup,
  deleteOperationalNotificationsByIds,
  countNotificationsForFingerprint
};