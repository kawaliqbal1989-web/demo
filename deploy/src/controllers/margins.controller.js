import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";

function parsePercent(value) {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function parseISODateOnly(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const listMargins = asyncHandler(async (req, res) => {
  const businessPartnerId = req.query.businessPartnerId ? String(req.query.businessPartnerId) : null;

  const where = {
    tenantId: req.auth.tenantId,
    ...(businessPartnerId ? { businessPartnerId } : {})
  };

  const items = await prisma.margin.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { effectiveFrom: "desc" }, { createdAt: "desc" }, { id: "desc" }]
  });

  return res.apiSuccess("Margins fetched", { items });
});

const setMargin = asyncHandler(async (req, res) => {
  const { businessPartnerId } = req.params;
  const marginPercent = parsePercent(req.body?.marginPercent);
  const effectiveFrom = req.body?.effectiveFrom ? parseISODateOnly(req.body.effectiveFrom) || new Date() : new Date();

  if (marginPercent === null || marginPercent < 0 || marginPercent > 100) {
    return res.apiError(400, "marginPercent must be a number between 0 and 100", "VALIDATION_ERROR");
  }

  const partner = await prisma.businessPartner.findFirst({
    where: { id: businessPartnerId, tenantId: req.auth.tenantId },
    select: { id: true }
  });

  if (!partner) {
    return res.apiError(404, "Business partner not found", "BUSINESS_PARTNER_NOT_FOUND");
  }

  const created = await prisma.$transaction(async (tx) => {
    await tx.margin.updateMany({
      where: {
        tenantId: req.auth.tenantId,
        businessPartnerId,
        isActive: true
      },
      data: {
        isActive: false
      }
    });

    return tx.margin.create({
      data: {
        tenantId: req.auth.tenantId,
        businessPartnerId,
        marginPercent,
        effectiveFrom,
        isActive: true
      }
    });
  });

  return res.apiSuccess("Margin updated", created, 201);
});

export { listMargins, setMargin };
