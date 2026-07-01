import bcrypt from "bcryptjs";
import {
  authHeader,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";

describe("COMPETITION TEACHER OWNERSHIP", () => {
  let centerToken;
  let centerManagerId;
  let tenant;
  let centerNode;
  let level1;
  let teacherA;
  let teacherAToken;
  let teacherAProfile;
  let teacherB;
  let teacherBToken;
  let inactiveTeacher;
  let foreignCenterTeacher;
  let foreignTenantTeacher;
  let foreignCenterNode;
  let foreignTenant;
  const createdAuthUserIds = [];
  const createdHierarchyNodeIds = [];
  const createdTenantIds = [];

  async function trackAuthUser(user) {
    createdAuthUserIds.push(user.id);
    return user;
  }

  async function createTeacherUser({ tenantId, hierarchyNodeId, usernamePrefix, isActive = true, createProfile = true }) {
    const suffix = randomId(usernamePrefix);
    const user = await trackAuthUser(await prisma.authUser.create({
      data: {
        tenantId,
        username: `${usernamePrefix}_${suffix}`,
        email: `${usernamePrefix}_${suffix}@abacusweb.local`,
        passwordHash: await bcrypt.hash("Pass@123", 10),
        role: "TEACHER",
        isActive,
        hierarchyNodeId
      }
    }));

    let profile = null;
    if (createProfile) {
      profile = await prisma.teacherProfile.create({
        data: {
          tenantId,
          hierarchyNodeId,
          authUserId: user.id,
          fullName: `${usernamePrefix} ${suffix}`,
          status: "ACTIVE",
          isActive
        }
      });
    }

    return { user, profile };
  }

  async function createCompetitionFixture() {
    const studentA = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `COMP-${randomId("A")}`,
        firstName: "Alpha",
        lastName: "Student",
        hierarchyNodeId: centerNode.id,
        levelId: level1.id,
        isActive: true
      }
    });

    const studentB = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `COMP-${randomId("B")}`,
        firstName: "Beta",
        lastName: "Student",
        hierarchyNodeId: centerNode.id,
        levelId: level1.id,
        isActive: true
      }
    });

    const created = await http
      .post("/api/competitions")
      .set(authHeader(centerToken))
      .send({
        title: `Competition ${randomId("teacher")}`,
        description: "teacher ownership regression",
        startsAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 7200 * 1000).toISOString(),
        hierarchyNodeId: centerNode.id,
        levelId: level1.id
      });

    expect(created.status).toBe(201);

    const competition = created.body.data;

    const enrollmentA = await http
      .post(`/api/competitions/${competition.id}/enrollments`)
      .set(authHeader(centerToken))
      .send({ studentId: studentA.id, competitionFeeAmount: 0 });

    expect(enrollmentA.status).toBe(201);

    const enrollmentB = await http
      .post(`/api/competitions/${competition.id}/enrollments`)
      .set(authHeader(centerToken))
      .send({ studentId: studentB.id, competitionFeeAmount: 0 });

    expect(enrollmentB.status).toBe(201);

    return { competition, studentA, studentB };
  }

  async function cleanupCompetitionFixture({ competition, students }) {
    await prisma.student.deleteMany({
      where: { id: { in: students.map((student) => student.id) } }
    });
    await prisma.competition.deleteMany({
      where: { id: competition.id }
    });
  }

  beforeAll(async () => {
    const centerLogin = await loginAs({ email: "center.manager@abacusweb.local" });
    centerToken = centerLogin.body.data.access_token;

    const centerManager = await prisma.authUser.findFirstOrThrow({
      where: { email: "center.manager@abacusweb.local", tenantId: (await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } })).id }
    });
    centerManagerId = centerManager.id;

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    centerNode = await prisma.hierarchyNode.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: "SCH-001"
        }
      }
    });
    level1 = await prisma.level.findFirstOrThrow({ where: { tenantId: tenant.id, rank: 1 } });

    ({ user: teacherA, profile: teacherAProfile } = await createTeacherUser({
      tenantId: tenant.id,
      hierarchyNodeId: centerNode.id,
      usernamePrefix: "teacher-a"
    }));
    teacherAToken = (await loginAs({ username: teacherA.username })).body.data.access_token;

    ({ user: teacherB } = await createTeacherUser({
      tenantId: tenant.id,
      hierarchyNodeId: centerNode.id,
      usernamePrefix: "teacher-b"
    }));
    teacherBToken = (await loginAs({ username: teacherB.username })).body.data.access_token;

    ({ user: inactiveTeacher } = await createTeacherUser({
      tenantId: tenant.id,
      hierarchyNodeId: centerNode.id,
      usernamePrefix: "teacher-inactive",
      isActive: false
    }));

    foreignCenterNode = await prisma.hierarchyNode.create({
      data: {
        tenantId: tenant.id,
        name: `Foreign Center ${randomId("center")}`,
        code: `FC-${randomId("center")}`,
        type: "SCHOOL",
        isActive: true
      }
    });
    createdHierarchyNodeIds.push(foreignCenterNode.id);

    ({ user: foreignCenterTeacher } = await createTeacherUser({
      tenantId: tenant.id,
      hierarchyNodeId: foreignCenterNode.id,
      usernamePrefix: "teacher-foreign-center"
    }));

    foreignTenant = await prisma.tenant.create({
      data: {
        name: `Foreign Tenant ${randomId("tenant")}`,
        code: `TENANT-${randomId("tenant")}`
      }
    });
    createdTenantIds.push(foreignTenant.id);

    const foreignTenantCenter = await prisma.hierarchyNode.create({
      data: {
        tenantId: foreignTenant.id,
        name: `Foreign Tenant Center ${randomId("center")}`,
        code: `FTC-${randomId("center")}`,
        type: "SCHOOL",
        isActive: true
      }
    });
    createdHierarchyNodeIds.push(foreignTenantCenter.id);

    ({ user: foreignTenantTeacher } = await createTeacherUser({
      tenantId: foreignTenant.id,
      hierarchyNodeId: foreignTenantCenter.id,
      usernamePrefix: "teacher-foreign-tenant"
    }));
  });

  afterAll(async () => {
    if (createdAuthUserIds.length) {
      await prisma.authUser.deleteMany({
        where: { id: { in: createdAuthUserIds } }
      });
    }

    if (createdHierarchyNodeIds.length) {
      await prisma.hierarchyNode.deleteMany({
        where: { id: { in: createdHierarchyNodeIds } }
      });
    }

    if (createdTenantIds.length) {
      await prisma.tenant.deleteMany({
        where: { id: { in: createdTenantIds } }
      });
    }
  });

  test("center can assign a teacher and teachers only see their own registrations", async () => {
    const { competition, studentA, studentB } = await createCompetitionFixture();

    try {
      const registrationId = `${competition.id}:${studentA.id}`;
      const assignResponse = await http
        .patch(`/api/competitions/${competition.id}/registrations/${registrationId}/teacher`)
        .set(authHeader(centerToken))
        .send({ teacherUserId: teacherA.id });

      expect(assignResponse.status).toBe(200);
      expect(assignResponse.body.data.registrationId).toBe(registrationId);
      expect(assignResponse.body.data.student.currentTeacher.id).toBe(teacherA.id);

      const refreshedStudent = await prisma.student.findUniqueOrThrow({
        where: { id: studentA.id },
        select: { currentTeacherUserId: true }
      });
      expect(refreshedStudent.currentTeacherUserId).toBe(teacherA.id);

      const academicEnrollmentCount = await prisma.enrollment.count({
        where: { studentId: studentA.id }
      });
      expect(academicEnrollmentCount).toBe(0);

      const teacherList = await http
        .get("/api/competitions")
        .set(authHeader(teacherAToken));

      expect(teacherList.status).toBe(200);
      const teacherCompetition = teacherList.body.data.find((item) => item.id === competition.id);
      expect(teacherCompetition).toBeTruthy();
      expect(teacherCompetition.enrollments).toHaveLength(1);

      const teacherDetail = await http
        .get(`/api/competitions/${competition.id}`)
        .set(authHeader(teacherAToken));

      expect(teacherDetail.status).toBe(200);
      expect(teacherDetail.body.data.enrollments).toHaveLength(1);
      expect(teacherDetail.body.data.enrollments[0].studentId).toBe(studentA.id);

      const registrationsResponse = await http
        .get(`/api/competitions/${competition.id}/registrations`)
        .set(authHeader(teacherAToken));

      expect(registrationsResponse.status).toBe(200);
      expect(registrationsResponse.body.data.registrations).toHaveLength(1);
      expect(registrationsResponse.body.data.registrations[0].studentId).toBe(studentA.id);

      const otherTeacherRegistrations = await http
        .get(`/api/competitions/${competition.id}/registrations`)
        .set(authHeader(teacherBToken));

      expect(otherTeacherRegistrations.status).toBe(404);

      await prisma.competitionEnrollment.delete({
        where: {
          competitionId_studentId: {
            competitionId: competition.id,
            studentId: studentA.id
          }
        }
      });

      const hiddenRegistrations = await http
        .get(`/api/competitions/${competition.id}/registrations`)
        .set(authHeader(teacherAToken));

      expect(hiddenRegistrations.status).toBe(404);

      const hiddenList = await http
        .get("/api/competitions")
        .set(authHeader(teacherAToken));

      expect(hiddenList.status).toBe(200);
      expect(hiddenList.body.data.some((item) => item.id === competition.id)).toBe(false);
    } finally {
      await cleanupCompetitionFixture({ competition, students: [studentA, studentB] });
    }
  });

  test("center rejects invalid teacher targets", async () => {
    const { competition, studentA, studentB } = await createCompetitionFixture();

    try {
      const invalidTargets = [
        { label: "center user", teacherUserId: centerManagerId },
        { label: "teacher profile id", teacherUserId: teacherAProfile.id },
        { label: "inactive teacher", teacherUserId: inactiveTeacher.id },
        { label: "foreign center teacher", teacherUserId: foreignCenterTeacher.id },
        { label: "foreign tenant teacher", teacherUserId: foreignTenantTeacher.id }
      ];

      for (const target of invalidTargets) {
        const response = await http
          .patch(`/api/competitions/${competition.id}/registrations/${competition.id}:${studentA.id}/teacher`)
          .set(authHeader(centerToken))
          .send({ teacherUserId: target.teacherUserId });

        expect(response.status).toBe(400);
        expect(response.body.error_code).toBe("INVALID_TEACHER");
      }

      await prisma.competitionEnrollment.delete({
        where: {
          competitionId_studentId: {
            competitionId: competition.id,
            studentId: studentA.id
          }
        }
      });
    } finally {
      await cleanupCompetitionFixture({ competition, students: [studentA, studentB] });
    }
  });

  test("competition workflow lock blocks teacher assignment after center submission", async () => {
    const { competition, studentA, studentB } = await createCompetitionFixture();

    try {
      const forwardResponse = await http
        .post(`/api/competitions/${competition.id}/forward-request`)
        .set(authHeader(centerToken));

      expect(forwardResponse.status).toBe(200);

      const response = await http
        .patch(`/api/competitions/${competition.id}/registrations/${competition.id}:${studentA.id}/teacher`)
        .set(authHeader(centerToken))
        .send({ teacherUserId: teacherA.id });

      expect(response.status).toBe(409);
      expect(response.body.error_code).toBe("COMPETITION_LOCKED");
    } finally {
      await cleanupCompetitionFixture({ competition, students: [studentA, studentB] });
    }
  });
});
