import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import { hashPassword } from "../utils/password.js";
import { generateUsername } from "../utils/username-generator.js";
import { recordAudit } from "../utils/audit.js";

function normalizeHierarchyType(type) {
  if (!type) {
    return "DISTRICT";
  }
  const normalized = String(type).trim().toUpperCase();
  const allowed = ["COUNTRY", "REGION", "DISTRICT", "SCHOOL", "BRANCH"];
  return allowed.includes(normalized) ? normalized : "DISTRICT";
}

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}
function parseOptionalDate(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "INVALID";
  return d;
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

function normalizeFranchiseStatus(status) {
  if (!status) {
    return null;
  }

  const s = String(status).trim().toUpperCase();
  if (["ACTIVE", "INACTIVE", "ARCHIVED"].includes(s)) {
    return s;
  }
  return null;
}

const listFranchises = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset, orderBy } = parsePagination(req.query);
  const q = req.query.q ? String(req.query.q).trim() : null;
  const status = normalizeFranchiseStatus(req.query.status);

  const where = {
    tenantId: req.auth.tenantId,
    businessPartnerId: req.bpScope.businessPartner.id,
    ...(status ? { status } : {})
  };

  if (q) {
    where.OR = [
      { code: { contains: q } },
      { name: { contains: q } },
      { displayName: { contains: q } },
      {
        authUser: {
          is: {
            username: { contains: q }
          }
        }
      }
    ];
  }

  const [items, total] = await Promise.all([
    prisma.franchiseProfile.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        authUser: {
          select: {
            id: true,
            username: true,
            email: true,
            isActive: true,
            hierarchyNodeId: true,
            hierarchyNode: {
              select: {
                id: true,
                name: true,
                code: true,
                type: true,
                isActive: true,
                parent: { select: { id: true, name: true, code: true, type: true } }
              }
            }
          }
        },
        address: true,
        businessPartner: {
          select: { id: true, code: true, name: true }
        }
      }
    }),
    prisma.franchiseProfile.count({ where })
  ]);

  return res.apiSuccess("Franchises fetched", {
    items,
    limit,
    offset,
    total
  });
});

const createFranchise = asyncHandler(async (req, res) => {
  const {
    name,
    displayName,
    type,
    parentId,
    emailOfficial,
    phonePrimary,
    phoneAlternate,
    emailSupport,
    websiteUrl,
    onboardingDate,
    whatsappEnabled,
    addressLine1,
    addressLine2,
    city,
    district,
    state,
    country,
    pincode,
    inheritBranding,
    logoUrl,
    password
  } = req.body;

  if (!name || !emailOfficial || !password) {
    return res.apiError(400, "name, emailOfficial and password are required", "VALIDATION_ERROR");
  }

  const parentNodeId = parentId || req.bpScope.businessPartner.hierarchyNodeId;
  if (!parentNodeId) {
    return res.apiError(
      400,
      "Business partner hierarchy root not configured. Ask SUPERADMIN to set BusinessPartner.hierarchyNodeId.",
      "BP_HIERARCHY_REQUIRED"
    );
  }

  if (req.bpScope.hierarchyNodeIds.length && !req.bpScope.hierarchyNodeIds.includes(parentNodeId)) {
    return res.apiError(403, "Parent hierarchy node outside partner scope", "BP_SCOPE_DENIED");
  }

  const nodeType = normalizeHierarchyType(type);

  const created = await prisma.$transaction(async (tx) => {
    const username = await generateUsername({
      tx,
      tenantId: req.auth.tenantId,
      role: "FRANCHISE"
    });

    const node = await tx.hierarchyNode.create({
      data: {
        tenantId: req.auth.tenantId,
        name: String(name).trim(),
        code: username,
        type: nodeType,
        parentId: parentNodeId
      }
    });

    const passwordHash = await hashPassword(password);

    const user = await tx.authUser.create({
      data: {
        tenantId: req.auth.tenantId,
        username,
        email: String(emailOfficial).trim(),
        passwordHash,
        role: "FRANCHISE",
        hierarchyNodeId: node.id,
        parentUserId: req.auth.userId,
        mustChangePassword: true,
        isActive: true
      },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true,
        createdAt: true
      }
    });

    const profile = await tx.franchiseProfile.create({
      data: {
        tenantId: req.auth.tenantId,
        businessPartnerId: req.bpScope.businessPartner.id,
        authUserId: user.id,
        code: username,
        name: String(name).trim(),
        displayName: normalizeString(displayName) || null,
        status: "ACTIVE",
        isActive: true,
        phonePrimary: normalizeString(phonePrimary),
        phoneAlternate: normalizeString(phoneAlternate),
        emailOfficial: String(emailOfficial).trim(),
        emailSupport: normalizeString(emailSupport),
        whatsappEnabled: normalizeBoolean(whatsappEnabled, false),
        websiteUrl: normalizeString(websiteUrl),
        onboardingDate: (() => { const d = parseOptionalDate(onboardingDate); if (d === "INVALID") throw Object.assign(new Error("Invalid onboarding date"), { statusCode: 400, errorCode: "VALIDATION_ERROR" }); return d; })(),
        // Franchise works under Business Partner branding by default.
        inheritBranding: true,
        logoUrl: null,
        logoPath: null
      }
    });

    const hasAddress = Boolean(addressLine1 && city && state);
    const address = hasAddress
      ? await tx.franchiseAddress.create({
          data: {
            tenantId: req.auth.tenantId,
            franchiseProfileId: profile.id,
            addressLine1: String(addressLine1).trim(),
            addressLine2: normalizeString(addressLine2),
            city: String(city).trim(),
            district: normalizeString(district),
            state: String(state).trim(),
            country: normalizeString(country) || "India",
            pincode: normalizeString(pincode)
          }
        })
      : null;

    return { node, user, profile, address };
  });

  res.locals.entityId = created.profile.id;
  return res.apiSuccess(
    "Franchise created",
    {
      code: created.profile.code,
      username: created.user.username,
      profile: created.profile,
      address: created.address,
      hierarchyNode: created.node
    },
    201
  );
});

const updateFranchise = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    name,
    displayName,
    status,
    phonePrimary,
    phoneAlternate,
    emailOfficial,
    emailSupport,
    websiteUrl,
    onboardingDate,
    whatsappEnabled,
    inheritBranding,
    logoUrl,
    addressLine1,
    addressLine2,
    city,
    district,
    state,
    country,
    pincode
  } = req.body;

  const existing = await prisma.franchiseProfile.findFirst({
    where: {
      tenantId: req.auth.tenantId,
      businessPartnerId: req.bpScope.businessPartner.id,
      authUserId: id
    },
    include: {
      authUser: { select: { id: true, hierarchyNodeId: true } },
      address: { select: { id: true } }
    }
  });

  if (!existing) {
    return res.apiError(404, "Franchise not found", "FRANCHISE_NOT_FOUND");
  }

  const nextStatus = normalizeFranchiseStatus(status);
  if (status && !nextStatus) {
    return res.apiError(400, "Invalid status. Must be ACTIVE, INACTIVE, or ARCHIVED", "VALIDATION_ERROR");
  }
  const nextIsActive = nextStatus === "INACTIVE" || nextStatus === "ARCHIVED" ? false : true;

  const updated = await prisma.$transaction(async (tx) => {
    const profile = await tx.franchiseProfile.update({
      where: { id: existing.id },
      data: {
        ...(name ? { name: String(name).trim() } : {}),
        ...(displayName !== undefined ? { displayName: normalizeString(displayName) } : {}),
        ...(nextStatus ? { status: nextStatus, isActive: nextIsActive } : {}),
        ...(phonePrimary !== undefined ? { phonePrimary: normalizeString(phonePrimary) } : {}),
        ...(phoneAlternate !== undefined ? { phoneAlternate: normalizeString(phoneAlternate) } : {}),
        ...(emailOfficial ? { emailOfficial: String(emailOfficial).trim() } : {}),
        ...(emailSupport !== undefined ? { emailSupport: normalizeString(emailSupport) } : {}),
        ...(websiteUrl !== undefined ? { websiteUrl: normalizeString(websiteUrl) } : {}),
        ...(onboardingDate !== undefined ? { onboardingDate: (() => { if (!onboardingDate) return null; const d = parseOptionalDate(onboardingDate); if (d === "INVALID") throw Object.assign(new Error("Invalid onboarding date"), { statusCode: 400, errorCode: "VALIDATION_ERROR" }); return d; })() } : {}),
        ...(whatsappEnabled !== undefined ? { whatsappEnabled: normalizeBoolean(whatsappEnabled, existing.whatsappEnabled) } : {}),
        ...(inheritBranding !== undefined ? { inheritBranding: normalizeBoolean(inheritBranding, existing.inheritBranding) } : {}),
        ...(logoUrl !== undefined ? { logoUrl: normalizeString(logoUrl) } : {})
      },
      include: { address: true }
    });

    if (emailOfficial) {
      await tx.authUser.update({
        where: { id },
        data: { email: String(emailOfficial).trim() }
      });
    }

    if (existing.authUser?.hierarchyNodeId && name) {
      await tx.hierarchyNode.update({
        where: { id: existing.authUser.hierarchyNodeId },
        data: { name: String(name).trim(), isActive: nextStatus ? nextIsActive : undefined }
      });
    }

    const hasAddressPatch =
      addressLine1 !== undefined || addressLine2 !== undefined || city !== undefined || district !== undefined ||
      state !== undefined || country !== undefined || pincode !== undefined;

    if (hasAddressPatch) {
      const next = {
        addressLine1: addressLine1 ? String(addressLine1).trim() : profile.address?.addressLine1 || "",
        addressLine2: normalizeString(addressLine2) ?? profile.address?.addressLine2 ?? null,
        city: city ? String(city).trim() : profile.address?.city || "",
        district: normalizeString(district) ?? profile.address?.district ?? null,
        state: state ? String(state).trim() : profile.address?.state || "",
        country: normalizeString(country) ?? profile.address?.country ?? "India",
        pincode: normalizeString(pincode) ?? profile.address?.pincode ?? null
      };

      if (!next.addressLine1 || !next.city || !next.state) {
        // Allow clearing address by sending empty requireds.
        if (profile.address?.id) {
          await tx.franchiseAddress.delete({ where: { id: profile.address.id } });
        }
      } else if (profile.address?.id) {
        await tx.franchiseAddress.update({
          where: { id: profile.address.id },
          data: next
        });
      } else {
        await tx.franchiseAddress.create({
          data: {
            tenantId: req.auth.tenantId,
            franchiseProfileId: profile.id,
            ...next
          }
        });
      }
    }

    const refreshed = await tx.franchiseProfile.findFirst({
      where: { id: profile.id },
      include: {
        authUser: {
          select: {
            id: true,
            username: true,
            email: true,
            isActive: true,
            hierarchyNode: { select: { id: true, name: true, code: true, type: true, isActive: true } }
          }
        },
        address: true,
        businessPartner: { select: { id: true, code: true, name: true } }
      }
    });

    return refreshed;
  });

  res.locals.entityId = existing.id;
  return res.apiSuccess("Franchise updated", updated);
});

const deleteFranchise = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.franchiseProfile.findFirst({
    where: {
      tenantId: req.auth.tenantId,
      businessPartnerId: req.bpScope.businessPartner.id,
      authUserId: id
    },
    include: {
      authUser: { select: { id: true, hierarchyNodeId: true } }
    }
  });

  if (!existing) {
    return res.apiError(404, "Franchise not found", "FRANCHISE_NOT_FOUND");
  }

  await prisma.$transaction(async (tx) => {
    await tx.franchiseProfile.update({
      where: { id: existing.id },
      data: {
        status: "ARCHIVED",
        isActive: false
      }
    });

    await tx.authUser.update({
      where: { id },
      data: {
        isActive: false,
        lockUntil: null,
        failedAttempts: 0
      }
    });

    if (existing.authUser?.hierarchyNodeId) {
      await tx.hierarchyNode.update({
        where: { id: existing.authUser.hierarchyNodeId },
        data: { isActive: false }
      });
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "FRANCHISE_ARCHIVE",
    entityType: "FRANCHISE_PROFILE",
    entityId: existing.id,
    metadata: { authUserId: id }
  });

  res.locals.entityId = existing.id;
  return res.apiSuccess("Franchise archived", { id });
});

const uploadFranchiseLogo = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.franchiseProfile.findFirst({
    where: {
      tenantId: req.auth.tenantId,
      businessPartnerId: req.bpScope.businessPartner.id,
      authUserId: id
    },
    select: { id: true }
  });

  if (!existing) {
    return res.apiError(404, "Franchise not found", "FRANCHISE_NOT_FOUND");
  }

  const file = req.file;
  if (!file) {
    return res.apiError(400, "file is required", "FILE_REQUIRED");
  }

  const url = `${req.protocol}://${req.get("host")}/uploads/franchise-logos/${file.filename}`;

  const updated = await prisma.franchiseProfile.update({
    where: { id: existing.id },
    data: {
      logoPath: file.filename,
      logoUrl: url,
      inheritBranding: false
    }
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Franchise logo updated", updated);
});

export { listFranchises, createFranchise, updateFranchise, deleteFranchise, uploadFranchiseLogo };
