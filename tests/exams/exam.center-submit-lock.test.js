import { authHeader, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";
import { jest } from "@jest/globals";

jest.setTimeout(60000);

describe("EXAM CENTER SUBMIT LOCK - teacher operations blocked after center forward", () => {
  let saToken;
  let centerToken;
  let teacherA;
  let teacherB;
  let teacherC;
  let teacherAToken;
  let teacherBToken;
  let teacherCToken;
  let tenant;
  let partner;
  let centerNode;
  let studentA;
  let studentB;
  let studentC;
  let examCycleId;

  beforeAll(async () => {
    const saLogin = await loginAs({ email: "superadmin@abacusweb.local" });
    const centerLogin = await loginAs({ email: "center.manager@abacusweb.local" });

    saToken = saLogin.body.data.access_token;
    centerToken = centerLogin.body.data.access_token;

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });

    partner = await prisma.businessPartner.findFirstOrThrow({ where: { tenantId: tenant.id } });

    centerNode = await prisma.hierarchyNode.findFirstOrThrow({ where: { tenantId: tenant.id, code: "SCH-001" } });

    // Create three teachers in the center
    teacherA = await prisma.authUser.findFirst({ where: { tenantId: tenant.id, role: "TEACHER", email: "teacher.one@abacusweb.local" }, select: { id: true } });

    teacherB = await prisma.authUser.create({
      data: {
        tenantId: tenant.id,
        email: `teacher.b.${randomId("t")}@abacusweb.local`,
        username: `TB${Math.floor(Math.random() * 100000)}`,
        role: "TEACHER",
        isActive: true,
        hierarchyNodeId: centerNode.id
      }
    });

    teacherC = await prisma.authUser.create({
      data: {
        tenantId: tenant.id,
        email: `teacher.c.${randomId("t")}@abacusweb.local`,
        username: `TC${Math.floor(Math.random() * 100000)}`,
        role: "TEACHER",
        isActive: true,
        hierarchyNodeId: centerNode.id
      }
    });

    // Create students and assign enrollments to teachers A, B, C
    const level = await prisma.level.findFirst({ where: { tenantId: tenant.id }, select: { id: true } });

    studentA = await prisma.student.create({ data: { tenantId: tenant.id, admissionNo: `ST-A-${randomId("s")}`, firstName: "A", lastName: "Stu", hierarchyNodeId: centerNode.id, levelId: level.id, isActive: true } });
    studentB = await prisma.student.create({ data: { tenantId: tenant.id, admissionNo: `ST-B-${randomId("s")}`, firstName: "B", lastName: "Stu", hierarchyNodeId: centerNode.id, levelId: level.id, isActive: true } });
    studentC = await prisma.student.create({ data: { tenantId: tenant.id, admissionNo: `ST-C-${randomId("s")}`, firstName: "C", lastName: "Stu", hierarchyNodeId: centerNode.id, levelId: level.id, isActive: true } });

    const batch = await prisma.batch.create({ data: { tenantId: tenant.id, hierarchyNodeId: centerNode.id, name: `BATCH-${randomId("b")}`, status: "ACTIVE", isActive: true } });

    await prisma.enrollment.create({ data: { tenantId: tenant.id, hierarchyNodeId: centerNode.id, studentId: studentA.id, batchId: batch.id, assignedTeacherUserId: teacherA.id, levelId: level.id, status: "ACTIVE" } });
    await prisma.enrollment.create({ data: { tenantId: tenant.id, hierarchyNodeId: centerNode.id, studentId: studentB.id, batchId: batch.id, assignedTeacherUserId: teacherB.id, levelId: level.id, status: "ACTIVE" } });
    await prisma.enrollment.create({ data: { tenantId: tenant.id, hierarchyNodeId: centerNode.id, studentId: studentC.id, batchId: batch.id, assignedTeacherUserId: teacherC.id, levelId: level.id, status: "ACTIVE" } });

    // Create exam cycle
    const now = Date.now();
    const resp = await http.post("/api/exam-cycles").set(authHeader(saToken)).send({
      businessPartnerId: partner.id,
      name: `Exam-${randomId("e")}`,
      enrollmentStartAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      enrollmentEndAt: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
      practiceStartAt: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(),
      examStartsAt: new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString(),
      examEndsAt: new Date(now + 12 * 24 * 60 * 60 * 1000).toISOString(),
      examDurationMinutes: 30,
      attemptLimit: 1
    });

    expect(resp.status).toBe(201);
    examCycleId = resp.body.data.id;

    // Login as teachers
    const tAlogin = await loginAs({ email: "teacher.one@abacusweb.local" });
    const tBlogin = await loginAs({ email: teacherB.email });
    const tClogin = await loginAs({ email: teacherC.email });

    teacherAToken = tAlogin.body.data.access_token;
    teacherBToken = tBlogin.body.data.access_token;
    teacherCToken = tClogin.body.data.access_token;
  });

  test("Teachers A and B submit, center forwards, teachers locked and C cannot submit; unlock on reject", async () => {
    // Teacher A enroll
    const enrollA = await http.post(`/api/exam-cycles/${examCycleId}/teacher-list/enroll`).set(authHeader(teacherAToken)).send({ studentIds: [studentA.id] });
    expect([200, 201]).toContain(enrollA.status);

    const submitA = await http.post(`/api/exam-cycles/${examCycleId}/teacher-list/submit`).set(authHeader(teacherAToken)).send({});
    expect(submitA.status).toBe(200);
    expect(submitA.body.data.status).toBe("SUBMITTED_TO_CENTER");

    // Teacher B enroll & submit
    const enrollB = await http.post(`/api/exam-cycles/${examCycleId}/teacher-list/enroll`).set(authHeader(teacherBToken)).send({ studentIds: [studentB.id] });
    expect([200, 201]).toContain(enrollB.status);

    const submitB = await http.post(`/api/exam-cycles/${examCycleId}/teacher-list/submit`).set(authHeader(teacherBToken)).send({});
    expect(submitB.status).toBe(200);
    expect(submitB.body.data.status).toBe("SUBMITTED_TO_CENTER");

    // Center prepare and submit combined list
    const prepared = await http.post(`/api/exam-cycles/${examCycleId}/center-list/prepare`).set(authHeader(centerToken)).send({});
    expect(prepared.status).toBe(200);

    const submitCenter = await http.post(`/api/exam-cycles/${examCycleId}/center-list/submit`).set(authHeader(centerToken)).send({});
    expect(submitCenter.status).toBe(200);
    expect(submitCenter.body.data.status).toBe("SUBMITTED_TO_FRANCHISE");

    // After center forward, Teacher C cannot enroll
    const enrollC = await http.post(`/api/exam-cycles/${examCycleId}/teacher-list/enroll`).set(authHeader(teacherCToken)).send({ studentIds: [studentC.id] });
    expect(enrollC.status).toBe(403);
    expect(enrollC.body.error_code).toBe("MAIN_ENROLLMENT_CLOSED");

    // Teachers A and B (who submitted earlier) cannot modify (enroll) anymore
    const enrollA2 = await http.post(`/api/exam-cycles/${examCycleId}/teacher-list/enroll`).set(authHeader(teacherAToken)).send({ studentIds: [studentA.id] });
    expect(enrollA2.status).toBe(403);
    expect(enrollA2.body.error_code).toBe("MAIN_ENROLLMENT_CLOSED");

    const enrollB2 = await http.post(`/api/exam-cycles/${examCycleId}/teacher-list/enroll`).set(authHeader(teacherBToken)).send({ studentIds: [studentB.id] });
    expect(enrollB2.status).toBe(403);
    expect(enrollB2.body.error_code).toBe("MAIN_ENROLLMENT_CLOSED");

    // Teachers can still view their lists
    const viewA = await http.get(`/api/exam-cycles/${examCycleId}/teacher-list`).set(authHeader(teacherAToken));
    expect(viewA.status).toBe(200);
    expect(viewA.body.data.mainEnrollmentClosed).toBe(true);

    const viewC = await http.get(`/api/exam-cycles/${examCycleId}/teacher-list`).set(authHeader(teacherCToken));
    expect(viewC.status).toBe(200);
    expect(viewC.body.data.mainEnrollmentClosed).toBe(true);

    // Now simulate franchise rejecting the combined list back to center to unlock
    const pending = await http.get(`/api/exam-cycles/${examCycleId}/enrollment-lists/pending`).set(authHeader(centerToken));
    // pending lists are visible to approvers; find the combined list id via center token by fetching center's pending lists as franchise would normally do
    const frLogin = await loginAs({ email: "franchise.manager@abacusweb.local" });
    const frToken = frLogin.body.data.access_token;
    const pendingFr = await http.get(`/api/exam-cycles/${examCycleId}/enrollment-lists/pending`).set(authHeader(frToken));
    expect(pendingFr.status).toBe(200);
    const listId = pendingFr.body.data[0].id;

    const reject = await http.post(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/reject`).set(authHeader(frToken)).send({ remark: "Return to center" });
    expect(reject.status).toBe(200);

    // After reject, Teacher C should be able to enroll again
    const enrollCAfter = await http.post(`/api/exam-cycles/${examCycleId}/teacher-list/enroll`).set(authHeader(teacherCToken)).send({ studentIds: [studentC.id] });
    expect([200, 201]).toContain(enrollCAfter.status);
  });
});
