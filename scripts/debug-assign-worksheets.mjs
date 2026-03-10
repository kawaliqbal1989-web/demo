import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const studentId = process.argv[2];
if (!studentId) {
  console.error("Usage: node scripts/debug-assign-worksheets.mjs <studentId>");
  process.exit(1);
}

async function main() {
  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: {
      id: true,
      tenantId: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      hierarchyNodeId: true,
      levelId: true,
      isActive: true
    }
  });

  if (!student) {
    console.log(JSON.stringify({ student: null }, null, 2));
    return;
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      tenantId: student.tenantId,
      studentId: student.id,
      status: "ACTIVE"
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      tenantId: true,
      hierarchyNodeId: true,
      status: true,
      levelId: true,
      createdAt: true,
      batchId: true,
      assignedTeacherUserId: true
    }
  });

  const levelId = enrollment?.levelId || student.levelId;

  const worksheets = levelId
    ? await prisma.worksheet.findMany({
        where: { tenantId: student.tenantId, levelId },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, isPublished: true, createdAt: true }
      })
    : [];

  const counts = {
    total: worksheets.length,
    published: worksheets.filter((w) => w.isPublished).length,
    draft: worksheets.filter((w) => !w.isPublished).length
  };

  const questionsByWorksheet = worksheets.length
    ? await prisma.worksheetQuestion.groupBy({
        by: ["worksheetId"],
        where: { tenantId: student.tenantId, worksheetId: { in: worksheets.map((w) => w.id) } },
        _count: { _all: true }
      })
    : [];

  const questionCountById = new Map(questionsByWorksheet.map((g) => [g.worksheetId, g._count._all]));

  console.log(
    JSON.stringify(
      {
        student,
        enrollment,
        effectiveLevelId: levelId,
        worksheetCounts: counts,
        worksheets: worksheets.map((w) => ({
          ...w,
          questionCount: questionCountById.get(w.id) || 0
        }))
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
