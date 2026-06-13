import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function qPrompt(prefix, i) {
  const n = String(i).padStart(4, "0");
  return `${prefix}-Q-${n}`;
}

async function ensureTemplate({ tenantId, levelId, name, totalQuestions }) {
  const existing = await prisma.worksheetTemplate.findUnique({
    where: { tenantId_levelId: { tenantId, levelId } },
    select: { id: true, name: true }
  });
  if (existing) return existing;
  return prisma.worksheetTemplate.create({
    data: {
      tenantId,
      levelId,
      name,
      totalQuestions,
      easyCount: Math.max(1, Math.floor(totalQuestions * 0.3)),
      mediumCount: Math.max(1, Math.floor(totalQuestions * 0.4)),
      hardCount: Math.max(1, totalQuestions - Math.floor(totalQuestions * 0.3) - Math.floor(totalQuestions * 0.4)),
      timeLimitSeconds: 1200,
      isActive: true
    },
    select: { id: true, name: true }
  });
}

async function ensureQuestionBankCount({ tenantId, levelId, templateId, targetCount, promptPrefix }) {
  const current = await prisma.questionBank.count({
    where: {
      tenantId,
      levelId,
      isActive: true,
      ...(templateId ? { templateId } : { templateId: null })
    }
  });

  if (current >= targetCount) {
    return { before: current, created: 0, after: current };
  }

  const needed = targetCount - current;
  const existing = await prisma.questionBank.findMany({
    where: {
      tenantId,
      levelId,
      ...(templateId ? { templateId } : { templateId: null })
    },
    select: { prompt: true },
    take: 5000
  });
  const usedPrompts = new Set(existing.map((e) => e.prompt));

  const rows = [];
  let seq = current + 1;
  while (rows.length < needed) {
    const prompt = qPrompt(promptPrefix, seq);
    seq += 1;
    if (usedPrompts.has(prompt)) continue;
    usedPrompts.add(prompt);

    const a = 10 + (seq % 90);
    const b = 5 + (seq % 30);

    rows.push({
      tenantId,
      levelId,
      templateId,
      difficulty: "MEDIUM",
      prompt,
      operands: { a, b },
      operation: "ADD",
      correctAnswer: a + b,
      isActive: true
    });
  }

  const chunkSize = 500;
  let created = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const result = await prisma.questionBank.createMany({ data: chunk, skipDuplicates: true });
    created += result.count;
  }

  const after = await prisma.questionBank.count({
    where: {
      tenantId,
      levelId,
      isActive: true,
      ...(templateId ? { templateId } : { templateId: null })
    }
  });

  return { before: current, created, after };
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { code: "DEFAULT" }, select: { id: true, code: true } });
  if (!tenant) throw new Error("DEFAULT tenant not found");

  const level1 = await prisma.level.findUnique({ where: { tenantId_rank: { tenantId: tenant.id, rank: 1 } }, select: { id: true, name: true, rank: true } });
  const level2 = await prisma.level.findUnique({ where: { tenantId_rank: { tenantId: tenant.id, rank: 2 } }, select: { id: true, name: true, rank: true } });
  if (!level1 || !level2) throw new Error("Level 1 or Level 2 missing");

  let level3 = await prisma.level.findUnique({ where: { tenantId_rank: { tenantId: tenant.id, rank: 3 } }, select: { id: true, name: true, rank: true } });
  if (!level3) {
    level3 = await prisma.level.create({
      data: {
        tenantId: tenant.id,
        name: "Level 3",
        rank: 3,
        description: "Auto-created for assessment workflow validation"
      },
      select: { id: true, name: true, rank: true }
    });
  }

  const level2Template = await ensureTemplate({
    tenantId: tenant.id,
    levelId: level2.id,
    name: "Workflow Validation Template L2",
    totalQuestions: 120
  });

  const level3Template = await ensureTemplate({
    tenantId: tenant.id,
    levelId: level3.id,
    name: "Workflow Validation Template L3",
    totalQuestions: 220
  });

  const l2Bank = await ensureQuestionBankCount({
    tenantId: tenant.id,
    levelId: level2.id,
    templateId: level2Template.id,
    targetCount: 120,
    promptPrefix: "WF-L2"
  });

  const l3Bank = await ensureQuestionBankCount({
    tenantId: tenant.id,
    levelId: level3.id,
    templateId: level3Template.id,
    targetCount: 220,
    promptPrefix: "WF-L3"
  });

  const worksheetL1 = await prisma.worksheet.findFirst({
    where: {
      tenantId: tenant.id,
      levelId: level1.id,
      isPublished: true,
      examCycleId: null,
      questions: { some: {} }
    },
    select: { id: true, title: true }
  });

  if (!worksheetL1) {
    throw new Error("No published Level 1 worksheet with questions found");
  }

  const baseNode = (await prisma.student.findFirst({
    where: { tenantId: tenant.id, isActive: true, levelId: level1.id },
    select: { hierarchyNodeId: true }
  }))?.hierarchyNodeId;

  if (!baseNode) {
    throw new Error("No base hierarchy node found from Level 1 students");
  }

  let l3Student = await prisma.student.findFirst({
    where: { tenantId: tenant.id, isActive: true, levelId: level3.id },
    select: { id: true, admissionNo: true, firstName: true, lastName: true, levelId: true, hierarchyNodeId: true }
  });

  if (!l3Student) {
    const admissionNo = `WF-L3-${Date.now()}`;
    l3Student = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo,
        firstName: "Level3",
        lastName: "Validation",
        hierarchyNodeId: baseNode,
        levelId: level3.id,
        isActive: true
      },
      select: { id: true, admissionNo: true, firstName: true, lastName: true, levelId: true, hierarchyNodeId: true }
    });
  }

  const level2Students = await prisma.student.findMany({
    where: { tenantId: tenant.id, isActive: true, levelId: level2.id },
    select: { id: true, admissionNo: true, firstName: true, lastName: true, levelId: true, hierarchyNodeId: true },
    orderBy: { createdAt: "asc" },
    take: 2
  });

  if (level2Students.length < 2) {
    throw new Error("Need at least two active Level 2 students");
  }

  const level1Student = await prisma.student.findFirst({
    where: { tenantId: tenant.id, isActive: true, levelId: level1.id },
    select: { id: true, admissionNo: true, firstName: true, lastName: true, levelId: true, hierarchyNodeId: true },
    orderBy: { createdAt: "asc" }
  });

  if (!level1Student) {
    throw new Error("Need at least one active Level 1 student");
  }

  const superadmin = await prisma.authUser.findFirst({
    where: { tenantId: tenant.id, role: "SUPERADMIN", isActive: true },
    select: { id: true, username: true, email: true }
  });

  const businessPartner = await prisma.businessPartner.findFirst({
    where: { tenantId: tenant.id, isActive: true },
    select: { id: true, code: true, name: true, hierarchyNodeId: true }
  });

  console.log(JSON.stringify({
    tenant,
    superadmin,
    businessPartner,
    levels: { level1, level2, level3 },
    worksheetL1,
    questionBanks: {
      level2: { bankKey: `TEMPLATE:${level2Template.id}`, templateId: level2Template.id, stats: l2Bank },
      level3: { bankKey: `TEMPLATE:${level3Template.id}`, templateId: level3Template.id, stats: l3Bank }
    },
    students: {
      level1Student,
      level2StudentA: level2Students[0],
      level2StudentB: level2Students[1],
      level3Student: l3Student
    },
    centerNodeIdForList: level1Student.hierarchyNodeId
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
