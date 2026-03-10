import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import { toCsv } from "../utils/csv.js";
import { hashPassword } from "../utils/password.js";
import { generateUsername } from "../utils/username-generator.js";
import { transitionForward, transitionReject } from "../services/competition-workflow.service.js";
import { buildHierarchyDashboardSummary } from "../services/hierarchy-dashboard.service.js";
import { recordAudit } from "../utils/audit.js";

function parseISODateOnly(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
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

function normalizeHierarchyType(type) {
  if (!type) {
    return "SCHOOL";
  }
  const normalized = String(type).trim().toUpperCase();
  const allowed = ["COUNTRY", "REGION", "DISTRICT", "SCHOOL", "BRANCH"];
  return allowed.includes(normalized) ? normalized : "SCHOOL";
}

function normalizeCenterStatus(status) {
  if (!status) {
    return null;
  }

  const s = String(status).trim().toUpperCase();
  if (["ACTIVE", "INACTIVE", "SUSPENDED", "ARCHIVED"].includes(s)) {
    return s;
  }
  return null;
}

function isActiveByCenterStatus(status) {
  return status === "ACTIVE";
}

const getFranchiseMe = asyncHandler(async (req, res) => {
  return res.apiSuccess("Franchise scope loaded", {
    franchiseProfileId: req.franchiseScope.franchise.id,
    franchiseCode: req.franchiseScope.franchise.code,
    businessPartnerId: req.franchiseScope.franchise.businessPartnerId,
    hierarchyNodeId: req.auth.hierarchyNodeId,
    profile: {
      id: req.franchiseScope.franchise.id,
      code: req.franchiseScope.franchise.code,
      name: req.franchiseScope.franchise.name,
      displayName: req.franchiseScope.franchise.displayName,
      status: req.franchiseScope.franchise.status,
      isActive: req.franchiseScope.franchise.isActive,
      phonePrimary: req.franchiseScope.franchise.phonePrimary,
      emailOfficial: req.franchiseScope.franchise.emailOfficial,
      logoUrl: req.franchiseScope.franchise.logoUrl
    },
    authUser: req.franchiseScope.franchise.authUser || null
  });
});

const getFranchiseDashboard = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const franchiseProfileId = req.franchiseScope.franchise.id;
  const nodeIds = req.franchiseScope.hierarchyNodeIds;

  const centerProfiles = await prisma.centerProfile.findMany({
    where: {
      tenantId,
      franchiseProfileId,
      status: { not: "ARCHIVED" }
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      authUser: {
        select: {
          hierarchyNodeId: true
        }
      }
    }
  });

  const dashboard = await buildHierarchyDashboardSummary({
    tenantId,
    centerProfiles: centerProfiles.map((center) => ({
      centerProfileId: center.id,
      code: center.code,
      name: center.name,
      status: center.status,
      hierarchyNodeId: center.authUser?.hierarchyNodeId || null
    })),
    settlementsWhere: {
      tenantId,
      businessPartnerId: req.franchiseScope.franchise.businessPartnerId
    },
    pendingCompetitionWhere: {
      tenantId,
      workflowStage: "FRANCHISE_REVIEW",
      ...(nodeIds.length ? { hierarchyNodeId: { in: nodeIds } } : {})
    }
  });

  return res.apiSuccess("Franchise dashboard fetched", {
    kpis: {
      centersCount: dashboard.overview.activeCentersCount,
      studentsCount: dashboard.overview.activeStudentsCount,
      activeEnrollments: dashboard.overview.activeEnrollments,
      teachersCount: dashboard.overview.teachersCount,
      attendanceRate30d: dashboard.operations.attendanceRate30d,
      collections30d: dashboard.finance.collections30d
    },
    dashboard,
    system: {
      api: "ok",
      now: new Date().toISOString()
    }
  });
});

const listFranchiseMargins = asyncHandler(async (req, res) => {
  const businessPartnerId = req.franchiseScope.franchise.businessPartnerId;

  const items = await prisma.margin.findMany({
    where: {
      tenantId: req.auth.tenantId,
      businessPartnerId
    },
    orderBy: [{ isActive: "desc" }, { effectiveFrom: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: 500
  });

  return res.apiSuccess("Franchise margins fetched", { items });
});

const listFranchiseSettlements = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset, orderBy } = parsePagination(req.query);
  const businessPartnerId = req.franchiseScope.franchise.businessPartnerId;

  const where = {
    tenantId: req.auth.tenantId,
    businessPartnerId
  };

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

  return res.apiSuccess("Franchise settlements fetched", { total, items, limit, offset });
});

const listFranchiseCenters = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset, orderBy } = parsePagination(req.query);
  const q = req.query.q ? String(req.query.q).trim() : null;
  const status = normalizeCenterStatus(req.query.status);

  const where = {
    tenantId: req.auth.tenantId,
    franchiseProfileId: req.franchiseScope.franchise.id,
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
            OR: [{ username: { contains: q } }, { email: { contains: q } }]
          }
        }
      }
    ];
  }

  const [items, total] = await Promise.all([
    prisma.centerProfile.findMany({
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
              select: { id: true, name: true, code: true, type: true, isActive: true, parentId: true }
            }
          }
        },
        address: true
      }
    }),
    prisma.centerProfile.count({ where })
  ]);

  return res.apiSuccess("Centers fetched", {
    items,
    limit,
    offset,
    total
  });
});

const createCenter = asyncHandler(async (req, res) => {
  const {
    name,
    displayName,
    status,
    phonePrimary,
    emailOfficial,
    password,
    type,
    parentId,
    whatsappEnabled,
    inheritBranding,
    headPrincipalName,
    affiliationCode,
    logoUrl,
    websiteUrl,
    onboardingDate,
    addressLine1,
    addressLine2,
    city,
    district,
    state,
    country,
    pincode
  } = req.body;

  if (!name || !displayName || !emailOfficial || !phonePrimary) {
    return res.apiError(
      400,
      "name, displayName, emailOfficial, phonePrimary are required",
      "VALIDATION_ERROR"
    );
  }

  if (!password) {
    return res.apiError(400, "password is required", "VALIDATION_ERROR");
  }

  const normalizedStatus = normalizeCenterStatus(status) || "ACTIVE";
  const nodeType = normalizeHierarchyType(type);

  const resolvedParentNodeId = parentId || req.auth.hierarchyNodeId;
  if (!resolvedParentNodeId) {
    return res.apiError(409, "Franchise hierarchy root not configured", "FRANCHISE_HIERARCHY_REQUIRED");
  }

  if (req.franchiseScope.hierarchyNodeIds.length && !req.franchiseScope.hierarchyNodeIds.includes(resolvedParentNodeId)) {
    return res.apiError(403, "Parent hierarchy node outside franchise scope", "FRANCHISE_SCOPE_DENIED");
  }

  const created = await prisma.$transaction(async (tx) => {
    const username = await generateUsername({
      tx,
      tenantId: req.auth.tenantId,
      role: "CENTER"
    });

    const node = await tx.hierarchyNode.create({
      data: {
        tenantId: req.auth.tenantId,
        name: String(name).trim(),
        code: username,
        type: nodeType,
        parentId: resolvedParentNodeId,
        isActive: isActiveByCenterStatus(normalizedStatus)
      }
    });

    const passwordHash = await hashPassword(password);

    const user = await tx.authUser.create({
      data: {
        tenantId: req.auth.tenantId,
        username,
        email: String(emailOfficial).trim(),
        passwordHash,
        role: "CENTER",
        hierarchyNodeId: node.id,
        parentUserId: req.auth.userId,
        mustChangePassword: true,
        isActive: isActiveByCenterStatus(normalizedStatus)
      },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true,
        createdAt: true
      }
    });

    const profile = await tx.centerProfile.create({
      data: {
        tenantId: req.auth.tenantId,
        franchiseProfileId: req.franchiseScope.franchise.id,
        authUserId: user.id,
        code: username,
        name: String(name).trim(),
        displayName: normalizeString(displayName),
        status: normalizedStatus,
        isActive: isActiveByCenterStatus(normalizedStatus),
        phonePrimary: normalizeString(phonePrimary),
        emailOfficial: String(emailOfficial).trim(),
        whatsappEnabled: normalizeBoolean(whatsappEnabled, false),
        inheritBranding: normalizeBoolean(inheritBranding, true),
        headPrincipalName: normalizeString(headPrincipalName),
        affiliationCode: normalizeString(affiliationCode),
        logoUrl: normalizeString(logoUrl),
        websiteUrl: normalizeString(websiteUrl),
        onboardingDate: onboardingDate ? parseISODateOnly(onboardingDate) || undefined : undefined
      }
    });

    const hasAddress = Boolean(addressLine1 && city && state);

    const address = hasAddress
      ? await tx.centerAddress.create({
          data: {
            tenantId: req.auth.tenantId,
            centerProfileId: profile.id,
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
    "Center created",
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

const updateCenter = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const {
    name,
    displayName,
    status,
    phonePrimary,
    emailOfficial,
    whatsappEnabled,
    inheritBranding,
    headPrincipalName,
    affiliationCode,
    logoUrl,
    websiteUrl,
    onboardingDate,
    addressLine1,
    addressLine2,
    city,
    district,
    state,
    country,
    pincode
  } = req.body;

  const existing = await prisma.centerProfile.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId,
      franchiseProfileId: req.franchiseScope.franchise.id
    },
    include: {
      authUser: { select: { id: true, hierarchyNodeId: true } },
      address: { select: { id: true } }
    }
  });

  if (!existing) {
    return res.apiError(404, "Center not found", "CENTER_NOT_FOUND");
  }

  const nextStatus = normalizeCenterStatus(status);
  const nextIsActive = nextStatus ? isActiveByCenterStatus(nextStatus) : existing.isActive;

  const updated = await prisma.$transaction(async (tx) => {
    const profile = await tx.centerProfile.update({
      where: { id: existing.id },
      data: {
        ...(name ? { name: String(name).trim() } : {}),
        ...(displayName !== undefined ? { displayName: normalizeString(displayName) } : {}),
        ...(nextStatus ? { status: nextStatus, isActive: nextIsActive } : {}),
        ...(phonePrimary !== undefined ? { phonePrimary: normalizeString(phonePrimary) } : {}),
        ...(emailOfficial ? { emailOfficial: String(emailOfficial).trim() } : {}),
        ...(whatsappEnabled !== undefined ? { whatsappEnabled: normalizeBoolean(whatsappEnabled, existing.whatsappEnabled) } : {}),
        ...(inheritBranding !== undefined ? { inheritBranding: normalizeBoolean(inheritBranding, existing.inheritBranding) } : {}),
        ...(headPrincipalName !== undefined ? { headPrincipalName: normalizeString(headPrincipalName) } : {}),
        ...(affiliationCode !== undefined ? { affiliationCode: normalizeString(affiliationCode) } : {}),
        ...(logoUrl !== undefined ? { logoUrl: normalizeString(logoUrl) } : {}),
        ...(websiteUrl !== undefined ? { websiteUrl: normalizeString(websiteUrl) } : {}),
        ...(onboardingDate !== undefined ? { onboardingDate: onboardingDate ? parseISODateOnly(onboardingDate) : null } : {})
      },
      include: { address: true }
    });

    if (emailOfficial || nextStatus) {
      await tx.authUser.update({
        where: { id: existing.authUser.id },
        data: {
          ...(emailOfficial ? { email: String(emailOfficial).trim() } : {}),
          ...(nextStatus ? { isActive: nextIsActive } : {})
        }
      });
    }

    if (existing.authUser?.hierarchyNodeId && (name || nextStatus)) {
      await tx.hierarchyNode.update({
        where: { id: existing.authUser.hierarchyNodeId },
        data: {
          ...(name ? { name: String(name).trim() } : {}),
          ...(nextStatus ? { isActive: nextIsActive } : {})
        }
      });
    }

    const hasAddressPatch =
      addressLine1 !== undefined ||
      addressLine2 !== undefined ||
      city !== undefined ||
      district !== undefined ||
      state !== undefined ||
      country !== undefined ||
      pincode !== undefined;

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
        if (profile.address?.id) {
          await tx.centerAddress.delete({ where: { id: profile.address.id } });
        }
      } else if (profile.address?.id) {
        await tx.centerAddress.update({
          where: { id: profile.address.id },
          data: next
        });
      } else {
        await tx.centerAddress.create({
          data: {
            tenantId: req.auth.tenantId,
            centerProfileId: profile.id,
            ...next
          }
        });
      }
    }

    return tx.centerProfile.findFirst({
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
        address: true
      }
    });
  });

  res.locals.entityId = existing.id;
  return res.apiSuccess("Center updated", updated);
});

const deleteCenter = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.centerProfile.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId,
      franchiseProfileId: req.franchiseScope.franchise.id
    },
    include: {
      authUser: { select: { id: true, hierarchyNodeId: true } }
    }
  });

  if (!existing) {
    return res.apiError(404, "Center not found", "CENTER_NOT_FOUND");
  }

  await prisma.$transaction(async (tx) => {
    await tx.centerProfile.update({
      where: { id: existing.id },
      data: {
        status: "ARCHIVED",
        isActive: false
      }
    });

    await tx.authUser.update({
      where: { id: existing.authUser.id },
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
    action: "CENTER_ARCHIVE",
    entityType: "CENTER_PROFILE",
    entityId: existing.id,
    metadata: { authUserId: existing.authUser.id }
  });

  res.locals.entityId = existing.id;
  return res.apiSuccess("Center archived", { id: existing.id });
});

const resetCenterPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newPassword, mustChangePassword = true } = req.body;

  if (!newPassword) {
    return res.apiError(400, "newPassword is required", "VALIDATION_ERROR");
  }

  const center = await prisma.centerProfile.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId,
      franchiseProfileId: req.franchiseScope.franchise.id,
      status: { not: "ARCHIVED" }
    },
    select: {
      id: true,
      authUserId: true,
      code: true,
      name: true,
      authUser: { select: { id: true, role: true, username: true, email: true } }
    }
  });

  if (!center) {
    return res.apiError(404, "Center not found", "CENTER_NOT_FOUND");
  }

  if (center.authUser?.role && center.authUser.role !== "CENTER") {
    return res.apiError(409, "Target user is not a center", "CENTER_USER_ROLE_REQUIRED");
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.authUser.update({
      where: { id: center.authUserId },
      data: {
        passwordHash,
        mustChangePassword: Boolean(mustChangePassword),
        failedAttempts: 0,
        lockUntil: null
      }
    });

    await tx.refreshToken.updateMany({
      where: {
        userId: center.authUserId,
        tenantId: req.auth.tenantId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  });

  res.locals.entityId = center.id;
  res.locals.auditMetadata = {
    ...(res.locals.auditMetadata || {}),
    centerAuthUserId: center.authUserId,
    centerCode: center.code
  };

  return res.apiSuccess("Center password reset successful", {
    centerId: center.id,
    username: center.authUser?.username || center.code
  });
});

const listFranchiseStudents = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset, orderBy } = parsePagination(req.query);
  const q = req.query.q ? String(req.query.q).trim() : null;
  const centerNodeId = req.query.centerId ? String(req.query.centerId).trim() : null;

  const nodeIds = req.franchiseScope.hierarchyNodeIds;

  const where = {
    tenantId: req.auth.tenantId,
    isActive: true,
    hierarchyNodeId: centerNodeId
      ? centerNodeId
      : nodeIds.length
        ? { in: nodeIds }
        : undefined
  };

  if (q) {
    where.OR = [
      { admissionNo: { contains: q } },
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { email: { contains: q } },
      {
        hierarchyNode: {
          is: {
            name: { contains: q }
          }
        }
      }
    ];
  }

  const [items, total] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        createdAt: true,
        hierarchyNode: {
          select: { id: true, name: true, code: true, type: true }
        },
        enrollments: {
          where: { isActive: true },
          select: { competitionId: true }
        }
      }
    }),
    prisma.student.count({ where })
  ]);

  return res.apiSuccess("Franchise students fetched", {
    items: items.map((s) => ({
      ...s,
      activeEnrollments: s.enrollments?.length || 0
    })),
    limit,
    offset,
    total
  });
});

const exportFranchiseStudentsCsv = asyncHandler(async (req, res) => {
  const q = req.query.q ? String(req.query.q).trim() : null;
  const centerNodeId = req.query.centerId ? String(req.query.centerId).trim() : null;
  const nodeIds = req.franchiseScope.hierarchyNodeIds;

  const where = {
    tenantId: req.auth.tenantId,
    hierarchyNodeId: centerNodeId
      ? centerNodeId
      : nodeIds.length
        ? { in: nodeIds }
        : undefined
  };

  if (q) {
    where.OR = [
      { admissionNo: { contains: q } },
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { email: { contains: q } },
      {
        hierarchyNode: {
          is: {
            name: { contains: q }
          }
        }
      }
    ];
  }

  const items = await prisma.student.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    select: {
      admissionNo: true,
      firstName: true,
      lastName: true,
      email: true,
      isActive: true,
      createdAt: true,
      hierarchyNode: { select: { code: true, name: true, type: true } }
    }
  });

  const csv = toCsv(
    items.map((s) => ({
      admissionNo: s.admissionNo,
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email || "",
      status: s.isActive ? "ACTIVE" : "INACTIVE",
      centerCode: s.hierarchyNode?.code || "",
      centerName: s.hierarchyNode?.name || "",
      centerType: s.hierarchyNode?.type || "",
      createdAt: s.createdAt.toISOString()
    })),
    ["admissionNo", "firstName", "lastName", "email", "status", "centerCode", "centerName", "centerType", "createdAt"]
  );

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=franchise_students.csv");
  return res.status(200).send(csv);
});

const getFranchiseReports = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const nodeIds = req.franchiseScope.hierarchyNodeIds;

  const centers = await prisma.centerProfile.findMany({
    where: {
      tenantId,
      franchiseProfileId: req.franchiseScope.franchise.id,
      status: { not: "ARCHIVED" }
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      authUser: {
        select: {
          hierarchyNodeId: true
        }
      }
    }
  });

  const centerNodeIds = centers.map((c) => c.authUser?.hierarchyNodeId).filter(Boolean);

  const [studentsByNode, enrollmentsByNode] = await Promise.all([
    prisma.student.groupBy({
      by: ["hierarchyNodeId"],
      where: {
        tenantId,
        hierarchyNodeId: centerNodeIds.length ? { in: centerNodeIds } : undefined
      },
      _count: { _all: true }
    }),
    prisma.competitionEnrollment.groupBy({
      by: ["studentId"],
      where: {
        tenantId,
        isActive: true,
        student: nodeIds.length ? { is: { hierarchyNodeId: { in: nodeIds } } } : undefined
      },
      _count: { _all: true }
    })
  ]);

  const studentsCountByNodeId = new Map(studentsByNode.map((r) => [r.hierarchyNodeId, r._count._all]));

  const reportRows = centers.map((c) => {
    const nodeId = c.authUser?.hierarchyNodeId || null;
    return {
      centerCode: c.code,
      centerName: c.name,
      centerStatus: c.status,
      studentsTotal: nodeId ? Number(studentsCountByNodeId.get(nodeId) || 0) : 0
    };
  });

  return res.apiSuccess("Franchise reports fetched", {
    summary: {
      centers: centers.length,
      studentsTotal: reportRows.reduce((sum, r) => sum + r.studentsTotal, 0),
      activeEnrollments: enrollmentsByNode.length
    },
    centers: reportRows
  });
});

const exportFranchiseReportsCsv = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;

  const centers = await prisma.centerProfile.findMany({
    where: {
      tenantId,
      franchiseProfileId: req.franchiseScope.franchise.id,
      status: { not: "ARCHIVED" }
    },
    select: {
      code: true,
      name: true,
      status: true,
      authUser: { select: { hierarchyNodeId: true } }
    }
  });

  const centerNodeIds = centers.map((c) => c.authUser?.hierarchyNodeId).filter(Boolean);
  const studentsByNode = await prisma.student.groupBy({
    by: ["hierarchyNodeId"],
    where: {
      tenantId,
      hierarchyNodeId: centerNodeIds.length ? { in: centerNodeIds } : undefined
    },
    _count: { _all: true }
  });

  const studentsCountByNodeId = new Map(studentsByNode.map((r) => [r.hierarchyNodeId, r._count._all]));

  const csv = toCsv(
    centers.map((c) => ({
      centerCode: c.code,
      centerName: c.name,
      centerStatus: c.status,
      studentsTotal: String(studentsCountByNodeId.get(c.authUser?.hierarchyNodeId) || 0)
    })),
    ["centerCode", "centerName", "centerStatus", "studentsTotal"]
  );

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=franchise_reports.csv");
  return res.status(200).send(csv);
});

const listFranchiseCompetitionRequests = asyncHandler(async (req, res) => {
  const { take, skip, orderBy } = parsePagination(req.query);
  const nodeIds = req.franchiseScope.hierarchyNodeIds;

  const where = {
    tenantId: req.auth.tenantId,
    workflowStage: "FRANCHISE_REVIEW",
    ...(nodeIds.length ? { hierarchyNodeId: { in: nodeIds } } : {})
  };

  const data = await prisma.competition.findMany({
    where,
    orderBy,
    skip,
    take,
    include: {
      hierarchyNode: { select: { id: true, name: true, type: true } },
      level: { select: { id: true, name: true, rank: true } },
      createdBy: { select: { id: true, email: true, role: true } }
    }
  });

  return res.apiSuccess("Franchise competition requests fetched", data);
});

const forwardFranchiseCompetitionRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await transitionForward({
    tenantId: req.auth.tenantId,
    competitionId: id,
    actorUserId: req.auth.userId,
    actorRole: "FRANCHISE"
  });

  res.locals.entityId = id;
  return res.apiSuccess("Competition request forwarded", result.competition);
});

const rejectFranchiseCompetitionRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const result = await transitionReject({
    tenantId: req.auth.tenantId,
    competitionId: id,
    actorUserId: req.auth.userId,
    actorRole: "FRANCHISE",
    reason
  });

  res.locals.entityId = id;
  return res.apiSuccess("Competition request rejected", result.competition);
});

const updateFranchiseProfile = asyncHandler(async (req, res) => {
  const allowed = [
    "displayName",
    "phonePrimary",
    "emailOfficial",
    "whatsappEnabled",
    "logoUrl"
  ];

  const data = {};
  for (const key of allowed) {
    if (key in req.body) {
      const value = req.body[key];
      if (typeof value === "boolean") {
        data[key] = value;
      } else if (value === null) {
        data[key] = null;
      } else if (value !== undefined) {
        data[key] = String(value).trim();
      }
    }
  }

  if (!Object.keys(data).length) {
    return res.apiError(400, "No updatable fields provided", "VALIDATION_ERROR");
  }

  const updated = await prisma.franchiseProfile.update({
    where: { id: req.franchiseScope.franchise.id },
    data
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Franchise profile updated", {
    id: updated.id,
    code: updated.code,
    name: updated.name,
    displayName: updated.displayName,
    status: updated.status,
    isActive: updated.isActive,
    phonePrimary: updated.phonePrimary,
    emailOfficial: updated.emailOfficial,
    whatsappEnabled: updated.whatsappEnabled,
    logoUrl: updated.logoUrl
  });
});

const listFranchiseCourses = asyncHandler(async (req, res) => {
  const businessPartnerId = req.franchiseScope.businessPartnerId;
  if (!businessPartnerId) {
    return res.apiSuccess("Available courses", []);
  }

  const accesses = await prisma.partnerCourseAccess.findMany({
    where: { businessPartnerId },
    include: {
      course: {
        select: { id: true, code: true, name: true, description: true, isActive: true }
      }
    }
  });

  const courses = accesses.map((a) => a.course).filter((c) => c.isActive);
  return res.apiSuccess("Available courses", courses);
});

export {
  getFranchiseMe,
  updateFranchiseProfile,
  getFranchiseDashboard,
  listFranchiseMargins,
  listFranchiseSettlements,
  listFranchiseCenters,
  createCenter,
  updateCenter,
  deleteCenter,
  resetCenterPassword,
  listFranchiseStudents,
  exportFranchiseStudentsCsv,
  getFranchiseReports,
  exportFranchiseReportsCsv,
  listFranchiseCompetitionRequests,
  forwardFranchiseCompetitionRequest,
  rejectFranchiseCompetitionRequest,
  listFranchiseCourses
};
