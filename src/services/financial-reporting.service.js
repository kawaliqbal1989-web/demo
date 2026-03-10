import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

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

function getDefaultMonthRangeUtc(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { from: start, toExclusive: endExclusive };
}

function addUtcDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function resolveRange({ from, to } = {}) {
  const parsedFrom = parseIsoDateOnly(from);
  const parsedTo = parseIsoDateOnly(to);

  if (!parsedFrom && !parsedTo) {
    return getDefaultMonthRangeUtc();
  }

  const start = parsedFrom || getDefaultMonthRangeUtc().from;

  if (!parsedTo) {
    // If only from is provided, report up to now.
    return { from: start, toExclusive: new Date() };
  }

  const endExclusive = addUtcDays(parsedTo, 1);

  if (endExclusive.getTime() < start.getTime()) {
    throw createHttpError(400, "Invalid date range", "INVALID_DATE_RANGE");
  }

  return { from: start, toExclusive: endExclusive };
}

async function resolveBusinessPartnerForUser({ tenantId, userId }) {
  const user = await prisma.authUser.findFirst({
    where: {
      id: userId,
      tenantId,
      isActive: true
    },
    select: {
      id: true,
      role: true,
      username: true,
      email: true,
      hierarchyNodeId: true
    }
  });

  if (!user || user.role !== "BP") {
    return null;
  }

  const select = {
    id: true,
    code: true,
    name: true,
    tenantId: true,
    hierarchyNodeId: true
  };

  // Most reliable: BP AuthUser.username is created as the partner code (e.g., BP008).
  const username = user.username ? String(user.username).trim() : "";
  if (username) {
    const byCode = await prisma.businessPartner.findUnique({
      where: {
        tenantId_code: {
          tenantId,
          code: username
        }
      },
      select
    });

    if (byCode) {
      return byCode;
    }
  }

  if (user.hierarchyNodeId) {
    const byNode = await prisma.businessPartner.findFirst({
      where: {
        tenantId,
        hierarchyNodeId: user.hierarchyNodeId
      },
      select,
      orderBy: { createdAt: "desc" }
    });

    if (byNode) {
      return byNode;
    }
  }

  if (user.email) {
    const email = String(user.email).trim().toLowerCase();
    if (email) {
      const byEmail = await prisma.businessPartner.findFirst({
        where: {
          tenantId,
          contactEmail: email
        },
        select,
        orderBy: { createdAt: "desc" }
      });

      if (byEmail) {
        return byEmail;
      }
    }
  }

  return null;
}

function buildWhere({ tenantId, from, toExclusive, businessPartnerId, centerId, type }) {
  const where = {
    createdAt: {
      gte: from,
      lt: toExclusive
    }
  };

  if (tenantId) {
    where.tenantId = tenantId;
  }

  if (businessPartnerId) {
    where.businessPartnerId = businessPartnerId;
  }

  if (centerId) {
    where.centerId = centerId;
  }

  if (type) {
    where.type = type;
  }

  return where;
}

function formatScopeForLog({ tenantId, range, scope }) {
  return {
    tenantId: tenantId || null,
    from: range?.from || null,
    toExclusive: range?.toExclusive || null,
    businessPartnerId: scope?.businessPartnerId || null,
    centerId: scope?.centerId || null,
    type: scope?.type || null
  };
}

function logPrismaFailure({ operation, error, context }) {
  logger.error("financial_reporting_prisma_failed", {
    operation,
    error: error?.message || String(error),
    ...context
  });
}

async function getRevenueSummary({ tenantId, range, scope }) {
  const where = buildWhere({
    tenantId,
    from: range.from,
    toExclusive: range.toExclusive,
    businessPartnerId: scope.businessPartnerId,
    centerId: scope.centerId,
    type: scope.type
  });

  let result;
  try {
    result = await prisma.financialTransaction.aggregate({
      where,
      _sum: {
        grossAmount: true
      }
    });
  } catch (error) {
    logPrismaFailure({
      operation: "financialTransaction.aggregate(revenueSummary)",
      error,
      context: formatScopeForLog({ tenantId, range, scope })
    });
    throw error;
  }

  return {
    tenantId: tenantId || null,
    from: range.from,
    to: new Date(range.toExclusive.getTime() - 1),
    totalGrossAmount: Number(result?._sum?.grossAmount ?? 0)
  };
}

async function getRevenueByType({ tenantId, range, scope }) {
  const where = buildWhere({
    tenantId,
    from: range.from,
    toExclusive: range.toExclusive,
    businessPartnerId: scope.businessPartnerId,
    centerId: scope.centerId
  });

  let rows;
  try {
    rows = await prisma.financialTransaction.groupBy({
      by: ["type"],
      where,
      _sum: {
        grossAmount: true
      },
      orderBy: {
        type: "asc"
      }
    });
  } catch (error) {
    logPrismaFailure({
      operation: "financialTransaction.groupBy(revenueByType)",
      error,
      context: formatScopeForLog({ tenantId, range, scope })
    });
    throw error;
  }

  return rows.map((row) => ({
    type: row.type,
    grossAmount: Number(row?._sum?.grossAmount ?? 0)
  }));
}

async function getMonthlyRevenue({ tenantId, range, scope }) {
  // TEMP stabilization: avoid raw SQL (it can break across MySQL versions / Prisma SQL interpolation).
  // Use Prisma findMany and aggregate per UTC month in memory.
  const where = buildWhere({
    tenantId,
    from: range.from,
    toExclusive: range.toExclusive,
    businessPartnerId: scope.businessPartnerId,
    centerId: scope.centerId,
    type: scope.type
  });

  let rows;
  try {
    rows = await prisma.financialTransaction.findMany({
      where,
      select: {
        createdAt: true,
        grossAmount: true
      },
      orderBy: {
        createdAt: "asc"
      },
      take: 50000
    });
  } catch (error) {
    logPrismaFailure({
      operation: "financialTransaction.findMany(monthlyRevenue)",
      error,
      context: formatScopeForLog({ tenantId, range, scope })
    });
    throw error;
  }

  const totalsByMonth = new Map();
  for (const row of rows || []) {
    const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
    const year = createdAt.getUTCFullYear();
    const month = String(createdAt.getUTCMonth() + 1).padStart(2, "0");
    const key = `${year}-${month}`;
    const current = totalsByMonth.get(key) || 0;
    totalsByMonth.set(key, current + Number(row.grossAmount ?? 0));
  }

  return Array.from(totalsByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, grossAmount]) => ({ month, grossAmount }));
}

async function getRevenueByBusinessPartner({ tenantId, range }) {
  let rows;
  try {
    rows = await prisma.financialTransaction.groupBy({
      by: ["businessPartnerId"],
      where: {
        ...(tenantId ? { tenantId } : {}),
        createdAt: {
          gte: range.from,
          lt: range.toExclusive
        },
        businessPartnerId: {
          not: null
        }
      },
      _sum: {
        grossAmount: true
      }
    });
  } catch (error) {
    logPrismaFailure({
      operation: "financialTransaction.groupBy(revenueByBusinessPartner)",
      error,
      context: {
        tenantId: tenantId || null,
        from: range?.from || null,
        toExclusive: range?.toExclusive || null
      }
    });
    throw error;
  }

  const partnerIds = rows.map((row) => row.businessPartnerId).filter(Boolean);

  let partners = [];
  try {
    partners = await prisma.businessPartner.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        id: {
          in: partnerIds
        }
      },
      select: {
        id: true,
        code: true,
        name: true
      }
    });
  } catch (error) {
    logPrismaFailure({
      operation: "businessPartner.findMany(revenueByBusinessPartner)",
      error,
      context: {
        tenantId: tenantId || null,
        partnerIdsCount: partnerIds.length
      }
    });
    logger.warn("financial_reporting_degraded", { detail: "Partner name lookup failed; returning null names" });
    partners = [];
  }

  const byId = new Map(partners.map((p) => [p.id, p]));

  return rows
    .map((row) => {
      const partner = byId.get(row.businessPartnerId);
      return {
        businessPartnerId: row.businessPartnerId,
        code: partner?.code || null,
        name: partner?.name || null,
        grossAmount: Number(row?._sum?.grossAmount ?? 0)
      };
    })
    .sort((a, b) => b.grossAmount - a.grossAmount);
}

async function getRevenueByCenter({ tenantId, range, businessPartnerId }) {
  if (!businessPartnerId) {
    throw createHttpError(403, "Business partner scope not resolved", "BP_SCOPE_REQUIRED");
  }

  let rows;
  try {
    rows = await prisma.financialTransaction.groupBy({
      by: ["centerId"],
      where: {
        ...(tenantId ? { tenantId } : {}),
        businessPartnerId,
        createdAt: {
          gte: range.from,
          lt: range.toExclusive
        }
      },
      _sum: {
        grossAmount: true
      }
    });
  } catch (error) {
    logPrismaFailure({
      operation: "financialTransaction.groupBy(revenueByCenter)",
      error,
      context: {
        tenantId: tenantId || null,
        businessPartnerId,
        from: range?.from || null,
        toExclusive: range?.toExclusive || null
      }
    });
    throw error;
  }

  const centerIds = rows.map((row) => row.centerId);

  let centers = [];
  try {
    centers = await prisma.hierarchyNode.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        id: {
          in: centerIds
        }
      },
      select: {
        id: true,
        name: true,
        type: true
      }
    });
  } catch (error) {
    logPrismaFailure({
      operation: "hierarchyNode.findMany(revenueByCenter)",
      error,
      context: {
        tenantId: tenantId || null,
        centerIdsCount: centerIds.length
      }
    });
    logger.warn("financial_reporting_degraded", { detail: "Center name lookup failed; returning null names" });
    centers = [];
  }

  const byId = new Map(centers.map((c) => [c.id, c]));

  return rows
    .map((row) => {
      const center = byId.get(row.centerId);
      return {
        centerId: row.centerId,
        name: center?.name || null,
        type: center?.type || null,
        grossAmount: Number(row?._sum?.grossAmount ?? 0)
      };
    })
    .sort((a, b) => b.grossAmount - a.grossAmount);
}

function resolveTenantForSuperadmin(authTenantId, requestedTenantId) {
  // If SUPERADMIN does not request a tenantId, aggregate across all tenants.
  return requestedTenantId ? String(requestedTenantId) : null;
}

async function resolveScopeFromRequest(auth, query) {
  if (!auth?.tenantId || !auth?.role || !auth?.userId) {
    throw createHttpError(401, "Unauthorized", "UNAUTHORIZED");
  }

  if (auth.role === "SUPERADMIN") {
    const tenantId = resolveTenantForSuperadmin(auth.tenantId, query.tenantId);
    return { tenantId, businessPartnerId: null, centerId: null };
  }

  if (auth.role === "CENTER") {
    if (!auth.hierarchyNodeId) {
      throw createHttpError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
    }
    return {
      tenantId: auth.tenantId,
      businessPartnerId: null,
      centerId: auth.hierarchyNodeId
    };
  }

  if (auth.role === "BP") {
    const partner = await resolveBusinessPartnerForUser({ tenantId: auth.tenantId, userId: auth.userId });
    if (!partner) {
      throw createHttpError(403, "Business partner scope not resolved", "BP_SCOPE_REQUIRED");
    }

    return {
      tenantId: auth.tenantId,
      businessPartnerId: partner.id,
      centerId: null
    };
  }

  throw createHttpError(403, "Role not supported for financial reporting", "ROLE_FORBIDDEN");
}

export {
  resolveBusinessPartnerForUser,
  resolveRange,
  resolveScopeFromRequest,
  getRevenueSummary,
  getRevenueByType,
  getMonthlyRevenue,
  getRevenueByBusinessPartner,
  getRevenueByCenter
};
