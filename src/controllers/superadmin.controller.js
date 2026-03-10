import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { hashPassword } from "../utils/password.js";
import { safelyUpdateUserRole } from "../services/superadmin-guard.service.js";
import { recordAudit } from "../utils/audit.js";
import { generateUsername } from "../utils/username-generator.js";
import { parsePagination } from "../utils/pagination.js";
import { buildHierarchyDashboardSummary } from "../services/hierarchy-dashboard.service.js";
import { cascadeSetBusinessPartnerActiveState } from "../services/business-partner-cascade.service.js";

/* ── Normalize helpers (local to superadmin scope) ── */
function parseISODateOnly(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeString(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const n = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(n)) return true;
  if (["false", "0", "no", "n"].includes(n)) return false;
  return fallback;
}

const listSuperadmins = asyncHandler(async (req, res) => {
  const data = await prisma.superadmin.findMany({
    where: {
      tenantId: req.auth.tenantId
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, fullName: true, isActive: true, createdAt: true }
  });

  return res.apiSuccess("Superadmins fetched", data);
});

const createSuperadmin = asyncHandler(async (req, res) => {
  const email = String(req.body.email || "").trim();
  const password = String(req.body.password || "");
  const fullName = String(req.body.fullName || "").trim();

  if (!email || !password || !fullName) {
    return res.apiError(400, "email, password and fullName are required", "VALIDATION_ERROR");
  }

  const generatedHash = await hashPassword(password);

  const created = await prisma.$transaction(async (tx) => {
    const username = await generateUsername({
      tx,
      tenantId: req.auth.tenantId,
      role: "SUPERADMIN"
    });

    const authUser = await tx.authUser.create({
      data: {
        username,
        email,
        passwordHash: generatedHash,
        role: "SUPERADMIN",
        tenantId: req.auth.tenantId,
        parentUserId: req.auth.userId
      }
    });

    const superadmin = await tx.superadmin.create({
      data: {
        tenantId: req.auth.tenantId,
        email,
        fullName,
        authUserId: authUser.id
      },
      select: { id: true, email: true, fullName: true, isActive: true, createdAt: true }
    });

    return superadmin;
  });

  res.locals.entityId = created.id;
  return res.apiSuccess("Superadmin created", created, 201);
});

const listUsersByRole = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset, orderBy } = parsePagination(req.query);
  const role = req.query.role ? String(req.query.role).trim().toUpperCase() : null;
  const q = req.query.q ? String(req.query.q).trim() : null;
  const status = req.query.status ? String(req.query.status).trim().toUpperCase() : null;
  const parentId = req.query.parentId ? String(req.query.parentId).trim() : null;

  /* ── STUDENT branch: query the Student table directly ── */
  if (role === "STUDENT") {
    const sWhere = { tenantId: req.auth.tenantId };

    if (status === "ACTIVE") sWhere.isActive = true;
    else if (status === "INACTIVE") sWhere.isActive = false;

    if (parentId) {
      sWhere.hierarchyNode = { is: { parentId } };
    }

    if (q) {
      sWhere.OR = [
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { admissionNo: { contains: q } },
        { email: { contains: q } },
        { guardianName: { contains: q } },
        { guardianPhone: { contains: q } },
        { hierarchyNode: { is: { name: { contains: q } } } },
        { hierarchyNode: { is: { code: { contains: q } } } },
        { hierarchyNode: { is: { parent: { is: { name: { contains: q } } } } } }
      ];
    }

    const [items, total] = await prisma.$transaction([
      prisma.student.findMany({
        where: sWhere,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          email: true,
          guardianName: true,
          guardianPhone: true,
          phonePrimary: true,
          isActive: true,
          createdAt: true,
          hierarchyNodeId: true,
          level: { select: { id: true, name: true } },
          hierarchyNode: {
            select: {
              id: true, code: true, name: true, type: true, isActive: true,
              parent: {
                select: {
                  id: true, code: true, name: true, type: true,
                  parent: { select: { id: true, code: true, name: true, type: true } }
                }
              }
            }
          }
        }
      }),
      prisma.student.count({ where: sWhere })
    ]);

    return res.apiSuccess("Students fetched", {
      items: items.map((s) => ({
        ...s,
        username: s.admissionNo,
        role: "STUDENT",
        _source: "student"
      })),
      total,
      limit,
      offset
    });
  }

  /* ── Default branch: query AuthUser ── */
  const where = {
    tenantId: req.auth.tenantId,
    isActive: true
  };

  if (role) {
    where.role = role;
  }

  const hierarchyNodeIs = {};

  if (parentId) {
    hierarchyNodeIs.parentId = parentId;
  }

  if (q) {
    where.OR = [
      { username: { contains: q } },
      { email: { contains: q } },
      {
        hierarchyNode: {
          is: {
            name: { contains: q }
          }
        }
      },
      {
        hierarchyNode: {
          is: {
            code: { contains: q }
          }
        }
      },
      {
        hierarchyNode: {
          is: {
            parent: {
              is: {
                name: { contains: q }
              }
            }
          }
        }
      },
      {
        hierarchyNode: {
          is: {
            parent: {
              is: {
                code: { contains: q }
              }
            }
          }
        }
      }
    ];
  }

  if (status === "ACTIVE") {
    hierarchyNodeIs.isActive = true;
  }

  if (status === "INACTIVE") {
    hierarchyNodeIs.isActive = false;
  }

  if (Object.keys(hierarchyNodeIs).length) {
    where.hierarchyNode = { is: hierarchyNodeIs };
  }

  const [items, total] = await prisma.$transaction([
    prisma.authUser.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        hierarchyNodeId: true,
        createdAt: true,
        hierarchyNode: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            isActive: true,
            parent: {
              select: {
                id: true,
                code: true,
                name: true,
                type: true,
                parent: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    type: true
                  }
                }
              }
            }
          }
        }
      }
    }),
    prisma.authUser.count({ where })
  ]);

  return res.apiSuccess("Users fetched", {
    items,
    total,
    limit,
    offset
  });
});

const updateUserRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!role) {
    return res.apiError(400, "role is required", "VALIDATION_ERROR");
  }

  const updated = await prisma.$transaction(async (tx) => {
    return safelyUpdateUserRole({
      tx,
      actor: {
        userId: req.auth.userId,
        role: req.auth.role,
        tenantId: req.auth.tenantId
      },
      targetUserId: id,
      targetNewRole: role
    });
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "ROLE_UPDATE",
    entityType: "AUTH_USER",
    entityId: updated.id,
    metadata: {
      newRole: updated.role
    }
  }, { strict: true });

  return res.apiSuccess("User role updated", updated);
});

function decimalToNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  // Prisma Decimal.js
  if (typeof value?.toNumber === "function") {
    return value.toNumber();
  }

  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

const getKpis = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    activeBusinessPartners,
    activeStudents,
    centerUsers,
    franchiseUsers,
    activeCompetitions,
    pendingCompetitionApprovals,
    openAbuseFlags,
    auditEventsLast24h,
    revenueMtdAgg
  ] = await Promise.all([
    prisma.businessPartner.count({
      where: {
        tenantId,
        status: "ACTIVE",
        isActive: true
      }
    }),
    prisma.student.count({
      where: {
        tenantId,
        isActive: true
      }
    }),
    prisma.authUser.count({
      where: {
        tenantId,
        role: "CENTER",
        isActive: true
      }
    }),
    prisma.authUser.count({
      where: {
        tenantId,
        role: "FRANCHISE",
        isActive: true
      }
    }),
    prisma.competition.count({
      where: {
        tenantId,
        status: "ACTIVE"
      }
    }),
    prisma.competition.count({
      where: {
        tenantId,
        workflowStage: "SUPERADMIN_APPROVAL",
        status: { in: ["DRAFT", "SCHEDULED", "ACTIVE"] }
      }
    }),
    prisma.abuseFlag.count({
      where: {
        tenantId,
        resolvedAt: null
      }
    }),
    prisma.auditLog.count({
      where: {
        tenantId,
        createdAt: { gte: since24h }
      }
    }),
    prisma.financialTransaction.aggregate({
      where: {
        tenantId,
        createdAt: { gte: monthStart }
      },
      _sum: {
        grossAmount: true
      }
    })
  ]);

  return res.apiSuccess("KPIs fetched", {
    asOf: now.toISOString(),
    tenantId,
    health: {
      uptimeSeconds: Math.round(process.uptime()),
      db: "ok"
    },
    metrics: {
      activeBusinessPartners,
      activeStudents,
      activeCenterUsers: centerUsers,
      activeFranchiseUsers: franchiseUsers,
      activeCompetitions,
      pendingCompetitionApprovals,
      openAbuseFlags,
      auditEventsLast24h,
      grossRevenueMtd: decimalToNumber(revenueMtdAgg?._sum?.grossAmount)
    }
  });
});

const recordDashboardAction = asyncHandler(async (req, res) => {
  const actionType = req.body?.actionType ? String(req.body.actionType).trim() : null;
  if (!actionType) {
    return res.apiError(400, "actionType is required", "VALIDATION_ERROR");
  }

  const metadata = req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : null;
  res.locals.auditMetadata = {
    actionType,
    ...(metadata ? { clientMetadata: metadata } : {})
  };

  return res.apiSuccess("Dashboard action recorded", { actionType }, 201);
});

/* ─── Hierarchy Monitor ─── */

const getHierarchyTree = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;

  const [bps, franchises, centers, studentsByNode, teachersByNode] = await Promise.all([
    prisma.businessPartner.findMany({
      where: { tenantId },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        _count: { select: { franchiseProfiles: true } }
      },
      orderBy: { name: "asc" }
    }),
    prisma.franchiseProfile.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        businessPartnerId: true,
        _count: { select: { centerProfiles: true } }
      },
      orderBy: { name: "asc" }
    }),
    prisma.centerProfile.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        franchiseProfileId: true,
        authUser: { select: { hierarchyNodeId: true } }
      },
      orderBy: { name: "asc" }
    }),
    prisma.student.groupBy({
      by: ["hierarchyNodeId"],
      where: { tenantId, isActive: true },
      _count: { _all: true }
    }),
    prisma.authUser.groupBy({
      by: ["hierarchyNodeId"],
      where: { tenantId, role: "TEACHER", isActive: true },
      _count: { _all: true }
    })
  ]);

  const studentCountMap = new Map(studentsByNode.map((s) => [s.hierarchyNodeId, s._count._all]));
  const teacherCountMap = new Map(teachersByNode.map((t) => [t.hierarchyNodeId, t._count._all]));

  const tree = bps.map((bp) => {
    const bpFranchises = franchises.filter((f) => f.businessPartnerId === bp.id);
    const bpCenterIds = [];
    let totalStudents = 0;
    let totalTeachers = 0;
    let activeCenters = 0;
    let centersWithoutTeacher = 0;

    const franchiseNodes = bpFranchises.map((f) => {
      const fCenters = centers.filter((c) => c.franchiseProfileId === f.id);
      let fStudents = 0;
      let fTeachers = 0;
      const centerNodes = fCenters.map((c) => {
        const nodeId = c.authUser?.hierarchyNodeId;
        const sc = nodeId ? (studentCountMap.get(nodeId) || 0) : 0;
        const tc = nodeId ? (teacherCountMap.get(nodeId) || 0) : 0;
        fStudents += sc;
        fTeachers += tc;
        if (c.status === "ACTIVE") activeCenters++;
        if (tc === 0 && c.status === "ACTIVE") centersWithoutTeacher++;
        bpCenterIds.push(c.id);
        return { id: c.id, code: c.code, name: c.name, status: c.status, students: sc, teachers: tc };
      });
      totalStudents += fStudents;
      totalTeachers += fTeachers;
      return {
        id: f.id, code: f.code, name: f.name, status: f.status,
        centerCount: f._count.centerProfiles,
        students: fStudents, teachers: fTeachers,
        centers: centerNodes
      };
    });

    const totalCenters = bpCenterIds.length;
    const subExpired = bp.subscriptionStatus === "ACTIVE" && bp.subscriptionExpiresAt && bp.subscriptionExpiresAt < new Date();
    let alertCount = 0;
    if (centersWithoutTeacher > 0) alertCount++;
    if (subExpired) alertCount++;
    if (totalCenters === 0) alertCount++;
    if (totalStudents === 0 && totalCenters > 0) alertCount++;

    const healthScore = Math.max(0, Math.min(100,
      100
      - (totalCenters === 0 ? 30 : 0)
      - (centersWithoutTeacher > 0 ? Math.min(20, centersWithoutTeacher * 5) : 0)
      - (subExpired ? 15 : 0)
      - (totalStudents === 0 && totalCenters > 0 ? 20 : 0)
      - (activeCenters < totalCenters * 0.5 ? 10 : 0)
    ));

    return {
      id: bp.id, code: bp.code, name: bp.name, status: bp.status,
      franchiseCount: bp._count.franchiseProfiles,
      students: totalStudents, teachers: totalTeachers,
      centers: totalCenters, activeCenters,
      healthScore, alertCount,
      franchises: franchiseNodes
    };
  });

  return res.apiSuccess("Hierarchy tree loaded", {
    tree,
    totals: { bps: bps.length, franchises: franchises.length, centers: centers.length }
  });
});

const getHierarchyDashboard = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const bpId = req.query.bpId ? String(req.query.bpId).trim() : null;

  if (!bpId) {
    return res.apiError(400, "bpId query parameter is required", "VALIDATION_ERROR");
  }

  const bp = await prisma.businessPartner.findFirst({
    where: { id: bpId, tenantId },
    select: { id: true, code: true, name: true, status: true }
  });
  if (!bp) {
    return res.apiError(404, "Business Partner not found", "NOT_FOUND");
  }

  const [franchiseProfiles, centerProfiles] = await Promise.all([
    prisma.franchiseProfile.findMany({
      where: { tenantId, businessPartnerId: bpId, status: { not: "ARCHIVED" } },
      select: { id: true, code: true, name: true, status: true }
    }),
    prisma.centerProfile.findMany({
      where: {
        tenantId,
        franchiseProfile: { is: { businessPartnerId: bpId } },
        status: { not: "ARCHIVED" }
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        franchiseProfileId: true,
        franchiseProfile: { select: { code: true, name: true } },
        authUser: { select: { hierarchyNodeId: true } }
      }
    })
  ]);

  const dashboard = await buildHierarchyDashboardSummary({
    tenantId,
    centerProfiles: centerProfiles.map((c) => ({
      centerProfileId: c.id,
      code: c.code,
      name: c.name,
      status: c.status,
      hierarchyNodeId: c.authUser?.hierarchyNodeId || null,
      franchiseProfileId: c.franchiseProfileId,
      franchiseCode: c.franchiseProfile?.code || null,
      franchiseName: c.franchiseProfile?.name || null
    })),
    settlementsWhere: { tenantId, businessPartnerId: bpId },
    pendingCompetitionWhere: {
      tenantId,
      workflowStage: { in: ["BP_REVIEW", "SUPERADMIN_APPROVAL"] }
    },
    franchisesCount: franchiseProfiles.filter((f) => f.status === "ACTIVE").length
  });

  return res.apiSuccess("Hierarchy dashboard loaded", {
    bp,
    franchiseCount: franchiseProfiles.length,
    centerCount: centerProfiles.length,
    ...dashboard
  });
});

const getSystemHealth = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;

  const [bpCount, franchiseCount, centerCount, studentsActive, studentsTotal,
    teacherCount, subscriptionsActive, subscriptionsExpired,
    pendingApprovals, recentAuditEvents] = await Promise.all([
    prisma.businessPartner.count({ where: { tenantId } }),
    prisma.franchiseProfile.count({ where: { tenantId, status: "ACTIVE" } }),
    prisma.centerProfile.count({ where: { tenantId, status: "ACTIVE" } }),
    prisma.student.count({ where: { tenantId, isActive: true } }),
    prisma.student.count({ where: { tenantId } }),
    prisma.authUser.count({ where: { tenantId, role: "TEACHER", isActive: true } }),
    prisma.businessPartner.count({ where: { tenantId, subscriptionStatus: "ACTIVE" } }),
    prisma.businessPartner.count({
      where: { tenantId, subscriptionStatus: "ACTIVE", subscriptionExpiresAt: { lt: new Date() } }
    }),
    prisma.competition.count({
      where: { tenantId, workflowStage: "SUPERADMIN_APPROVAL" }
    }),
    prisma.auditLog.count({
      where: {
        tenantId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    })
  ]);

  const insights = [];
  const retentionPct = studentsTotal ? Math.round((studentsActive / studentsTotal) * 100) : 0;
  if (retentionPct < 70) insights.push({ level: "warning", message: `Student retention is ${retentionPct}% — below 70% threshold` });
  if (subscriptionsExpired > 0) insights.push({ level: "warning", message: `${subscriptionsExpired} subscription(s) past end date but still marked active` });
  if (pendingApprovals > 5) insights.push({ level: "info", message: `${pendingApprovals} competitions awaiting your approval` });
  if (centerCount === 0) insights.push({ level: "critical", message: "No active centers found" });

  const healthScore = Math.max(0, Math.min(100,
    100
    - (retentionPct < 70 ? 15 : 0)
    - (subscriptionsExpired > 0 ? 10 : 0)
    - (centerCount === 0 ? 30 : 0)
    - (pendingApprovals > 10 ? 5 : 0)
  ));

  // 6-month trends: student admissions and revenue per month
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [recentStudents, recentRevenue] = await Promise.all([
    prisma.student.findMany({
      where: { tenantId, createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true }
    }),
    prisma.financialTransaction.findMany({
      where: { tenantId, createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true, grossAmount: true }
    })
  ]);

  const monthLabels = [];
  const admissionsTrend = [];
  const revenueTrend = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    const y = d.getFullYear();
    const m = d.getMonth();
    monthLabels.push(d.toLocaleString("en", { month: "short" }));
    admissionsTrend.push(recentStudents.filter((s) => s.createdAt.getFullYear() === y && s.createdAt.getMonth() === m).length);
    revenueTrend.push(
      recentRevenue
        .filter((t) => t.createdAt.getFullYear() === y && t.createdAt.getMonth() === m)
        .reduce((sum, t) => sum + Number(t.grossAmount || 0), 0)
    );
  }

  return res.apiSuccess("System health loaded", {
    overview: { bpCount, franchiseCount, centerCount, studentsActive, studentsTotal, teacherCount },
    subscriptions: { active: subscriptionsActive, expired: subscriptionsExpired },
    pendingApprovals,
    recentAuditEvents,
    healthScore,
    insights,
    trends: { monthLabels, admissions: admissionsTrend, revenue: revenueTrend }
  });
});

/* ═══════════════════════════════════════════════════════
   Hierarchy Management – Franchise endpoints
   ═══════════════════════════════════════════════════════ */

const saCreateFranchise = asyncHandler(async (req, res) => {
  const {
    businessPartnerId,
    name,
    displayName,
    type,
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
    password
  } = req.body;

  if (!businessPartnerId || !name || !emailOfficial || !password) {
    return res.apiError(400, "businessPartnerId, name, emailOfficial and password are required", "VALIDATION_ERROR");
  }

  const bp = await prisma.businessPartner.findFirst({
    where: { id: businessPartnerId, tenantId: req.auth.tenantId },
    select: { id: true, hierarchyNodeId: true }
  });
  if (!bp) return res.apiError(404, "Business partner not found", "BP_NOT_FOUND");
  if (!bp.hierarchyNodeId) {
    return res.apiError(400, "Business partner hierarchy root not configured", "BP_HIERARCHY_REQUIRED");
  }

  const nodeType = (() => {
    if (!type) return "DISTRICT";
    const n = String(type).trim().toUpperCase();
    return ["COUNTRY", "REGION", "DISTRICT", "SCHOOL", "BRANCH"].includes(n) ? n : "DISTRICT";
  })();

  const created = await prisma.$transaction(async (tx) => {
    const username = await generateUsername({ tx, tenantId: req.auth.tenantId, role: "FRANCHISE" });

    const node = await tx.hierarchyNode.create({
      data: {
        tenantId: req.auth.tenantId,
        name: String(name).trim(),
        code: username,
        type: nodeType,
        parentId: bp.hierarchyNodeId
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
      select: { id: true, username: true, email: true, isActive: true, createdAt: true }
    });

    const profile = await tx.franchiseProfile.create({
      data: {
        tenantId: req.auth.tenantId,
        businessPartnerId: bp.id,
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
        onboardingDate: onboardingDate ? parseISODateOnly(onboardingDate) || undefined : undefined,
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

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "SA_CREATE_FRANCHISE",
    entityType: "FRANCHISE_PROFILE",
    entityId: created.profile.id,
    metadata: { businessPartnerId, name }
  });

  res.locals.entityId = created.profile.id;
  return res.apiSuccess("Franchise created", {
    code: created.profile.code,
    username: created.user.username,
    profile: created.profile,
    address: created.address,
    hierarchyNode: created.node
  }, 201);
});

const saSetFranchiseStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const nextStatus = req.body?.status ? String(req.body.status).trim().toUpperCase() : null;

  if (!nextStatus || !["ACTIVE", "INACTIVE", "ARCHIVED"].includes(nextStatus)) {
    return res.apiError(400, "status must be ACTIVE, INACTIVE, or ARCHIVED", "VALIDATION_ERROR");
  }

  const existing = await prisma.franchiseProfile.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true, tenantId: true, code: true, status: true, authUserId: true },
    
  });
  if (!existing) return res.apiError(404, "Franchise not found", "FRANCHISE_NOT_FOUND");

  const shouldActivate = nextStatus === "ACTIVE";

  const updated = await prisma.$transaction(async (tx) => {
    const profile = await tx.franchiseProfile.update({
      where: { id: existing.id },
      data: { status: nextStatus, isActive: shouldActivate }
    });

    // Update franchise auth user + hierarchy node
    if (existing.authUserId) {
      const authUser = await tx.authUser.findUnique({
        where: { id: existing.authUserId },
        select: { hierarchyNodeId: true }
      });
      await tx.authUser.update({
        where: { id: existing.authUserId },
        data: { isActive: shouldActivate }
      });
      if (authUser?.hierarchyNodeId) {
        await tx.hierarchyNode.update({
          where: { id: authUser.hierarchyNodeId },
          data: { isActive: shouldActivate }
        });
      }
    }

    // Cascade to child centers
    const childCenters = await tx.centerProfile.findMany({
      where: { tenantId: req.auth.tenantId, franchiseProfileId: existing.id },
      select: { id: true, authUserId: true }
    });
    if (childCenters.length) {
      await tx.centerProfile.updateMany({
        where: { tenantId: req.auth.tenantId, franchiseProfileId: existing.id },
        data: { isActive: shouldActivate, status: shouldActivate ? "ACTIVE" : "INACTIVE" }
      });
      const centerAuthUserIds = childCenters.map((c) => c.authUserId).filter(Boolean);
      if (centerAuthUserIds.length) {
        const centerAuthUsers = await tx.authUser.findMany({
          where: { id: { in: centerAuthUserIds } },
          select: { id: true, hierarchyNodeId: true }
        });
        await tx.authUser.updateMany({
          where: { id: { in: centerAuthUserIds } },
          data: { isActive: shouldActivate }
        });
        const centerNodeIds = centerAuthUsers.map((u) => u.hierarchyNodeId).filter(Boolean);
        if (centerNodeIds.length) {
          await tx.hierarchyNode.updateMany({
            where: { id: { in: centerNodeIds } },
            data: { isActive: shouldActivate }
          });
        }
      }
    }

    return profile;
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "SA_SET_FRANCHISE_STATUS",
    entityType: "FRANCHISE_PROFILE",
    entityId: existing.id,
    metadata: { from: existing.status, to: nextStatus }
  });

  return res.apiSuccess("Franchise status updated", updated);
});

const saGetFranchiseDetail = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const franchise = await prisma.franchiseProfile.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    include: {
      address: true,
      authUser: {
        select: { id: true, username: true, email: true, isActive: true, hierarchyNodeId: true }
      },
      businessPartner: { select: { id: true, code: true, name: true } }
    }
  });
  if (!franchise) return res.apiError(404, "Franchise not found", "FRANCHISE_NOT_FOUND");

  const franchiseCenters = await prisma.centerProfile.findMany({
    where: { tenantId: req.auth.tenantId, franchiseProfileId: id, status: { not: "ARCHIVED" } },
    select: {
      authUser: {
        select: { hierarchyNodeId: true }
      }
    }
  });

  const centerNodeIds = franchiseCenters
    .map((center) => center.authUser?.hierarchyNodeId)
    .filter(Boolean);

  const [centersCount, studentsCount, teachersCount] = await Promise.all([
    prisma.centerProfile.count({ where: { tenantId: req.auth.tenantId, franchiseProfileId: id, status: { not: "ARCHIVED" } } }),
    centerNodeIds.length
      ? prisma.student.count({
          where: {
            tenantId: req.auth.tenantId,
            hierarchyNodeId: { in: centerNodeIds },
            isActive: true
          }
        })
      : Promise.resolve(0),
    centerNodeIds.length
      ? prisma.authUser.count({
          where: {
            tenantId: req.auth.tenantId,
            role: "TEACHER",
            hierarchyNodeId: { in: centerNodeIds }
          }
        })
      : Promise.resolve(0)
  ]);

  return res.apiSuccess("Franchise detail loaded", {
    ...franchise,
    metrics: { centersCount, studentsCount, teachersCount }
  });
});

/* ═══════════════════════════════════════════════════════
   Hierarchy Management – Center endpoints
   ═══════════════════════════════════════════════════════ */

const saCreateCenter = asyncHandler(async (req, res) => {
  const {
    franchiseProfileId,
    name,
    displayName,
    type,
    emailOfficial,
    phonePrimary,
    password,
    whatsappEnabled,
    inheritBranding,
    headPrincipalName,
    affiliationCode,
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

  if (!franchiseProfileId || !name || !displayName || !emailOfficial || !phonePrimary || !password) {
    return res.apiError(400, "franchiseProfileId, name, displayName, emailOfficial, phonePrimary and password are required", "VALIDATION_ERROR");
  }

  const franchise = await prisma.franchiseProfile.findFirst({
    where: { id: franchiseProfileId, tenantId: req.auth.tenantId },
    select: { id: true, businessPartnerId: true, authUser: { select: { hierarchyNodeId: true, id: true } } }
  });
  if (!franchise) return res.apiError(404, "Franchise not found", "FRANCHISE_NOT_FOUND");

  const parentNodeId = franchise.authUser?.hierarchyNodeId;
  if (!parentNodeId) {
    return res.apiError(400, "Franchise hierarchy root not configured", "FRANCHISE_HIERARCHY_REQUIRED");
  }

  const nodeType = (() => {
    if (!type) return "SCHOOL";
    const n = String(type).trim().toUpperCase();
    return ["COUNTRY", "REGION", "DISTRICT", "SCHOOL", "BRANCH"].includes(n) ? n : "SCHOOL";
  })();

  const created = await prisma.$transaction(async (tx) => {
    const username = await generateUsername({ tx, tenantId: req.auth.tenantId, role: "CENTER" });

    const node = await tx.hierarchyNode.create({
      data: {
        tenantId: req.auth.tenantId,
        name: String(name).trim(),
        code: username,
        type: nodeType,
        parentId: parentNodeId,
        isActive: true
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
        isActive: true
      },
      select: { id: true, username: true, email: true, isActive: true, createdAt: true }
    });

    const profile = await tx.centerProfile.create({
      data: {
        tenantId: req.auth.tenantId,
        franchiseProfileId: franchise.id,
        authUserId: user.id,
        code: username,
        name: String(name).trim(),
        displayName: normalizeString(displayName),
        status: "ACTIVE",
        isActive: true,
        phonePrimary: normalizeString(phonePrimary),
        emailOfficial: String(emailOfficial).trim(),
        whatsappEnabled: normalizeBoolean(whatsappEnabled, false),
        inheritBranding: normalizeBoolean(inheritBranding, true),
        headPrincipalName: normalizeString(headPrincipalName),
        affiliationCode: normalizeString(affiliationCode),
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

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "SA_CREATE_CENTER",
    entityType: "CENTER_PROFILE",
    entityId: created.profile.id,
    metadata: { franchiseProfileId, name }
  });

  res.locals.entityId = created.profile.id;
  return res.apiSuccess("Center created", {
    code: created.profile.code,
    username: created.user.username,
    profile: created.profile,
    address: created.address,
    hierarchyNode: created.node
  }, 201);
});

const saSetCenterStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const nextStatus = req.body?.status ? String(req.body.status).trim().toUpperCase() : null;

  if (!nextStatus || !["ACTIVE", "INACTIVE", "SUSPENDED", "ARCHIVED"].includes(nextStatus)) {
    return res.apiError(400, "status must be ACTIVE, INACTIVE, SUSPENDED, or ARCHIVED", "VALIDATION_ERROR");
  }

  const existing = await prisma.centerProfile.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true, tenantId: true, code: true, status: true, authUserId: true }
  });
  if (!existing) return res.apiError(404, "Center not found", "CENTER_NOT_FOUND");

  const shouldActivate = nextStatus === "ACTIVE";

  const updated = await prisma.$transaction(async (tx) => {
    const profile = await tx.centerProfile.update({
      where: { id: existing.id },
      data: { status: nextStatus, isActive: shouldActivate }
    });

    if (existing.authUserId) {
      const authUser = await tx.authUser.findUnique({
        where: { id: existing.authUserId },
        select: { hierarchyNodeId: true }
      });
      await tx.authUser.update({
        where: { id: existing.authUserId },
        data: { isActive: shouldActivate }
      });
      if (authUser?.hierarchyNodeId) {
        await tx.hierarchyNode.update({
          where: { id: authUser.hierarchyNodeId },
          data: { isActive: shouldActivate }
        });
      }
    }

    return profile;
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "SA_SET_CENTER_STATUS",
    entityType: "CENTER_PROFILE",
    entityId: existing.id,
    metadata: { from: existing.status, to: nextStatus }
  });

  return res.apiSuccess("Center status updated", updated);
});

const saGetCenterDetail = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const center = await prisma.centerProfile.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    include: {
      address: true,
      authUser: {
        select: { id: true, username: true, email: true, isActive: true, hierarchyNodeId: true }
      },
      franchiseProfile: { select: { id: true, code: true, name: true } }
    }
  });
  if (!center) return res.apiError(404, "Center not found", "CENTER_NOT_FOUND");

  const centerNodeId = center.authUser?.hierarchyNodeId;

  const [studentsCount, teachersCount, batchesCount] = await Promise.all([
    centerNodeId
      ? prisma.student.count({ where: { tenantId: req.auth.tenantId, hierarchyNodeId: centerNodeId, isActive: true } })
      : Promise.resolve(0),
    centerNodeId
      ? prisma.authUser.count({ where: { tenantId: req.auth.tenantId, role: "TEACHER", hierarchyNodeId: centerNodeId } })
      : Promise.resolve(0),
    centerNodeId
      ? prisma.batch.count({ where: { tenantId: req.auth.tenantId, hierarchyNodeId: centerNodeId } })
      : Promise.resolve(0)
  ]);

  return res.apiSuccess("Center detail loaded", {
    ...center,
    metrics: { studentsCount, teachersCount, batchesCount }
  });
});

export {
  listSuperadmins,
  createSuperadmin,
  updateUserRole,
  listUsersByRole,
  getKpis,
  recordDashboardAction,
  getHierarchyTree,
  getHierarchyDashboard,
  getSystemHealth,
  saCreateFranchise,
  saSetFranchiseStatus,
  saGetFranchiseDetail,
  saCreateCenter,
  saSetCenterStatus,
  saGetCenterDetail
};
