import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import { applyBpScopeToCenterQuery } from "../utils/bp-scope-filters.js";

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizeCenterStatus(status) {
  if (!status) {
    return null;
  }

  const normalized = String(status).trim().toUpperCase();
  if (["ACTIVE", "INACTIVE", "SUSPENDED", "ARCHIVED"].includes(normalized)) {
    return normalized;
  }

  return null;
}

const listCenters = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset, orderBy } = parsePagination(req.query);
  const q = normalizeString(req.query.q);
  const status = normalizeCenterStatus(req.query.status);
  const centerId = normalizeString(req.query.centerId);
  const franchiseId = normalizeString(req.query.franchiseId);

  const isBusinessPartner = req.auth.role === "BP";

  if (isBusinessPartner) {
    const scopedWhere = applyBpScopeToCenterQuery({
      tenantId: req.auth.tenantId,
      bpScope: req.bpScope,
      where: {
        isActive: true,
        status: status || "ACTIVE",
        ...(centerId ? { id: centerId } : {}),
        ...(franchiseId ? { franchiseProfileId: franchiseId } : {}),
        ...(q
          ? {
              OR: [
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
              ]
            }
          : {})
      }
    });

    const [items, total] = await Promise.all([
      prisma.centerProfile.findMany({
        where: scopedWhere,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          code: true,
          name: true,
          displayName: true,
          status: true,
          isActive: true,
          franchiseProfileId: true,
          authUser: {
            select: {
              hierarchyNodeId: true,
              hierarchyNode: {
                select: {
                  type: true
                }
              }
            }
          }
        }
      }),
      prisma.centerProfile.count({ where: scopedWhere })
    ]);

    const nodeIds = items.map((item) => item.authUser?.hierarchyNodeId).filter(Boolean);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      studentsTotalRows,
      studentsActiveRows,
      enrollmentsActiveRows,
      activeTeachersRows,
      newEnrollmentsRows
    ] = await Promise.all([
      prisma.student.groupBy({
        by: ["hierarchyNodeId"],
        where: {
          tenantId: req.auth.tenantId,
          hierarchyNodeId: nodeIds.length ? { in: nodeIds } : undefined
        },
        _count: { _all: true }
      }),
      prisma.student.groupBy({
        by: ["hierarchyNodeId"],
        where: {
          tenantId: req.auth.tenantId,
          isActive: true,
          hierarchyNodeId: nodeIds.length ? { in: nodeIds } : undefined
        },
        _count: { _all: true }
      }),
      prisma.enrollment.groupBy({
        by: ["hierarchyNodeId"],
        where: {
          tenantId: req.auth.tenantId,
          status: "ACTIVE",
          hierarchyNodeId: nodeIds.length ? { in: nodeIds } : undefined
        },
        _count: { _all: true }
      }),
      prisma.authUser.groupBy({
        by: ["hierarchyNodeId"],
        where: {
          tenantId: req.auth.tenantId,
          role: "TEACHER",
          isActive: true,
          hierarchyNodeId: nodeIds.length ? { in: nodeIds } : undefined
        },
        _count: { _all: true }
      }),
      prisma.enrollment.groupBy({
        by: ["hierarchyNodeId"],
        where: {
          tenantId: req.auth.tenantId,
          status: "ACTIVE",
          createdAt: { gte: thirtyDaysAgo },
          hierarchyNodeId: nodeIds.length ? { in: nodeIds } : undefined
        },
        _count: { _all: true }
      })
    ]);

    const studentsTotalByNode = new Map(studentsTotalRows.map((r) => [r.hierarchyNodeId, r._count._all]));
    const studentsActiveByNode = new Map(studentsActiveRows.map((r) => [r.hierarchyNodeId, r._count._all]));
    const enrollmentsActiveByNode = new Map(enrollmentsActiveRows.map((r) => [r.hierarchyNodeId, r._count._all]));
    const activeTeachersByNode = new Map(activeTeachersRows.map((r) => [r.hierarchyNodeId, r._count._all]));
    const newEnrollmentsByNode = new Map(newEnrollmentsRows.map((r) => [r.hierarchyNodeId, r._count._all]));

    const enriched = items.map((center) => {
      const nodeId = center.authUser?.hierarchyNodeId || null;
      return {
        id: center.id,
        code: center.code,
        name: center.displayName || center.name,
        type: center.authUser?.hierarchyNode?.type || null,
        status: center.status,
        isActive: center.isActive,
        franchiseProfileId: center.franchiseProfileId,
        studentsTotal: Number(studentsTotalByNode.get(nodeId) || 0),
        studentsActive: Number(studentsActiveByNode.get(nodeId) || 0),
        enrollmentsActive: Number(enrollmentsActiveByNode.get(nodeId) || 0),
        teachersActive: Number(activeTeachersByNode.get(nodeId) || 0),
        newEnrollmentsLast30Days: Number(newEnrollmentsByNode.get(nodeId) || 0)
      };
    });

    return res.apiSuccess("Centers fetched", {
      items: enriched,
      limit,
      offset,
      total
    });
  }

  const where = {
    tenantId: req.auth.tenantId,
    isActive: true
  };

  const items = await prisma.hierarchyNode.findMany({
    where,
    orderBy,
    skip,
    take,
    select: {
      id: true,
      name: true,
      code: true,
      type: true,
      parentId: true,
      createdAt: true
    }
  });

  return res.apiSuccess("Centers fetched", {
    items,
    limit,
    offset
  });
});

export { listCenters };
