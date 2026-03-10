import { authHeader, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";

describe("EXAM MANAGEMENT WORKFLOW", () => {
  let saToken;
  let bpToken;
  let franchiseToken;
  let centerToken;
  let teacherToken;
  let tenant;
  let partner;
  let centerNode;
  let teacher;
  let student;
  let baseExamWorksheet;

  beforeAll(async () => {
    const [saLogin, bpLogin, frLogin, ceLogin, teLogin] = await Promise.all([
      loginAs({ email: "superadmin@abacusweb.local" }),
      loginAs({ email: "bp.manager@abacusweb.local" }),
      loginAs({ email: "franchise.manager@abacusweb.local" }),
      loginAs({ email: "center.manager@abacusweb.local" }),
      loginAs({ email: "teacher.one@abacusweb.local" })
    ]);

    saToken = saLogin.body.data.access_token;
    bpToken = bpLogin.body.data.access_token;
    franchiseToken = frLogin.body.data.access_token;
    centerToken = ceLogin.body.data.access_token;
    teacherToken = teLogin.body.data.access_token;

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });

    partner = await prisma.businessPartner.findFirstOrThrow({
      where: { tenantId: tenant.id, contactEmail: "bp.manager@abacusweb.local" },
      select: { id: true }
    });

    centerNode = await prisma.hierarchyNode.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: "SCH-001"
        }
      },
      select: { id: true }
    });

    teacher = await prisma.authUser.findFirstOrThrow({
      where: { tenantId: tenant.id, email: "teacher.one@abacusweb.local" },
      select: { id: true, hierarchyNodeId: true }
    });

    student = await prisma.student.findFirstOrThrow({
      where: { tenantId: tenant.id, admissionNo: "ADM-1001" },
      select: { id: true, levelId: true, hierarchyNodeId: true }
    });

    // Ensure teacher has an ACTIVE enrollment assignment for the student.
    const batch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: `Batch ${randomId("exam")}`,
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
        levelId: student.levelId,
        status: "ACTIVE"
      }
    });

    // Create a published base worksheet for the student's level to be selectable during approval.
    baseExamWorksheet = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `Level ${student.levelId} Exam Base ${randomId("ws")}`,
        description: "Base exam worksheet for testing",
        difficulty: "MEDIUM",
        levelId: student.levelId,
        createdByUserId: teacher.id,
        isPublished: true
      },
      select: { id: true }
    });

    await prisma.worksheetQuestion.createMany({
      data: [
        {
          tenantId: tenant.id,
          worksheetId: baseExamWorksheet.id,
          questionNumber: 1,
          operands: { a: 1, b: 2 },
          operation: "+",
          correctAnswer: 3
        },
        {
          tenantId: tenant.id,
          worksheetId: baseExamWorksheet.id,
          questionNumber: 2,
          operands: { a: 5, b: 4 },
          operation: "-",
          correctAnswer: 1
        },
        {
          tenantId: tenant.id,
          worksheetId: baseExamWorksheet.id,
          questionNumber: 3,
          operands: { a: 2, b: 3 },
          operation: "*",
          correctAnswer: 6
        }
      ]
    });
  });

  test("Teacher cannot create exam cycle (403)", async () => {
    const response = await http
      .post("/api/exam-cycles")
      .set(authHeader(teacherToken))
      .send({
        businessPartnerId: partner.id,
        name: `Exam ${randomId("x")}`,
        enrollmentStartAt: new Date().toISOString(),
        enrollmentEndAt: new Date().toISOString(),
        practiceStartAt: new Date().toISOString(),
        examStartsAt: new Date().toISOString(),
        examEndsAt: new Date().toISOString(),
        examDurationMinutes: 60,
        attemptLimit: 1
      });

    expect(response.status).toBe(403);
    expect(response.body.error_code).toBe("ROLE_FORBIDDEN");
  });

  test("End-to-end list approval + worksheet assignment", async () => {
    const now = Date.now();

    const create = await http
      .post("/api/exam-cycles")
      .set(authHeader(saToken))
      .send({
        businessPartnerId: partner.id,
        name: `Exam ${randomId("cycle")}`,
        enrollmentStartAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
        enrollmentEndAt: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
        practiceStartAt: new Date(now).toISOString(),
        examStartsAt: new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString(),
        examEndsAt: new Date(now + 12 * 24 * 60 * 60 * 1000).toISOString(),
        examDurationMinutes: 45,
        attemptLimit: 1
      });

    expect(create.status).toBe(201);
    const examCycleId = create.body.data.id;

    // Teacher enrolls and submits to center
    const enroll = await http
      .post(`/api/exam-cycles/${examCycleId}/teacher-list/enroll`)
      .set(authHeader(teacherToken))
      .send({ studentIds: [student.id] });

    expect([200, 201]).toContain(enroll.status);

    const submitTeacher = await http
      .post(`/api/exam-cycles/${examCycleId}/teacher-list/submit`)
      .set(authHeader(teacherToken))
      .send({});

    expect(submitTeacher.status).toBe(200);
    expect(submitTeacher.body.data.status).toBe("SUBMITTED_TO_CENTER");

    // Center prepares and submits combined list
    const prepared = await http
      .post(`/api/exam-cycles/${examCycleId}/center-list/prepare`)
      .set(authHeader(centerToken))
      .send({});

    expect(prepared.status).toBe(200);

    const submitCenter = await http
      .post(`/api/exam-cycles/${examCycleId}/center-list/submit`)
      .set(authHeader(centerToken))
      .send({});

    expect(submitCenter.status).toBe(200);
    expect(submitCenter.body.data.status).toBe("SUBMITTED_TO_FRANCHISE");

    // Franchise sees pending and forwards
    const pendingFr = await http
      .get(`/api/exam-cycles/${examCycleId}/enrollment-lists/pending`)
      .set(authHeader(franchiseToken));

    expect(pendingFr.status).toBe(200);
    expect(Array.isArray(pendingFr.body.data)).toBe(true);
    const listId = pendingFr.body.data[0].id;

    const frForward = await http
      .post(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/forward`)
      .set(authHeader(franchiseToken))
      .send({});

    expect(frForward.status).toBe(200);
    expect(frForward.body.data.status).toBe("SUBMITTED_TO_BUSINESS_PARTNER");

    // BP forwards
    const bpForward = await http
      .post(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/forward`)
      .set(authHeader(bpToken))
      .send({});

    expect(bpForward.status).toBe(200);
    expect(bpForward.body.data.status).toBe("SUBMITTED_TO_SUPERADMIN");

    // Superadmin approves
    const approve = await http
      .post(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/approve`)
      .set(authHeader(saToken))
      .send({
        selections: [
          {
            levelId: student.levelId,
            worksheetId: baseExamWorksheet.id
          }
        ]
      });

    expect(approve.status).toBe(200);
    expect(approve.body.data.list.status).toBe("APPROVED");
    expect(approve.body.data.worksheets.createdCount).toBeGreaterThanOrEqual(1);

    // Only EXAM worksheets should exist with examCycleId for this student.
    const ws = await prisma.worksheet.findMany({
      where: {
        tenantId: tenant.id,
        examCycleId,
        assignments: {
          some: {
            studentId: student.id,
            isActive: true
          }
        }
      },
      select: { id: true, generationMode: true }
    });

    const modes = new Set(ws.map((w) => w.generationMode));
    expect(modes.has("EXAM")).toBe(true);
    expect(modes.has("PRACTICE")).toBe(false);

    // Results should be blocked for BP until published
    const resultsBefore = await http
      .get(`/api/exam-cycles/${examCycleId}/results`)
      .set(authHeader(bpToken));

    expect(resultsBefore.status).toBe(403);

    // Publish
    const publish = await http
      .post(`/api/exam-cycles/${examCycleId}/results/publish`)
      .set(authHeader(saToken))
      .send({});

    expect(publish.status).toBe(200);

    const resultsAfter = await http
      .get(`/api/exam-cycles/${examCycleId}/results`)
      .set(authHeader(bpToken));

    expect(resultsAfter.status).toBe(200);
    expect(resultsAfter.body.data.status).toBe("PUBLISHED");
  });
});
