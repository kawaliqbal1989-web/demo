import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import { resolveBusinessPartnerForUser } from "../services/financial-reporting.service.js";
import { ensureTenantCourseCatalog } from "../services/course-bootstrap.service.js";

function parseStatus(value) {
  const v = String(value || "").trim().toUpperCase();
  if (v === "ACTIVE" || v === "ARCHIVED") return v;
  return null;
}

async function resolveScopedBusinessPartner(req) {
  const tenantId = req.auth?.tenantId;
  const userId = req.auth?.userId;
  const role = req.auth?.role;
  const hierarchyNodeId = req.auth?.hierarchyNodeId || null;

  if (!tenantId || !userId || !role) {
    return null;
  }

  if (role === "BP") {
    const bp = await resolveBusinessPartnerForUser({ tenantId, userId });
    if (!bp) {
      return null;
    }

    return await prisma.businessPartner.findFirst({
      where: { tenantId, id: bp.id },
      select: { id: true, accessMode: true }
    });
  }

  if (role === "FRANCHISE") {
    const profile = await prisma.franchiseProfile.findFirst({
      where: { tenantId, authUserId: userId, isActive: true },
      select: {
        businessPartner: {
          select: { id: true, accessMode: true }
        }
      }
    });

    return profile?.businessPartner || null;
  }

  if (role === "CENTER") {
    const profile = await prisma.centerProfile.findFirst({
      where: { tenantId, authUserId: userId, isActive: true },
      select: {
        franchiseProfile: {
          select: {
            businessPartner: {
              select: { id: true, accessMode: true }
            }
          }
        }
      }
    });

    return profile?.franchiseProfile?.businessPartner || null;
  }

  if (role === "TEACHER") {
    let centerHierarchyNodeId = hierarchyNodeId;

    if (!centerHierarchyNodeId) {
      const teacher = await prisma.teacherProfile.findFirst({
        where: { tenantId, authUserId: userId, isActive: true },
        select: { hierarchyNodeId: true }
      });
      centerHierarchyNodeId = teacher?.hierarchyNodeId || null;
    }

    if (!centerHierarchyNodeId) {
      return null;
    }

    const profile = await prisma.centerProfile.findFirst({
      where: {
        tenantId,
        isActive: true,
        authUser: {
          hierarchyNodeId: centerHierarchyNodeId
        }
      },
      select: {
        franchiseProfile: {
          select: {
            businessPartner: {
              select: { id: true, accessMode: true }
            }
          }
        }
      }
    });

    return profile?.franchiseProfile?.businessPartner || null;
  }

  return null;
}

async function resolveScopedCourseIds(req) {
  const role = req.auth?.role;
  // Include TEACHER role so teachers inherit partner/course scoping
  if (!["BP", "FRANCHISE", "CENTER", "TEACHER"].includes(role)) {
    return null;
  }

  const businessPartner = await resolveScopedBusinessPartner(req);
  if (!businessPartner) {
    return [];
  }

  if (businessPartner.accessMode !== "SELECTIVE") {
    return null;
  }

  const accesses = await prisma.partnerCourseAccess.findMany({
    where: { businessPartnerId: businessPartner.id },
    select: { courseId: true }
  });

  return accesses.map((item) => item.courseId);
}

const listCatalogCourses = asyncHandler(async (req, res) => {
  await ensureTenantCourseCatalog(req.auth?.tenantId);

  const { take, skip, limit, offset, orderBy } = parsePagination(req.query);
  const status = parseStatus(req.query.status);
  const scopedCourseIds = await resolveScopedCourseIds(req);

  if (Array.isArray(scopedCourseIds) && scopedCourseIds.length === 0) {
    return res.apiSuccess("Catalog courses fetched", { total: 0, items: [], limit, offset });
  }

  const where = {
    tenantId: req.auth.tenantId
  };

  if (Array.isArray(scopedCourseIds)) {
    where.id = { in: scopedCourseIds };
  }

  if (status === "ACTIVE") where.isActive = true;
  if (status === "ARCHIVED") where.isActive = false;

  const [total, items] = await prisma.$transaction([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    })
  ]);

  const data = items.map((c) => ({
    ...c,
    status: c.isActive ? "ACTIVE" : "ARCHIVED"
  }));

  return res.apiSuccess("Catalog courses fetched", { total, items: data, limit, offset });
});

const listCatalogCourseLevels = asyncHandler(async (req, res) => {
  await ensureTenantCourseCatalog(req.auth?.tenantId);

  const { courseId } = req.params;
  const { take, skip, limit, offset, orderBy } = parsePagination(req.query);
  const status = parseStatus(req.query.status);
  const scopedCourseIds = await resolveScopedCourseIds(req);

  if (Array.isArray(scopedCourseIds) && !scopedCourseIds.includes(courseId)) {
    return res.apiError(404, "Course not found", "COURSE_NOT_FOUND");
  }

  const course = await prisma.course.findFirst({
    where: { id: courseId, tenantId: req.auth.tenantId },
    select: { id: true, code: true, name: true, isActive: true }
  });

  if (!course) {
    return res.apiError(404, "Course not found", "COURSE_NOT_FOUND");
  }

  const where = {
    tenantId: req.auth.tenantId,
    courseId
  };

  if (status === "ACTIVE") where.isActive = true;
  if (status === "ARCHIVED") where.isActive = false;

  const [total, items] = await prisma.$transaction([
    prisma.courseLevel.count({ where }),
    prisma.courseLevel.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        courseId: true,
        levelNumber: true,
        title: true,
        sortOrder: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    })
  ]);

  const ranks = Array.from(new Set(items.map((l) => l.levelNumber)));
  const levels = ranks.length
    ? await prisma.level.findMany({
        where: { tenantId: req.auth.tenantId, rank: { in: ranks } },
        select: { id: true, name: true, rank: true }
      })
    : [];
  const levelByRank = new Map(levels.map((l) => [l.rank, l]));

  const data = items.map((l) => ({
    ...l,
    status: l.isActive ? "ACTIVE" : "ARCHIVED",
    level: levelByRank.get(l.levelNumber) || null
  }));

  return res.apiSuccess("Catalog course levels fetched", {
    course,
    total,
    items: data,
    limit,
    offset
  });
});

export { listCatalogCourses, listCatalogCourseLevels };
