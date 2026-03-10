import { prisma } from "../lib/prisma.js";

const DEFAULT_COURSE_CODE = "COURSE-ABACUS";
const DEFAULT_COURSE_NAME = "Abacus Core";
const DEFAULT_COURSE_DESCRIPTION = "Auto-generated from existing tenant levels.";

async function ensureTenantCourseCatalog(tenantId) {
  if (!tenantId) {
    return null;
  }

  const [courseCount, levels] = await prisma.$transaction([
    prisma.course.count({ where: { tenantId } }),
    prisma.level.findMany({
      where: { tenantId },
      orderBy: { rank: "asc" },
      select: { rank: true, name: true }
    })
  ]);

  if (courseCount > 0 || !levels.length) {
    return null;
  }

  const course = await prisma.course.upsert({
    where: {
      tenantId_code: {
        tenantId,
        code: DEFAULT_COURSE_CODE
      }
    },
    update: {
      name: DEFAULT_COURSE_NAME,
      description: DEFAULT_COURSE_DESCRIPTION,
      isActive: true
    },
    create: {
      tenantId,
      code: DEFAULT_COURSE_CODE,
      name: DEFAULT_COURSE_NAME,
      description: DEFAULT_COURSE_DESCRIPTION,
      isActive: true
    },
    select: { id: true }
  });

  await prisma.courseLevel.createMany({
    data: levels.map((level) => ({
      tenantId,
      courseId: course.id,
      levelNumber: level.rank,
      title: level.name,
      sortOrder: level.rank,
      isActive: true
    })),
    skipDuplicates: true
  });

  return course.id;
}

export { ensureTenantCourseCatalog };