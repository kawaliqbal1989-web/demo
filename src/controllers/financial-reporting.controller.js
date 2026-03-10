import { asyncHandler } from "../utils/async-handler.js";
import {
  getMonthlyRevenue,
  getRevenueByBusinessPartner,
  getRevenueByCenter,
  getRevenueByType,
  getRevenueSummary,
  resolveRange,
  resolveScopeFromRequest
} from "../services/financial-reporting.service.js";
import {
  getMonthlyDues as getCenterMonthlyDues,
  listPendingInstallments as listCenterPendingInstallments,
  listReminders as listCenterFeeReminders,
  listStudentWise as listCenterStudentWiseFees
} from "../services/center-fees-reporting.service.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

function logControllerFailure(operation, error, details = {}) {
  logger.error("financial_reporting_controller_failed", {
    operation,
    error: error?.message || String(error),
    ...details
  });
}

async function safePrisma(operation, fn, fallback, details = {}) {
  try {
    return await fn();
  } catch (error) {
    logControllerFailure(operation, error, details);
    return fallback;
  }
}

const revenueSummary = asyncHandler(async (req, res) => {
  const range = resolveRange({ from: req.query.from, to: req.query.to });
  const scope = await resolveScopeFromRequest(req.auth, req.query);

  const data = await safePrisma(
    "getRevenueSummary",
    () =>
      getRevenueSummary({
        tenantId: scope.tenantId,
        range,
        scope
      }),
    {
      tenantId: scope.tenantId || null,
      from: range.from,
      to: new Date(range.toExclusive.getTime() - 1),
      totalGrossAmount: 0
    },
    {
      role: req.auth?.role || null,
      tenantId: scope.tenantId || null
    }
  );

  return res.apiSuccess("Revenue summary fetched", data);
});

const revenueByType = asyncHandler(async (req, res) => {
  const range = resolveRange({ from: req.query.from, to: req.query.to });
  const scope = await resolveScopeFromRequest(req.auth, req.query);

  const items = await safePrisma(
    "getRevenueByType",
    () =>
      getRevenueByType({
        tenantId: scope.tenantId,
        range,
        scope
      }),
    [],
    {
      role: req.auth?.role || null,
      tenantId: scope.tenantId || null
    }
  );

  return res.apiSuccess("Revenue by type fetched", {
    tenantId: scope.tenantId || null,
    from: range.from,
    to: new Date(range.toExclusive.getTime() - 1),
    items
  });
});

const monthlyRevenue = asyncHandler(async (req, res) => {
  const range = resolveRange({ from: req.query.from, to: req.query.to });
  const scope = await resolveScopeFromRequest(req.auth, req.query);

  const items = await safePrisma(
    "getMonthlyRevenue",
    () =>
      getMonthlyRevenue({
        tenantId: scope.tenantId,
        range,
        scope
      }),
    [],
    {
      role: req.auth?.role || null,
      tenantId: scope.tenantId || null
    }
  );

  return res.apiSuccess("Monthly revenue fetched", {
    tenantId: scope.tenantId || null,
    from: range.from,
    to: new Date(range.toExclusive.getTime() - 1),
    items
  });
});

const revenueByBusinessPartner = asyncHandler(async (req, res) => {
  if (req.auth.role !== "SUPERADMIN") {
    return res.apiError(403, "Forbidden", "ROLE_FORBIDDEN");
  }

  const range = resolveRange({ from: req.query.from, to: req.query.to });
  // SUPERADMIN without tenantId aggregates across all tenants.
  const tenantId = req.query.tenantId ? String(req.query.tenantId) : null;

  const items = await safePrisma(
    "getRevenueByBusinessPartner",
    () => getRevenueByBusinessPartner({ tenantId, range }),
    [],
    {
      role: req.auth?.role || null,
      tenantId: tenantId || null
    }
  );

  return res.apiSuccess("Revenue by business partner fetched", {
    tenantId: tenantId || null,
    from: range.from,
    to: new Date(range.toExclusive.getTime() - 1),
    items
  });
});

const revenueByCenter = asyncHandler(async (req, res) => {
  if (req.auth.role !== "BP") {
    return res.apiError(403, "Forbidden", "ROLE_FORBIDDEN");
  }

  const range = resolveRange({ from: req.query.from, to: req.query.to });
  const scope = await resolveScopeFromRequest(req.auth, req.query);

  const items = await safePrisma(
    "getRevenueByCenter",
    () =>
      getRevenueByCenter({
        tenantId: scope.tenantId,
        range,
        businessPartnerId: scope.businessPartnerId
      }),
    [],
    {
      role: req.auth?.role || null,
      tenantId: scope.tenantId || null,
      businessPartnerId: scope.businessPartnerId || null
    }
  );

  return res.apiSuccess("Revenue by center fetched", {
    tenantId: scope.tenantId || null,
    from: range.from,
    to: new Date(range.toExclusive.getTime() - 1),
    items
  });
});

const dashboardSummary = asyncHandler(async (req, res) => {
  const range = resolveRange({ from: req.query.from, to: req.query.to });
  const scope = await resolveScopeFromRequest(req.auth, req.query);

  const whereLedger = {
    createdAt: {
      gte: range.from,
      lt: range.toExclusive
    },
    ...(scope.businessPartnerId ? { businessPartnerId: scope.businessPartnerId } : {}),
    ...(scope.centerId ? { centerId: scope.centerId } : {})
  };

  if (scope.tenantId) {
    whereLedger.tenantId = scope.tenantId;
  }

  const revenueAgg = await safePrisma(
    "financialTransaction.aggregate(dashboardSummary)",
    () =>
      prisma.financialTransaction.aggregate({
        where: whereLedger,
        _sum: {
          grossAmount: true
        }
      }),
    { _sum: { grossAmount: 0 } },
    {
      tenantId: scope.tenantId || null,
      role: req.auth?.role || null
    }
  );

  const monthlyItems = await safePrisma(
    "getMonthlyRevenue(dashboardSummary)",
    () => getMonthlyRevenue({ tenantId: scope.tenantId, range, scope }),
    [],
    {
      tenantId: scope.tenantId || null,
      role: req.auth?.role || null
    }
  );

  const activeStudents = await safePrisma(
    "student.count(activeStudents)",
    () =>
      prisma.student.count({
        where: {
          ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
          isActive: true,
          ...(scope.centerId ? { hierarchyNodeId: scope.centerId } : {})
        }
      }),
    0,
    {
      tenantId: scope.tenantId || null,
      role: req.auth?.role || null
    }
  );

  const activeCenters = await safePrisma(
    "hierarchyNode.count(activeCenters)",
    () =>
      prisma.hierarchyNode.count({
        where: {
          ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
          type: {
            in: ["SCHOOL", "BRANCH"]
          }
        }
      }),
    0,
    {
      tenantId: scope.tenantId || null,
      role: req.auth?.role || null
    }
  );

  const activeBusinessPartners = req.auth.role === "SUPERADMIN"
    ? await safePrisma(
        "businessPartner.count(active)",
        () =>
          prisma.businessPartner.count({
            where: {
              ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
              subscriptionStatus: "ACTIVE"
            }
          }),
        0,
        {
          tenantId: scope.tenantId || null,
          role: req.auth?.role || null
        }
      )
    : null;

  const expiredSubscriptions = req.auth.role === "SUPERADMIN"
    ? await safePrisma(
        "businessPartner.count(expired)",
        () =>
          prisma.businessPartner.count({
            where: {
              ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
              subscriptionStatus: "EXPIRED"
            }
          }),
        0,
        {
          tenantId: scope.tenantId || null,
          role: req.auth?.role || null
        }
      )
    : null;

  const totalStudents = req.auth.role === "SUPERADMIN"
    ? await safePrisma(
        "student.count(total)",
        () =>
          prisma.student.count({
            where: {
              ...(scope.tenantId ? { tenantId: scope.tenantId } : {})
            }
          }),
        0,
        {
          tenantId: scope.tenantId || null,
          role: req.auth?.role || null
        }
      )
    : null;

  const totalBusinessPartners = req.auth.role === "SUPERADMIN"
    ? await safePrisma(
        "businessPartner.count(total)",
        () =>
          prisma.businessPartner.count({
            where: {
              ...(scope.tenantId ? { tenantId: scope.tenantId } : {})
            }
          }),
        0,
        {
          tenantId: scope.tenantId || null,
          role: req.auth?.role || null
        }
      )
    : null;

  const totalFranchises = req.auth.role === "SUPERADMIN"
    ? await safePrisma(
        "authUser.count(franchises)",
        () =>
          prisma.authUser.count({
            where: {
              ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
              role: "FRANCHISE",
              isActive: true
            }
          }),
        0,
        {
          tenantId: scope.tenantId || null,
          role: req.auth?.role || null
        }
      )
    : null;

  const totalCenters = req.auth.role === "SUPERADMIN"
    ? await safePrisma(
        "hierarchyNode.count(centers)",
        () =>
          prisma.hierarchyNode.count({
            where: {
              ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
              type: "BRANCH",
              isActive: true
            }
          }),
        0,
        {
          tenantId: scope.tenantId || null,
          role: req.auth?.role || null
        }
      )
    : null;

  const totalTeachers = req.auth.role === "SUPERADMIN"
    ? await safePrisma(
        "authUser.count(teachers)",
        () =>
          prisma.authUser.count({
            where: {
              ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
              role: "TEACHER",
              isActive: true
            }
          }),
        0,
        {
          tenantId: scope.tenantId || null,
          role: req.auth?.role || null
        }
      )
    : null;

  const activeEnrollments = req.auth.role === "SUPERADMIN"
    ? await safePrisma(
        "competitionEnrollment.count(active)",
        () =>
          prisma.competitionEnrollment.count({
            where: {
              ...(scope.tenantId ? { tenantId: scope.tenantId } : {})
            }
          }),
        0,
        {
          tenantId: scope.tenantId || null,
          role: req.auth?.role || null
        }
      )
    : null;

  const coursesCount = req.auth.role === "SUPERADMIN"
    ? await safePrisma(
        "course.count(total)",
        () =>
          prisma.course.count({
            where: {
              ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
              isActive: true
            }
          }),
        0,
        {
          tenantId: scope.tenantId || null,
          role: req.auth?.role || null
        }
      )
    : null;

  const levelsCount = req.auth.role === "SUPERADMIN"
    ? await safePrisma(
        "level.count(total)",
        () =>
          prisma.level.count({
            where: {
              ...(scope.tenantId ? { tenantId: scope.tenantId } : {})
            }
          }),
        0,
        {
          tenantId: scope.tenantId || null,
          role: req.auth?.role || null
        }
      )
    : null;

  const worksheetsCount = req.auth.role === "SUPERADMIN"
    ? await safePrisma(
        "worksheet.count(total)",
        () =>
          prisma.worksheet.count({
            where: {
              ...(scope.tenantId ? { tenantId: scope.tenantId } : {})
            }
          }),
        0,
        {
          tenantId: scope.tenantId || null,
          role: req.auth?.role || null
        }
      )
    : null;

  const worksheetQuestionsCount = req.auth.role === "SUPERADMIN"
    ? await safePrisma(
        "worksheetQuestion.count(total)",
        () =>
          prisma.worksheetQuestion.count({
            where: {
              ...(scope.tenantId ? { tenantId: scope.tenantId } : {})
            }
          }),
        0,
        {
          tenantId: scope.tenantId || null,
          role: req.auth?.role || null
        }
      )
    : null;

  return res.apiSuccess("Dashboard summary fetched", {
    tenantId: scope.tenantId || null,
    from: range.from,
    to: new Date(range.toExclusive.getTime() - 1),
    totalRevenue: Number(revenueAgg?._sum?.grossAmount ?? 0),
    monthlyRevenue: monthlyItems,
    activeStudents,
    activeCenters,
    ...(req.auth.role === "SUPERADMIN"
      ? {
          totalBusinessPartners,
          totalFranchises,
          totalCenters,
          totalTeachers,
          activeEnrollments,
          coursesCount,
          levelsCount,
          worksheetsCount,
          worksheetQuestionsCount,
          activeBusinessPartners,
          expiredSubscriptions,
          totalStudents
        }
      : {})
  });
});

const feesPendingInstallments = asyncHandler(async (req, res) => {
  if (req.auth.role !== "CENTER") {
    return res.apiError(403, "Forbidden", "ROLE_FORBIDDEN");
  }

  const range = resolveRange({ from: req.query.from, to: req.query.to });
  const scope = await resolveScopeFromRequest(req.auth, req.query);

  const limit = Number.parseInt(String(req.query.limit ?? "20"), 10);
  const offset = Number.parseInt(String(req.query.offset ?? "0"), 10);
  const safeLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, limit)) : 20;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

  const data = await safePrisma(
    "feesPendingInstallments",
    () =>
      listCenterPendingInstallments({
        tenantId: scope.tenantId,
        centerId: scope.centerId,
        range,
        limit: safeLimit,
        offset: safeOffset
      }),
    { items: [], total: 0, limit: safeLimit, offset: safeOffset },
    { role: req.auth?.role || null, tenantId: scope.tenantId || null, centerId: scope.centerId || null }
  );

  return res.apiSuccess("Pending installments fetched", {
    tenantId: scope.tenantId || null,
    from: range.from,
    to: new Date(range.toExclusive.getTime() - 1),
    ...data
  });
});

const feesStudentWise = asyncHandler(async (req, res) => {
  if (req.auth.role !== "CENTER") {
    return res.apiError(403, "Forbidden", "ROLE_FORBIDDEN");
  }

  const range = resolveRange({ from: req.query.from, to: req.query.to });
  const scope = await resolveScopeFromRequest(req.auth, req.query);

  const limit = Number.parseInt(String(req.query.limit ?? "20"), 10);
  const offset = Number.parseInt(String(req.query.offset ?? "0"), 10);
  const safeLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, limit)) : 20;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

  const data = await safePrisma(
    "feesStudentWise",
    () =>
      listCenterStudentWiseFees({
        tenantId: scope.tenantId,
        centerId: scope.centerId,
        range,
        limit: safeLimit,
        offset: safeOffset
      }),
    { items: [], total: 0, limit: safeLimit, offset: safeOffset },
    { role: req.auth?.role || null, tenantId: scope.tenantId || null, centerId: scope.centerId || null }
  );

  return res.apiSuccess("Student-wise fees fetched", {
    tenantId: scope.tenantId || null,
    from: range.from,
    to: new Date(range.toExclusive.getTime() - 1),
    ...data
  });
});

const feesMonthlyDues = asyncHandler(async (req, res) => {
  if (req.auth.role !== "CENTER") {
    return res.apiError(403, "Forbidden", "ROLE_FORBIDDEN");
  }

  const range = resolveRange({ from: req.query.from, to: req.query.to });
  const scope = await resolveScopeFromRequest(req.auth, req.query);

  const data = await safePrisma(
    "feesMonthlyDues",
    () => getCenterMonthlyDues({ tenantId: scope.tenantId, centerId: scope.centerId, range }),
    { items: [] },
    { role: req.auth?.role || null, tenantId: scope.tenantId || null, centerId: scope.centerId || null }
  );

  return res.apiSuccess("Monthly dues fetched", {
    tenantId: scope.tenantId || null,
    from: range.from,
    to: new Date(range.toExclusive.getTime() - 1),
    items: data.items || []
  });
});

const feesReminders = asyncHandler(async (req, res) => {
  if (req.auth.role !== "CENTER") {
    return res.apiError(403, "Forbidden", "ROLE_FORBIDDEN");
  }

  const range = resolveRange({ from: req.query.from, to: req.query.to });
  const scope = await resolveScopeFromRequest(req.auth, req.query);

  const limit = Number.parseInt(String(req.query.limit ?? "20"), 10);
  const offset = Number.parseInt(String(req.query.offset ?? "0"), 10);
  const safeLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, limit)) : 20;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

  const data = await safePrisma(
    "feesReminders",
    () =>
      listCenterFeeReminders({
        tenantId: scope.tenantId,
        centerId: scope.centerId,
        range,
        limit: safeLimit,
        offset: safeOffset
      }),
    { items: [], total: 0, limit: safeLimit, offset: safeOffset },
    { role: req.auth?.role || null, tenantId: scope.tenantId || null, centerId: scope.centerId || null }
  );

  return res.apiSuccess("Fee reminders fetched", {
    tenantId: scope.tenantId || null,
    from: range.from,
    to: new Date(range.toExclusive.getTime() - 1),
    ...data
  });
});

const healthMetrics = asyncHandler(async (req, res) => {
  if (req.auth.role !== "SUPERADMIN") {
    return res.apiError(403, "Forbidden", "ROLE_FORBIDDEN");
  }

  // SUPERADMIN without tenantId aggregates across all tenants.
  const tenantId = req.query.tenantId ? String(req.query.tenantId) : null;
  const range = resolveRange({ from: req.query.from, to: req.query.to });

  const expiredSubscriptions = await safePrisma(
    "businessPartner.count(expiredSubscriptions)",
    () =>
      prisma.businessPartner.count({
        where: {
          ...(tenantId ? { tenantId } : {}),
          subscriptionStatus: "EXPIRED"
        }
      }),
    0,
    {
      tenantId: tenantId || null
    }
  );

  const competitionCounts = await safePrisma(
    "competition.groupBy(workflowStage)",
    () =>
      prisma.competition.groupBy({
        by: ["workflowStage"],
        where: {
          ...(tenantId ? { tenantId } : {}),
          createdAt: {
            gte: range.from,
            lt: range.toExclusive
          }
        },
        _count: {
          _all: true
        }
      }),
    [],
    {
      tenantId: tenantId || null
    }
  );

  const promotionCount = await safePrisma(
    "studentLevelProgressionHistory.count",
    () =>
      prisma.studentLevelProgressionHistory.count({
        where: {
          ...(tenantId ? { tenantId } : {}),
          createdAt: {
            gte: range.from,
            lt: range.toExclusive
          }
        }
      }),
    0,
    {
      tenantId: tenantId || null
    }
  );

  const studentsCount = await safePrisma(
    "student.count(active)",
    () =>
      prisma.student.count({
        where: {
          ...(tenantId ? { tenantId } : {}),
          isActive: true
        }
      }),
    0,
    {
      tenantId: tenantId || null
    }
  );

  const totalCompetitions = (competitionCounts || []).reduce(
    (sum, row) => sum + Number(row?._count?._all ?? 0),
    0
  );
  const rejectedCompetitions =
    (competitionCounts || []).find((row) => row.workflowStage === "REJECTED")?._count?._all ?? 0;

  const competitionRejectionRate = totalCompetitions ? rejectedCompetitions / totalCompetitions : 0;
  const averagePromotionRate = studentsCount ? promotionCount / studentsCount : 0;

  return res.apiSuccess("Health metrics fetched", {
    tenantId: tenantId || null,
    from: range.from,
    to: new Date(range.toExclusive.getTime() - 1),
    expiredSubscriptions,
    competitionRejectionRate,
    averagePromotionRate
  });
});

export {
  revenueSummary,
  revenueByType,
  monthlyRevenue,
  revenueByBusinessPartner,
  revenueByCenter,
  dashboardSummary,
  healthMetrics,
  feesPendingInstallments,
  feesStudentWise,
  feesMonthlyDues,
  feesReminders
};
