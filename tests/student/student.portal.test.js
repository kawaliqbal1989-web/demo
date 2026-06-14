import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../helpers/test-helpers.js";
import { authHeader, ensureAuthUser, getTenantByCode, loginAs, randomId } from "../helpers/test-helpers.js";

const http = request(app);

describe("STUDENT PORTAL (API)", () => {
  let tenant;
  let centerUser;
  let superadminUser;
  let businessPartner;
  let level1;
  let student;
  let studentAuth;
  let token;
  let worksheet;
  let unassignedWorksheet;

  beforeAll(async () => {
    tenant = await getTenantByCode("DEFAULT");
    level1 = await prisma.level.findFirst({ where: { tenantId: tenant.id, rank: 1 }, select: { id: true } });

    centerUser = await prisma.authUser.findFirst({
      where: { tenantId: tenant.id, role: "CENTER", email: "center.manager@abacusweb.local" },
      select: { id: true, hierarchyNodeId: true }
    });

    superadminUser = await prisma.authUser.findFirst({
      where: { tenantId: tenant.id, role: "SUPERADMIN", email: "superadmin@abacusweb.local" },
      select: { id: true }
    });

    businessPartner = await prisma.businessPartner.findFirst({
      where: { tenantId: tenant.id },
      select: { id: true }
    });

    student = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `ST-${randomId("p")}`,
        firstName: "Portal",
        lastName: "Student",
        hierarchyNodeId: centerUser.hierarchyNodeId,
        levelId: level1.id,
        isActive: true
      }
    });

    studentAuth = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `student.${randomId("u")}@abacusweb.local`,
      username: `STU${Math.floor(Math.random() * 100000)}`,
      role: "STUDENT",
      hierarchyNodeCode: null,
      parentUserId: centerUser.id,
      studentId: student.id,
      password: "Pass@123"
    });

    const login = await loginAs({ tenantCode: "DEFAULT", username: studentAuth.username, password: "Pass@123" });
    token = login.body?.data?.access_token;

    worksheet = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `WS-${randomId("w")}`,
        description: "Student portal worksheet",
        levelId: level1.id,
        createdByUserId: centerUser.id,
        isPublished: true,
        timeLimitSeconds: 600
      }
    });

    unassignedWorksheet = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `WS-UNASSIGNED-${randomId("w")}`,
        description: "Unassigned worksheet",
        levelId: level1.id,
        createdByUserId: centerUser.id,
        isPublished: true,
        timeLimitSeconds: 600
      }
    });

    await prisma.worksheetQuestion.createMany({
      data: [
        {
          tenantId: tenant.id,
          worksheetId: worksheet.id,
          questionNumber: 1,
          operands: { a: 1, b: 2 },
          operation: "+",
          correctAnswer: 3
        },
        {
          tenantId: tenant.id,
          worksheetId: worksheet.id,
          questionNumber: 2,
          operands: { a: 5, b: 4 },
          operation: "-",
          correctAnswer: 1
        }
      ]
    });

    await prisma.worksheetQuestion.createMany({
      data: [
        {
          tenantId: tenant.id,
          worksheetId: unassignedWorksheet.id,
          questionNumber: 1,
          operands: { a: 10, b: 4 },
          operation: "-",
          correctAnswer: 6
        }
      ]
    });

    await prisma.worksheetAssignment.create({
      data: {
        tenantId: tenant.id,
        worksheetId: worksheet.id,
        studentId: student.id,
        createdByUserId: centerUser.id,
        isActive: true,
        assignedAt: new Date()
      }
    });
  });

  async function createExamResultFixture({ published = false } = {}) {
    const now = Date.now();
    const examCycle = await prisma.examCycle.create({
      data: {
        tenantId: tenant.id,
        businessPartnerId: businessPartner.id,
        name: `Portal Exam ${randomId("exam")}`,
        code: `EX-${randomId("code")}`,
        enrollmentStartAt: new Date(now - 24 * 60 * 60 * 1000),
        enrollmentEndAt: new Date(now + 24 * 60 * 60 * 1000),
        practiceStartAt: new Date(now - 12 * 60 * 60 * 1000),
        examStartsAt: new Date(now - 6 * 60 * 60 * 1000),
        examEndsAt: new Date(now + 6 * 60 * 60 * 1000),
        examDurationMinutes: 45,
        attemptLimit: 1,
        createdByUserId: superadminUser.id,
        resultStatus: published ? "PUBLISHED" : "DRAFT",
        resultPublishedAt: published ? new Date() : null
      }
    });

    await prisma.examEnrollmentEntry.create({
      data: {
        tenantId: tenant.id,
        examCycleId: examCycle.id,
        studentId: student.id,
        enrolledLevelId: level1.id,
        isTemporary: false,
        sourceTeacherUserId: null,
        createdByUserId: centerUser.id
      }
    });

    const examWorksheet = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `Exam Worksheet ${randomId("ews")}`,
        description: "Exam worksheet for student portal result tests",
        levelId: level1.id,
        createdByUserId: centerUser.id,
        isPublished: true,
        generationMode: "EXAM",
        examCycleId: examCycle.id,
        timeLimitSeconds: 2700
      }
    });

    await prisma.worksheetSubmission.create({
      data: {
        tenantId: tenant.id,
        worksheetId: examWorksheet.id,
        studentId: student.id,
        score: 100,
        submittedAt: new Date(now - 5 * 60 * 1000),
        status: "REVIEWED",
        correctCount: 2,
        totalQuestions: 2,
        completionTimeSeconds: 120,
        submittedAnswers: [{ questionNumber: 1, answer: 3 }, { questionNumber: 2, answer: 1 }],
        finalSubmittedAt: new Date(now - 4 * 60 * 1000),
        passed: true,
        evaluationHash: `hash_${randomId("eval")}`,
        remarks: "Auto-evaluated"
      }
    });

    return examCycle;
  }

  async function createAssignedWorksheetFixture({ titlePrefix = "WS-SEC", dueDate = null } = {}) {
    const createdWorksheet = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `${titlePrefix}-${randomId("w")}`,
        description: "Security fixture worksheet",
        levelId: level1.id,
        createdByUserId: centerUser.id,
        isPublished: true,
        timeLimitSeconds: 600
      }
    });

    await prisma.worksheetQuestion.createMany({
      data: [
        {
          tenantId: tenant.id,
          worksheetId: createdWorksheet.id,
          questionNumber: 1,
          operands: { a: 2, b: 2 },
          operation: "+",
          correctAnswer: 4
        }
      ]
    });

    const assignment = await prisma.worksheetAssignment.create({
      data: {
        tenantId: tenant.id,
        worksheetId: createdWorksheet.id,
        studentId: student.id,
        createdByUserId: centerUser.id,
        isActive: true,
        assignedAt: new Date(),
        ...(dueDate ? { dueDate } : {})
      }
    });

    return { worksheet: createdWorksheet, assignment };
  }

  test("GET /api/student/me returns student profile", async () => {
    const res = await http.get("/api/student/me").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body?.data?.studentId).toBe(student.id);
    expect(res.body?.data?.studentCode).toBe(student.admissionNo);
    expect(res.body?.data?.status).toBe("ACTIVE");
  });

  test("GET /api/student/worksheets lists only explicitly assigned worksheets", async () => {
    const res = await http.get("/api/student/worksheets").set(authHeader(token));
    expect(res.status).toBe(200);
    const ids = res.body?.data?.items?.map((i) => i.worksheetId) || [];
    expect(ids).toContain(worksheet.id);
    expect(ids).not.toContain(unassignedWorksheet.id);
  });

  test("student cannot start an unassigned worksheet even when level matches", async () => {
    const start = await http
      .post(`/api/student/worksheets/${unassignedWorksheet.id}/start`)
      .set(authHeader(token))
      .send({ attemptMode: "practice" });

    expect(start.status).toBe(403);
    expect(start.body?.error_code).toBe("WORKSHEET_NOT_ALLOWED");
  });

  test("student cannot fetch an unassigned worksheet even when published and same-level", async () => {
    const fetch = await http
      .get(`/api/student/worksheets/${unassignedWorksheet.id}`)
      .set(authHeader(token));

    expect(fetch.status).toBe(403);
    expect(fetch.body?.error_code).toBe("WORKSHEET_NOT_ALLOWED");
  });

  test("direct /api/worksheets/:id/submit denies unassigned student", async () => {
    const submit = await http
      .post(`/api/worksheets/${unassignedWorksheet.id}/submit`)
      .set(authHeader(token))
      .send({
        studentId: student.id,
        answers: [{ questionNumber: 1, answer: 6 }]
      });

    expect(submit.status).toBe(403);
    expect(submit.body?.error_code).toBe("WORKSHEET_NOT_ALLOWED");
  });

  test("revoked assignment immediately blocks save and submit by attempt id", async () => {
    const { worksheet: assignedWorksheet, assignment } = await createAssignedWorksheetFixture({
      titlePrefix: "WS-REVOKE"
    });

    const start = await http
      .post(`/api/student/worksheets/${assignedWorksheet.id}/attempts/start`)
      .set(authHeader(token))
      .send({});

    expect([200, 201]).toContain(start.status);
    const attemptId = start.body?.data?.attemptId;
    expect(typeof attemptId).toBe("string");

    await prisma.worksheetAssignment.update({
      where: {
        worksheetId_studentId: {
          worksheetId: assignment.worksheetId,
          studentId: assignment.studentId
        }
      },
      data: {
        isActive: false,
        unassignedAt: new Date()
      }
    });

    const save = await http
      .patch(`/api/student/attempts/${attemptId}/answers`)
      .set(authHeader(token))
      .send({ answersDelta: { q1: 4 }, version: 0 });

    expect(save.status).toBe(403);
    expect(save.body?.error_code).toBe("WORKSHEET_NOT_ALLOWED");

    const submit = await http
      .post(`/api/student/attempts/${attemptId}/submit`)
      .set(authHeader(token))
      .send({ answersByQuestionId: { q1: 4 } });

    expect(submit.status).toBe(403);
    expect(submit.body?.error_code).toBe("WORKSHEET_NOT_ALLOWED");
  });

  test("expired assignment is hidden from list and blocked from start", async () => {
    const { worksheet: expiredWorksheet } = await createAssignedWorksheetFixture({
      titlePrefix: "WS-EXPIRED",
      dueDate: new Date(Date.now() - 60 * 1000)
    });

    const list = await http.get("/api/student/worksheets").set(authHeader(token));
    expect(list.status).toBe(200);
    const listedIds = list.body?.data?.items?.map((item) => item.worksheetId) || [];
    expect(listedIds).not.toContain(expiredWorksheet.id);

    const start = await http
      .post(`/api/student/worksheets/${expiredWorksheet.id}/start`)
      .set(authHeader(token))
      .send({ attemptMode: "practice" });

    expect(start.status).toBe(403);
    expect(start.body?.error_code).toBe("WORKSHEET_NOT_ALLOWED");
  });

  test("can list student materials", async () => {
    const response = await http.get("/api/student/materials").set(authHeader(token));

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);

    if (response.body.data.length) {
      const first = response.body.data[0];
      expect(first).toHaveProperty("materialId");
      expect(first).toHaveProperty("title");
      expect(first).toHaveProperty("url");
    }
  });

  test("Start -> submit cycle returns score", async () => {
    const start = await http
      .post(`/api/student/worksheets/${worksheet.id}/start`)
      .set(authHeader(token))
      .send({ attemptMode: "practice" });

    expect([200, 201]).toContain(start.status);
    const attemptId = start.body?.data?.attemptId;
    expect(typeof attemptId).toBe("string");

    const submit = await http
      .post(`/api/student/worksheets/${worksheet.id}/submit`)
      .set(authHeader(token))
      .send({
        attemptId,
        answers: [
          { questionNumber: 1, answer: 3 },
          { questionNumber: 2, answer: 1 }
        ]
      });

    expect(submit.status).toBe(200);
    expect(submit.body?.data?.status).toBe("SUBMITTED");
    expect(submit.body?.data?.score).toBe(100);
    expect(submit.body?.data?.total).toBe(2);
  });

  test("submission applies level rule pass/fail and does not auto-progress level", async () => {
    const level2 = await prisma.level.findFirst({
      where: { tenantId: tenant.id, rank: 2 },
      select: { id: true }
    });

    expect(level2?.id).toBeTruthy();

    await prisma.levelRule.upsert({
      where: {
        tenantId_levelId: {
          tenantId: tenant.id,
          levelId: level1.id
        }
      },
      update: {
        passThreshold: 100
      },
      create: {
        tenantId: tenant.id,
        levelId: level1.id,
        passThreshold: 100
      }
    });

    const { worksheet: thresholdWorksheet } = await createAssignedWorksheetFixture({
      titlePrefix: "WS-THRESHOLD"
    });

    const start = await http
      .post(`/api/student/worksheets/${thresholdWorksheet.id}/start`)
      .set(authHeader(token))
      .send({ attemptMode: "practice" });

    expect([200, 201]).toContain(start.status);
    const attemptId = start.body?.data?.attemptId;
    expect(typeof attemptId).toBe("string");

    const submit = await http
      .post(`/api/student/worksheets/${thresholdWorksheet.id}/submit`)
      .set(authHeader(token))
      .send({
        attemptId,
        answers: [{ questionNumber: 1, answer: 999 }]
      });

    expect(submit.status).toBe(200);
    expect(submit.body?.data?.score).toBe(0);
    expect(submit.body?.data?.resultBreakdown?.passThreshold).toBe(100);
    expect(submit.body?.data?.resultBreakdown?.passed).toBe(false);

    const freshStudent = await prisma.student.findUnique({
      where: { id: student.id },
      select: { levelId: true }
    });

    expect(freshStudent?.levelId).toBe(level1.id);
  });

  test("Student cannot submit for another student", async () => {
    const other = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `ST-${randomId("x")}`,
        firstName: "Other",
        lastName: "Student",
        hierarchyNodeId: centerUser.hierarchyNodeId,
        levelId: level1.id,
        isActive: true
      }
    });

    const res = await http
      .post(`/api/worksheets/${worksheet.id}/submit`)
      .set(authHeader(token))
      .send({ studentId: other.id, answers: [{ questionNumber: 1, answer: 3 }] });

    expect(res.status).toBe(403);
    expect(res.body?.error_code).toBe("CROSS_STUDENT_SUBMISSION_DENIED");
  });

  test("GET /api/student/exam-cycles/:id/result returns awaiting publication message before publish", async () => {
    const examCycle = await createExamResultFixture({ published: false });

    const res = await http.get(`/api/student/exam-cycles/${examCycle.id}/result`).set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body?.data?.published).toBe(false);
    expect(res.body?.data?.message).toBe("Result Awaiting Publication");
    expect(res.body?.data?.result).toBeNull();
    expect(res.body?.data?.submission).toBeNull();
  });

  test("GET /api/student/exam-cycles/:id/result returns result payload after publish", async () => {
    const examCycle = await createExamResultFixture({ published: true });

    const res = await http.get(`/api/student/exam-cycles/${examCycle.id}/result`).set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body?.data?.published).toBe(true);
    expect(res.body?.data?.result).toBeTruthy();
    expect(Number(res.body?.data?.result?.score)).toBe(100);
    expect(res.body?.data?.result?.correctCount).toBe(2);
    expect(res.body?.data?.result?.totalQuestions).toBe(2);
  });

  test("GET /api/student/exam-cycles/:id/result denies non-enrolled student access", async () => {
    const now = Date.now();
    const examCycle = await prisma.examCycle.create({
      data: {
        tenantId: tenant.id,
        businessPartnerId: businessPartner.id,
        name: `Private Exam ${randomId("exam")}`,
        code: `PR-${randomId("code")}`,
        enrollmentStartAt: new Date(now - 24 * 60 * 60 * 1000),
        enrollmentEndAt: new Date(now + 24 * 60 * 60 * 1000),
        practiceStartAt: new Date(now - 12 * 60 * 60 * 1000),
        examStartsAt: new Date(now - 6 * 60 * 60 * 1000),
        examEndsAt: new Date(now + 6 * 60 * 60 * 1000),
        examDurationMinutes: 45,
        attemptLimit: 1,
        createdByUserId: superadminUser.id,
        resultStatus: "PUBLISHED",
        resultPublishedAt: new Date()
      }
    });

    const res = await http.get(`/api/student/exam-cycles/${examCycle.id}/result`).set(authHeader(token));

    expect(res.status).toBe(404);
    expect(res.body?.error_code).toBe("EXAM_RESULT_NOT_FOUND");
  });
});
