import {
  authHeader,
  ensureAuthUser,
  getTenantByCode,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";

describe("TEACHER mock tests", () => {
  let tenant;
  let centerUser;
  let teacherUser;
  let teacherToken;
  let level;
  let batch;
  let student;
  let enrollment;
  let mockTest;

  beforeAll(async () => {
    tenant = await getTenantByCode("DEFAULT");

    centerUser = await prisma.authUser.findFirstOrThrow({
      where: { tenantId: tenant.id, role: "CENTER", email: "center.manager@abacusweb.local" },
      select: { id: true, hierarchyNodeId: true }
    });

    teacherUser = await prisma.authUser.findFirst({
      where: { tenantId: tenant.id, role: "TEACHER", email: "teacher.one@abacusweb.local" },
      select: { id: true, username: true }
    });

    if (!teacherUser) {
      teacherUser = await ensureAuthUser({
        tenantCode: "DEFAULT",
        email: "teacher.one@abacusweb.local",
        username: `TE${Math.floor(Math.random() * 100000)}`,
        role: "TEACHER",
        hierarchyNodeCode: null,
        parentUserId: centerUser.id
      });
    }

    await prisma.authUser.update({
      where: { id: teacherUser.id },
      data: { hierarchyNodeId: centerUser.hierarchyNodeId }
    });

    await prisma.teacherProfile.upsert({
      where: { authUserId: teacherUser.id },
      update: {
        tenantId: tenant.id,
        hierarchyNodeId: centerUser.hierarchyNodeId,
        fullName: "Teacher One"
      },
      create: {
        tenantId: tenant.id,
        hierarchyNodeId: centerUser.hierarchyNodeId,
        authUserId: teacherUser.id,
        fullName: "Teacher One"
      }
    });

    const login = await loginAs({ email: "teacher.one@abacusweb.local" });
    expect(login.statusCode).toBe(200);
    teacherToken = login.body.data.access_token;

    level = await prisma.level.findFirstOrThrow({
      where: { tenantId: tenant.id, rank: 1 },
      select: { id: true }
    });

    batch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerUser.hierarchyNodeId,
        name: randomId("T_BATCH")
      }
    });

    await prisma.batchTeacherAssignment.create({
      data: {
        tenantId: tenant.id,
        batchId: batch.id,
        teacherUserId: teacherUser.id
      }
    });

    student = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: randomId("ADM"),
        firstName: "Mock",
        lastName: "Student",
        hierarchyNodeId: centerUser.hierarchyNodeId,
        levelId: level.id,
        isActive: true
      }
    });

    enrollment = await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerUser.hierarchyNodeId,
        batchId: batch.id,
        studentId: student.id,
        levelId: level.id,
        assignedTeacherUserId: teacherUser.id,
        status: "ACTIVE"
      }
    });

    mockTest = await prisma.mockTest.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerUser.hierarchyNodeId,
        batchId: batch.id,
        title: "Teacher Mock Test",
        date: new Date("2026-02-22T00:00:00.000Z"),
        maxMarks: 100,
        createdByUserId: centerUser.id
      }
    });
  });

  afterAll(async () => {
    if (!tenant) return;

    await prisma.mockTestResult.deleteMany({ where: { tenantId: tenant.id, mockTestId: mockTest?.id } });
    await prisma.mockTest.deleteMany({ where: { tenantId: tenant.id, id: mockTest?.id } });
    await prisma.enrollment.deleteMany({ where: { tenantId: tenant.id, id: enrollment?.id } });
    await prisma.student.deleteMany({ where: { tenantId: tenant.id, id: student?.id } });
    await prisma.batchTeacherAssignment.deleteMany({ where: { tenantId: tenant.id, batchId: batch?.id, teacherUserId: teacherUser?.id } });
    await prisma.batch.deleteMany({ where: { tenantId: tenant.id, id: batch?.id } });
  });

  test("Teacher can list batch mock tests and save marks", async () => {
    const list = await http
      .get(`/api/teacher/batches/${batch.id}/mock-tests?limit=20&offset=0`)
      .set(authHeader(teacherToken));

    expect(list.statusCode).toBe(200);
    const ids = (list.body?.data?.items || []).map((item) => item.id);
    expect(ids).toContain(mockTest.id);

    const save = await http
      .put(`/api/teacher/mock-tests/${mockTest.id}/results`)
      .set(authHeader(teacherToken))
      .send({
        results: [{ studentId: student.id, marks: 91 }]
      });

    expect(save.statusCode).toBe(200);
    expect(save.body?.data?.updatedCount).toBe(1);

    const detail = await http
      .get(`/api/teacher/mock-tests/${mockTest.id}`)
      .set(authHeader(teacherToken));

    expect(detail.statusCode).toBe(200);
    const rosterRow = (detail.body?.data?.roster || []).find((row) => row.studentId === student.id);
    expect(rosterRow?.marks).toBe(91);
  });

  test("Teacher cannot save marks for archived mock test", async () => {
    await prisma.mockTest.update({
      where: { id: mockTest.id },
      data: { status: "ARCHIVED" }
    });

    const save = await http
      .put(`/api/teacher/mock-tests/${mockTest.id}/results`)
      .set(authHeader(teacherToken))
      .send({
        results: [{ studentId: student.id, marks: 77 }]
      });

    expect(save.statusCode).toBe(409);
    expect(save.body?.error_code).toBe("MOCK_TEST_ARCHIVED");
  });
});
