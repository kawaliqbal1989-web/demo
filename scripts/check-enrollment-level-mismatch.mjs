import { prisma } from "../src/lib/prisma.js";

async function main() {
  const rows = await prisma.enrollment.findMany({
    where: {
      status: "ACTIVE",
      levelId: { not: null }
    },
    select: {
      studentId: true,
      levelId: true,
      student: {
        select: {
          levelId: true,
          admissionNo: true,
          hierarchyNodeId: true
        }
      }
    }
  });

  const mismatches = rows
    .filter((row) => row.student && row.student.levelId !== row.levelId)
    .map((row) => ({
      studentId: row.studentId,
      admissionNo: row.student.admissionNo,
      studentLevelId: row.student.levelId,
      enrollmentLevelId: row.levelId,
      hierarchyNodeId: row.student.hierarchyNodeId
    }));

  console.log(
    JSON.stringify(
      {
        activeEnrollmentWithLevel: rows.length,
        mismatchesCount: mismatches.length,
        mismatches
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
