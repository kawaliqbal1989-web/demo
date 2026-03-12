import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { hashPassword } from "../utils/password.js";
import { recordAudit } from "../utils/audit.js";
import { generatePartnerCode } from "../utils/partner-code.js";
import { parsePagination } from "../utils/pagination.js";
import { isSchemaMismatchError } from "../utils/schema-mismatch.js";
import {
  cascadeSetBusinessPartnerActiveState,
  resolveBusinessPartnerHierarchyNodeIds
} from "../services/business-partner-cascade.service.js";
import {
  getBPEntitlements,
  upsertBPEntitlement,
  getBPUsageReport
} from "../services/practice-entitlement.service.js";

function parseISODateOnly(value) {
  const text = String(value || "").trim();
  const dateOnly = text.includes("T") ? text.slice(0, 10) : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "n"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function validateGstNumber(gstNumber) {
  if (!gstNumber) {
    return;
  }

  const value = String(gstNumber).trim().toUpperCase();
  // Basic GSTIN format: 15 chars (state code + PAN + entity + checksum)
  const ok = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(value);
  if (!ok) {
    const error = new Error("Invalid GST number format");
    error.statusCode = 400;
    error.errorCode = "GST_INVALID";
    throw error;
  }
}

function validatePanNumber(panNumber) {
  if (!panNumber) {
    return;
  }

  const value = String(panNumber).trim().toUpperCase();
  const ok = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(value);
  if (!ok) {
    const error = new Error("Invalid PAN number format");
    error.statusCode = 400;
    error.errorCode = "PAN_INVALID";
    throw error;
  }
}

function validateLogoUrl(logoUrl) {
  if (!logoUrl) {
    return;
  }

  const value = String(logoUrl).trim();
  if (!value) {
    return;
  }

  if (value.toLowerCase().startsWith("data:")) {
    // Allow small data URIs (base64) to be stored directly for quick admin uploads.
    // They are still subject to the length check below to avoid accidental huge payloads.
  }

  // TEXT column can hold more, but extremely large values are almost always accidental.
  if (value.length > 20000) {
    const error = new Error("logoUrl is too long");
    error.statusCode = 400;
    error.errorCode = "LOGO_URL_TOO_LONG";
    throw error;
  }
}

function normalizePercent(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function validateSplit({ centerSharePercent, franchiseSharePercent, bpSharePercent, platformSharePercent }) {
  const percents = [
    { name: "centerSharePercent", value: centerSharePercent },
    { name: "franchiseSharePercent", value: franchiseSharePercent },
    { name: "bpSharePercent", value: bpSharePercent },
    { name: "platformSharePercent", value: platformSharePercent }
  ];

  for (const entry of percents) {
    if (!Number.isInteger(entry.value) || entry.value < 0 || entry.value > 100) {
      const error = new Error(`${entry.name} must be an integer 0..100`);
      error.statusCode = 400;
      error.errorCode = "REVENUE_SPLIT_INVALID";
      throw error;
    }
  }

  const sum = centerSharePercent + franchiseSharePercent + bpSharePercent + platformSharePercent;
  if (sum !== 100) {
    const error = new Error("Revenue split percents must sum to 100");
    error.statusCode = 400;
    error.errorCode = "REVENUE_SPLIT_SUM_INVALID";
    throw error;
  }
}

function addDaysLocal(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

const renewBusinessPartnerSubscription = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { extendDays = 30 } = req.body;
  const days = Number(extendDays);

  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    return res.apiError(400, "extendDays must be an integer between 1 and 3650", "VALIDATION_ERROR");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.businessPartner.findFirst({
      where: {
        id,
        tenantId: req.auth.tenantId
      },
      select: {
        id: true,
        subscriptionExpiresAt: true,
        subscriptionStatus: true
      }
    });

    if (!existing) {
      const error = new Error("Business partner not found");
      error.statusCode = 404;
      error.errorCode = "BUSINESS_PARTNER_NOT_FOUND";
      throw error;
    }

    const base = existing.subscriptionExpiresAt && new Date(existing.subscriptionExpiresAt) > new Date()
      ? new Date(existing.subscriptionExpiresAt)
      : new Date();

    const nextExpiresAt = addDaysLocal(base, days);

    return tx.businessPartner.update({
      where: { id: existing.id },
      data: {
        subscriptionStatus: "ACTIVE",
        subscriptionExpiresAt: nextExpiresAt
      }
    });
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "SUBSCRIPTION_RENEWAL",
    entityType: "BUSINESS_PARTNER",
    entityId: id,
    metadata: {
      subscriptionExpiresAt: updated.subscriptionExpiresAt
    }
  });

  return res.apiSuccess("Subscription renewed", updated);
});

const listBusinessPartners = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset, orderBy } = parsePagination(req.query);

  const requestedTenantId = req.query.tenantId ? String(req.query.tenantId) : null;
  const q = req.query.q ? String(req.query.q).trim() : null;
  const status = req.query.status ? String(req.query.status).trim().toUpperCase() : null;
  const subscriptionStatus = req.query.subscriptionStatus
    ? String(req.query.subscriptionStatus).trim().toUpperCase()
    : null;

  const where = req.auth.role === "SUPERADMIN"
    ? requestedTenantId
      ? { tenantId: requestedTenantId }
      : {}
    : { tenantId: req.auth.tenantId };

  if (q) {
    const cleaned = q.replace(/-/g, "");
    const alternatives = new Set([q]);
    if (cleaned && cleaned !== q) {
      alternatives.add(cleaned);
    }
    // Legacy codes sometimes include a dash (e.g. BP-001). Make BP001 match BP-001.
    if (/^BP\d{3}$/i.test(cleaned)) {
      alternatives.add(`BP-${cleaned.slice(2)}`);
    }

    where.OR = [
      ...Array.from(alternatives).map((term) => ({ code: { contains: term } })),
      { name: { contains: q } },
      { displayName: { contains: q } }
    ];
  }

  if (status) {
    where.status = status;
  }

  if (subscriptionStatus) {
    where.subscriptionStatus = subscriptionStatus;
  }

  const [total, items] = await prisma.$transaction([
    prisma.businessPartner.count({ where }),
    prisma.businessPartner.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        tenantId: true,
        code: true,
        name: true,
        displayName: true,
        status: true,
        accessMode: true,
        contactEmail: true,
        supportEmail: true,
        primaryPhone: true,
        whatsappEnabled: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        gracePeriodUntil: true,
        hierarchyNodeId: true,
        createdAt: true
      }
    })
  ]);

  const partnerIds = items.map((p) => p.id);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const revenueGroups = partnerIds.length
    ? await prisma.financialTransaction.groupBy({
        by: ["businessPartnerId"],
        where: {
          businessPartnerId: { in: partnerIds },
          createdAt: { gte: since }
        },
        _sum: { grossAmount: true }
      })
    : [];

  const revenueByPartnerId = new Map(
    revenueGroups
      .filter((g) => g.businessPartnerId)
      .map((g) => [g.businessPartnerId, Number(g._sum?.grossAmount ?? 0)])
  );

  return res.apiSuccess("Business partners fetched", {
    total,
    items: items.map((p) => ({
      ...p,
      revenueSnapshot30d: revenueByPartnerId.get(p.id) ?? 0
    })),
    limit,
    offset
  });
});

const uploadBusinessPartnerLogo = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.businessPartner.findFirst({
    where: {
      tenantId: req.auth.tenantId,
      id
    },
    select: {
      id: true
    }
  });

  if (!existing) {
    return res.apiError(404, "Business partner not found", "BUSINESS_PARTNER_NOT_FOUND");
  }

  const file = req.file;
  if (!file) {
    return res.apiError(400, "file is required", "FILE_REQUIRED");
  }

  const url = `${req.protocol}://${req.get("host")}/uploads/business-partner-logos/${file.filename}`;

  const updated = await prisma.businessPartner.update({
    where: { id: existing.id },
    data: {
      logoPath: file.filename,
      logoUrl: url
    }
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Business partner logo updated", updated);
});

const getBusinessPartner = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const partner = await prisma.businessPartner.findFirst({
    where: {
      id,
      ...(req.auth.role === "SUPERADMIN" ? {} : { tenantId: req.auth.tenantId })
    },
    include: {
      address: true,
      operationalStates: true,
      operationalDistricts: true,
      operationalCities: true,
      courseAccesses: { include: { course: { select: { id: true, code: true, name: true } } } },
      legacyPrograms: true
    }
  });

  if (!partner) {
    return res.apiError(404, "Business partner not found", "BUSINESS_PARTNER_NOT_FOUND");
  }

  return res.apiSuccess("Business partner fetched", partner);
});

const updateBusinessPartner = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.businessPartner.findFirst({
    where: {
      id,
      ...(req.auth.role === "SUPERADMIN" ? {} : { tenantId: req.auth.tenantId })
    },
    select: {
      id: true,
      tenantId: true,
      code: true,
      hierarchyNodeId: true
    }
  });

  if (!existing) {
    return res.apiError(404, "Business partner not found", "BUSINESS_PARTNER_NOT_FOUND");
  }

  validateGstNumber(req.body.gstNumber);
  validatePanNumber(req.body.panNumber);

  const logoUrlNormalized = req.body.logoUrl !== undefined ? normalizeString(req.body.logoUrl) : undefined;
  validateLogoUrl(logoUrlNormalized);

  const subscriptionStatus = req.body.subscriptionStatus
    ? String(req.body.subscriptionStatus).trim().toUpperCase()
    : undefined;

  if (
    subscriptionStatus !== undefined
    && !["ACTIVE", "SUSPENDED", "EXPIRED"].includes(subscriptionStatus)
  ) {
    return res.apiError(
      400,
      "subscriptionStatus must be ACTIVE, SUSPENDED, or EXPIRED",
      "VALIDATION_ERROR"
    );
  }

  let subscriptionExpiresAt;
  if (req.body.subscriptionExpiresAt !== undefined) {
    if (req.body.subscriptionExpiresAt === null || req.body.subscriptionExpiresAt === "") {
      subscriptionExpiresAt = null;
    } else {
      subscriptionExpiresAt = parseISODateOnly(req.body.subscriptionExpiresAt);
      if (!subscriptionExpiresAt) {
        return res.apiError(400, "Invalid subscriptionExpiresAt date", "VALIDATION_ERROR");
      }
    }
  }

  const address = req.body.address && typeof req.body.address === "object" ? req.body.address : null;
  const operationalStates = Array.isArray(req.body.operationalStates) ? req.body.operationalStates : null;
  const operationalDistricts = Array.isArray(req.body.operationalDistricts) ? req.body.operationalDistricts : null;
  const operationalCities = Array.isArray(req.body.operationalCities) ? req.body.operationalCities : null;
  const courseIds = Array.isArray(req.body.courseIds) ? req.body.courseIds : null;

  const updated = await prisma.$transaction(async (tx) => {
    const partner = await tx.businessPartner.update({
      where: { id: existing.id },
      data: {
        name: normalizeString(req.body.name) ?? undefined,
        ...(req.body.displayName !== undefined ? { displayName: normalizeString(req.body.displayName) } : {}),
        status: req.body.status ? String(req.body.status).trim().toUpperCase() : undefined,
        isActive: req.body.isActive === undefined ? undefined : normalizeBoolean(req.body.isActive, true),
        ...(req.body.logoPath !== undefined ? { logoPath: normalizeString(req.body.logoPath) } : {}),
        ...(req.body.logoUrl !== undefined ? { logoUrl: logoUrlNormalized } : {}),
        ...(req.body.primaryPhone !== undefined ? { primaryPhone: normalizeString(req.body.primaryPhone) } : {}),
        ...(req.body.alternatePhone !== undefined ? { alternatePhone: normalizeString(req.body.alternatePhone) } : {}),
        ...(req.body.contactEmail !== undefined ? { contactEmail: normalizeString(req.body.contactEmail) } : {}),
        ...(req.body.supportEmail !== undefined ? { supportEmail: normalizeString(req.body.supportEmail) } : {}),
        whatsappEnabled: req.body.whatsappEnabled === undefined
          ? undefined
          : normalizeBoolean(req.body.whatsappEnabled, false),
        businessType: req.body.businessType ? String(req.body.businessType).trim().toUpperCase() : undefined,
        ...(req.body.gstNumber !== undefined ? { gstNumber: normalizeString(req.body.gstNumber) } : {}),
        ...(req.body.panNumber !== undefined ? { panNumber: normalizeString(req.body.panNumber) } : {}),
        ...(req.body.onboardingDate !== undefined
          ? {
              onboardingDate: req.body.onboardingDate
                ? parseISODateOnly(req.body.onboardingDate) || undefined
                : null
            }
          : {}),
        ...(req.body.primaryBrandColor !== undefined ? { primaryBrandColor: normalizeString(req.body.primaryBrandColor) } : {}),
        ...(req.body.secondaryBrandColor !== undefined ? { secondaryBrandColor: normalizeString(req.body.secondaryBrandColor) } : {}),
        ...(req.body.websiteUrl !== undefined ? { websiteUrl: normalizeString(req.body.websiteUrl) } : {}),
        ...(req.body.facebookUrl !== undefined ? { facebookUrl: normalizeString(req.body.facebookUrl) } : {}),
        ...(req.body.instagramUrl !== undefined ? { instagramUrl: normalizeString(req.body.instagramUrl) } : {}),
        ...(req.body.youtubeUrl !== undefined ? { youtubeUrl: normalizeString(req.body.youtubeUrl) } : {}),
        accessMode: req.body.accessMode ? String(req.body.accessMode).trim().toUpperCase() : undefined,
        ...(subscriptionStatus !== undefined ? { subscriptionStatus } : {}),
        ...(req.body.subscriptionExpiresAt !== undefined ? { subscriptionExpiresAt } : {}),
        legacyLoginEnabled: false,
        legacyUsername: null,
        legacyPasswordHash: null
      }
    });

    if (address) {
      const addressData = {
        addressLine1: normalizeString(address.addressLine1) || "",
        addressLine2: normalizeString(address.addressLine2) || null,
        city: normalizeString(address.city) || "",
        district: normalizeString(address.district) || null,
        state: normalizeString(address.state) || "",
        country: normalizeString(address.country) || "India",
        pincode: normalizeString(address.pincode) || null
      };

      await tx.businessPartnerAddress.upsert({
        where: { businessPartnerId: existing.id },
        create: { businessPartnerId: existing.id, ...addressData },
        update: { ...addressData }
      });
    }

    if (operationalStates) {
      await tx.partnerOperationalState.deleteMany({ where: { businessPartnerId: existing.id } });
      const rows = operationalStates
        .map((s) => normalizeString(s))
        .filter(Boolean)
        .map((state) => ({ businessPartnerId: existing.id, state }));
      if (rows.length) {
        await tx.partnerOperationalState.createMany({ data: rows, skipDuplicates: true });
      }
    }

    if (operationalDistricts) {
      await tx.partnerOperationalDistrict.deleteMany({ where: { businessPartnerId: existing.id } });
      const rows = operationalDistricts
        .map((d) => {
          if (typeof d === "string") {
            return { district: d, state: null };
          }
          if (!d || typeof d !== "object") {
            return null;
          }
          return { district: d.district, state: d.state || null };
        })
        .filter(Boolean)
        .map((d) => ({
          businessPartnerId: existing.id,
          district: normalizeString(d.district),
          state: normalizeString(d.state)
        }))
        .filter((d) => d.district);

      if (rows.length) {
        await tx.partnerOperationalDistrict.createMany({ data: rows, skipDuplicates: true });
      }
    }

    if (operationalCities) {
      await tx.partnerOperationalCity.deleteMany({ where: { businessPartnerId: existing.id } });
      const rows = operationalCities
        .map((c) => {
          if (typeof c === "string") {
            return { city: c, district: null, state: null };
          }
          if (!c || typeof c !== "object") {
            return null;
          }
          return { city: c.city, district: c.district || null, state: c.state || null };
        })
        .filter(Boolean)
        .map((c) => ({
          businessPartnerId: existing.id,
          city: normalizeString(c.city),
          district: normalizeString(c.district),
          state: normalizeString(c.state)
        }))
        .filter((c) => c.city);

      if (rows.length) {
        await tx.partnerOperationalCity.createMany({ data: rows, skipDuplicates: true });
      }
    }

    if (courseIds) {
      await tx.partnerCourseAccess.deleteMany({ where: { businessPartnerId: existing.id } });
      const rows = courseIds
        .map((courseId) => normalizeString(courseId))
        .filter(Boolean)
        .map((courseId) => ({ businessPartnerId: existing.id, courseId }));
      if (rows.length) {
        await tx.partnerCourseAccess.createMany({ data: rows, skipDuplicates: true });
      }
    }

    await tx.partnerLegacyProgram.deleteMany({ where: { businessPartnerId: existing.id } });

    return partner;
  });

  await recordAudit({
    tenantId: existing.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "UPDATE_BUSINESS_PARTNER",
    entityType: "BUSINESS_PARTNER",
    entityId: existing.id,
    metadata: {
      code: existing.code
    }
  });

  return res.apiSuccess("Business partner updated", updated);
});

const setBusinessPartnerStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const nextStatus = req.body?.status ? String(req.body.status).trim().toUpperCase() : null;

  if (!nextStatus || !["ACTIVE", "INACTIVE", "SUSPENDED"].includes(nextStatus)) {
    return res.apiError(400, "status must be ACTIVE, INACTIVE, or SUSPENDED", "VALIDATION_ERROR");
  }

  const existing = await prisma.businessPartner.findFirst({
    where: {
      id,
      ...(req.auth.role === "SUPERADMIN" ? {} : { tenantId: req.auth.tenantId })
    },
    select: {
      id: true,
      tenantId: true,
      code: true,
      status: true,
      hierarchyNodeId: true
    }
  });

  if (!existing) {
    return res.apiError(404, "Business partner not found", "BUSINESS_PARTNER_NOT_FOUND");
  }

  const shouldActivate = nextStatus === "ACTIVE";

  const updated = await prisma.$transaction(async (tx) => {
    const partner = await tx.businessPartner.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        isActive: shouldActivate
      }
    });

    await cascadeSetBusinessPartnerActiveState({
      tx,
      tenantId: existing.tenantId,
      businessPartnerId: existing.id,
      isActive: shouldActivate
    });

    return partner;
  });

  await recordAudit({
    tenantId: existing.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "SET_BUSINESS_PARTNER_STATUS",
    entityType: "BUSINESS_PARTNER",
    entityId: existing.id,
    metadata: {
      from: existing.status,
      to: nextStatus
    }
  });

  return res.apiSuccess("Business partner status updated", updated);
});

const resetBusinessPartnerPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const nextPassword = req.body?.password ? String(req.body.password) : null;

  if (!nextPassword || nextPassword.length < 8) {
    return res.apiError(400, "password must be at least 8 characters", "VALIDATION_ERROR");
  }

  const partner = await prisma.businessPartner.findFirst({
    where: {
      id,
      ...(req.auth.role === "SUPERADMIN" ? {} : { tenantId: req.auth.tenantId })
    },
    select: {
      id: true,
      tenantId: true,
      contactEmail: true,
      hierarchyNodeId: true
    }
  });

  if (!partner) {
    return res.apiError(404, "Business partner not found", "BUSINESS_PARTNER_NOT_FOUND");
  }

  const passwordHash = await hashPassword(nextPassword);

  const hierarchyNodeIds = await resolveBusinessPartnerHierarchyNodeIds({
    tenantId: partner.tenantId,
    businessPartnerId: partner.id
  });

  const whereUser = {
    tenantId: partner.tenantId,
    role: "BP",
    ...(partner.contactEmail ? { email: partner.contactEmail } : {}),
    ...(hierarchyNodeIds.length ? { hierarchyNodeId: { in: hierarchyNodeIds } } : {})
  };

  const updated = await prisma.authUser.updateMany({
    where: whereUser,
    data: {
      passwordHash,
      mustChangePassword: true,
      failedAttempts: 0,
      lockUntil: null
    }
  });

  await recordAudit({
    tenantId: partner.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "RESET_BP_PASSWORD",
    entityType: "BUSINESS_PARTNER",
    entityId: partner.id,
    metadata: {
      updatedUsers: updated.count
    }
  });

  return res.apiSuccess("Password reset and force-change enabled", { updatedUsers: updated.count });
});

const getMyBusinessPartner = asyncHandler(async (req, res) => {
  const criteria = [];
  if (req.auth.hierarchyNodeId) {
    criteria.push({ hierarchyNodeId: req.auth.hierarchyNodeId });
  }

  if (req.auth.username) {
    criteria.push({ code: String(req.auth.username).trim() });
  }

  if (req.auth.email) {
    criteria.push({ contactEmail: String(req.auth.email).trim().toLowerCase() });
  }

  if (!criteria.length) {
    return res.apiError(400, "BP scope could not be resolved", "BP_SCOPE_REQUIRED");
  }

  const matches = await prisma.businessPartner.findMany({
    where: {
      tenantId: req.auth.tenantId,
      OR: criteria
    },
    orderBy: { createdAt: "desc" },
    take: 2
  });

  if (matches.length > 1) {
    return res.apiError(409, "Multiple business partners match this BP user", "BP_SCOPE_AMBIGUOUS");
  }

  const partner = matches[0] || null;

  if (!partner) {
    return res.apiError(404, "Business partner not found", "BUSINESS_PARTNER_NOT_FOUND");
  }

  return res.apiSuccess("Business partner fetched", partner);
});

const updateRevenueSplit = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.businessPartner.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId
    }
  });

  if (!existing) {
    return res.apiError(404, "Business partner not found", "BUSINESS_PARTNER_NOT_FOUND");
  }

  if (req.auth.role === "BP") {
    if (!req.auth.hierarchyNodeId || existing.hierarchyNodeId !== req.auth.hierarchyNodeId) {
      return res.apiError(403, "Forbidden", "ROLE_FORBIDDEN");
    }
  }

  const split = {
    centerSharePercent: normalizePercent(req.body.centerSharePercent, existing.centerSharePercent),
    franchiseSharePercent: normalizePercent(req.body.franchiseSharePercent, existing.franchiseSharePercent),
    bpSharePercent: normalizePercent(req.body.bpSharePercent, existing.bpSharePercent),
    platformSharePercent: normalizePercent(req.body.platformSharePercent, existing.platformSharePercent)
  };

  validateSplit(split);

  const updated = await prisma.businessPartner.update({
    where: { id: existing.id },
    data: {
      ...split
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "UPDATE_REVENUE_SPLIT",
    entityType: "BUSINESS_PARTNER",
    entityId: existing.id,
    metadata: {
      ...split
    }
  });

  return res.apiSuccess("Revenue split updated", updated);
});

const createBusinessPartner = asyncHandler(async (req, res) => {
  const {
    name,
    contactEmail,
    hierarchyNodeId,
    adminPassword,
    trialDays = 30,
    accessMode,
    courseIds,
    centerSharePercent,
    franchiseSharePercent,
    bpSharePercent,
    platformSharePercent
  } = req.body;

  if (!name || !contactEmail || !adminPassword) {
    return res.apiError(400, "name, contactEmail and adminPassword are required", "VALIDATION_ERROR");
  }

  const normalizedContactEmail = String(contactEmail).trim().toLowerCase();
  if (!normalizedContactEmail) {
    return res.apiError(400, "contactEmail is required", "VALIDATION_ERROR");
  }

  const existingUser = await prisma.authUser.findUnique({
    where: {
      tenantId_email: {
        tenantId: req.auth.tenantId,
        email: normalizedContactEmail
      }
    },
    select: { id: true }
  });
  if (existingUser) {
    return res.apiError(409, "contactEmail is already in use", "AUTH_EMAIL_ALREADY_EXISTS");
  }

  const resolvedTrialDays = Math.max(1, Number(trialDays) || 30);

  const normalizedAccessMode = accessMode
    ? String(accessMode).trim().toUpperCase()
    : "ALL";

  if (!["ALL", "SELECTIVE"].includes(normalizedAccessMode)) {
    return res.apiError(400, "accessMode must be ALL or SELECTIVE", "VALIDATION_ERROR");
  }

  const normalizedCourseIds = Array.isArray(courseIds)
    ? Array.from(
        new Set(
          courseIds
            .map((courseId) => normalizeString(courseId))
            .filter(Boolean)
        )
      )
    : [];

  const split = {
    centerSharePercent: normalizePercent(centerSharePercent, 0),
    franchiseSharePercent: normalizePercent(franchiseSharePercent, 0),
    bpSharePercent: normalizePercent(bpSharePercent, 0),
    platformSharePercent: normalizePercent(platformSharePercent, 100)
  };

  validateSplit(split);

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
    const expiresAt = addDaysLocal(new Date(), resolvedTrialDays);

    const partnerCode = await generatePartnerCode({ tx, tenantId: req.auth.tenantId });

    const partner = await tx.businessPartner.create({
      data: {
        tenantId: req.auth.tenantId,
        name,
        code: partnerCode,
        contactEmail: normalizedContactEmail,
        hierarchyNodeId,
        accessMode: normalizedAccessMode,
        subscriptionStatus: "ACTIVE",
        subscriptionExpiresAt: expiresAt,
        gracePeriodUntil: null,
        ...split,
        createdByUserId: req.auth.userId
      }
    });

    if (normalizedCourseIds.length) {
      const rows = normalizedCourseIds.map((courseId) => ({
        businessPartnerId: partner.id,
        courseId
      }));

      await tx.partnerCourseAccess.createMany({
        data: rows,
        skipDuplicates: true
      });
    }

    const passwordHash = await hashPassword(adminPassword);

    const adminUser = await tx.authUser.create({
      data: {
        username: partnerCode,
        email: normalizedContactEmail,
        passwordHash,
        role: "BP",
        tenantId: req.auth.tenantId,
        hierarchyNodeId: hierarchyNodeId || null,
        parentUserId: req.auth.userId,
        mustChangePassword: true
      },
      select: {
        id: true,
        username: true,
        email: true
      }
    });

    return { partner, adminUser };
    });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "P2002") {
      const message = error?.message ? String(error.message) : "";
      if (message.includes("AuthUser_tenantId_email_key")) {
        return res.apiError(409, "contactEmail is already in use", "AUTH_EMAIL_ALREADY_EXISTS");
      }

      if (message.includes("AuthUser_tenantId_username_key")) {
        return res.apiError(409, "Generated username already exists; retry", "AUTH_USERNAME_ALREADY_EXISTS");
      }

      return res.apiError(409, "Unique constraint violation", "UNIQUE_CONSTRAINT_VIOLATION");
    }

    throw error;
  }

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "CREATE_BUSINESS_PARTNER",
    entityType: "BUSINESS_PARTNER",
    entityId: created.partner.id,
    metadata: {
      adminUsername: created.adminUser.username,
      subscriptionExpiresAt: created.partner.subscriptionExpiresAt,
      accessMode: created.partner.accessMode
    }
  });

  res.locals.entityId = created.partner.id;
  return res.apiSuccess(
    "Business partner onboarded",
    {
      businessPartner: created.partner,
      adminUser: created.adminUser
    },
    201
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// Practice Feature Entitlements (Superadmin only)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /business-partners/:id/practice-entitlements
 * Returns entitlement config for both features with usage summary
 */
const getBPPracticeEntitlements = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const businessPartnerId = String(req.params.id || "").trim();

  if (!businessPartnerId) {
    return res.apiError(400, "Business partner ID is required", "MISSING_BP_ID");
  }

  // Verify BP exists
  const bp = await prisma.businessPartner.findUnique({
    where: { id: businessPartnerId },
    select: { id: true, name: true }
  });

  if (!bp) {
    return res.apiError(404, "Business partner not found", "BP_NOT_FOUND");
  }

  const entitlements = await getBPEntitlements({ tenantId, businessPartnerId });

  return res.apiSuccess("Practice entitlements loaded", entitlements);
});

/**
 * PATCH /business-partners/:id/practice-entitlements
 * Upsert entitlement settings for Practice and/or Abacus Practice
 */
const updateBPPracticeEntitlements = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const actorUserId = req.auth.userId;
  const businessPartnerId = String(req.params.id || "").trim();

  if (!businessPartnerId) {
    return res.apiError(400, "Business partner ID is required", "MISSING_BP_ID");
  }

  // Verify BP exists
  const bp = await prisma.businessPartner.findUnique({
    where: { id: businessPartnerId },
    select: { id: true, name: true }
  });

  if (!bp) {
    return res.apiError(404, "Business partner not found", "BP_NOT_FOUND");
  }

  const { practice, abacusPractice } = req.body || {};
  const updates = [];

  // Process PRACTICE
  if (practice !== undefined && practice !== null) {
    const isEnabled = typeof practice.isEnabled === "boolean" ? practice.isEnabled : false;
    const totalSeats = parseInt(practice.totalSeats, 10);

    if (isNaN(totalSeats) || totalSeats < 0) {
      return res.apiError(400, "Practice totalSeats must be a non-negative number", "INVALID_SEATS");
    }

    updates.push(
      upsertBPEntitlement({
        tenantId,
        businessPartnerId,
        featureKey: "PRACTICE",
        isEnabled,
        totalSeats,
        actorUserId
      })
    );
  }

  // Process ABACUS_PRACTICE
  if (abacusPractice !== undefined && abacusPractice !== null) {
    const isEnabled = typeof abacusPractice.isEnabled === "boolean" ? abacusPractice.isEnabled : false;
    const totalSeats = parseInt(abacusPractice.totalSeats, 10);

    if (isNaN(totalSeats) || totalSeats < 0) {
      return res.apiError(400, "Abacus Practice totalSeats must be a non-negative number", "INVALID_SEATS");
    }

    updates.push(
      upsertBPEntitlement({
        tenantId,
        businessPartnerId,
        featureKey: "ABACUS_PRACTICE",
        isEnabled,
        totalSeats,
        actorUserId
      })
    );
  }

  if (updates.length === 0) {
    return res.apiError(400, "No entitlement data provided", "NO_DATA");
  }

  try {
    await Promise.all(updates);
  } catch (error) {
    if (isSchemaMismatchError(error, ["businesspartnerpracticeentitlement", "centerpracticeallocation", "studentpracticeassignment"])) {
      const entitlements = await getBPEntitlements({ tenantId, businessPartnerId });
      return res.apiSuccess("Practice entitlements are unavailable in this environment", {
        ...entitlements,
        _meta: { unavailable: true }
      });
    }
    throw error;
  }

  // Return updated state
  const entitlements = await getBPEntitlements({ tenantId, businessPartnerId });

  res.locals.entityId = businessPartnerId;
  return res.apiSuccess("Practice entitlements updated", entitlements);
});

/**
 * GET /business-partners/:id/practice-usage
 * View-only usage report with center-wise breakdown (Superadmin)
 */
const getBPPracticeUsageReport = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const businessPartnerId = String(req.params.id || "").trim();

  if (!businessPartnerId) {
    return res.apiError(400, "Business partner ID is required", "MISSING_BP_ID");
  }

  // Verify BP exists
  const bp = await prisma.businessPartner.findUnique({
    where: { id: businessPartnerId },
    select: { id: true, name: true }
  });

  if (!bp) {
    return res.apiError(404, "Business partner not found", "BP_NOT_FOUND");
  }

  let report;
  try {
    report = await getBPUsageReport({ tenantId, businessPartnerId });
  } catch (error) {
    if (isSchemaMismatchError(error, ["businesspartnerpracticeentitlement", "centerpracticeallocation", "studentpracticeassignment"])) {
      report = {
        PRACTICE: { featureKey: "PRACTICE", isEnabled: false, purchasedSeats: 0, allocatedSeats: 0, assignedStudents: 0, unallocatedSeats: 0, centerCount: 0, centers: [] },
        ABACUS_PRACTICE: { featureKey: "ABACUS_PRACTICE", isEnabled: false, purchasedSeats: 0, allocatedSeats: 0, assignedStudents: 0, unallocatedSeats: 0, centerCount: 0, centers: [] }
      };
    } else {
      throw error;
    }
  }

  return res.apiSuccess("Practice usage report loaded", {
    businessPartner: { id: bp.id, name: bp.name },
    usage: report
  });
});

export {
  createBusinessPartner,
  uploadBusinessPartnerLogo,
  renewBusinessPartnerSubscription,
  listBusinessPartners,
  getBusinessPartner,
  updateBusinessPartner,
  setBusinessPartnerStatus,
  resetBusinessPartnerPassword,
  getMyBusinessPartner,
  updateRevenueSplit,
  getBPPracticeEntitlements,
  updateBPPracticeEntitlements,
  getBPPracticeUsageReport
};
