import { Prisma } from "@prisma/client";

async function resolveActiveMarginPercent({ tx, tenantId, businessPartnerId, asOf = new Date() }) {
  const row = await tx.margin.findFirst({
    where: {
      tenantId,
      businessPartnerId,
      isActive: true,
      effectiveFrom: {
        lte: asOf
      }
    },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { marginPercent: true }
  });

  return row?.marginPercent ?? null;
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

function startOfMonthUtc(year, month) {
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

function startOfNextMonthUtc(year, month) {
  return month === 12
    ? new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0))
    : new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
}

function createPeriod({ year, month }) {
  const resolvedYear = toInt(year, new Date().getUTCFullYear());
  const resolvedMonth = Math.min(12, Math.max(1, toInt(month, new Date().getUTCMonth() + 1)));

  const start = startOfMonthUtc(resolvedYear, resolvedMonth);
  const endExclusive = startOfNextMonthUtc(resolvedYear, resolvedMonth);

  return {
    year: resolvedYear,
    month: resolvedMonth,
    start,
    endExclusive,
    end: new Date(endExclusive.getTime() - 1)
  };
}

async function generateMonthlySettlements({
  tx,
  tenantId,
  year,
  month,
  onlyUnsettled = true
}) {
  const period = createPeriod({ year, month });

  const whereTx = {
    tenantId,
    businessPartnerId: { not: null },
    createdAt: {
      gte: period.start,
      lt: period.endExclusive
    },
    ...(onlyUnsettled ? { settlementId: null } : {})
  };

  const groups = await tx.financialTransaction.groupBy({
    by: ["businessPartnerId"],
    where: whereTx,
    _sum: {
      grossAmount: true,
      platformShare: true
    }
  });

  const results = [];

  for (const group of groups) {
    const businessPartnerId = group.businessPartnerId;
    if (!businessPartnerId) {
      // Should not happen due to where clause, but keep safe.
      // eslint-disable-next-line no-continue
      continue;
    }

    const gross = new Prisma.Decimal(String(group._sum?.grossAmount ?? 0));
    const platformShareSum = new Prisma.Decimal(String(group._sum?.platformShare ?? 0));

    const marginPercent = await resolveActiveMarginPercent({
      tx,
      tenantId,
      businessPartnerId,
      asOf: period.end
    });

    const platform = marginPercent === null || marginPercent === undefined
      ? platformShareSum
      : new Prisma.Decimal(String(gross.mul(marginPercent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)));

    if (gross.lte(0)) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const existing = await tx.settlement.findFirst({
      where: {
        tenantId,
        businessPartnerId,
        periodYear: period.year,
        periodMonth: period.month
      },
      select: { id: true }
    });

    if (existing) {
      results.push({ businessPartnerId, settlementId: existing.id, created: false });
      // eslint-disable-next-line no-continue
      continue;
    }

    const settlement = await tx.settlement.create({
      data: {
        tenantId,
        businessPartnerId,
        periodYear: period.year,
        periodMonth: period.month,
        periodStart: period.start,
        periodEnd: period.end,
        grossAmount: gross,
        partnerEarnings: gross.sub(platform),
        platformEarnings: platform,
        status: "PENDING"
      },
      select: { id: true }
    });

    await tx.financialTransaction.updateMany({
      where: {
        ...whereTx,
        businessPartnerId
      },
      data: {
        settlementId: settlement.id
      }
    });

    results.push({ businessPartnerId, settlementId: settlement.id, created: true });
  }

  return {
    tenantId,
    period,
    results
  };
}

export { createPeriod, generateMonthlySettlements };
