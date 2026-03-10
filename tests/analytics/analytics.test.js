import {
  authHeader,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";

async function createAnalyticsContext() {
  const suffix = randomId("analytics");
  const tenant = await prisma.tenant.create({
    data: {
      name: `Analytics ${suffix}`,
      code: `AN_${suffix}`
    }
  });

  const school = await prisma.hierarchyNode.create({
    data: {
      tenantId: tenant.id,
      name: `School ${suffix}`,
      code: `SCH_${suffix}`,
      type: "SCHOOL"
    }
  });

  const level1 = await prisma.level.create({
    data: {
      tenantId: tenant.id,
      name: `L1 ${suffix}`,
      rank: 1,
      description: "L1"
    }
  });

  const level2 = await prisma.level.create({
    data: {
      tenantId: tenant.id,
      name: `L2 ${suffix}`,
      rank: 2,
      description: "L2"
    }
  });

  await prisma.levelRule.createMany({
    data: [
      {
        tenantId: tenant.id,
        levelId: level1.id,
        minPracticeAverage: 75,
        minExamScore: 85,
        minAccuracy: 85,
        minConsistencyScore: 70,
        maxAttemptsAllowed: 3,
        allowTeacherOverride: true
      },
      {
        tenantId: tenant.id,
        levelId: level2.id,
        minPracticeAverage: 75,
        minExamScore: 85,
        minAccuracy: 85,
        minConsistencyScore: 70,
        maxAttemptsAllowed: 3,
        allowTeacherOverride: true
      }
    ]
  });

  const actorUser = await prisma.authUser.create({
    data: {
      tenantId: tenant.id,
      email: `actor.${suffix}@example.com`,
      username: `CE_${suffix}`,
      passwordHash: "not_used_by_tests",
      role: "CENTER",
      hierarchyNodeId: school.id,
      isActive: true
    }
  });

  // Only one SUPERADMIN exists system-wide (seeded as SA001). Use it and query this tenant via tenantId.
  const login = await loginAs({ username: "SA001" });

  return {
    tenant,
    school,
    level1,
    level2,
    actorUser,
    token: login.body.data.access_token
  };
}

describe("ANALYTICS", () => {
  test("Level distribution returns correct grouped counts", async () => {
    const ctx = await createAnalyticsContext();

    await prisma.student.createMany({
      data: [
        {
          tenantId: ctx.tenant.id,
          admissionNo: `AD-${randomId("ld")}-1`,
          firstName: "A",
          lastName: "One",
          email: `ld.${randomId("a")}@example.com`,
          hierarchyNodeId: ctx.school.id,
          levelId: ctx.level1.id
        },
        {
          tenantId: ctx.tenant.id,
          admissionNo: `AD-${randomId("ld")}-2`,
          firstName: "B",
          lastName: "Two",
          email: `ld.${randomId("b")}@example.com`,
          hierarchyNodeId: ctx.school.id,
          levelId: ctx.level1.id
        },
        {
          tenantId: ctx.tenant.id,
          admissionNo: `AD-${randomId("ld")}-3`,
          firstName: "C",
          lastName: "Three",
          email: `ld.${randomId("c")}@example.com`,
          hierarchyNodeId: ctx.school.id,
          levelId: ctx.level2.id
        }
      ]
    });

    const response = await http
      .get(`/api/admin/analytics/level-distribution?tenantId=${ctx.tenant.id}`)
      .set(authHeader(ctx.token));

    expect(response.status).toBe(200);
    expect(response.body.data.totalStudents).toBe(3);

    const map = new Map(response.body.data.byLevel.map((item) => [item.levelId, item.studentCount]));
    expect(map.get(ctx.level1.id)).toBe(2);
    expect(map.get(ctx.level2.id)).toBe(1);
  });

  test("Promotion rate calculation accurate", async () => {
    const ctx = await createAnalyticsContext();

    const studentEligible = await prisma.student.create({
      data: {
        tenantId: ctx.tenant.id,
        admissionNo: `AD-${randomId("pr")}-1`,
        firstName: "Eligible",
        lastName: "Student",
        email: `eligible.${randomId("pr")}@example.com`,
        hierarchyNodeId: ctx.school.id,
        levelId: ctx.level1.id
      }
    });

    const studentNotEligible = await prisma.student.create({
      data: {
        tenantId: ctx.tenant.id,
        admissionNo: `AD-${randomId("pr")}-2`,
        firstName: "Not",
        lastName: "Eligible",
        email: `noteligible.${randomId("pr")}@example.com`,
        hierarchyNodeId: ctx.school.id,
        levelId: ctx.level1.id
      }
    });

    const adminUser = ctx.actorUser;

    for (let index = 0; index < 3; index += 1) {
      const worksheet = await prisma.worksheet.create({
        data: {
          tenantId: ctx.tenant.id,
          title: `PR-W-${randomId("pr")}-${index}`,
          levelId: ctx.level1.id,
          difficulty: "EASY",
          createdByUserId: adminUser.id,
          isPublished: true
        }
      });

      await prisma.worksheetSubmission.create({
        data: {
          tenantId: ctx.tenant.id,
          worksheetId: worksheet.id,
          studentId: studentEligible.id,
          score: 90,
          status: "REVIEWED",
          submittedAt: new Date(),
          correctCount: 18,
          totalQuestions: 20,
          completionTimeSeconds: 25
        }
      });
    }

    const competition = await prisma.competition.create({
      data: {
        tenantId: ctx.tenant.id,
        title: `PR-C-${randomId("pr")}`,
        status: "SCHEDULED",
        workflowStage: "APPROVED",
        startsAt: new Date(Date.now() - 3600 * 1000),
        endsAt: new Date(Date.now() + 3600 * 1000),
        hierarchyNodeId: ctx.school.id,
        levelId: ctx.level1.id,
        createdByUserId: adminUser.id
      }
    });

    await prisma.competitionEnrollment.create({
      data: {
        competitionId: competition.id,
        studentId: studentEligible.id,
        tenantId: ctx.tenant.id,
        totalScore: 90
      }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenant.id,
        userId: adminUser.id,
        role: "SUPERADMIN",
        action: "COURSE_ASSIGNMENT",
        entityType: "STUDENT",
        entityId: studentEligible.id,
        metadata: { source: "analytics-test" }
      }
    });

    const from = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const response = await http
      .get(`/api/admin/analytics/promotion-rate?tenantId=${ctx.tenant.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .set(authHeader(ctx.token));

    expect(response.status).toBe(200);
    expect(response.body.data.totalStudents).toBe(2);
    expect(response.body.data.eligiblePercentage).toBe(50);
    expect(response.body.data.promotedLast30DaysPercentage).toBe(50);

    const studentCount = await prisma.student.count({ where: { tenantId: ctx.tenant.id } });
    expect(studentCount).toBe(2);

    void studentNotEligible;
  });
});
