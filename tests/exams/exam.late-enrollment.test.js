import { authHeader, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";
import { jest } from "@jest/globals";

jest.setTimeout(90000);

describe("EXAM LATE ENROLLMENT", () => {
  let tenant;
  let partner;
  let centerNode;
  let teacher;
  let baseStudent;
  let baseWorksheet;

  let saToken;
  let bpToken;
  let franchiseToken;
  let centerToken;
  let teacherToken;

  async function createStudentForCenter({ levelId }) {
    return prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `LATE-${randomId("ADM")}`,
        firstName: "Late",
        lastName: `Student-${randomId("S")}`,
        hierarchyNodeId: centerNode.id,
        levelId,
        isActive: true
      },
      select: { id: true, levelId: true, admissionNo: true }
    });
  }

  async function createExamCycle() {
    const now = Date.now();
    const response = await http
      .post("/api/exam-cycles")
      .set(authHeader(saToken))
      .send({
        businessPartnerId: partner.id,
        name: `Late Enrollment ${randomId("cycle")}`,
        enrollmentStartAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
        enrollmentEndAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
        practiceStartAt: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(),
        examStartsAt: new Date(now + 4 * 24 * 60 * 60 * 1000).toISOString(),
        examEndsAt: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
        examDurationMinutes: 45,
        attemptLimit: 1
      });

    expect(response.status).toBe(201);
    return response.body.data.id;
  }

  async function moveExamToApprovedWithPackage(examCycleId) {
    const enroll = await http
      .post(`/api/exam-cycles/${examCycleId}/teacher-list/enroll`)
      .set(authHeader(teacherToken))
      .send({ studentIds: [baseStudent.id] });
    expect([200, 201]).toContain(enroll.status);

    const submitTeacher = await http
      .post(`/api/exam-cycles/${examCycleId}/teacher-list/submit`)
      .set(authHeader(teacherToken))
      .send({});
    expect(submitTeacher.status).toBe(200);

    const prepareCenter = await http
      .post(`/api/exam-cycles/${examCycleId}/center-list/prepare`)
      .set(authHeader(centerToken))
      .send({});
    expect(prepareCenter.status).toBe(200);

    const submitCenter = await http
      .post(`/api/exam-cycles/${examCycleId}/center-list/submit`)
      .set(authHeader(centerToken))
      .send({});
    expect(submitCenter.status).toBe(200);

    const pendingFr = await http
      .get(`/api/exam-cycles/${examCycleId}/enrollment-lists/pending`)
      .set(authHeader(franchiseToken));
    expect(pendingFr.status).toBe(200);
    const listId = pendingFr.body.data[0].id;

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

    const saveConfig = await http
      .post(`/api/exam-cycles/${examCycleId}/assessment-config`)
      .set(authHeader(saToken))
      .send({
        configs: [
          {
            levelId: baseStudent.levelId,
            assessmentType: "WORKSHEET",
            worksheetId: baseWorksheet.id
          }
        ]
      });
    expect(saveConfig.status).toBe(200);

    const approve = await http
      .post(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/approve`)
      .set(authHeader(saToken))
      .send({});
    expect(approve.status).toBe(200);

    return listId;
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
      where: { tenantId_code: { tenantId: tenant.id, code: "SCH-001" } },
      select: { id: true }
    });

    teacher = await prisma.authUser.findFirstOrThrow({
      where: { tenantId: tenant.id, email: "teacher.one@abacusweb.local" },
      select: { id: true }
    });

    baseStudent = await prisma.student.findFirstOrThrow({
      where: { tenantId: tenant.id, admissionNo: "ADM-1001" },
      select: { id: true, levelId: true }
    });

    const batch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: `Late Enrollment Batch ${randomId("B")}`,
        status: "ACTIVE",
        isActive: true
      },
      select: { id: true }
    });

    await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: baseStudent.id,
        batchId: batch.id,
        assignedTeacherUserId: teacher.id,
        levelId: baseStudent.levelId,
        status: "ACTIVE"
      }
    });

    baseWorksheet = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `Late Enrollment Base ${randomId("WS")}`,
        description: "Base worksheet for late enrollment package reuse",
        difficulty: "MEDIUM",
        levelId: baseStudent.levelId,
        createdByUserId: teacher.id,
        isPublished: true
      },
      select: { id: true }
    });

    await prisma.worksheetQuestion.createMany({
      data: [
        {
          tenantId: tenant.id,
          worksheetId: baseWorksheet.id,
          questionNumber: 1,
          operands: { a: 2, b: 1 },
          operation: "+",
          correctAnswer: 3
        },
        {
          tenantId: tenant.id,
          worksheetId: baseWorksheet.id,
          questionNumber: 2,
          operands: { a: 7, b: 4 },
          operation: "-",
          correctAnswer: 3
        }
      ]
    });
  });

  test("eligible list excludes already enrolled students", async () => {
    const examCycleId = await createExamCycle();
    await moveExamToApprovedWithPackage(examCycleId);

    const eligibleStudent = await createStudentForCenter({ levelId: baseStudent.levelId });

    const eligibleRes = await http
      .get(`/api/exam-cycles/${examCycleId}/late-enrollment/eligible-students?levelId=${baseStudent.levelId}`)
      .set(authHeader(centerToken));

    expect(eligibleRes.status).toBe(200);
    const ids = (eligibleRes.body.data.eligibleStudents || []).map((row) => row.id);

    expect(ids).toContain(eligibleStudent.id);
    expect(ids).not.toContain(baseStudent.id);
  });

  test("supports multiple requests and prevents duplicate student requests", async () => {
    const examCycleId = await createExamCycle();
    await moveExamToApprovedWithPackage(examCycleId);

    const lateOne = await createStudentForCenter({ levelId: baseStudent.levelId });
    const lateTwo = await createStudentForCenter({ levelId: baseStudent.levelId });

    const req1 = await http
      .post(`/api/exam-cycles/${examCycleId}/late-enrollment/requests`)
      .set(authHeader(centerToken))
      .send({ levelId: baseStudent.levelId, studentIds: [lateOne.id] });
    expect(req1.status).toBe(201);

    const dup = await http
      .post(`/api/exam-cycles/${examCycleId}/late-enrollment/requests`)
      .set(authHeader(centerToken))
      .send({ levelId: baseStudent.levelId, studentIds: [lateOne.id] });
    expect(dup.status).toBe(409);

    const req2 = await http
      .post(`/api/exam-cycles/${examCycleId}/late-enrollment/requests`)
      .set(authHeader(centerToken))
      .send({ levelId: baseStudent.levelId, studentIds: [lateTwo.id] });
    expect(req2.status).toBe(201);
  });

  test("superadmin can approve/reject student-wise and updates counts", async () => {
    const examCycleId = await createExamCycle();
    await moveExamToApprovedWithPackage(examCycleId);

    const lateApprove = await createStudentForCenter({ levelId: baseStudent.levelId });
    const lateReject = await createStudentForCenter({ levelId: baseStudent.levelId });

    const requestRes = await http
      .post(`/api/exam-cycles/${examCycleId}/late-enrollment/requests`)
      .set(authHeader(centerToken))
      .send({ levelId: baseStudent.levelId, studentIds: [lateApprove.id, lateReject.id] });
    expect(requestRes.status).toBe(201);

    const requestId = requestRes.body.data.request.id;

    const reviewRes = await http
      .post(`/api/exam-cycles/${examCycleId}/late-enrollment/requests/${requestId}/review`)
      .set(authHeader(saToken))
      .send({
        decisions: [
          { studentId: lateApprove.id, decision: "APPROVED" },
          { studentId: lateReject.id, decision: "REJECTED", reviewRemarks: "Not eligible" }
        ]
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.request.status).toBe("PARTIALLY_APPROVED");

    const approvedEnrollment = await prisma.examEnrollmentEntry.findUnique({
      where: {
        tenantId_examCycleId_studentId: {
          tenantId: tenant.id,
          examCycleId,
          studentId: lateApprove.id
        }
      },
      select: { id: true }
    });

    const rejectedEnrollment = await prisma.examEnrollmentEntry.findUnique({
      where: {
        tenantId_examCycleId_studentId: {
          tenantId: tenant.id,
          examCycleId,
          studentId: lateReject.id
        }
      },
      select: { id: true }
    });

    expect(approvedEnrollment).not.toBeNull();
    expect(rejectedEnrollment).toBeNull();

    const auditRes = await http
      .get(`/api/exam-cycles/${examCycleId}/late-enrollment/audit`)
      .set(authHeader(saToken));

    expect(auditRes.status).toBe(200);
    expect(auditRes.body.data.counts.lateEnrollmentCount).toBeGreaterThanOrEqual(1);
    expect(auditRes.body.data.counts.totalEnrollmentCount).toBeGreaterThan(auditRes.body.data.counts.normalEnrollmentCount);
  });

  test("exam end lock blocks new late enrollment requests", async () => {
    const examCycleId = await createExamCycle();
    await moveExamToApprovedWithPackage(examCycleId);

    await prisma.examCycle.update({
      where: { id: examCycleId },
      data: {
        examEndsAt: new Date(Date.now() - 60 * 1000)
      }
    });

    const lateStudent = await createStudentForCenter({ levelId: baseStudent.levelId });

    const response = await http
      .post(`/api/exam-cycles/${examCycleId}/late-enrollment/requests`)
      .set(authHeader(centerToken))
      .send({ levelId: baseStudent.levelId, studentIds: [lateStudent.id] });

    expect(response.status).toBe(409);
    expect(response.body.error_code).toBe("LATE_ENROLLMENT_WINDOW_CLOSED");
  });

  test("result publication lock blocks request and approval", async () => {
    const examCycleId = await createExamCycle();
    await moveExamToApprovedWithPackage(examCycleId);

    const lateStudent = await createStudentForCenter({ levelId: baseStudent.levelId });

    const requestRes = await http
      .post(`/api/exam-cycles/${examCycleId}/late-enrollment/requests`)
      .set(authHeader(centerToken))
      .send({ levelId: baseStudent.levelId, studentIds: [lateStudent.id] });
    expect(requestRes.status).toBe(201);

    const publishRes = await http
      .post(`/api/exam-cycles/${examCycleId}/results/publish`)
      .set(authHeader(saToken))
      .send({});
    expect(publishRes.status).toBe(200);

    const lockRequestRes = await http
      .post(`/api/exam-cycles/${examCycleId}/late-enrollment/requests`)
      .set(authHeader(centerToken))
      .send({ levelId: baseStudent.levelId, studentIds: [lateStudent.id] });

    expect(lockRequestRes.status).toBe(409);
    expect(lockRequestRes.body.error_code).toBe("EXAM_RESULT_PUBLISHED_LOCK");

    const lockApproveRes = await http
      .post(`/api/exam-cycles/${examCycleId}/late-enrollment/requests/${requestRes.body.data.request.id}/review`)
      .set(authHeader(saToken))
      .send({ decisions: [{ studentId: lateStudent.id, decision: "APPROVED" }] });

    expect(lockApproveRes.status).toBe(409);
    expect(lockApproveRes.body.error_code).toBe("EXAM_RESULT_PUBLISHED_LOCK");
  });
});
