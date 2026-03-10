import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";

const listCenters = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset, orderBy } = parsePagination(req.query);

  const where = {
    tenantId: req.auth.tenantId,
    isActive: true
  };

  // SUPERADMIN can list all hierarchy nodes; BP should see only center/school nodes.
  // In this system, centers/schools are modeled as hierarchy nodes of type SCHOOL or BRANCH.
  const isBusinessPartner = req.auth.role === "BP";

  if (isBusinessPartner) {
    if (!req.auth.hierarchyNodeId) {
      return res.apiError(400, "BP user is missing hierarchyNodeId", "BP_HIERARCHY_REQUIRED");
    }

    // Treat centers as direct child hierarchy nodes under the BP's hierarchy node.
    where.parentId = req.auth.hierarchyNodeId;

    // Only include actual centers/schools (avoid leaking other hierarchy metadata).
    where.type = { in: ["SCHOOL", "BRANCH"] };
  }

  const select = isBusinessPartner
    ? {
        id: true,
        name: true,
        code: true,
        type: true
      }
    : {
        id: true,
        name: true,
        code: true,
        type: true,
        parentId: true,
        createdAt: true
      };

  const items = await prisma.hierarchyNode.findMany({
    where,
    orderBy,
    skip,
    take,
    select
  });

  if (isBusinessPartner) {
    const nodeIds = items.map((x) => x.id).filter(Boolean);

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

    const enriched = items.map((c) => {
      const id = c.id;
      return {
        ...c,
        studentsTotal: Number(studentsTotalByNode.get(id) || 0),
        studentsActive: Number(studentsActiveByNode.get(id) || 0),
        enrollmentsActive: Number(enrollmentsActiveByNode.get(id) || 0),
        teachersActive: Number(activeTeachersByNode.get(id) || 0),
        newEnrollmentsLast30Days: Number(newEnrollmentsByNode.get(id) || 0)
      };
    });

    return res.apiSuccess("Centers fetched", {
      items: enriched,
      limit,
      offset
    });
  }

  return res.apiSuccess("Centers fetched", {
    items,
    limit,
    offset
  });
});

export { listCenters };
