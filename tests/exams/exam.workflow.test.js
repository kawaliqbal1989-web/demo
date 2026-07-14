import { parse as parseCsv } from "csv-parse/sync";
import { authHeader, ensureAuthUser, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";
import { jest } from "@jest/globals";
import crypto from "crypto";

jest.setTimeout(60000);

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

  function createSeededRandom(seedValue) {
    const hashed = crypto.createHash("sha256").update(String(seedValue)).digest("hex");
    let state = parseInt(hashed.slice(0, 8), 16) || 1;

    return function random() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleDeterministic(items, seed) {
    const rnd = createSeededRandom(seed);
    return items
      .map((item) => ({ item, sortKey: rnd() }))
      .sort((a, b) => a.sortKey - b.sortKey)
      .map((entry) => entry.item);
  }

  function questionSignature(question) {
    return JSON.stringify({
      questionBankId: question.questionBankId || null,
      operands: question.operands,
      operation: question.operation,
      correctAnswer: question.correctAnswer
    });
  }

  async function createExamCycleForWorkflow({ practiceStartAt } = {}) {
    const now = Date.now();

    const scheduledPracticeStart = practiceStartAt || new Date(now + 2 * 24 * 60 * 60 * 1000);
    scheduledPracticeStart.setMilliseconds(0);

    const examStartsAt = new Date(now + 10 * 24 * 60 * 60 * 1000);
    examStartsAt.setMilliseconds(0);

    const examEndsAt = new Date(now + 12 * 24 * 60 * 60 * 1000);
    examEndsAt.setMilliseconds(0);

    const response = await http
      .post("/api/exam-cycles")
      .set(authHeader(saToken))
      .send({
        businessPartnerId: partner.id,
        name: `Exam ${randomId("cycle")}`,
        enrollmentStartAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
        enrollmentEndAt: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
        practiceStartAt: scheduledPracticeStart.toISOString(),
        examStartsAt: examStartsAt.toISOString(),
        examEndsAt: examEndsAt.toISOString(),
        examDurationMinutes: 45,
        attemptLimit: 1
      });

    expect(response.status).toBe(201);

    return {
      examCycleId: response.body.data.id,
      practiceStartAtIso: scheduledPracticeStart.toISOString()
    };
  }

  async function moveExamCycleToSuperadmin(examCycleId, { teacherSubmissions } = {}) {
    const submissions = Array.isArray(teacherSubmissions) && teacherSubmissions.length
      ? teacherSubmissions
      : [{ token: teacherToken, studentIds: [student.id] }];

    for (const submission of submissions) {
      const enroll = await http
        .post(`/api/exam-cycles/${examCycleId}/teacher-list/enroll`)
        .set(authHeader(submission.token))
        .send({ studentIds: submission.studentIds || [] });

      expect([200, 201]).toContain(enroll.status);

      const submitTeacher = await http
        .post(`/api/exam-cycles/${examCycleId}/teacher-list/submit`)
        .set(authHeader(submission.token))
        .send({});

      expect(submitTeacher.status).toBe(200);
      expect(submitTeacher.body.data.status).toBe("SUBMITTED_TO_CENTER");
    }

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

    const bpForward = await http
      .post(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/forward`)
      .set(authHeader(bpToken))
      .send({});

    expect(bpForward.status).toBe(200);
    expect(bpForward.body.data.status).toBe("SUBMITTED_TO_SUPERADMIN");

    return { listId };
  }

  async function saveWorksheetAssessmentConfig(examCycleId, { questionCount = 3, timeLimitMinutes = 45, worksheetId = null } = {}) {
    const response = await http
      .post(`/api/exam-cycles/${examCycleId}/assessment-config`)
      .set(authHeader(saToken))
      .send({
        configs: [
          {
            levelId: student.levelId,
            assessmentType: "WORKSHEET",
            worksheetId: worksheetId || baseExamWorksheet.id,
            questionCount,
            timeLimitMinutes
          }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body?.success).toBe(true);
  }

  async function createTeacherAssignedStudent({ levelId = student.levelId, prefix = "EXAM" } = {}) {
    const createdStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `${prefix}-${randomId("adm")}`,
        firstName: `Stu-${prefix}`,
        lastName: randomId("ln"),
        hierarchyNodeId: centerNode.id,
        levelId,
        currentTeacherUserId: teacher.id,
        isActive: true
      },
      select: { id: true, levelId: true }
    });

    const batch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: `Batch-${prefix}-${randomId("b")}`,
        status: "ACTIVE",
        isActive: true,
        levelId
      },
      select: { id: true }
    });

    await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: createdStudent.id,
        batchId: batch.id,
        assignedTeacherUserId: teacher.id,
        levelId,
        status: "ACTIVE"
      }
    });

    return { student: createdStudent, batchId: batch.id };
  }

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

  test("Teacher can enroll a student when the assigned enrollment has no explicit level", async () => {
    const examCycleId = (await createExamCycleForWorkflow()).examCycleId;

    await prisma.enrollment.updateMany({
      where: {
        tenantId: tenant.id,
        studentId: student.id,
        assignedTeacherUserId: teacher.id,
        status: "ACTIVE"
      },
      data: { levelId: null }
    });

    const response = await http
      .post(`/api/exam-cycles/${examCycleId}/teacher-list/enroll`)
      .set(authHeader(teacherToken))
      .send({ studentIds: [student.id] });

    expect([200, 201]).toContain(response.status);
    expect(response.body.success).toBe(true);
    expect(response.body.data?.items?.[0]?.entry?.enrolledLevelId).toBe(student.levelId);
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
    const { examCycleId, practiceStartAtIso } = await createExamCycleForWorkflow();
    const { listId } = await moveExamCycleToSuperadmin(examCycleId);
    await saveWorksheetAssessmentConfig(examCycleId);

    // Superadmin approves
    const approve = await http
      .post(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/approve`)
      .set(authHeader(saToken))
      .send({});

    expect(approve.status).toBe(200);
    expect(approve.body.data.list.status).toBe("APPROVED");
    expect(approve.body.data.worksheets.createdCount).toBeGreaterThanOrEqual(1);

    const approvedCycle = await prisma.examCycle.findUniqueOrThrow({
      where: { id: examCycleId },
      select: { practiceStartAt: true }
    });

    expect(approvedCycle.practiceStartAt.toISOString()).toBe(practiceStartAtIso);

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

    // BP can view scoped tracking before publish, but metrics remain hidden
    const resultsBefore = await http
      .get(`/api/exam-cycles/${examCycleId}/results`)
      .set(authHeader(bpToken));

    expect(resultsBefore.status).toBe(200);
    expect(resultsBefore.body.data.status).not.toBe("PUBLISHED");
    expect(resultsBefore.body.data.isResultPublished).toBe(false);
    expect(resultsBefore.body.data.resultPublicationState).toBe("PENDING");

    const prePublishRow = Array.isArray(resultsBefore.body.data.results)
      ? resultsBefore.body.data.results[0]
      : null;

    if (prePublishRow) {
      expect(prePublishRow.correctCount).toBeNull();
      expect(prePublishRow.wrongCount).toBeNull();
      expect(prePublishRow.unansweredCount).toBeNull();
      expect(prePublishRow.score).toBeNull();
      expect(prePublishRow.percentage).toBeNull();
      expect(prePublishRow.completionTimeSeconds).toBeNull();
    }

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
    expect(resultsAfter.body.data.isResultPublished).toBe(true);
    expect(resultsAfter.body.data.resultPublicationState).toBe("DONE");
  });

  test("Worksheet mode applies configured question count and configured time limit with deterministic seeded selection", async () => {
    const extra = await createTeacherAssignedStudent({ prefix: "WB" });
    const baseQuestions = await prisma.worksheetQuestion.findMany({
      where: { worksheetId: baseExamWorksheet.id },
      orderBy: { questionNumber: "asc" },
      select: {
        questionBankId: true,
        operands: true,
        operation: true,
        correctAnswer: true
      }
    });

    const { examCycleId } = await createExamCycleForWorkflow();
    const { listId } = await moveExamCycleToSuperadmin(examCycleId, {
      teacherSubmissions: [{ token: teacherToken, studentIds: [student.id, extra.student.id] }]
    });

    await saveWorksheetAssessmentConfig(examCycleId, { questionCount: 2, timeLimitMinutes: 5 });

    const approve = await http
      .post(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/approve`)
      .set(authHeader(saToken))
      .send({});
    expect(approve.status).toBe(200);

    const assigned = await prisma.worksheet.findMany({
      where: {
        tenantId: tenant.id,
        examCycleId,
        generationMode: "EXAM",
        assignments: {
          some: {
            studentId: { in: [student.id, extra.student.id] },
            isActive: true
          }
        }
      },
      select: {
        id: true,
        timeLimitSeconds: true,
        generationSeed: true,
        assignments: { select: { studentId: true, isActive: true } },
        questions: {
          orderBy: { questionNumber: "asc" },
          select: {
            questionNumber: true,
            questionBankId: true,
            operands: true,
            operation: true,
            correctAnswer: true
          }
        }
      }
    });

    expect(assigned.length).toBeGreaterThanOrEqual(2);

    for (const row of assigned) {
      const activeAssignment = row.assignments.find((entry) => entry.isActive);
      if (!activeAssignment) continue;
      expect(row.timeLimitSeconds).toBe(300);
      expect(row.questions).toHaveLength(2);
      expect(row.questions.map((q) => q.questionNumber)).toEqual([1, 2]);

      const seed = `EXAM_SELECTED:${examCycleId}:${baseExamWorksheet.id}:${activeAssignment.studentId}`;
      expect(row.generationSeed).toBe(seed);

      const expected = shuffleDeterministic(baseQuestions, seed).slice(0, 2).map(questionSignature);
      const actual = row.questions.map(questionSignature);
      expect(actual).toEqual(expected);
    }

    await prisma.enrollment.deleteMany({ where: { studentId: extra.student.id } });
    await prisma.student.deleteMany({ where: { id: extra.student.id } });
    await prisma.batch.deleteMany({ where: { id: extra.batchId } });
  });

  test("Worksheet config rejects question count above worksheet availability", async () => {
    const { examCycleId } = await createExamCycleForWorkflow();
    await moveExamCycleToSuperadmin(examCycleId);

    const response = await http
      .post(`/api/exam-cycles/${examCycleId}/assessment-config`)
      .set(authHeader(saToken))
      .send({
        configs: [
          {
            levelId: student.levelId,
            assessmentType: "WORKSHEET",
            worksheetId: baseExamWorksheet.id,
            questionCount: 999,
            timeLimitMinutes: 5
          }
        ]
      });

    expect(response.status).toBe(409);
    expect(response.body?.error_code).toBe("EXAM_QUESTION_COUNT_EXCEEDS_WORKSHEET");
  });

  test("Worksheet config denies worksheet from another level", async () => {
    const foreignLevel = await prisma.level.findFirst({
      where: {
        tenantId: tenant.id,
        id: { not: student.levelId }
      },
      select: { id: true }
    });

    if (!foreignLevel?.id) {
      return;
    }

    const foreignWorksheet = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `Foreign WS ${randomId("fw")}`,
        description: "Foreign level worksheet",
        difficulty: "MEDIUM",
        levelId: foreignLevel.id,
        createdByUserId: teacher.id,
        isPublished: true
      },
      select: { id: true }
    });

    await prisma.worksheetQuestion.create({
      data: {
        tenantId: tenant.id,
        worksheetId: foreignWorksheet.id,
        questionNumber: 1,
        operands: { a: 7, b: 2 },
        operation: "-",
        correctAnswer: 5
      }
    });

    const { examCycleId } = await createExamCycleForWorkflow();
    await moveExamCycleToSuperadmin(examCycleId);

    const response = await http
      .post(`/api/exam-cycles/${examCycleId}/assessment-config`)
      .set(authHeader(saToken))
      .send({
        configs: [
          {
            levelId: student.levelId,
            assessmentType: "WORKSHEET",
            worksheetId: foreignWorksheet.id,
            questionCount: 1,
            timeLimitMinutes: 5
          }
        ]
      });

    expect(response.status).toBe(409);
    expect(response.body?.error_code).toBe("EXAM_WORKSHEET_LEVEL_MISMATCH");

    await prisma.worksheetQuestion.deleteMany({ where: { worksheetId: foreignWorksheet.id } });
    await prisma.worksheet.deleteMany({ where: { id: foreignWorksheet.id } });
  });

  test("Legacy worksheet config with null question/time falls back to full worksheet and exam cycle duration", async () => {
    const { examCycleId } = await createExamCycleForWorkflow();
    const { listId } = await moveExamCycleToSuperadmin(examCycleId);
    await saveWorksheetAssessmentConfig(examCycleId, { questionCount: 3, timeLimitMinutes: 5 });

    await prisma.examLevelAssessmentConfig.updateMany({
      where: {
        tenantId: tenant.id,
        examCycleId,
        levelId: student.levelId
      },
      data: {
        questionCount: null,
        timeLimitMinutes: null
      }
    });

    const approve = await http
      .post(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/approve`)
      .set(authHeader(saToken))
      .send({});
    expect(approve.status).toBe(200);

    const assignedWorksheet = await prisma.worksheet.findFirst({
      where: {
        tenantId: tenant.id,
        examCycleId,
        generationMode: "EXAM",
        assignments: {
          some: {
            studentId: student.id,
            isActive: true
          }
        }
      },
      select: {
        id: true,
        timeLimitSeconds: true,
        questions: { select: { id: true } }
      }
    });

    expect(assignedWorksheet).toBeTruthy();
    expect(Array.isArray(assignedWorksheet.questions)).toBe(true);
    expect(assignedWorksheet.questions).toHaveLength(3);
    expect(assignedWorksheet.timeLimitSeconds).toBe(45 * 60);
  });

  test("BP, Franchise, Center, and Teacher pre/post publication visibility uses participation ResultState and scoped redaction", async () => {
    const teacherTwoEmail = `teacher.two.${randomId("exam")}@abacusweb.local`;
    const teacherTwoUsername = `TE${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`;

    const teacherTwo = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: teacherTwoEmail,
      username: teacherTwoUsername,
      role: "TEACHER",
      hierarchyNodeCode: "SCH-001"
    });

    await prisma.teacherProfile.upsert({
      where: { authUserId: teacherTwo.id },
      update: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        fullName: "Teacher Two",
        isActive: true,
        status: "ACTIVE"
      },
      create: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        authUserId: teacherTwo.id,
        fullName: "Teacher Two",
        isActive: true,
        status: "ACTIVE"
      }
    });

    const teacherTwoLogin = await loginAs({ email: teacherTwoEmail });
    expect(teacherTwoLogin.status).toBe(200);
    const teacherTwoToken = teacherTwoLogin.body?.data?.access_token;

    const teacherTwoBatch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: `Batch ${randomId("exam2")}`,
        status: "ACTIVE",
        isActive: true
      },
      select: { id: true }
    });

    const teacherTwoStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        admissionNo: `ADM-${randomId("t2")}`,
        firstName: "Second",
        lastName: "Student",
        levelId: student.levelId,
        currentTeacherUserId: teacherTwo.id,
        isActive: true
      },
      select: { id: true }
    });

    await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: teacherTwoStudent.id,
        batchId: teacherTwoBatch.id,
        assignedTeacherUserId: teacherTwo.id,
        levelId: student.levelId,
        status: "ACTIVE"
      }
    });

    const { examCycleId } = await createExamCycleForWorkflow();
    const { listId } = await moveExamCycleToSuperadmin(examCycleId, {
      teacherSubmissions: [
        { token: teacherToken, studentIds: [student.id] },
        { token: teacherTwoToken, studentIds: [teacherTwoStudent.id] }
      ]
    });
    await saveWorksheetAssessmentConfig(examCycleId);

    const approve = await http
      .post(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/approve`)
      .set(authHeader(saToken))
      .send({});

    expect(approve.status).toBe(200);

    const assertRedactedBeforePublishRow = (row) => {
      expect(row).toBeTruthy();
      expect(row.resultState).toBe(row.candidateStatus);
      expect(row.resultPublicationState).toBe("PENDING");
      expect(row.isResultPublished).toBe(false);
      expect(row.correctCount).toBeNull();
      expect(row.wrongCount).toBeNull();
      expect(row.unansweredCount).toBeNull();
      expect(row.score).toBeNull();
      expect(row.percentage).toBeNull();
      expect(row.completionTimeSeconds).toBeNull();
      expect(row.rank).toBeNull();
      expect(Object.prototype.hasOwnProperty.call(row, "resultOutcome")).toBe(false);
    };

    const beforeByRole = {
      BP: await http.get(`/api/exam-cycles/${examCycleId}/results`).set(authHeader(bpToken)),
      FRANCHISE: await http.get(`/api/exam-cycles/${examCycleId}/results`).set(authHeader(franchiseToken)),
      CENTER: await http.get(`/api/exam-cycles/${examCycleId}/results`).set(authHeader(centerToken)),
      TEACHER: await http.get(`/api/exam-cycles/${examCycleId}/results`).set(authHeader(teacherToken))
    };

    for (const [role, response] of Object.entries(beforeByRole)) {
      expect(response.status).toBe(200);
      expect(response.body?.data?.isResultPublished).toBe(false);
      expect(response.body?.data?.resultPublicationState).toBe("PENDING");
      const rows = Array.isArray(response.body?.data?.results) ? response.body.data.results : [];
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach(assertRedactedBeforePublishRow);
      expect(rows.every((row) => row.centerNodeId === centerNode.id)).toBe(true);

      if (role === "TEACHER") {
        expect(rows.some((row) => row.studentId === teacherTwoStudent.id)).toBe(false);
        expect(rows.every((row) => row.teacherUserId === teacher.id)).toBe(true);
      }
    }

    const bpExportBefore = await http
      .get(`/api/exam-cycles/${examCycleId}/results/export.csv`)
      .set(authHeader(bpToken));

    expect(bpExportBefore.status).toBe(200);
    const parsedCsvBefore = parseCsv(bpExportBefore.text || "", {
      columns: true,
      skip_empty_lines: true
    });
    expect(Array.isArray(parsedCsvBefore)).toBe(true);
    if (parsedCsvBefore.length) {
      const csvRow = parsedCsvBefore[0];
      expect(csvRow["Correct"]).toBe("");
      expect(csvRow["Wrong"]).toBe("");
      expect(csvRow["Unanswered"]).toBe("");
      expect(csvRow["Accuracy %"]).toBe("");
      expect(csvRow["Rank"]).toBe("");
      expect(["ABSENT", "IN_PROGRESS", "SUBMITTED", "TIMED_OUT"]).toContain(csvRow["Result State"]);
    }

    const foreignCenterNode = await prisma.hierarchyNode.findFirst({
      where: {
        tenantId: tenant.id,
        id: { not: centerNode.id }
      },
      select: { code: true }
    });

    if (foreignCenterNode?.code) {
      const foreignCenterEmail = `foreign.center.${randomId("exam")}@abacusweb.local`;
      const foreignCenterUser = await ensureAuthUser({
        tenantCode: "DEFAULT",
        email: foreignCenterEmail,
        username: `CE${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`,
        role: "CENTER",
        hierarchyNodeCode: foreignCenterNode.code
      });

      const foreignCenterLogin = await loginAs({ email: foreignCenterEmail });
      expect(foreignCenterLogin.status).toBe(200);
      const foreignCenterToken = foreignCenterLogin.body?.data?.access_token;

      const foreignResponse = await http
        .get(`/api/exam-cycles/${examCycleId}/results`)
        .set(authHeader(foreignCenterToken));

      expect([403, 404]).toContain(foreignResponse.status);
      expect(["HIERARCHY_SCOPE_DENIED", "EXAM_CYCLE_NOT_FOUND"]).toContain(String(foreignResponse.body?.error_code || ""));

      await prisma.authUser.deleteMany({ where: { id: foreignCenterUser.id } });
    }

    const publish = await http
      .post(`/api/exam-cycles/${examCycleId}/results/publish`)
      .set(authHeader(saToken))
      .send({ confirmationAccepted: true });

    expect(publish.status).toBe(200);

    const afterByRole = {
      BP: await http.get(`/api/exam-cycles/${examCycleId}/results`).set(authHeader(bpToken)),
      FRANCHISE: await http.get(`/api/exam-cycles/${examCycleId}/results`).set(authHeader(franchiseToken)),
      CENTER: await http.get(`/api/exam-cycles/${examCycleId}/results`).set(authHeader(centerToken)),
      TEACHER: await http.get(`/api/exam-cycles/${examCycleId}/results`).set(authHeader(teacherToken))
    };

    for (const [role, response] of Object.entries(afterByRole)) {
      expect(response.status).toBe(200);
      expect(response.body?.data?.isResultPublished).toBe(true);
      expect(response.body?.data?.resultPublicationState).toBe("DONE");
      const rows = Array.isArray(response.body?.data?.results) ? response.body.data.results : [];
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach((row) => {
        expect(row.resultState).toBe(row.candidateStatus);
        expect(row.resultPublicationState).toBe("DONE");
        expect(Object.prototype.hasOwnProperty.call(row, "resultOutcome")).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(row, "correctCount")).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(row, "wrongCount")).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(row, "unansweredCount")).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(row, "completionTimeSeconds")).toBe(true);
      });

      if (role === "TEACHER") {
        expect(rows.some((row) => row.studentId === teacherTwoStudent.id)).toBe(false);
      }
    }

    await prisma.enrollment.deleteMany({ where: { studentId: teacherTwoStudent.id } });
    await prisma.student.deleteMany({ where: { id: teacherTwoStudent.id } });
    await prisma.batch.deleteMany({ where: { id: teacherTwoBatch.id } });
    await prisma.teacherProfile.deleteMany({ where: { authUserId: teacherTwo.id } });
    await prisma.authUser.deleteMany({ where: { id: teacherTwo.id } });
  });

  test("Superadmin approval requires complete assessment configuration", async () => {
    const { examCycleId } = await createExamCycleForWorkflow();
    const { listId } = await moveExamCycleToSuperadmin(examCycleId);

    const approve = await http
      .post(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/approve`)
      .set(authHeader(saToken))
      .send({});

    expect(approve.status).toBe(409);
    expect(approve.body.error_code).toBe("EXAM_ASSESSMENT_CONFIG_INCOMPLETE");

    const list = await prisma.examEnrollmentList.findUniqueOrThrow({
      where: { id: listId },
      select: { status: true }
    });

    expect(list.status).toBe("SUBMITTED_TO_SUPERADMIN");

    const assignedExamWorksheets = await prisma.worksheet.count({
      where: {
        tenantId: tenant.id,
        examCycleId,
        generationMode: "EXAM"
      }
    });

    expect(assignedExamWorksheets).toBe(0);
  });

  test("Result control center exposes review summary and publication audit trail", async () => {
    const { examCycleId } = await createExamCycleForWorkflow();
    const { listId } = await moveExamCycleToSuperadmin(examCycleId);
    await saveWorksheetAssessmentConfig(examCycleId);

    const approve = await http
      .post(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/approve`)
      .set(authHeader(saToken))
      .send({});

    expect(approve.status).toBe(200);

    const review = await http
      .get(`/api/exam-cycles/${examCycleId}/results/review`)
      .set(authHeader(saToken));

    expect(review.status).toBe(200);
    expect(review.body.data.publication.status).toBe("READY_FOR_REVIEW");
    expect(typeof review.body.data.summary.totalCandidates).toBe("number");

    const publish = await http
      .post(`/api/exam-cycles/${examCycleId}/results/publish`)
      .set(authHeader(saToken))
      .send({ confirmationAccepted: true, note: "Reviewed and approved for network publication" });

    expect(publish.status).toBe(200);
    expect(publish.body.data.resultStatus).toBe("PUBLISHED");

    const unpublishMissingNote = await http
      .post(`/api/exam-cycles/${examCycleId}/results/unpublish`)
      .set(authHeader(saToken))
      .send({});

    expect(unpublishMissingNote.status).toBe(400);
    expect(unpublishMissingNote.body.error_code).toBe("UNPUBLISH_NOTE_REQUIRED");

    const unpublish = await http
      .post(`/api/exam-cycles/${examCycleId}/results/unpublish`)
      .set(authHeader(saToken))
      .send({ note: "Detected discrepancy in verification checklist" });

    expect(unpublish.status).toBe(200);
    expect(unpublish.body.data.resultStatus).toBe("READY_FOR_REVIEW");

    const publicationAudit = await http
      .get(`/api/exam-cycles/${examCycleId}/results/publication-audit`)
      .set(authHeader(saToken));

    expect(publicationAudit.status).toBe(200);
    expect(Array.isArray(publicationAudit.body.data)).toBe(true);
    const actions = publicationAudit.body.data.map((entry) => entry.action);
    expect(actions).toContain("PUBLISHED");
    expect(actions).toContain("UNPUBLISHED");

    const controlCenter = await http
      .get("/api/exam-cycles/results/control-center?status=READY_FOR_REVIEW")
      .set(authHeader(saToken));

    expect(controlCenter.status).toBe(200);
    expect(Array.isArray(controlCenter.body.data.items)).toBe(true);
    expect(controlCenter.body.data.items.some((item) => item.id === examCycleId)).toBe(true);
  });
});
