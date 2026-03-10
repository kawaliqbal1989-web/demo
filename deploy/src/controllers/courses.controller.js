import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import { ensureTenantCourseCatalog } from "../services/course-bootstrap.service.js";

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function parseStatus(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim().toUpperCase();
  if (normalized === "ACTIVE") {
    return "ACTIVE";
  }

  if (normalized === "ARCHIVED" || normalized === "INACTIVE") {
    return "ARCHIVED";
  }

  return null;
}

function isSchemaMismatchError(error) {
  const code = error?.code ? String(error.code) : "";
  if (["P2021", "P2022"].includes(code)) {
    return true;
  }

  const message = error?.message ? String(error.message) : "";
  return (
    message.includes("does not exist in the current database") ||
    message.includes("Unknown column") ||
    message.includes("Unknown field")
  );
}

function isUniqueConstraintError(error) {
  const code = error?.code ? String(error.code) : "";
  return code === "P2002";
}

const listCourses = asyncHandler(async (req, res) => {
  await ensureTenantCourseCatalog(req.auth?.tenantId);

  const { take, skip, limit, offset, orderBy } = parsePagination(req.query);
  const q = req.query.q ? String(req.query.q).trim() : null;
  const status = parseStatus(req.query.status);

  const where = {
    tenantId: req.auth.tenantId
  };

  if (q) {
    where.OR = [
      { code: { contains: q } },
      { name: { contains: q } }
    ];
  }

  if (status === "ACTIVE") {
    where.isActive = true;
  }

  if (status === "ARCHIVED") {
    where.isActive = false;
  }

  let total = 0;
  let items = [];
  try {
    [total, items] = await prisma.$transaction([
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
          description: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        }
      })
    ]);
  } catch (error) {
    if (!isSchemaMismatchError(error)) {
      throw error;
    }

    [total, items] = await prisma.$transaction([
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

    items = items.map((c) => ({ ...c, description: null }));
  }

  return res.apiSuccess("Courses fetched", {
    total,
    items,
    limit,
    offset
  });
});

const createCourse = asyncHandler(async (req, res) => {
  const code = normalizeString(req.body.code);
  const name = normalizeString(req.body.name);
  const description = normalizeString(req.body.description);
  const status = parseStatus(req.body.status);

  if (!code || !name) {
    return res.apiError(400, "code and name are required", "VALIDATION_ERROR");
  }

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          tenantId: req.auth.tenantId,
          code,
          name,
          description,
          isActive: status === "ARCHIVED" ? false : true
        },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        }
      });

      // Ensure default 8-level hierarchy exists for a new course.
      try {
        const existingCount = await tx.courseLevel.count({
          where: {
            tenantId: req.auth.tenantId,
            courseId: course.id
          }
        });

        if (existingCount === 0) {
          const levels = Array.from({ length: 8 }).map((_, idx) => {
            const levelNumber = idx + 1;
            return {
              tenantId: req.auth.tenantId,
              courseId: course.id,
              levelNumber,
              title: `Level ${levelNumber}`,
              sortOrder: levelNumber,
              isActive: true
            };
          });

          await tx.courseLevel.createMany({ data: levels, skipDuplicates: true });
        }
      } catch (error) {
        if (!isSchemaMismatchError(error)) {
          throw error;
        }
        // If CourseLevel isn't migrated, keep course creation functional.
      }

      return course;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.apiError(409, "Course code already exists", "COURSE_CODE_EXISTS");
    }

    if (!isSchemaMismatchError(error)) {
      throw error;
    }

    created = await prisma.course.create({
      data: {
        tenantId: req.auth.tenantId,
        code,
        name,
        isActive: status === "ARCHIVED" ? false : true
      },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    created = { ...created, description: null };
  }

  res.locals.entityId = created.id;
  return res.apiSuccess("Course created", created, 201);
});

const getCourse = asyncHandler(async (req, res) => {
  const { id } = req.params;

  let course;
  try {
    course = await prisma.course.findFirst({
      where: {
        id,
        tenantId: req.auth.tenantId
      },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });
  } catch (error) {
    if (!isSchemaMismatchError(error)) {
      throw error;
    }

    course = await prisma.course.findFirst({
      where: {
        id,
        tenantId: req.auth.tenantId
      },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (course) {
      course = { ...course, description: null };
    }
  }

  if (!course) {
    return res.apiError(404, "Course not found", "COURSE_NOT_FOUND");
  }

  return res.apiSuccess("Course fetched", course);
});

const updateCourse = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.course.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId
    },
    select: { id: true }
  });

  if (!existing) {
    return res.apiError(404, "Course not found", "COURSE_NOT_FOUND");
  }

  const name = normalizeString(req.body.name);
  const description = normalizeString(req.body.description);
  const status = parseStatus(req.body.status);

  let updated;
  try {
    updated = await prisma.course.update({
      where: { id: existing.id },
      data: {
        name: name ?? undefined,
        description: description ?? undefined,
        isActive: status ? status === "ACTIVE" : undefined
      },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });
  } catch (error) {
    if (!isSchemaMismatchError(error)) {
      throw error;
    }

    updated = await prisma.course.update({
      where: { id: existing.id },
      data: {
        name: name ?? undefined,
        isActive: status ? status === "ACTIVE" : undefined
      },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    updated = { ...updated, description: null };
  }

  res.locals.entityId = updated.id;
  return res.apiSuccess("Course updated", updated);
});

const archiveCourse = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.course.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId
    },
    select: { id: true }
  });

  if (!existing) {
    return res.apiError(404, "Course not found", "COURSE_NOT_FOUND");
  }

  const updated = await prisma.course.update({
    where: { id: existing.id },
    data: { isActive: false },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Course archived", updated);
});

const listCourseLevels = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset, orderBy } = parsePagination(req.query);
  const { courseId } = req.params;
  const status = parseStatus(req.query.status);

  const course = await prisma.course.findFirst({
    where: { id: courseId, tenantId: req.auth.tenantId },
    select: { id: true }
  });

  if (!course) {
    return res.apiError(404, "Course not found", "COURSE_NOT_FOUND");
  }

  const where = {
    tenantId: req.auth.tenantId,
    courseId
  };

  if (status === "ACTIVE") {
    where.isActive = true;
  }

  if (status === "ARCHIVED") {
    where.isActive = false;
  }

  try {
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

    return res.apiSuccess("Course levels fetched", { total, items, limit, offset });
  } catch (error) {
    if (!isSchemaMismatchError(error)) {
      throw error;
    }

    return res.apiError(
      503,
      "Course levels require a database migration. Apply Prisma migrations and restart the server.",
      "MIGRATION_REQUIRED"
    );
  }
});

const createCourseLevel = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  const course = await prisma.course.findFirst({
    where: { id: courseId, tenantId: req.auth.tenantId },
    select: { id: true }
  });

  if (!course) {
    return res.apiError(404, "Course not found", "COURSE_NOT_FOUND");
  }

  const levelNumber = Number(req.body.levelNumber);
  const sortOrder = Number(req.body.sortOrder);
  const title = normalizeString(req.body.title);
  const status = parseStatus(req.body.status);

  if (!Number.isInteger(levelNumber) || levelNumber < 1 || levelNumber > 15) {
    return res.apiError(400, "levelNumber must be an integer between 1 and 15", "VALIDATION_ERROR");
  }

  if (!Number.isInteger(sortOrder)) {
    return res.apiError(400, "sortOrder must be an integer", "VALIDATION_ERROR");
  }

  if (!title) {
    return res.apiError(400, "title is required", "VALIDATION_ERROR");
  }

  let created;
  try {
    const existingLevels = await prisma.courseLevel.findMany({
      where: {
        tenantId: req.auth.tenantId,
        courseId
      },
      select: {
        levelNumber: true
      }
    });

    const existingNumbers = new Set(existingLevels.map((l) => l.levelNumber));
    if (existingNumbers.has(levelNumber)) {
      return res.apiError(409, "Level number already exists for this course", "COURSE_LEVEL_EXISTS");
    }

    // Sequential creation: you can only create the next missing level.
    for (let n = 1; n < levelNumber; n += 1) {
      if (!existingNumbers.has(n)) {
        return res.apiError(
          400,
          "Levels must be created sequentially without gaps",
          "COURSE_LEVEL_SEQUENCE_REQUIRED"
        );
      }
    }

    created = await prisma.courseLevel.create({
      data: {
        tenantId: req.auth.tenantId,
        courseId,
        levelNumber,
        title,
        sortOrder,
        isActive: status === "ARCHIVED" ? false : true
      },
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
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.apiError(409, "Level number already exists for this course", "COURSE_LEVEL_EXISTS");
    }

    if (!isSchemaMismatchError(error)) {
      throw error;
    }

    return res.apiError(
      503,
      "Course levels require a database migration. Apply Prisma migrations and restart the server.",
      "MIGRATION_REQUIRED"
    );
  }

  res.locals.entityId = created.id;
  return res.apiSuccess("Course level created", created, 201);
});

const updateCourseLevel = asyncHandler(async (req, res) => {
  const { courseId, id } = req.params;

  let existing;
  try {
    existing = await prisma.courseLevel.findFirst({
      where: {
        id,
        courseId,
        tenantId: req.auth.tenantId
      },
      select: { id: true }
    });
  } catch (error) {
    if (!isSchemaMismatchError(error)) {
      throw error;
    }

    return res.apiError(
      503,
      "Course levels require a database migration. Apply Prisma migrations and restart the server.",
      "MIGRATION_REQUIRED"
    );
  }

  if (!existing) {
    return res.apiError(404, "Course level not found", "COURSE_LEVEL_NOT_FOUND");
  }

  const title = normalizeString(req.body.title);
  const status = parseStatus(req.body.status);
  const sortOrder = req.body.sortOrder === undefined ? null : Number(req.body.sortOrder);

  if (sortOrder !== null && !Number.isInteger(sortOrder)) {
    return res.apiError(400, "sortOrder must be an integer", "VALIDATION_ERROR");
  }

  let updated;
  try {
    updated = await prisma.courseLevel.update({
      where: { id: existing.id },
      data: {
        title: title ?? undefined,
        sortOrder: sortOrder === null ? undefined : sortOrder,
        isActive: status ? status === "ACTIVE" : undefined
      },
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
    });
  } catch (error) {
    if (!isSchemaMismatchError(error)) {
      throw error;
    }

    return res.apiError(
      503,
      "Course levels require a database migration. Apply Prisma migrations and restart the server.",
      "MIGRATION_REQUIRED"
    );
  }

  res.locals.entityId = updated.id;
  return res.apiSuccess("Course level updated", updated);
});

export {
  listCourses,
  createCourse,
  getCourse,
  updateCourse,
  archiveCourse,
  listCourseLevels,
  createCourseLevel,
  updateCourseLevel
};
