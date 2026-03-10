import { prisma } from "../lib/prisma.js";

function getDb(dbClient) {
  return dbClient || prisma;
}

function isMissingNotificationSchemaError(error) {
  // Only treat Prisma "table/column does not exist" errors as missing-schema.
  // P2021 = table does not exist, P2022 = column does not exist.
  const code = String(error?.code || "").trim().toUpperCase();
  return code === "P2021" || code === "P2022";
}

async function createNotification(payload, dbClient) {
  const db = getDb(dbClient);

  try {
    const created = await db.notification.create({
      data: {
        tenantId: payload.tenantId,
        recipientUserId: payload.recipientUserId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        entityType: payload.entityType || null,
        entityId: payload.entityId || null
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

    return created;
  } catch (error) {
    if (!isMissingNotificationSchemaError(error)) {
      throw error;
    }

    return {
      id: "",
      type: payload.type,
      title: payload.title,
      message: payload.message,
      isRead: false,
      createdAt: new Date().toISOString()
    };
  }
}

async function createBulkNotification(payloads, dbClient) {
  if (!Array.isArray(payloads) || !payloads.length) {
    return { count: 0 };
  }

  const db = getDb(dbClient);

  try {
    const result = await db.notification.createMany({
      data: payloads.map((payload) => ({
        tenantId: payload.tenantId,
        recipientUserId: payload.recipientUserId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        entityType: payload.entityType || null,
        entityId: payload.entityId || null
      }))
    });

    return result;
  } catch (error) {
    if (!isMissingNotificationSchemaError(error)) {
      throw error;
    }
    return { count: 0 };
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

  const where = {
    recipientUserId: userId,
    tenantId
  };

  if (String(filters.unread) === "true") {
    where.isRead = false;
  }

  let total = 0;
  let items = [];
  let unreadCount = 0;

  try {
    [total, items, unreadCount] = await Promise.all([
      db.notification.count({ where }),
      db.notification.findMany({
        where,
        orderBy: {
          createdAt: "desc"
        },
        skip,
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          isRead: true,
          createdAt: true,
          entityType: true,
          entityId: true
        }
      }),
      db.notification.count({
        where: {
          recipientUserId: userId,
          tenantId,
          isRead: false
        }
      })
    ]);
  } catch (error) {
    if (!isMissingNotificationSchemaError(error)) {
      throw error;
    }
  }

  return {
    page,
    limit,
    offset: skip,
    total,
    unreadCount,
    items
  };
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
