import { authHeader, ensureAuthUser, getTenantByCode, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";
import { jest } from "@jest/globals";

jest.setTimeout(90000);

describe("EXAM LEVEL MAPPING INTEGRITY", () => {
  let tenant;
  let saToken;
  let teacherToken;
  let centerNode;
  let partner;
  let superadmin;
  let teacher;
  let levelsByRank;
  let examCycleId;

  async function createExamCycle() {
    const now = Date.now();
    const res = await http
      .post("/api/exam-cycles")
      .set(authHeader(saToken))
      .send({
        businessPartnerId: partner.id,
        name: `Level Mapping ${randomId("cycle")}`,
        enrollmentStartAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
        enrollmentEndAt: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
        practiceStartAt: new Date(now + 6 * 24 * 60 * 60 * 1000).toISOString(),
        examStartsAt: new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString(),
        examEndsAt: new Date(now + 11 * 24 * 60 * 60 * 1000).toISOString(),
        examDurationMinutes: 45,
        attemptLimit: 1
      });

    expect(res.status).toBe(201);
    return res.body.data.id;
  }

  async function createTeacherAssignedStudent({ rank, suffix }) {
    const level = levelsByRank.get(rank);
    expect(level?.id).toBeTruthy();

    const student = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `ADM-${suffix}-${randomId("lvl")}`,
        firstName: `Stu${suffix}`,
        lastName: `R${rank}`,
        hierarchyNodeId: centerNode.id,
        levelId: level.id,
        isActive: true
      },
      select: { id: true, levelId: true }
    });

    const batch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: `B-${suffix}-${randomId("lvl")}`,
        levelId: level.id,
        status: "ACTIVE",
        isActive: true
      },
      select: { id: true }
    });

    await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: student.id,
        batchId: batch.id,
        assignedTeacherUserId: teacher.id,
        levelId: level.id,
        status: "ACTIVE"
      }
    });

    return student;
  }

  async function ensureLevelQuestionBank(levelId) {
    const template = await prisma.worksheetTemplate.upsert({
      where: {
        tenantId_levelId: {
          tenantId: tenant.id,
          levelId
        }
      },
      update: { isActive: true },
      create: {
        tenantId: tenant.id,
        levelId,
        name: `Template-${randomId("qb")}`,
        totalQuestions: 10,
        easyCount: 4,
        mediumCount: 4,
        hardCount: 2,
        timeLimitSeconds: 600,
        isActive: true
      },
      select: { id: true }
    });

    const count = await prisma.questionBank.count({
      where: { tenantId: tenant.id, levelId, templateId: template.id, isActive: true }
    });

    if (count >= 5) {
      return template.id;
    }

    const toCreate = [];
    for (let i = count; i < 5; i += 1) {
      toCreate.push({
        tenantId: tenant.id,
        levelId,
        templateId: template.id,
        difficulty: "MEDIUM",
        prompt: `QB-${levelId}-${i}-${randomId("p")}`,
        operands: { a: i + 2, b: i + 3 },
        operation: "+",
        correctAnswer: i + 5,
        isActive: true
      });
    }

    await prisma.questionBank.createMany({ data: toCreate });
    return template.id;
  }

  async function createPublishedBaseWorksheet(levelId) {
    const worksheet = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `Base-L${levelId}-${randomId("ws")}`,
        description: "Base worksheet for exam mapping test",
        difficulty: "MEDIUM",
        levelId,
        createdByUserId: superadmin.id,
        isPublished: true
      },
      select: { id: true }
    });

    await prisma.worksheetQuestion.createMany({
      data: [
        {
          tenantId: tenant.id,
          worksheetId: worksheet.id,
          questionNumber: 1,
          operands: { a: 3, b: 2 },
          operation: "+",
          correctAnswer: 5
        },
        {
          tenantId: tenant.id,
          worksheetId: worksheet.id,
          questionNumber: 2,
          operands: { a: 9, b: 4 },
          operation: "-",
          correctAnswer: 5
        }
      ]
    });

    return worksheet.id;
  }

  beforeAll(async () => {
    tenant = await getTenantByCode("DEFAULT");

    const [saLogin, teLogin] = await Promise.all([
      loginAs({ email: "superadmin@abacusweb.local" }),
      loginAs({ email: "teacher.one@abacusweb.local" })
    ]);

    saToken = saLogin.body?.data?.access_token;
    teacherToken = teLogin.body?.data?.access_token;

    expect(saToken).toBeTruthy();
    expect(teacherToken).toBeTruthy();

    superadmin = await prisma.authUser.findFirstOrThrow({
      where: { tenantId: tenant.id, role: "SUPERADMIN", isActive: true },
      select: { id: true }
    });

    teacher = await prisma.authUser.findFirstOrThrow({
      where: { tenantId: tenant.id, email: "teacher.one@abacusweb.local" },
      select: { id: true, hierarchyNodeId: true }
    });

    centerNode = await prisma.hierarchyNode.findUniqueOrThrow({
      where: { id: teacher.hierarchyNodeId },
      select: { id: true, code: true }
    });

    partner = await prisma.businessPartner.findFirstOrThrow({
      where: { tenantId: tenant.id, contactEmail: "bp.manager@abacusweb.local" },
      select: { id: true }
    });

    const neededRanks = [1, 4, 8];
    for (const rank of neededRanks) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.level.upsert({
        where: {
          tenantId_rank: {
            tenantId: tenant.id,
            rank
          }
        },
        update: {},
        create: {
          tenantId: tenant.id,
          rank,
          name: `Level ${rank}`,
          description: `Exam level mapping test level ${rank}`
        }
      });
    }

    const levels = await prisma.level.findMany({
      where: { tenantId: tenant.id, rank: { in: [1, 4, 8] } },
      select: { id: true, rank: true }
    });
    levelsByRank = new Map(levels.map((l) => [l.rank, l]));

    examCycleId = await createExamCycle();
  });

  test("teacher enrollment stores active enrollment level (1,4,8) and preserves in bulk", async () => {
    const s1 = await createTeacherAssignedStudent({ rank: 1, suffix: "L1" });
    const s4 = await createTeacherAssignedStudent({ rank: 4, suffix: "L4" });
    const s8 = await createTeacherAssignedStudent({ rank: 8, suffix: "L8" });

    const enrollRes = await http
      .post(`/api/exam-cycles/${examCycleId}/teacher-list/enroll`)
      .set(authHeader(teacherToken))
      .send({ studentIds: [s1.id, s4.id, s8.id] });

    expect([200, 201]).toContain(enrollRes.status);

    const entries = await prisma.examEnrollmentEntry.findMany({
      where: {
        tenantId: tenant.id,
        examCycleId,
        studentId: { in: [s1.id, s4.id, s8.id] }
      },
      select: { studentId: true, enrolledLevelId: true }
    });

    const byStudentId = new Map(entries.map((e) => [e.studentId, e.enrolledLevelId]));
    expect(byStudentId.get(s1.id)).toBe(levelsByRank.get(1).id);
    expect(byStudentId.get(s4.id)).toBe(levelsByRank.get(4).id);
    expect(byStudentId.get(s8.id)).toBe(levelsByRank.get(8).id);
  });

  test("temporary student enrollment preserves provided level", async () => {
    const prepare = await http
      .post(`/api/exam-cycles/${examCycleId}/center-list/prepare`)
      .set(authHeader(await loginAs({ email: "center.manager@abacusweb.local" }).then((r) => r.body?.data?.access_token)))
      .send({});

    expect([200, 409]).toContain(prepare.status);

    const centerToken = (await loginAs({ email: "center.manager@abacusweb.local" })).body?.data?.access_token;

    const createTemp = await http
      .post(`/api/exam-cycles/${examCycleId}/temporary-students`)
      .set(authHeader(centerToken))
      .send({
        students: [
          {
            firstName: "Temp",
            lastName: "L8",
            levelId: levelsByRank.get(8).id,
            password: "Pass@123"
          }
        ]
      });

    expect(createTemp.status).toBe(201);

    const created = Array.isArray(createTemp.body?.data) ? createTemp.body.data[0] : null;
    expect(created?.student?.levelId).toBe(levelsByRank.get(8).id);

    const tempEntry = await prisma.examEnrollmentEntry.findFirst({
      where: {
        tenantId: tenant.id,
        examCycleId,
        studentId: created?.student?.id
      },
      select: { enrolledLevelId: true, isTemporary: true }
    });

    expect(tempEntry?.isTemporary).toBe(true);
    expect(tempEntry?.enrolledLevelId).toBe(levelsByRank.get(8).id);
  });

  test("worksheet assignment and question-bank selection both use enrolled exam level", async () => {
    const centerToken = (await loginAs({ email: "center.manager@abacusweb.local" })).body?.data?.access_token;
    const franchiseToken = (await loginAs({ email: "franchise.manager@abacusweb.local" })).body?.data?.access_token;
    const bpToken = (await loginAs({ email: "bp.manager@abacusweb.local" })).body?.data?.access_token;

    const existingEntryCount = await prisma.examEnrollmentEntry.count({
      where: { tenantId: tenant.id, examCycleId }
    });

    if (existingEntryCount === 0) {
      const s1 = await createTeacherAssignedStudent({ rank: 1, suffix: "W1" });
      const s4 = await createTeacherAssignedStudent({ rank: 4, suffix: "W4" });
      const s8 = await createTeacherAssignedStudent({ rank: 8, suffix: "W8" });

      const enrollRes = await http
        .post(`/api/exam-cycles/${examCycleId}/teacher-list/enroll`)
        .set(authHeader(teacherToken))
        .send({ studentIds: [s1.id, s4.id, s8.id] });

      expect([200, 201]).toContain(enrollRes.status);
    }

    const submitTeacher = await http
      .post(`/api/exam-cycles/${examCycleId}/teacher-list/submit`)
      .set(authHeader(teacherToken))
      .send({});
    expect(submitTeacher.status).toBe(200);

    const prepare = await http
      .post(`/api/exam-cycles/${examCycleId}/center-list/prepare`)
      .set(authHeader(centerToken))
      .send({});
    expect(prepare.status).toBe(200);

    const submitCenter = await http
      .post(`/api/exam-cycles/${examCycleId}/center-list/submit`)
      .set(authHeader(centerToken))
      .send({});
    expect(submitCenter.status).toBe(200);

    const pendingFr = await http
      .get(`/api/exam-cycles/${examCycleId}/enrollment-lists/pending`)
      .set(authHeader(franchiseToken));
    expect(pendingFr.status).toBe(200);

    const listId = pendingFr.body?.data?.[0]?.id;
    expect(listId).toBeTruthy();

    const frForward = await http
      .post(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/forward`)
      .set(authHeader(franchiseToken))
      .send({});
    expect(frForward.status).toBe(200);

    const bpForward = await http
      .post(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/forward`)
      .set(authHeader(bpToken))
      .send({});
    expect(bpForward.status).toBe(200);

    const baseWsByLevel = new Map();
    for (const rank of [1, 4, 8]) {
      const levelId = levelsByRank.get(rank).id;
      // eslint-disable-next-line no-await-in-loop
      const wsId = await createPublishedBaseWorksheet(levelId);
      baseWsByLevel.set(levelId, wsId);
    }

    const saveConfig = await http
      .put(`/api/exam-cycles/${examCycleId}/assessment-config`)
      .set(authHeader(saToken))
      .send({
        listId,
        configs: [
          {
            levelId: levelsByRank.get(1).id,
            assessmentType: "WORKSHEET",
            worksheetId: baseWsByLevel.get(levelsByRank.get(1).id)
          },
          {
            levelId: levelsByRank.get(4).id,
            assessmentType: "WORKSHEET",
            worksheetId: baseWsByLevel.get(levelsByRank.get(4).id)
          },
          {
            levelId: levelsByRank.get(8).id,
            assessmentType: "QUESTION_BANK",
            questionBankId: `TEMPLATE:${await ensureLevelQuestionBank(levelsByRank.get(8).id)}`,
            questionCount: 3,
            timeLimitMinutes: 20
          }
        ]
      });

    expect(saveConfig.status).toBe(200);

    const approve = await http
      .post(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/approve`)
      .set(authHeader(saToken))
      .send({});

    expect(approve.status).toBe(200);

    const entries = await prisma.examEnrollmentEntry.findMany({
      where: { tenantId: tenant.id, examCycleId },
      select: { studentId: true, enrolledLevelId: true }
    });

    const enrolledByStudent = new Map(entries.map((e) => [e.studentId, e.enrolledLevelId]));

    const assignments = await prisma.worksheetAssignment.findMany({
      where: {
        tenantId: tenant.id,
        isActive: true,
        worksheet: {
          is: {
            examCycleId,
            generationMode: "EXAM"
          }
        }
      },
      select: {
        studentId: true,
        worksheet: {
          select: {
            levelId: true
          }
        }
      }
    });

    for (const row of assignments) {
      expect(row.worksheet.levelId).toBe(enrolledByStudent.get(row.studentId));
    }

    const generatedSets = await prisma.examGeneratedQuestionSet.findMany({
      where: { tenantId: tenant.id, examCycleId },
      select: { studentId: true, levelId: true }
    });

    for (const set of generatedSets) {
      expect(set.levelId).toBe(enrolledByStudent.get(set.studentId));
    }
  });

  test("question-set endpoint rejects mismatched level and uses enrolled level", async () => {
    const anyEntry = await prisma.examEnrollmentEntry.findFirst({
      where: { tenantId: tenant.id, examCycleId },
      select: { studentId: true, enrolledLevelId: true }
    });
    expect(anyEntry).toBeTruthy();

    const mismatchedLevelId = levelsByRank.get(1).id === anyEntry.enrolledLevelId ? levelsByRank.get(4).id : levelsByRank.get(1).id;

    const mismatch = await http
      .post(`/api/exam-cycles/${examCycleId}/generate-question-set`)
      .set(authHeader(saToken))
      .send({
        studentId: anyEntry.studentId,
        levelId: mismatchedLevelId
      });

    expect(mismatch.status).toBe(409);
    expect(mismatch.body?.error_code).toBe("EXAM_LEVEL_MISMATCH");

    const valid = await http
      .post(`/api/exam-cycles/${examCycleId}/generate-question-set`)
      .set(authHeader(saToken))
      .send({
        studentId: anyEntry.studentId
      });

    const allowedStatuses = new Set([200, 409]);
    expect(allowedStatuses.has(valid.status)).toBe(true);
    if (valid.status === 200) {
      expect(valid.body?.data?.levelId).toBe(anyEntry.enrolledLevelId);
    }
  });
});
