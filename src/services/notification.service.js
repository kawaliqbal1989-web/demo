import { prisma } from "../lib/prisma.js";

function getDb(dbClient) {
  return dbClient || prisma;
}

function isMissingNotificationSchemaError(error) {
  // Only treat Prisma "table/column does not exist" errors as missing-schema.
  // P2021 = table does not exist, P2022 = column does not exist.
  // Also treat PrismaClientValidationError (unknown field) as missing-schema.
  const code = String(error?.code || "").trim().toUpperCase();
  if (code === "P2021" || code === "P2022") return true;
  if (error?.constructor?.name === "PrismaClientValidationError") return true;
  if (String(error?.message || "").includes("Unknown field")) return true;
  return false;
}

async function createNotification(payload, dbClient) {
  const db = getDb(dbClient);

  try {
    return await db.notification.create({
      data: {
        tenantId: payload.tenantId,
        recipientUserId: payload.recipientUserId,
        type: payload.type,
        priority: payload.priority || "NORMAL",
        category: payload.category || "SYSTEM",
        title: payload.title,
        message: payload.message,
        entityType: payload.entityType || null,
        entityId: payload.entityId || null,
        actionUrl: payload.actionUrl || null,
        expiresAt: payload.expiresAt || null
      },
      select: {
        id: true, type: true, priority: true, category: true,
        title: true, message: true, isRead: true, actionUrl: true, createdAt: true
      }
    });
  } catch (error) {
    if (!isMissingNotificationSchemaError(error)) throw error;
    // Fallback: create with base fields only
    try {
      return await db.notification.create({
        data: {
          tenantId: payload.tenantId,
          recipientUserId: payload.recipientUserId,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          entityType: payload.entityType || null,
          entityId: payload.entityId || null
        },
        select: { id: true, type: true, title: true, message: true, isRead: true, createdAt: true }
      });
    } catch (err2) {
      if (!isMissingNotificationSchemaError(err2)) throw err2;
      return { id: "", type: payload.type, title: payload.title, message: payload.message, isRead: false, createdAt: new Date().toISOString() };
    }
  }
}

async function createBulkNotification(payloads, dbClient) {
  if (!Array.isArray(payloads) || !payloads.length) {
    return { count: 0 };
  }

  const db = getDb(dbClient);

  try {
    return await db.notification.createMany({
      data: payloads.map((p) => ({
        tenantId: p.tenantId,
        recipientUserId: p.recipientUserId,
        type: p.type,
        priority: p.priority || "NORMAL",
        category: p.category || "SYSTEM",
        title: p.title,
        message: p.message,
        entityType: p.entityType || null,
        entityId: p.entityId || null,
        actionUrl: p.actionUrl || null,
        expiresAt: p.expiresAt || null
      }))
    });
  } catch (error) {
    if (!isMissingNotificationSchemaError(error)) throw error;
    // Fallback: create with base fields only
    try {
      return await db.notification.createMany({
        data: payloads.map((p) => ({
          tenantId: p.tenantId,
          recipientUserId: p.recipientUserId,
          type: p.type,
          title: p.title,
          message: p.message,
          entityType: p.entityType || null,
          entityId: p.entityId || null
        }))
      });
    } catch (err2) {
      if (!isMissingNotificationSchemaError(err2)) throw err2;
      return { count: 0 };
    }
  }
}

async function markAsRead(notificationId, userId, tenantId, dbClient) {
  const db = getDb(dbClient);

  let existing;
  try {
    existing = await db.notification.findFirst({
      where: {
        id: notificationId,
        recipientUserId: userId,
        tenantId
      },
      select: {
        id: true,
        isRead: true,
        createdAt: true,
        type: true,
        title: true,
        message: true
      }
    });
  } catch (error) {
    if (!isMissingNotificationSchemaError(error)) {
      throw error;
    }
    return {
      id: notificationId,
      type: "SYSTEM_BROADCAST",
      title: "Notification",
      message: "",
      isRead: true,
      createdAt: new Date().toISOString()
    };
  }

  if (!existing) {
    const error = new Error("Notification not found");
    error.statusCode = 404;
    error.errorCode = "NOTIFICATION_NOT_FOUND";
    throw error;
  }

  if (existing.isRead) {
    return existing;
  }

  let updated;
  try {
    updated = await db.notification.update({
      where: {
        id: notificationId
      },
      data: {
        isRead: true
      },
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        isRead: true,
        createdAt: true
      }
    });
  } catch (error) {
    if (!isMissingNotificationSchemaError(error)) {
      throw error;
    }
    return {
      id: notificationId,
      type: existing.type,
      title: existing.title,
      message: existing.message,
      isRead: true,
      createdAt: existing.createdAt
    };
  }

  return updated;
}

async function markAllAsRead(userId, tenantId, dbClient) {
  const db = getDb(dbClient);

  try {
    return await db.notification.updateMany({
      where: {
        recipientUserId: userId,
        tenantId,
        isRead: false
      },
      data: {
        isRead: true
      }
    });
  } catch (error) {
    if (!isMissingNotificationSchemaError(error)) {
      throw error;
    }
    return { count: 0 };
  }
}

async function getUserNotifications(userId, tenantId, filters = {}, dbClient) {
  const db = getDb(dbClient);
  const offsetRaw = Number(filters.offset);
  const hasOffset = Number.isFinite(offsetRaw) && offsetRaw >= 0;
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const page = hasOffset ? Math.floor(offsetRaw / limit) + 1 : Math.max(1, Number(filters.page) || 1);
  const skip = hasOffset ? Math.floor(offsetRaw) : (page - 1) * limit;

  const baseWhere = { recipientUserId: userId, tenantId };
  if (String(filters.unread) === "true") baseWhere.isRead = false;

  // New fields may not exist before migration — build where cautiously
  const where = { ...baseWhere };
  if (filters.category) where.category = filters.category;
  if (filters.priority) where.priority = filters.priority;

  const extendedSelect = {
    id: true, type: true, priority: true, category: true,
    title: true, message: true, isRead: true, createdAt: true,
    entityType: true, entityId: true, actionUrl: true, expiresAt: true
  };

  const baseSelect = {
    id: true, type: true, title: true, message: true,
    isRead: true, createdAt: true, entityType: true, entityId: true
  };

  let total = 0;
  let items = [];
  let unreadCount = 0;

  async function doFetch(select, filterWhere) {
    return Promise.all([
      db.notification.count({ where: filterWhere }),
      db.notification.findMany({
        where: filterWhere, orderBy: { createdAt: "desc" },
        skip, take: limit, select
      }),
      db.notification.count({ where: { recipientUserId: userId, tenantId, isRead: false } })
    ]);
  }

  try {
    [total, items, unreadCount] = await doFetch(extendedSelect, where);
  } catch (error) {
    if (!isMissingNotificationSchemaError(error)) throw error;
    // Fallback: drop new fields from select and where
    try {
      [total, items, unreadCount] = await doFetch(baseSelect, baseWhere);
    } catch (err2) {
      if (!isMissingNotificationSchemaError(err2)) throw err2;
    }
  }

  return { page, limit, offset: skip, total, unreadCount, items };
}

async function findUsersByRoles(tenantId, roles, hierarchyNodeId = null, dbClient) {
  const db = getDb(dbClient);
  return db.authUser.findMany({
    where: {
      tenantId,
      isActive: true,
      role: {
        in: roles
      },
      ...(hierarchyNodeId ? { hierarchyNodeId } : {})
    },
    select: {
      id: true,
      role: true
    }
  });
}

export {
  createNotification,
  createBulkNotification,
  markAsRead,
  markAllAsRead,
  getUserNotifications,
  findUsersByRoles
};
