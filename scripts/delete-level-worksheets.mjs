import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [, , courseId, levelNumberArg, modeArg] = process.argv;
  const levelNumber = Number(levelNumberArg || "1");
  const mode = String(modeArg || "preview").toLowerCase();

  if (!courseId || !Number.isInteger(levelNumber) || levelNumber < 1) {
    console.error("Usage: node scripts/delete-level-worksheets.mjs <courseId> <levelNumber> [preview|apply]");
    process.exit(1);
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, tenantId: true, name: true }
  });

  if (!course) {
    console.error("Course not found");
    process.exit(1);
  }

  const courseLevel = await prisma.courseLevel.findFirst({
    where: {
      tenantId: course.tenantId,
      courseId: course.id,
      levelNumber
    },
    select: { id: true, levelNumber: true }
  });

  if (!courseLevel) {
    console.error("Course level mapping not found");
    process.exit(1);
  }

  const level = await prisma.level.findFirst({
    where: {
      tenantId: course.tenantId,
      rank: levelNumber
    },
    select: { id: true, name: true, rank: true }
  });

  if (!level) {
    console.error("Level rank mapping not found");
    process.exit(1);
  }

  const worksheetRows = await prisma.worksheet.findMany({
    where: {
      tenantId: course.tenantId,
      levelId: level.id
    },
    select: { id: true }
  });

  const worksheetIds = worksheetRows.map((row) => row.id);

  const usageCount = worksheetIds.length
    ? await prisma.examEnrollmentLevelWorksheetSelection.count({
        where: { tenantId: course.tenantId, baseWorksheetId: { in: worksheetIds } }
      })
    : 0;

  const payload = {
    courseId: course.id,
    courseName: course.name,
    tenantId: course.tenantId,
    levelNumber,
    levelId: level.id,
    levelName: level.name,
    worksheetsFound: worksheetIds.length,
    examSelectionReferences: usageCount,
    mode
  };

  if (mode !== "apply") {
    console.log(JSON.stringify({ preview: payload }, null, 2));
    return;
  }

  if (!worksheetIds.length) {
    console.log(JSON.stringify({ apply: { ...payload, deletedSelections: 0, deletedWorksheets: 0 } }, null, 2));
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const deletedSelections = await tx.examEnrollmentLevelWorksheetSelection.deleteMany({
      where: { tenantId: course.tenantId, baseWorksheetId: { in: worksheetIds } }
    });

    const deletedWorksheets = await tx.worksheet.deleteMany({
      where: { tenantId: course.tenantId, id: { in: worksheetIds } }
    });

    return {
      deletedSelections: deletedSelections.count,
      deletedWorksheets: deletedWorksheets.count
    };
  });

  console.log(JSON.stringify({ apply: { ...payload, ...result } }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
