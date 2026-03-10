import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function parseIsoDateOnly(value) {
  if (!value) {
    return null;
  }

  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw createHttpError(400, "Invalid date format. Use YYYY-MM-DD", "INVALID_DATE_RANGE");
  }

  return new Date(`${text}T00:00:00.000Z`);
}

function addUtcDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

function redactMetadata(value) {
  const redactKeys = new Set([
    "password",
    "passwordHash",
    "access_token",
    "refresh_token",
    "refreshToken",
    "accessToken",
    "token",
    "authorization",
    "Authorization",
    "jwt",
    "secret",
    "apiKey"
  ]);

  const maxDepth = 6;

  function walk(node, depth) {
    if (depth > maxDepth) {
      return "[TRUNCATED]";
    }

    if (node === null || node === undefined) {
      return node;
    }

    if (Array.isArray(node)) {
      return node.map((item) => walk(item, depth + 1));
    }

    if (typeof node === "object") {
      const result = {};
      for (const [key, val] of Object.entries(node)) {
        if (redactKeys.has(key)) {
          result[key] = "[REDACTED]";
        } else {
          result[key] = walk(val, depth + 1);
        }
      }
      return result;
    }

    return node;
  }

  return walk(value, 0);
}

const listAuditLogs = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset, orderBy } = parsePagination(req.query);

  const tenantId = normalizeOptionalString(req.query.tenantId);
  const userId = normalizeOptionalString(req.query.userId);
  const role = normalizeOptionalString(req.query.role);
  const action = normalizeOptionalString(req.query.action);

  const from = parseIsoDateOnly(req.query.from);
  const to = parseIsoDateOnly(req.query.to);

  const createdAt = {};
  if (from) {
    createdAt.gte = from;
  }
  if (to) {
    createdAt.lt = addUtcDays(to, 1);
  }

  const where = {
    ...(tenantId ? { tenantId } : {}),
    ...(userId ? { userId } : {}),
    ...(role ? { role } : {}),
    ...(action ? { action } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {})
  };

  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        createdAt: true,
        action: true,
        userId: true,
        role: true,
        tenantId: true,
        entityType: true,
        entityId: true,
        metadata: true
      }
    })
  ]);

  return res.apiSuccess("Audit logs fetched", {
    total,
    limit,
    offset,
    items: items.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      action: row.action,
      actorUserId: row.userId,
      actorRole: row.role,
      tenantId: row.tenantId,
      targetEntityType: row.entityType,
      targetEntityId: row.entityId,
      metadata: redactMetadata(row.metadata)
    }))
  });
});

export { listAuditLogs };
