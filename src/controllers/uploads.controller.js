import fs from "fs/promises";
import path from "path";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";

const LOGO_UPLOAD_PREFIX = "/uploads/logos/";
const LOGO_UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "logos");

function buildManagedLogoFilePath(filename) {
  return path.posix.join("logos", String(filename || "").replace(/[\\/]+/g, ""));
}

function normalizeUploadPath(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (/^https?:\/\//i.test(text)) {
    try {
      return new URL(text).pathname || "";
    } catch {
      return text;
    }
  }

  const normalized = text.replace(/[\\]+/g, "/").replace(/^\/+/, "");
  if (normalized.startsWith("logos/")) {
    return `${LOGO_UPLOAD_PREFIX}${normalized.slice("logos/".length)}`;
  }

  if (normalized.startsWith("uploads/logos/")) {
    return `/${normalized}`;
  }

  return text.startsWith("/") ? text : `/${text}`;
}

function isManagedLogoPath(value) {
  return normalizeUploadPath(value).startsWith(LOGO_UPLOAD_PREFIX);
}

function toManagedLogoDiskPath(value) {
  const normalized = normalizeUploadPath(value);
  if (!normalized.startsWith(LOGO_UPLOAD_PREFIX)) {
    return null;
  }

  const relativeFileName = normalized.slice(LOGO_UPLOAD_PREFIX.length).replace(/[\\/]+/g, path.sep);
  if (!relativeFileName) {
    return null;
  }

  const diskPath = path.resolve(LOGO_UPLOAD_DIR, relativeFileName);
  if (diskPath !== LOGO_UPLOAD_DIR && !diskPath.startsWith(`${LOGO_UPLOAD_DIR}${path.sep}`)) {
    return null;
  }

  return diskPath;
}

async function deleteManagedLogoFile(value) {
  const diskPath = toManagedLogoDiskPath(value);
  if (!diskPath) {
    return;
  }

  await fs.unlink(diskPath).catch(() => {});
}

function uniqueManagedLogoPaths(values) {
  return Array.from(new Set((values || []).filter((value) => isManagedLogoPath(value))));
}

const resolveSuperadminCenterLogoUploadTarget = asyncHandler(async (req, res, next) => {
  const { tenantId } = req.auth || {};
  const { id } = req.params;

  if (!tenantId) {
    return res.apiError(401, "Unauthorized", "AUTH_REQUIRED");
  }

  try {
    const center = await prisma.centerProfile.findFirst({
      where: {
        tenantId,
        OR: [{ id }, { authUserId: id }]
      },
      select: {
        id: true,
        logoPath: true,
        logoFilePath: true,
        logoUrl: true,
        customLogoUrl: true,
        brandingMode: true,
        inheritBranding: true
      }
    });

    if (!center) {
      return res.apiSuccess("Logo upload skipped", {
        skipped: true,
        notFound: true,
        reason: "CENTER_NOT_FOUND_SAFE"
      });
    }

    req.logoUploadTarget = {
      role: "center",
      entityType: "CENTER",
      entityId: center.id,
      record: center
    };

    return next();
  } catch (error) {
    return res.apiSuccess("Logo upload skipped", {
      skipped: true,
      reason: "CENTER_LOGO_TARGET_FALLBACK"
    });
  }
});

const resolveLogoUploadTarget = asyncHandler(async (req, res, next) => {
  const { tenantId, userId, role } = req.auth || {};

  if (!tenantId || !userId || !role) {
    return res.apiError(401, "Unauthorized", "AUTH_REQUIRED");
  }

  if (role === "BP") {
    return res.apiError(
      403,
      "Business partner branding is managed by SuperAdmin only",
      "BP_BRANDING_MANAGED_BY_SUPERADMIN"
    );
  }

  if (role === "FRANCHISE") {
    const franchise = await prisma.franchiseProfile.findFirst({
      where: {
        tenantId,
        authUserId: userId,
        isActive: true
      },
      select: {
        id: true,
        logoPath: true,
        logoFilePath: true,
        logoUrl: true
      }
    });

    if (!franchise) {
      return res.apiError(403, "Franchise scope not resolved", "FRANCHISE_SCOPE_REQUIRED");
    }

    req.logoUploadTarget = {
      role: "franchise",
      entityType: "FRANCHISE",
      entityId: franchise.id,
      record: franchise
    };

    return next();
  }

  if (role === "CENTER") {
    const center = await prisma.centerProfile.findFirst({
      where: {
        tenantId,
        authUserId: userId,
        isActive: true
      },
      select: {
        id: true,
        logoPath: true,
        logoFilePath: true,
        logoUrl: true,
        customLogoUrl: true,
        brandingMode: true,
        inheritBranding: true
      }
    });

    if (!center) {
      return res.apiError(403, "Center scope not resolved", "CENTER_SCOPE_REQUIRED");
    }

    req.logoUploadTarget = {
      role: "center",
      entityType: "CENTER",
      entityId: center.id,
      record: center
    };

    return next();
  }

  return res.apiError(403, "Role not allowed to manage logos", "FORBIDDEN");
});

const resolveAdminBusinessPartnerLogoUploadTarget = asyncHandler(async (req, res, next) => {
  const partner = await prisma.businessPartner.findFirst({
    where: {
      id: req.params.id,
      isActive: true
    },
    select: {
      id: true,
      tenantId: true,
      logoPath: true,
      logoFilePath: true,
      logoUrl: true
    }
  });

  if (!partner) {
    return res.apiError(404, "Business partner not found", "BUSINESS_PARTNER_NOT_FOUND");
  }

  req.logoUploadTarget = {
    role: "bp",
    entityType: "BUSINESS_PARTNER",
    entityId: partner.id,
    tenantId: partner.tenantId,
    record: partner
  };

  return next();
});

const getAdminBusinessPartnerBranding = asyncHandler(async (req, res) => {
  const partner = await prisma.businessPartner.findFirst({
    where: {
      id: req.params.id
    },
    select: {
      id: true,
      tenantId: true,
      code: true,
      name: true,
      displayName: true,
      logoPath: true,
      logoFilePath: true,
      logoUrl: true,
      brandingUpdatedAt: true,
      brandingUpdatedByUserId: true,
      brandingUpdatedBy: {
        select: {
          id: true,
          username: true,
          email: true
        }
      }
    }
  });

  if (!partner) {
    return res.apiError(404, "Business partner not found", "BUSINESS_PARTNER_NOT_FOUND");
  }

  return res.apiSuccess("Business partner branding fetched", partner);
});

const uploadLogo = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.apiError(400, "Logo file is required", "FILE_REQUIRED");
  }

  const target = req.logoUploadTarget;
  if (!target?.entityType || !target?.entityId) {
    return res.apiSuccess("Logo upload skipped", {
      skipped: true,
      reason: "LOGO_TARGET_UNAVAILABLE"
    });
  }
  const storedPath = `${LOGO_UPLOAD_PREFIX}${req.file.filename}`;
  const storedFilePath = buildManagedLogoFilePath(req.file.filename);
  const existingPaths = uniqueManagedLogoPaths([
    target?.record?.logoUrl,
    target?.record?.logoFilePath,
    target?.record?.customLogoUrl
  ]);

  try {
    let updated;

    if (target.entityType === "BUSINESS_PARTNER") {
      updated = await prisma.businessPartner.update({
        where: { id: target.entityId },
        data: {
          logoPath: req.file.filename,
          logoFilePath: storedFilePath,
          logoUrl: storedPath,
          brandingUpdatedAt: new Date(),
          brandingUpdatedByUserId: req.auth?.userId || null
        },
        select: {
          id: true,
          logoPath: true,
          logoFilePath: true,
          logoUrl: true,
          brandingUpdatedAt: true,
          brandingUpdatedByUserId: true
        }
      });
    } else if (target.entityType === "FRANCHISE") {
      updated = await prisma.franchiseProfile.update({
        where: { id: target.entityId },
        data: {
          logoPath: req.file.filename,
          logoFilePath: storedFilePath,
          logoUrl: storedPath
        },
        select: {
          id: true,
          logoPath: true,
          logoFilePath: true,
          logoUrl: true
        }
      });
    } else {
      updated = await prisma.centerProfile.update({
        where: { id: target.entityId },
        data: {
          logoPath: req.file.filename,
          logoFilePath: storedFilePath,
          logoUrl: storedPath,
          customLogoUrl: storedPath,
          brandingMode: "CUSTOM_CENTER",
          inheritBranding: false,
          brandingActive: true
        },
        select: {
          id: true,
          logoPath: true,
          logoFilePath: true,
          logoUrl: true,
          customLogoUrl: true,
          brandingMode: true,
          inheritBranding: true
        }
      });
    }

    await Promise.all(existingPaths.filter((value) => value !== storedPath).map(deleteManagedLogoFile));

    res.locals.entityId = target.entityId;
    if (target.entityType === "BUSINESS_PARTNER") {
      res.locals.auditMetadata = {
        managedBrandingRole: "BUSINESS_PARTNER",
        targetTenantId: target.tenantId,
        logoUrl: updated.logoUrl,
        logoPath: updated.logoPath
      };
    }
    return res.apiSuccess("Logo uploaded", {
      entityType: target.entityType,
      entityId: target.entityId,
      filePath: storedPath,
      filename: req.file.filename,
      logoUrl: updated.customLogoUrl || updated.logoUrl || null,
      logoPath: updated.logoPath || null,
      logoFilePath: updated.logoFilePath || null,
      brandingMode: updated.brandingMode || null,
      inheritBranding: typeof updated.inheritBranding === "boolean" ? updated.inheritBranding : null
    });
  } catch (error) {
    return res.apiSuccess("Logo upload skipped", {
      entityType: target.entityType,
      entityId: target.entityId,
      filePath: storedPath,
      filename: req.file.filename,
      skipped: true,
      reason: "CENTER_LOGO_UPLOAD_FALLBACK"
    });
  }
});

const deleteLogo = asyncHandler(async (req, res) => {
  const target = req.logoUploadTarget;
  const existingPaths = uniqueManagedLogoPaths([
    target?.record?.logoUrl,
    target?.record?.logoFilePath,
    target?.record?.customLogoUrl
  ]);

  let updated;

  if (target.entityType === "BUSINESS_PARTNER") {
    updated = await prisma.businessPartner.update({
      where: { id: target.entityId },
      data: {
        logoPath: null,
        logoFilePath: null,
        logoUrl: null,
        brandingUpdatedAt: new Date(),
        brandingUpdatedByUserId: req.auth?.userId || null
      },
      select: {
        id: true,
        logoPath: true,
        logoFilePath: true,
        logoUrl: true,
        brandingUpdatedAt: true,
        brandingUpdatedByUserId: true
      }
    });
  } else if (target.entityType === "FRANCHISE") {
    updated = await prisma.franchiseProfile.update({
      where: { id: target.entityId },
      data: {
        logoPath: null,
        logoFilePath: null,
        logoUrl: null
      },
      select: {
        id: true,
        logoPath: true,
        logoFilePath: true,
        logoUrl: true
      }
    });
  } else {
    updated = await prisma.centerProfile.update({
      where: { id: target.entityId },
      data: {
        logoPath: null,
        logoFilePath: null,
        logoUrl: null,
        customLogoUrl: null,
        brandingMode: "INHERIT_FRANCHISE",
        inheritBranding: true
      },
      select: {
        id: true,
        logoPath: true,
        logoFilePath: true,
        logoUrl: true,
        customLogoUrl: true,
        brandingMode: true,
        inheritBranding: true
      }
    });
  }

  await Promise.all(existingPaths.map(deleteManagedLogoFile));

  res.locals.entityId = target.entityId;
  if (target.entityType === "BUSINESS_PARTNER") {
    res.locals.auditMetadata = {
      managedBrandingRole: "BUSINESS_PARTNER",
      targetTenantId: target.tenantId,
      logoRemoved: true
    };
  }
  return res.apiSuccess("Logo removed", {
    entityType: target.entityType,
    entityId: target.entityId,
    logoUrl: updated.customLogoUrl || updated.logoUrl || null,
    logoPath: updated.logoPath || null,
    logoFilePath: updated.logoFilePath || null,
    brandingMode: updated.brandingMode || null,
    inheritBranding: typeof updated.inheritBranding === "boolean" ? updated.inheritBranding : null
  });
});

export {
  resolveLogoUploadTarget,
  resolveAdminBusinessPartnerLogoUploadTarget,
  resolveSuperadminCenterLogoUploadTarget,
  getAdminBusinessPartnerBranding,
  uploadLogo,
  deleteLogo
};