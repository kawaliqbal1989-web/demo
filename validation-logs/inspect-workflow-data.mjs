import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { code: "DEFAULT" }, select: { id: true, code: true } });
  if (!tenant) {
    console.log(JSON.stringify({ error: "DEFAULT tenant not found" }, null, 2));
    return;
  }

  const superadmin = await prisma.authUser.findFirst({
    where: { tenantId: tenant.id, role: "SUPERADMIN", isActive: true },
    select: { id: true, username: true, email: true }
  });

  const businessPartners = await prisma.businessPartner.findMany({
    where: { tenantId: tenant.id, isActive: true },
    select: { id: true, code: true, name: true, hierarchyNodeId: true },
    take: 10
  });

  const levels = await prisma.level.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true, rank: true },
    orderBy: [{ rank: "asc" }, { name: "asc" }],
    take: 20
  });

  const topLevels = levels.filter((l) => [1, 2, 3].includes(l.rank));
  const levelIds = topLevels.map((l) => l.id);

  const worksheetCandidates = await prisma.worksheet.findMany({
    where: {
      tenantId: tenant.id,
      levelId: levelIds.length ? { in: levelIds } : undefined,
      isPublished: true,
      examCycleId: null
    },
    select: {
      id: true,
      title: true,
      levelId: true,
      createdAt: true,
      _count: { select: { questions: true } }
    },
    orderBy: [{ createdAt: "desc" }],
    take: 60
  });

  const worksheetByLevel = {};
  for (const w of worksheetCandidates) {
    const q = w?._count?.questions ?? 0;
    if (q <= 0) continue;
    if (!worksheetByLevel[w.levelId]) worksheetByLevel[w.levelId] = [];
    worksheetByLevel[w.levelId].push({ id: w.id, title: w.title, questionCount: q, createdAt: w.createdAt });
  }

  const questionBankGroups = await prisma.questionBank.groupBy({
    by: ["levelId", "templateId"],
    where: {
      tenantId: tenant.id,
      levelId: levelIds.length ? { in: levelIds } : undefined,
      isActive: true
    },
    _count: { _all: true }
  });

  const questionBankByLevel = {};
  for (const g of questionBankGroups) {
    if (!questionBankByLevel[g.levelId]) questionBankByLevel[g.levelId] = [];
    questionBankByLevel[g.levelId].push({ templateId: g.templateId, available: g._count?._all ?? 0, bankKey: `TEMPLATE:${g.templateId || "DEFAULT"}` });
  }

  const studentCounts = await prisma.student.groupBy({
    by: ["levelId", "hierarchyNodeId"],
    where: {
      tenantId: tenant.id,
      isActive: true,
      levelId: levelIds.length ? { in: levelIds } : undefined
    },
    _count: { _all: true }
  });

  const studentSamples = await prisma.student.findMany({
    where: {
      tenantId: tenant.id,
      isActive: true,
      levelId: levelIds.length ? { in: levelIds } : undefined
    },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      levelId: true,
      hierarchyNodeId: true
    },
    orderBy: [{ createdAt: "asc" }],
    take: 120
  });

  console.log(JSON.stringify({
    tenant,
    superadmin,
    businessPartners,
    levels: topLevels,
    worksheetByLevel,
    questionBankByLevel,
    studentCounts,
    studentSamples
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
