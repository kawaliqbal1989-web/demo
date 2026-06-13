import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = "http://127.0.0.1:4000/api";

function isoPlusMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function callApi(path, { method = "GET", token = null, body = null } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    path,
    method,
    status: response.status,
    ok: response.ok,
    bodyText: text,
    bodyJson: json
  };
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { code: "DEFAULT" }, select: { id: true, code: true } });
  if (!tenant) throw new Error("DEFAULT tenant not found");

  const superadmin = await prisma.authUser.findFirst({
    where: { tenantId: tenant.id, role: "SUPERADMIN", isActive: true },
    select: { id: true, email: true, username: true }
  });
  if (!superadmin) throw new Error("Superadmin not found");

  const businessPartner = await prisma.businessPartner.findFirst({
    where: { tenantId: tenant.id, isActive: true },
    select: { id: true, code: true, name: true }
  });
  if (!businessPartner) throw new Error("Business partner not found");

  const level1 = await prisma.level.findUnique({ where: { tenantId_rank: { tenantId: tenant.id, rank: 1 } }, select: { id: true, name: true, rank: true } });
  const level2 = await prisma.level.findUnique({ where: { tenantId_rank: { tenantId: tenant.id, rank: 2 } }, select: { id: true, name: true, rank: true } });
  const level3 = await prisma.level.findUnique({ where: { tenantId_rank: { tenantId: tenant.id, rank: 3 } }, select: { id: true, name: true, rank: true } });
  if (!level1 || !level2 || !level3) throw new Error("Required levels (1,2,3) not found");

  const worksheetL1 = await prisma.worksheet.findFirst({
    where: {
      tenantId: tenant.id,
      levelId: level1.id,
      isPublished: true,
      examCycleId: null,
      questions: { some: {} }
    },
    select: { id: true, title: true, levelId: true }
  });
  if (!worksheetL1) throw new Error("No Level 1 worksheet found with questions");

  const l2Groups = await prisma.questionBank.groupBy({
    by: ["templateId"],
    where: { tenantId: tenant.id, levelId: level2.id, isActive: true },
    _count: { _all: true }
  });
  const l2Bank = l2Groups
    .map((g) => ({ templateId: g.templateId, count: g._count?._all ?? 0, bankKey: `TEMPLATE:${g.templateId || "DEFAULT"}` }))
    .filter((x) => x.count >= 100)
    .sort((a, b) => b.count - a.count)[0];
  if (!l2Bank) throw new Error("No Level 2 question bank with >=100 questions");

  const l3Groups = await prisma.questionBank.groupBy({
    by: ["templateId"],
    where: { tenantId: tenant.id, levelId: level3.id, isActive: true },
    _count: { _all: true }
  });
  const l3Bank = l3Groups
    .map((g) => ({ templateId: g.templateId, count: g._count?._all ?? 0, bankKey: `TEMPLATE:${g.templateId || "DEFAULT"}` }))
    .filter((x) => x.count >= 200)
    .sort((a, b) => b.count - a.count)[0];
  if (!l3Bank) throw new Error("No Level 3 question bank with >=200 questions");

  const level1Student = await prisma.student.findFirst({
    where: { tenantId: tenant.id, levelId: level1.id, isActive: true },
    select: { id: true, admissionNo: true, firstName: true, lastName: true, hierarchyNodeId: true, levelId: true },
    orderBy: { createdAt: "asc" }
  });
  if (!level1Student) throw new Error("No Level 1 student found");

  const centerNodeId = level1Student.hierarchyNodeId;

  const level2Students = await prisma.student.findMany({
    where: { tenantId: tenant.id, levelId: level2.id, isActive: true, hierarchyNodeId: centerNodeId },
    select: { id: true, admissionNo: true, firstName: true, lastName: true, hierarchyNodeId: true, levelId: true },
    orderBy: { createdAt: "asc" },
    take: 2
  });
  if (level2Students.length < 2) throw new Error("Need 2 Level 2 students in same center node");

  const level3Student = await prisma.student.findFirst({
    where: { tenantId: tenant.id, levelId: level3.id, isActive: true, hierarchyNodeId: centerNodeId },
    select: { id: true, admissionNo: true, firstName: true, lastName: true, hierarchyNodeId: true, levelId: true },
    orderBy: { createdAt: "asc" }
  });
  if (!level3Student) throw new Error("No Level 3 student in center node");

  const login = await callApi("/auth/login", {
    method: "POST",
    body: {
      tenantCode: "DEFAULT",
      username: "superadmin@abacusweb.local",
      password: "Pass@123"
    }
  });

  if (!login.ok) {
    console.log(JSON.stringify({ step: "LOGIN", login }, null, 2));
    throw new Error("Login failed");
  }

  const token = login.bodyJson?.data?.access_token;
  if (!token) throw new Error("Missing access token from login response");

  const cycleName = `WF Validation ${new Date().toISOString()}`;

  const createCycle = await callApi("/exam-cycles", {
    method: "POST",
    token,
    body: {
      businessPartnerId: businessPartner.id,
      name: cycleName,
      enrollmentStartAt: isoPlusMinutes(-60),
      enrollmentEndAt: isoPlusMinutes(1440),
      practiceStartAt: isoPlusMinutes(-30),
      examStartsAt: isoPlusMinutes(2880),
      examEndsAt: isoPlusMinutes(2940),
      examDurationMinutes: 60,
      attemptLimit: 1,
      resultPublishAt: isoPlusMinutes(3000)
    }
  });

  const examCycleId = createCycle.bodyJson?.data?.id;
  if (!createCycle.ok || !examCycleId) {
    console.log(JSON.stringify({ step: "CREATE_EXAM_CYCLE", createCycle }, null, 2));
    throw new Error("Exam cycle creation failed");
  }

  const saveConfig = await callApi(`/exam-cycles/${examCycleId}/assessment-config`, {
    method: "POST",
    token,
    body: {
      configs: [
        {
          levelId: level1.id,
          assessmentType: "WORKSHEET",
          worksheetId: worksheetL1.id
        },
        {
          levelId: level2.id,
          assessmentType: "QUESTION_BANK",
          questionBankId: l2Bank.bankKey,
          questionCount: 100,
          timeLimitMinutes: 15
        },
        {
          levelId: level3.id,
          assessmentType: "QUESTION_BANK",
          questionBankId: l3Bank.bankKey,
          questionCount: 200,
          timeLimitMinutes: 20
        }
      ]
    }
  });

  const getConfig = await callApi(`/exam-cycles/${examCycleId}/assessment-config`, {
    method: "GET",
    token
  });

  const selectedStudents = [
    level1Student,
    level2Students[0],
    level2Students[1],
    level3Student
  ];

  const listPrep = await prisma.$transaction(async (tx) => {
    const scopeKey = `CENTER:${centerNodeId}`;

    const list = await tx.examEnrollmentList.upsert({
      where: {
        tenantId_examCycleId_scopeKey: {
          tenantId: tenant.id,
          examCycleId,
          scopeKey
        }
      },
      create: {
        tenantId: tenant.id,
        examCycleId,
        type: "CENTER_COMBINED",
        scopeKey,
        hierarchyNodeId: centerNodeId,
        teacherUserId: null,
        status: "SUBMITTED_TO_SUPERADMIN",
        locked: true,
        submittedAt: new Date(),
        forwardedAt: new Date(),
        createdByUserId: superadmin.id
      },
      update: {
        status: "SUBMITTED_TO_SUPERADMIN",
        locked: true,
        submittedAt: new Date(),
        forwardedAt: new Date(),
        rejectedAt: null,
        rejectedByUserId: null,
        rejectedRemark: null
      },
      select: { id: true, status: true, scopeKey: true }
    });

    const entryIds = [];

    for (const student of selectedStudents) {
      const entry = await tx.examEnrollmentEntry.upsert({
        where: {
          tenantId_examCycleId_studentId: {
            tenantId: tenant.id,
            examCycleId,
            studentId: student.id
          }
        },
        create: {
          tenantId: tenant.id,
          examCycleId,
          studentId: student.id,
          enrolledLevelId: student.levelId,
          isTemporary: false,
          sourceTeacherUserId: null,
          createdByUserId: superadmin.id
        },
        update: {
          enrolledLevelId: student.levelId
        },
        select: { id: true, studentId: true, enrolledLevelId: true }
      });

      entryIds.push(entry.id);
    }

    await tx.examEnrollmentListItem.deleteMany({
      where: {
        tenantId: tenant.id,
        listId: list.id,
        entryId: { notIn: entryIds }
      }
    });

    await tx.examEnrollmentListItem.createMany({
      data: entryIds.map((entryId) => ({ tenantId: tenant.id, listId: list.id, entryId, included: true })),
      skipDuplicates: true
    });

    await tx.examEnrollmentListItem.updateMany({
      where: {
        tenantId: tenant.id,
        listId: list.id,
        entryId: { in: entryIds }
      },
      data: { included: true }
    });

    return { listId: list.id, status: list.status, selectedStudentIds: selectedStudents.map((s) => s.id), selectedAdmissionNos: selectedStudents.map((s) => s.admissionNo) };
  });

  const pendingBeforeApprove = await callApi(`/exam-cycles/${examCycleId}/enrollment-lists/pending`, {
    method: "GET",
    token
  });

  const approve = await callApi(`/exam-cycles/${examCycleId}/enrollment-lists/${listPrep.listId}/approve`, {
    method: "POST",
    token,
    body: {}
  });

  const pendingAfterApprove = await callApi(`/exam-cycles/${examCycleId}/enrollment-lists/pending`, {
    method: "GET",
    token
  });

  const configRows = await prisma.examLevelAssessmentConfig.findMany({
    where: { tenantId: tenant.id, examCycleId },
    orderBy: [{ levelId: "asc" }],
    select: {
      id: true,
      levelId: true,
      assessmentType: true,
      worksheetId: true,
      questionBankId: true,
      questionCount: true,
      timeLimitMinutes: true,
      createdAt: true,
      updatedAt: true
    }
  });

  const generatedSets = await prisma.examGeneratedQuestionSet.findMany({
    where: { tenantId: tenant.id, examCycleId },
    orderBy: [{ studentId: "asc" }, { levelId: "asc" }],
    select: {
      id: true,
      studentId: true,
      levelId: true,
      questionBankId: true,
      generatedQuestionIds: true,
      generatedAt: true
    }
  });

  const studentAId = level2Students[0].id;
  const studentBId = level2Students[1].id;

  const setA = generatedSets.find((row) => row.studentId === studentAId && row.levelId === level2.id);
  const setB = generatedSets.find((row) => row.studentId === studentBId && row.levelId === level2.id);

  const listA = Array.isArray(setA?.generatedQuestionIds) ? setA.generatedQuestionIds : [];
  const listB = Array.isArray(setB?.generatedQuestionIds) ? setB.generatedQuestionIds : [];
  const sameLength = listA.length === listB.length;
  const sameOrder = sameLength && listA.every((id, idx) => id === listB[idx]);
  const overlapCount = listA.filter((id) => listB.includes(id)).length;

  const output = {
    workflowInput: {
      businessPartner,
      levels: { level1, level2, level3 },
      worksheetL1,
      banks: {
        level2: { bankKey: l2Bank.bankKey, available: l2Bank.count },
        level3: { bankKey: l3Bank.bankKey, available: l3Bank.count }
      },
      students: {
        level1Student,
        level2StudentA: level2Students[0],
        level2StudentB: level2Students[1],
        level3Student
      }
    },
    apiResponses: {
      login,
      createCycle,
      saveConfig,
      getConfig,
      pendingBeforeApprove,
      approve,
      pendingAfterApprove
    },
    dbVerification: {
      examCycleId,
      listPrep,
      examLevelAssessmentConfigRows: configRows,
      examGeneratedQuestionSetRows: generatedSets,
      studentABComparison: {
        studentA: {
          id: level2Students[0].id,
          admissionNo: level2Students[0].admissionNo,
          generatedCount: listA.length,
          first20: listA.slice(0, 20)
        },
        studentB: {
          id: level2Students[1].id,
          admissionNo: level2Students[1].admissionNo,
          generatedCount: listB.length,
          first20: listB.slice(0, 20)
        },
        sameLength,
        sameOrder,
        overlapCount
      }
    }
  };

  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch((error) => {
    console.error("WORKFLOW_SCRIPT_ERROR", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
