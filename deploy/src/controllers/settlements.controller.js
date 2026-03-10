import { asyncHandler } from "../utils/async-handler.js";
import { prisma } from "../lib/prisma.js";
import { parsePagination } from "../utils/pagination.js";
import { generateMonthlySettlements } from "../services/settlement.service.js";

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

async function resolveBusinessPartnerForHierarchy({ tenantId, hierarchyNodeId }) {
  if (!hierarchyNodeId) return null;

  // Walk up the hierarchy tree to find a BusinessPartner with a matching hierarchyNodeId
  let nodeId = hierarchyNodeId;
  while (nodeId) {
    const bp = await prisma.businessPartner.findFirst({ where: { tenantId, hierarchyNodeId: nodeId }, select: { id: true } });
    if (bp) return bp.id;

    const node = await prisma.hierarchyNode.findFirst({ where: { id: nodeId, tenantId }, select: { parentId: true } });
    if (!node || !node.parentId) break;
    nodeId = node.parentId;
  }

  return null;
}

const listSettlements = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset, orderBy } = parsePagination(req.query);

  const where = {
    tenantId: req.auth.tenantId
  };

  if (req.auth.role === "BP") {
    const businessPartnerId = await resolveBusinessPartnerId({ tenantId: req.auth.tenantId, userId: req.auth.userId });
    if (!businessPartnerId) {
      return res.apiError(403, "Business partner scope not resolved", "BP_SCOPE_REQUIRED");
    }
    where.businessPartnerId = businessPartnerId;
  }

  if (req.auth.role === "CENTER") {
    // Resolve the business partner for this center by walking up the hierarchy
    const businessPartnerId = await resolveBusinessPartnerForHierarchy({ tenantId: req.auth.tenantId, hierarchyNodeId: req.auth.hierarchyNodeId });
    if (!businessPartnerId) {
      return res.apiError(403, "Business partner scope not resolved for center", "BP_SCOPE_REQUIRED");
    }
    where.businessPartnerId = businessPartnerId;
  }

  if (req.auth.role === "SUPERADMIN" && req.query.businessPartnerId) {
    where.businessPartnerId = String(req.query.businessPartnerId);
  }

  const [total, items] = await prisma.$transaction([
    prisma.settlement.count({ where }),
    prisma.settlement.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        businessPartner: { select: { id: true, code: true, name: true } }
      }
    })
  ]);

  return res.apiSuccess("Settlements fetched", { total, items, limit, offset });
});

const generateSettlements = asyncHandler(async (req, res) => {
  const year = req.body?.year ?? req.query?.year;
  const month = req.body?.month ?? req.query?.month;

  const data = await prisma.$transaction((tx) =>
    generateMonthlySettlements({
      tx,
      tenantId: req.auth.tenantId,
      year,
      month,
      onlyUnsettled: true
    })
  );

  return res.apiSuccess("Settlements generated", data, 201);
});

const markSettlementPaid = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.settlement.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId
    },
    select: { id: true, status: true }
  });

  if (!existing) {
    return res.apiError(404, "Settlement not found", "SETTLEMENT_NOT_FOUND");
  }

  const updated = await prisma.settlement.update({
    where: { id },
    data: {
      status: "PAID",
      paidAt: new Date()
    }
  });

  return res.apiSuccess("Settlement marked as paid", updated);
});

export { listSettlements, generateSettlements, markSettlementPaid };
