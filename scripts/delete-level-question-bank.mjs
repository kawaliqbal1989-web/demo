import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [, , courseId, levelNumberArg, modeArg] = process.argv;
  const levelNumber = Number(levelNumberArg || "1");
  const mode = String(modeArg || "preview").toLowerCase();

  if (!courseId || !Number.isInteger(levelNumber) || levelNumber < 1) {
    console.error("Usage: node scripts/delete-level-question-bank.mjs <courseId> <levelNumber> [preview|apply]");
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

  const level = await prisma.level.findFirst({
    where: { tenantId: course.tenantId, rank: levelNumber },
    select: { id: true, name: true, rank: true }
  });

  if (!level) {
    console.error("Level rank mapping not found");
    process.exit(1);
  }

  const questionCount = await prisma.questionBank.count({
    where: {
      tenantId: course.tenantId,
      levelId: level.id
    }
  });

  const payload = {
    courseId: course.id,
    courseName: course.name,
    tenantId: course.tenantId,
    levelNumber,
    levelId: level.id,
    levelName: level.name,
    questionBankCount: questionCount,
    mode
  };

  if (mode !== "apply") {
    console.log(JSON.stringify({ preview: payload }, null, 2));
    return;
  }

  const deleted = await prisma.questionBank.deleteMany({
    where: {
      tenantId: course.tenantId,
      levelId: level.id
    }
  });

  console.log(JSON.stringify({ apply: { ...payload, deletedQuestions: deleted.count } }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
