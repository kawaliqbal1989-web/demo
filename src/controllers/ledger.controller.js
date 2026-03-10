import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import { prisma } from "../lib/prisma.js";
import { toCsv } from "../utils/csv.js";

async function resolveBusinessPartnerId({ tenantId, userId }) {
  const user = await prisma.authUser.findFirst({
    where: {
      id: userId,
      tenantId,
      isActive: true
    },
    select: {
      role: true,
      email: true,
      hierarchyNodeId: true
    }
  });

  if (!user || user.role !== "BP") {
    return null;
  }

  const partner = await prisma.businessPartner.findFirst({
    where: {
      tenantId,
      OR: [
        user.email ? { contactEmail: user.email } : undefined,
        user.hierarchyNodeId ? { hierarchyNodeId: user.hierarchyNodeId } : undefined
      ].filter(Boolean)
    },
    select: { id: true }
  });

  return partner?.id || null;
}

const listLedger = asyncHandler(async (req, res) => {
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);
  const type = req.query.type ? String(req.query.type).trim() : null;
  const studentId = req.query.studentId ? String(req.query.studentId).trim() : null;

  let tenantId = req.auth.tenantId;
  const where = {
    tenantId
  };

  if (req.auth.role === "SUPERADMIN" && req.query.tenantId) {
    tenantId = String(req.query.tenantId);
    where.tenantId = tenantId;
  }

  if (type) {
    where.type = type;
  }

  if (studentId) {
    where.studentId = studentId;
  }

  if (req.auth.role === "BP") {
    const businessPartnerId = await resolveBusinessPartnerId({ tenantId, userId: req.auth.userId });
    if (!businessPartnerId) {
      return res.apiError(403, "Business partner scope not resolved", "BP_SCOPE_REQUIRED");
    }
    where.businessPartnerId = businessPartnerId;
  }

  if (req.auth.role === "CENTER") {
    if (!req.auth.hierarchyNodeId) {
      return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
    }
    where.centerId = req.auth.hierarchyNodeId;
  }

  const items = await prisma.financialTransaction.findMany({
    where,
    orderBy,
    skip,
    take,
    select: {
      id: true,
      tenantId: true,
      type: true,
      paymentMode: true,
      receivedAt: true,
      feeScheduleType: true,
      feeMonth: true,
      feeYear: true,
      feeLevelId: true,
      paymentReference: true,
      grossAmount: true,
      centerShare: true,
      franchiseShare: true,
      bpShare: true,
      platformShare: true,
      businessPartnerId: true,
      studentId: true,
      centerId: true,
      franchiseId: true,
      createdByUserId: true,
      createdAt: true,
      createdBy: {
        select: {
          id: true,
          username: true,
          email: true,
          role: true
        }
      },
      feeLevel: {
        select: {
          id: true,
          name: true,
          rank: true
        }
      }
    }
  });

  return res.apiSuccess("Ledger fetched", {
    limit,
    offset,
    items
  });
});

const exportLedgerCsv = asyncHandler(async (req, res) => {
  const { take, skip, orderBy } = parsePagination(req.query);
  const safeTake = Math.min(take, 5000);
  const type = req.query.type ? String(req.query.type).trim() : null;
  const studentId = req.query.studentId ? String(req.query.studentId).trim() : null;

  let tenantId = req.auth.tenantId;
  const where = {
    tenantId
  };

  if (req.auth.role === "SUPERADMIN" && req.query.tenantId) {
    tenantId = String(req.query.tenantId);
    where.tenantId = tenantId;
  }

  if (type) {
    where.type = type;
  }

  if (studentId) {
    where.studentId = studentId;
  }

  if (req.auth.role === "BP") {
    const businessPartnerId = await resolveBusinessPartnerId({ tenantId, userId: req.auth.userId });
    if (!businessPartnerId) {
      return res.apiError(403, "Business partner scope not resolved", "BP_SCOPE_REQUIRED");
    }
    where.businessPartnerId = businessPartnerId;
  }

  if (req.auth.role === "CENTER") {
    if (!req.auth.hierarchyNodeId) {
      return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
    }
    where.centerId = req.auth.hierarchyNodeId;
  }

  const items = await prisma.financialTransaction.findMany({
    where,
    orderBy,
    skip,
    take: safeTake,
    select: {
      id: true,
      type: true,
      grossAmount: true,
      centerShare: true,
      franchiseShare: true,
      bpShare: true,
      platformShare: true,
      businessPartnerId: true,
      studentId: true,
      centerId: true,
      franchiseId: true,
      createdByUserId: true,
      createdAt: true
    }
  });

  const csv = toCsv({
    headers: [
      "id",
      "type",
      "grossAmount",
      "centerShare",
      "franchiseShare",
      "bpShare",
      "platformShare",
      "businessPartnerId",
      "studentId",
      "centerId",
      "franchiseId",
      "createdByUserId",
      "createdAt"
    ],
    rows: items.map((t) => [
      t.id,
      t.type,
      String(t.grossAmount),
      String(t.centerShare),
      String(t.franchiseShare),
      String(t.bpShare),
      String(t.platformShare),
      t.businessPartnerId || "",
      t.studentId || "",
      t.centerId,
      t.franchiseId || "",
      t.createdByUserId,
      t.createdAt?.toISOString?.() || String(t.createdAt)
    ])
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=ledger.csv");
  return res.status(200).send(csv);
});

export { listLedger, exportLedgerCsv };