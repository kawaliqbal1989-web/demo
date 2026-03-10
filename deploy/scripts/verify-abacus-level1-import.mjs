import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const tenantId = process.argv[2] || "tenant_default";
const levelRank = Number(process.argv[3] || 1);

async function main() {
  const level = await prisma.level.findFirst({
    where: { tenantId, rank: levelRank },
    select: { id: true, name: true, rank: true }
  });
  if (!level) {
    throw new Error(`Level not found for tenantId=${tenantId} rank=${levelRank}`);
  }

  const worksheets = await prisma.worksheet.findMany({
    where: {
      tenantId,
      levelId: level.id
    },
    select: {
      id: true,
      title: true,
      _count: { select: { questions: true } }
    },
    orderBy: { title: "asc" }
  });

  const imported = worksheets.filter((w) => /^L1-WS-\d+\s-\s/.test(w.title));

  const counts = imported.map((w) => w._count.questions);
  const min = counts.length ? Math.min(...counts) : 0;
  const max = counts.length ? Math.max(...counts) : 0;
  const totalQs = counts.reduce((a, b) => a + b, 0);

  console.log(
    JSON.stringify(
      {
        tenantId,
        level,
        worksheetsTotal: worksheets.length,
        importedWorksheets: imported.length,
        importedQuestionsTotal: totalQs,
        importedQuestionsMinPerWorksheet: min,
        importedQuestionsMaxPerWorksheet: max,
        sampleTitles: imported.slice(0, 5).map((w) => w.title)
      },
      null,
      2
    )
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
