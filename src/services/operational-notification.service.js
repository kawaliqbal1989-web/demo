import { prisma } from "../lib/prisma.js";
import {
  countOperationalTargets,
  createOperationalEvent,
  createOperationalTargets as createOperationalTargetsRecords,
  deleteOperationalNotificationsByIds,
  expireOperationalNotifications,
  findOperationalEventByActiveFingerprint,
  findOperationalNotificationById,
  findOperationalNotificationIdsForCleanup,
  findOperationalTargetIdsForMarkAll,
  findRecipientOperationalTarget,
  findTargetsByNotificationAndKeys,
  listOperationalNotificationTargets,
  listOperationalTargetsForNotification,
  markOperationalTargetRead,
  markOperationalTargetsReadByIds,
  reopenOperationalTargets,
  updateOperationalEvent,
  updateOperationalTarget
} from "./operational-notification.repository.js";

const SEVERITY_RANK = {
  INFO: 0,
  WARNING: 1,
  HIGH: 2,
  CRITICAL: 3
};

const OPERATIONAL_SEVERITIES = ["CRITICAL", "HIGH", "WARNING", "INFO"];
const OPERATIONAL_CATEGORIES = ["WORKFLOW", "RISK", "FINANCE", "ACADEMIC", "OPERATIONS", "SYSTEM"];

function createOperationalNotificationError(message, {
  statusCode = 400,
  errorCode = "OPERATIONAL_NOTIFICATION_ERROR",
  details
} = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

function getDb(dbClient) {
  return dbClient || prisma;
}

async function withOptionalTransaction(dbClient, operation) {
  if (dbClient) {
    return operation(dbClient);
  }

  return prisma.$transaction((tx) => operation(tx));
}

function isUniqueConstraintError(error) {
  return String(error?.code || "").toUpperCase() === "P2002";
}

function normalizeDate(value, fallback = null) {
  if (value === undefined) {
    return fallback;
  }

  if (value === null) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw createOperationalNotificationError("Invalid date value provided.", {
      statusCode: 400,
      errorCode: "OPERATIONAL_NOTIFICATION_INVALID_DATE",
      details: { value }
    });
  }

  return date;
}

function validateRequiredString(value, fieldName) {
  if (!value || typeof value !== "string") {
    throw createOperationalNotificationError(`${fieldName} is required.`, {
      statusCode: 400,
      errorCode: "OPERATIONAL_NOTIFICATION_VALIDATION_ERROR",
      details: { fieldName }
    });
  }
}

function hasSeverityEscalated(previousSeverity, nextSeverity) {
  return (SEVERITY_RANK[nextSeverity] ?? -1) > (SEVERITY_RANK[previousSeverity] ?? -1);
}

function normalizeTarget(target, defaults = {}) {
  const recipientUserId = target?.recipientUserId;
  const recipientRole = target?.recipientRole || target?.role;
  const targetKey = target?.targetKey || `${recipientUserId}:${recipientRole}`;

  validateRequiredString(recipientUserId, "recipientUserId");
  validateRequiredString(recipientRole, "recipientRole");
  validateRequiredString(targetKey, "targetKey");

  return {
    tenantId: defaults.tenantId,
    notificationId: defaults.notificationId,
    recipientUserId,
    recipientRole,
    businessPartnerId: target.businessPartnerId ?? defaults.businessPartnerId ?? null,
    franchiseId: target.franchiseId ?? defaults.franchiseId ?? null,
    centerId: target.centerId ?? defaults.centerId ?? null,
    targetKey,
    deliveredAt: normalizeDate(target.deliveredAt, defaults.deliveredAt),
    actionPathOverride: target.actionPathOverride ?? null,
    metadata: target.metadata ?? null
  };
}

function dedupeTargets(targets, defaults = {}) {
  const byKey = new Map();
  for (const target of targets || []) {
    const normalized = normalizeTarget(target, defaults);
    byKey.set(normalized.targetKey, normalized);
  }
  return Array.from(byKey.values());
}

function buildNotificationUpdateData(payload, triggeredAt) {
  return {
    businessPartnerId: payload.businessPartnerId,
    franchiseId: payload.franchiseId ?? null,
    centerId: payload.centerId ?? null,
    type: payload.type,
    category: payload.category,
    severity: payload.severity,
    status: "ACTIVE",
    title: payload.title,
    message: payload.message,
    metricKey: payload.metricKey ?? null,
    thresholdValue: payload.thresholdValue ?? null,
    observedValue: payload.observedValue ?? null,
    deltaPercent: payload.deltaPercent ?? null,
    sourceKind: payload.sourceKind,
    sourceSnapshotDate: payload.sourceSnapshotDate ?? null,
    sourceWindowKey: payload.sourceWindowKey ?? null,
    fingerprint: payload.fingerprint,
    cooldownUntil: payload.cooldownUntil ?? null,
    lastTriggeredAt: triggeredAt,
    resolvedAt: null,
    expiresAt: payload.expiresAt ?? null,
    deepLinkPath: payload.deepLinkPath ?? null,
    metadata: payload.metadata ?? null
  };
}

function normalizeEventPayload(payload = {}) {
  validateRequiredString(payload.tenantId, "tenantId");
  validateRequiredString(payload.businessPartnerId, "businessPartnerId");
  validateRequiredString(payload.type, "type");
  validateRequiredString(payload.severity, "severity");
  validateRequiredString(payload.title, "title");
  validateRequiredString(payload.message, "message");
  validateRequiredString(payload.sourceKind, "sourceKind");
  validateRequiredString(payload.fingerprint, "fingerprint");

  const triggeredAt = normalizeDate(payload.triggeredAt, new Date());

  return {
    tenantId: payload.tenantId,
    businessPartnerId: payload.businessPartnerId,
    franchiseId: payload.franchiseId ?? null,
    centerId: payload.centerId ?? null,
    type: payload.type,
    category: payload.category || "OPERATIONS",
    severity: payload.severity,
    title: payload.title,
    message: payload.message,
    metricKey: payload.metricKey ?? null,
    thresholdValue: payload.thresholdValue ?? null,
    observedValue: payload.observedValue ?? null,
    deltaPercent: payload.deltaPercent ?? null,
    sourceKind: payload.sourceKind,
    sourceSnapshotDate: normalizeDate(payload.sourceSnapshotDate, null),
    sourceWindowKey: payload.sourceWindowKey ?? null,
    fingerprint: payload.fingerprint,
    activeFingerprint: payload.activeFingerprint || payload.fingerprint,
    cooldownUntil: normalizeDate(payload.cooldownUntil, null),
    firstTriggeredAt: normalizeDate(payload.firstTriggeredAt, triggeredAt),
    lastTriggeredAt: triggeredAt,
    expiresAt: normalizeDate(payload.expiresAt, null),
    deepLinkPath: payload.deepLinkPath ?? null,
    metadata: payload.metadata ?? null,
    targets: Array.isArray(payload.targets) ? payload.targets : []
  };
}

function formatNotificationItem(targetRecord) {
  const notification = targetRecord.notification;
  const franchiseLabel = notification.franchise?.displayName || notification.franchise?.name || notification.franchise?.code || null;
  const centerLabel = notification.center?.displayName || notification.center?.name || notification.center?.code || null;

  return {
    targetId: targetRecord.id,
    notificationId: notification.id,
    tenantId: notification.tenantId,
    recipientUserId: targetRecord.recipientUserId,
    recipientRole: targetRecord.recipientRole,
    targetKey: targetRecord.targetKey,
    type: notification.type,
    category: notification.category,
    severity: notification.severity,
    status: notification.status,
    title: notification.title,
    message: notification.message,
    metricKey: notification.metricKey,
    thresholdValue: notification.thresholdValue,
    observedValue: notification.observedValue,
    deltaPercent: notification.deltaPercent,
    sourceKind: notification.sourceKind,
    sourceSnapshotDate: notification.sourceSnapshotDate,
    sourceWindowKey: notification.sourceWindowKey,
    fingerprint: notification.fingerprint,
    activeFingerprint: notification.activeFingerprint,
    businessPartnerId: targetRecord.businessPartnerId || notification.businessPartnerId,
    franchiseId: targetRecord.franchiseId || notification.franchiseId,
    centerId: targetRecord.centerId || notification.centerId,
    franchiseLabel,
    centerLabel,
    cooldownUntil: notification.cooldownUntil,
    firstTriggeredAt: notification.firstTriggeredAt,
    lastTriggeredAt: notification.lastTriggeredAt,
    resolvedAt: notification.resolvedAt,
    expiresAt: notification.expiresAt,
    occurrenceCount: notification.occurrenceCount,
    deepLinkPath: targetRecord.actionPathOverride || notification.deepLinkPath,
    metadata: notification.metadata,
    targetMetadata: targetRecord.metadata,
    readAt: targetRecord.readAt,
    deliveredAt: targetRecord.deliveredAt,
    reopenedAt: targetRecord.reopenedAt,
    dismissedAt: targetRecord.dismissedAt,
    lastSeenAt: targetRecord.lastSeenAt,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
    targetCreatedAt: targetRecord.createdAt,
    targetUpdatedAt: targetRecord.updatedAt,
    isUnread: !targetRecord.readAt && !targetRecord.dismissedAt
  };
}

async function createOperationalTargets(input, dbClient) {
  const tenantId = input?.tenantId;
  const notificationId = input?.notificationId;
  validateRequiredString(tenantId, "tenantId");
  validateRequiredString(notificationId, "notificationId");

  const normalizedTargets = dedupeTargets(input.targets, {
    tenantId,
    notificationId,
    businessPartnerId: input.businessPartnerId,
    franchiseId: input.franchiseId,
    centerId: input.centerId,
    deliveredAt: normalizeDate(input.deliveredAt, new Date())
  });

  if (!normalizedTargets.length) {
    return [];
  }

  const existingTargets = await findTargetsByNotificationAndKeys(
    {
      tenantId,
      notificationId,
      targetKeys: normalizedTargets.map((target) => target.targetKey)
    },
    dbClient
  );

  const existingByKey = new Map(existingTargets.map((target) => [target.targetKey, target]));
  const createRecords = [];
  const updates = [];

  for (const target of normalizedTargets) {
    const existing = existingByKey.get(target.targetKey);
    if (!existing) {
      createRecords.push({
        tenantId,
        notificationId,
        recipientUserId: target.recipientUserId,
        recipientRole: target.recipientRole,
        businessPartnerId: target.businessPartnerId,
        franchiseId: target.franchiseId,
        centerId: target.centerId,
        targetKey: target.targetKey,
        deliveredAt: target.deliveredAt,
        actionPathOverride: target.actionPathOverride,
        metadata: target.metadata
      });
      continue;
    }

    updates.push(
      updateOperationalTarget(
        {
          targetId: existing.id,
          data: {
            recipientUserId: target.recipientUserId,
            recipientRole: target.recipientRole,
            businessPartnerId: target.businessPartnerId,
            franchiseId: target.franchiseId,
            centerId: target.centerId,
            actionPathOverride: target.actionPathOverride,
            metadata: target.metadata
          }
        },
        dbClient
      )
    );
  }

  if (createRecords.length) {
    await createOperationalTargetsRecords(createRecords, dbClient);
  }

  if (updates.length) {
    await Promise.all(updates);
  }

  return listOperationalTargetsForNotification({ tenantId, notificationId }, dbClient);
}

async function reopenTargetsOnEscalation({ tenantId, notificationId, targets }, dbClient) {
  const normalizedTargets = dedupeTargets(targets, {
    tenantId,
    notificationId
  });

  const reopenedAt = new Date();
  await reopenOperationalTargets(
    {
      tenantId,
      notificationId,
      targetKeys: normalizedTargets.map((target) => target.targetKey),
      reopenedAt
    },
    dbClient
  );

  return listOperationalTargetsForNotification({ tenantId, notificationId }, dbClient);
}

async function updateExistingOperationalEvent(existing, normalized, tx) {
  const escalated = hasSeverityEscalated(existing.severity, normalized.severity);
  const suppressed = !escalated && existing.cooldownUntil && existing.cooldownUntil > normalized.lastTriggeredAt;

  const updated = await updateOperationalEvent(
    {
      tenantId: normalized.tenantId,
      notificationId: existing.id,
      data: {
        ...buildNotificationUpdateData(normalized, normalized.lastTriggeredAt),
        activeFingerprint: normalized.activeFingerprint,
        occurrenceCount: {
          increment: 1
        }
      }
    },
    tx
  );

  let targets = [];
  if (normalized.targets.length) {
    targets = await createOperationalTargets(
      {
        tenantId: normalized.tenantId,
        notificationId: updated.id,
        businessPartnerId: normalized.businessPartnerId,
        franchiseId: normalized.franchiseId,
        centerId: normalized.centerId,
        targets: normalized.targets,
        deliveredAt: normalized.lastTriggeredAt
      },
      tx
    );

    if (escalated) {
      targets = await reopenTargetsOnEscalation(
        {
          tenantId: normalized.tenantId,
          notificationId: updated.id,
          targets: normalized.targets
        },
        tx
      );
    }
  }

  const notification = await findOperationalNotificationById(
    {
      tenantId: normalized.tenantId,
      notificationId: updated.id
    },
    tx
  );

  return {
    created: false,
    deduped: true,
    suppressed: Boolean(suppressed),
    escalated,
    notification,
    targets
  };
}

async function createOrUpdateOperationalEvent(payload, dbClient) {
  const normalized = normalizeEventPayload(payload);

  async function execute(tx) {
    const existing = await findOperationalEventByActiveFingerprint(
      {
        tenantId: normalized.tenantId,
        activeFingerprint: normalized.activeFingerprint
      },
      tx
    );

    if (existing) {
      return updateExistingOperationalEvent(existing, normalized, tx);
    }

    const created = await createOperationalEvent(
      {
        tenantId: normalized.tenantId,
        businessPartnerId: normalized.businessPartnerId,
        franchiseId: normalized.franchiseId,
        centerId: normalized.centerId,
        type: normalized.type,
        category: normalized.category,
        severity: normalized.severity,
        status: "ACTIVE",
        title: normalized.title,
        message: normalized.message,
        metricKey: normalized.metricKey,
        thresholdValue: normalized.thresholdValue,
        observedValue: normalized.observedValue,
        deltaPercent: normalized.deltaPercent,
        sourceKind: normalized.sourceKind,
        sourceSnapshotDate: normalized.sourceSnapshotDate,
        sourceWindowKey: normalized.sourceWindowKey,
        fingerprint: normalized.fingerprint,
        activeFingerprint: normalized.activeFingerprint,
        cooldownUntil: normalized.cooldownUntil,
        firstTriggeredAt: normalized.firstTriggeredAt,
        lastTriggeredAt: normalized.lastTriggeredAt,
        occurrenceCount: 1,
        expiresAt: normalized.expiresAt,
        deepLinkPath: normalized.deepLinkPath,
        metadata: normalized.metadata
      },
      tx
    );

    const targets = normalized.targets.length
      ? await createOperationalTargets(
          {
            tenantId: normalized.tenantId,
            notificationId: created.id,
            businessPartnerId: normalized.businessPartnerId,
            franchiseId: normalized.franchiseId,
            centerId: normalized.centerId,
            targets: normalized.targets,
            deliveredAt: normalized.lastTriggeredAt
          },
          tx
        )
      : [];

    const notification = await findOperationalNotificationById(
      {
        tenantId: normalized.tenantId,
        notificationId: created.id
      },
      tx
    );

    return {
      created: true,
      deduped: false,
      suppressed: false,
      escalated: false,
      notification,
      targets
    };
  }

  try {
    return await withOptionalTransaction(dbClient, (tx) => execute(tx));
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    if (dbClient && typeof dbClient.$transaction !== "function") {
      throw error;
    }

    return withOptionalTransaction(dbClient, async (tx) => {
      const existing = await findOperationalEventByActiveFingerprint(
        {
          tenantId: normalized.tenantId,
          activeFingerprint: normalized.activeFingerprint
        },
        tx
      );

      if (!existing) {
        throw error;
      }

      return updateExistingOperationalEvent(existing, normalized, tx);
    });
  }
}

async function resolveOperationalEventByActiveFingerprint(
  {
    tenantId,
    activeFingerprint,
    resolvedAt = new Date(),
    status = "RESOLVED",
    metadata
  },
  dbClient
) {
  validateRequiredString(tenantId, "tenantId");
  validateRequiredString(activeFingerprint, "activeFingerprint");

  const normalizedResolvedAt = normalizeDate(resolvedAt, new Date());

  return withOptionalTransaction(dbClient, async (tx) => {
    const existing = await findOperationalEventByActiveFingerprint(
      {
        tenantId,
        activeFingerprint
      },
      tx
    );

    if (!existing) {
      return {
        resolved: false,
        notification: null,
        reason: "not_found"
      };
    }

    if (existing.status === status && existing.resolvedAt) {
      return {
        resolved: false,
        notification: existing,
        reason: "already_resolved"
      };
    }

    await updateOperationalEvent(
      {
        tenantId,
        notificationId: existing.id,
        data: {
          status,
          resolvedAt: normalizedResolvedAt,
          cooldownUntil: null,
          ...(metadata !== undefined ? { metadata } : {})
        }
      },
      tx
    );

    const notification = await findOperationalNotificationById(
      {
        tenantId,
        notificationId: existing.id
      },
      tx
    );

    return {
      resolved: true,
      notification,
      reason: null
    };
  });
}

async function markOperationalNotificationRead({ tenantId, notificationId, recipientUserId, readAt }, dbClient) {
  validateRequiredString(tenantId, "tenantId");
  validateRequiredString(notificationId, "notificationId");
  validateRequiredString(recipientUserId, "recipientUserId");

  const readTimestamp = normalizeDate(readAt, new Date());
  const existing = await findRecipientOperationalTarget(
    {
      tenantId,
      notificationId,
      recipientUserId
    },
    dbClient
  );

  if (!existing) {
    throw createOperationalNotificationError("Operational notification target not found.", {
      statusCode: 404,
      errorCode: "OPERATIONAL_NOTIFICATION_NOT_FOUND"
    });
  }

  if (existing.readAt) {
    return formatNotificationItem(existing);
  }

  const updated = await markOperationalTargetRead(
    {
      targetId: existing.id,
      readAt: readTimestamp,
      lastSeenAt: readTimestamp
    },
    dbClient
  );

  return formatNotificationItem(updated);
}

async function markAllOperationalNotificationsRead({ tenantId, recipientUserId, filters = {}, batchSize = 200 }, dbClient) {
  validateRequiredString(tenantId, "tenantId");
  validateRequiredString(recipientUserId, "recipientUserId");

  const readTimestamp = new Date();
  let updatedCount = 0;

  while (true) {
    const targets = await findOperationalTargetIdsForMarkAll(
      {
        tenantId,
        recipientUserId,
        filters,
        limit: batchSize
      },
      dbClient
    );

    if (!targets.length) {
      break;
    }

    const result = await markOperationalTargetsReadByIds(
      {
        targetIds: targets.map((target) => target.id),
        readAt: readTimestamp,
        lastSeenAt: readTimestamp
      },
      dbClient
    );

    updatedCount += result.count;

    if (targets.length < batchSize) {
      break;
    }
  }

  return {
    updatedCount,
    readAt: readTimestamp
  };
}

async function getOperationalUnreadCounts({ tenantId, recipientUserId, filters = {}, includeGroups = false }, dbClient) {
  validateRequiredString(tenantId, "tenantId");
  validateRequiredString(recipientUserId, "recipientUserId");

  const unreadFilters = {
    ...filters,
    unread: true,
    includeDismissed: false,
    status: filters.status || ["ACTIVE"]
  };

  const [totalUnread, criticalUnread, highUnread] = await Promise.all([
    countOperationalTargets({ tenantId, recipientUserId, filters: unreadFilters }, dbClient),
    countOperationalTargets({
      tenantId,
      recipientUserId,
      filters: {
        ...unreadFilters,
        severity: "CRITICAL"
      }
    }, dbClient),
    countOperationalTargets({
      tenantId,
      recipientUserId,
      filters: {
        ...unreadFilters,
        severity: "HIGH"
      }
    }, dbClient)
  ]);

  const response = {
    totalUnread,
    criticalUnread,
    highUnread
  };

  if (!includeGroups) {
    return response;
  }

  const bySeverity = {};
  const byCategory = {};

  const [severityCounts, categoryCounts] = await Promise.all([
    Promise.all(
      OPERATIONAL_SEVERITIES.map(async (severity) => [
        severity,
        await countOperationalTargets(
          {
            tenantId,
            recipientUserId,
            filters: {
              ...unreadFilters,
              severity
            }
          },
          dbClient
        )
      ])
    ),
    Promise.all(
      OPERATIONAL_CATEGORIES.map(async (category) => [
        category,
        await countOperationalTargets(
          {
            tenantId,
            recipientUserId,
            filters: {
              ...unreadFilters,
              category
            }
          },
          dbClient
        )
      ])
    )
  ]);

  for (const [severity, count] of severityCounts) {
    bySeverity[severity] = count;
  }

  for (const [category, count] of categoryCounts) {
    byCategory[category] = count;
  }

  response.grouped = {
    bySeverity,
    byCategory
  };

  return response;
}

async function listOperationalNotifications({ tenantId, recipientUserId, filters = {} }, dbClient) {
  validateRequiredString(tenantId, "tenantId");
  validateRequiredString(recipientUserId, "recipientUserId");

  const result = await listOperationalNotificationTargets(
    {
      tenantId,
      recipientUserId,
      filters
    },
    dbClient
  );

  const unreadCount = await countOperationalTargets(
    {
      tenantId,
      recipientUserId,
      filters: {
        ...filters,
        unread: true,
        includeDismissed: false,
        status: filters.status || ["ACTIVE"]
      }
    },
    dbClient
  );

  return {
    page: result.page,
    limit: result.limit,
    offset: result.offset,
    total: result.total,
    unreadCount,
    items: result.items.map(formatNotificationItem)
  };
}

async function cleanupOperationalNotifications(
  {
    tenantId,
    expiredRetentionDays = 30,
    resolvedRetentionDays = 90,
    batchSize = 200,
    now = new Date()
  },
  dbClient
) {
  validateRequiredString(tenantId, "tenantId");

  const normalizedNow = normalizeDate(now, new Date());
  const resolvedBefore = new Date(normalizedNow.getTime() - resolvedRetentionDays * 24 * 60 * 60 * 1000);
  const expiredBefore = new Date(normalizedNow.getTime() - expiredRetentionDays * 24 * 60 * 60 * 1000);

  const expiredResult = await expireOperationalNotifications(
    {
      tenantId,
      now: normalizedNow
    },
    dbClient
  );

  let deletedCount = 0;

  while (true) {
    const ids = await findOperationalNotificationIdsForCleanup(
      {
        tenantId,
        batchSize,
        resolvedBefore,
        expiredBefore
      },
      dbClient
    );

    if (!ids.length) {
      break;
    }

    const result = await deleteOperationalNotificationsByIds(
      {
        tenantId,
        notificationIds: ids
      },
      dbClient
    );

    deletedCount += result.count;

    if (ids.length < batchSize) {
      break;
    }
  }

  return {
    expiredCount: expiredResult.count,
    deletedCount,
    expiredRetentionDays,
    resolvedRetentionDays,
    batchSize,
    processedAt: normalizedNow
  };
}

export {
  createOperationalNotificationError,
  createOperationalTargets,
  reopenTargetsOnEscalation,
  createOrUpdateOperationalEvent,
  resolveOperationalEventByActiveFingerprint,
  markOperationalNotificationRead,
  markAllOperationalNotificationsRead,
  getOperationalUnreadCounts,
  listOperationalNotifications,
  cleanupOperationalNotifications
};