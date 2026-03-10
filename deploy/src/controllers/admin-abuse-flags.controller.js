import { asyncHandler } from "../utils/async-handler.js";
import { prisma } from "../lib/prisma.js";

const VALID_FLAG_TYPES = ["RAPID_SUBMISSION", "PERFECT_STREAK", "TIME_ANOMALY", "COMPETITION_SPIKE"];

function parsePagination(pageRaw, limitRaw) {
  const page = Math.max(1, Number(pageRaw) || 1);
  const limit = Math.min(100, Math.max(1, Number(limitRaw) || 20));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

function parseISODateOnly(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const listAbuseFlags = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query.page, req.query.limit);

  const where = {
    tenantId: req.auth.tenantId
  };

  if (req.query.flagType) {
    const ft = String(req.query.flagType).trim().toUpperCase();
    if (VALID_FLAG_TYPES.includes(ft)) where.flagType = ft;
  }

  if (req.query.from || req.query.to) {
    where.createdAt = {};
    const fromDate = req.query.from ? parseISODateOnly(req.query.from) : null;
    const toDate = req.query.to ? parseISODateOnly(req.query.to) : null;
    if (fromDate) where.createdAt.gte = fromDate;
    if (toDate) {
      toDate.setUTCHours(23, 59, 59, 999);
      where.createdAt.lte = toDate;
    }
    if (!Object.keys(where.createdAt).length) delete where.createdAt;
  }

  const [total, rows] = await Promise.all([
    prisma.abuseFlag.count({ where }),
    prisma.abuseFlag.findMany({
      where,
      orderBy: {
        createdAt: "desc"
      },
      skip,
      take: limit,
      select: {
        id: true,
        studentId: true,
        flagType: true,
        metadata: true,
        createdAt: true,
        resolvedAt: true,
        resolvedBy: {
          select: {
            id: true,
            email: true,
            role: true
          }
        }
      }
    })
  ]);

  return res.apiSuccess("Abuse flags fetched", {
    page,
    limit,
    total,
    items: rows
  });
});

const resolveAbuseFlag = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.abuseFlag.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId
    },
    select: {
      id: true,
      resolvedAt: true
    }
  });

  if (!existing) {
    return res.apiError(404, "Abuse flag not found", "ABUSE_FLAG_NOT_FOUND");
  }

  if (existing.resolvedAt) {
    return res.apiSuccess("Abuse flag already resolved", {
      id: existing.id,
      resolvedAt: existing.resolvedAt
    });
  }

  const resolved = await prisma.abuseFlag.update({
    where: { id },
    data: {
      resolvedAt: new Date(),
      resolvedByUserId: req.auth.userId
    },
    select: {
      id: true,
      resolvedAt: true,
      resolvedBy: {
        select: {
          id: true,
          email: true,
          role: true
        }
      }
    }
  });

  return res.apiSuccess("Abuse flag resolved", resolved);
});

export { listAbuseFlags, resolveAbuseFlag };
