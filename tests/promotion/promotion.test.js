import {
  authHeader,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";

async function createStudentAtLevel(tenantId, hierarchyNodeId, levelId, suffix) {
  return prisma.student.create({
    data: {
      tenantId,
      admissionNo: `ADM-${suffix}`,
      firstName: `Student${suffix}`,
      lastName: "Promotion",
      email: `promotion.${suffix}@example.com`,
      hierarchyNodeId,
      levelId
    }
  });
}

describe("PROMOTION", () => {
  let centerToken;
  let tenant;
  let school;
  let level1;
  let level2;

  beforeAll(async () => {
    const centerLogin = await loginAs({ email: "center.manager@abacusweb.local" });
    centerToken = centerLogin.body.data.access_token;

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    school = await prisma.hierarchyNode.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: "SCH-001"
        }
      }
    });

    [level1, level2] = await prisma.level.findMany({
      where: {
        tenantId: tenant.id,
        rank: { in: [1, 2] }
      },
      orderBy: { rank: "asc" }
    });
  });

  test("Eligible student → confirm success", async () => {
    const suffix = randomId("eligible");
    const student = await createStudentAtLevel(tenant.id, school.id, level1.id, suffix);

    const superadmin = await prisma.authUser.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        email: "superadmin@abacusweb.local"
      }
    });

    for (let index = 0; index < 3; index += 1) {
      const worksheet = await prisma.worksheet.create({
        data: {
          tenantId: tenant.id,
          title: `Promo worksheet ${suffix}-${index}`,
          levelId: level1.id,
          difficulty: "EASY",
          createdByUserId: superadmin.id,
          isPublished: true
        }
      });

      await prisma.worksheetSubmission.create({
        data: {
          tenantId: tenant.id,
          worksheetId: worksheet.id,
          studentId: student.id,
          score: 90,
          status: "REVIEWED",
          submittedAt: new Date(Date.now() - (index + 1) * 1000),
          correctCount: 9,
          totalQuestions: 10,
          completionTimeSeconds: 30
        }
      });
    }

    const competition = await prisma.competition.create({
      data: {
        tenantId: tenant.id,
        title: `Promo exam ${suffix}`,
        status: "SCHEDULED",
        workflowStage: "APPROVED",
        startsAt: new Date(Date.now() - 3600 * 1000),
        endsAt: new Date(Date.now() + 3600 * 1000),
        hierarchyNodeId: school.id,
        levelId: level1.id,
        createdByUserId: superadmin.id
      }
    });

    await prisma.competitionEnrollment.create({
      data: {
        competitionId: competition.id,
        studentId: student.id,
        tenantId: tenant.id,
        totalScore: 90,
        rank: 1
      }
    });

    const response = await http
      .post(`/api/students/${student.id}/confirm-promotion`)
      .set(authHeader(centerToken))
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.previousLevelId).toBe(level1.id);
    expect(response.body.data.newLevelId).toBe(level2.id);

    const updatedStudent = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(updatedStudent.levelId).toBe(level2.id);

    const completion = await prisma.studentLevelCompletion.findUnique({
      where: {
        tenantId_studentId_levelId: {
          tenantId: tenant.id,
          studentId: student.id,
          levelId: level1.id
        }
      }
    });

    expect(completion).toBeTruthy();
  });

  test("Not eligible → 409", async () => {
    const suffix = randomId("ineligible");
    const student = await createStudentAtLevel(tenant.id, school.id, level1.id, suffix);

    const response = await http
      .post(`/api/students/${student.id}/confirm-promotion`)
      .set(authHeader(centerToken))
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error_code).toBe("PROMOTION_NOT_ELIGIBLE");

    const studentAfter = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(studentAfter.levelId).toBe(level1.id);
  });

  test("Double promotion blocked", async () => {
    const suffix = randomId("double");
    const student = await createStudentAtLevel(tenant.id, school.id, level1.id, suffix);

    const superadmin = await prisma.authUser.findFirstOrThrow({
      where: { tenantId: tenant.id, email: "superadmin@abacusweb.local" }
    });

    for (let index = 0; index < 3; index += 1) {
      const worksheet = await prisma.worksheet.create({
        data: {
          tenantId: tenant.id,
          title: `Double promo worksheet ${suffix}-${index}`,
          levelId: level1.id,
          difficulty: "EASY",
          createdByUserId: superadmin.id,
          isPublished: true
        }
      });

      await prisma.worksheetSubmission.create({
        data: {
          tenantId: tenant.id,
          worksheetId: worksheet.id,
          studentId: student.id,
          score: 95,
          status: "REVIEWED",
          submittedAt: new Date(),
          correctCount: 19,
          totalQuestions: 20,
          completionTimeSeconds: 40
        }
      });
    }

    const competition = await prisma.competition.create({
      data: {
        tenantId: tenant.id,
        title: `Double promo exam ${suffix}`,
        status: "SCHEDULED",
        workflowStage: "APPROVED",
        startsAt: new Date(Date.now() - 3600 * 1000),
        endsAt: new Date(Date.now() + 3600 * 1000),
        hierarchyNodeId: school.id,
        levelId: level1.id,
        createdByUserId: superadmin.id
      }
    });

    await prisma.competitionEnrollment.create({
      data: {
        competitionId: competition.id,
        studentId: student.id,
        tenantId: tenant.id,
        totalScore: 95,
        rank: 1
      }
    });

    const first = await http
      .post(`/api/students/${student.id}/confirm-promotion`)
      .set(authHeader(centerToken));

    expect(first.status).toBe(200);

    const second = await http
      .post(`/api/students/${student.id}/confirm-promotion`)
      .set(authHeader(centerToken));

    expect(second.status).toBe(409);
    expect([
      "ALREADY_PROMOTED",
      "PROMOTION_NOT_ELIGIBLE",
      "NEXT_LEVEL_NOT_FOUND"
    ]).toContain(second.body.error_code);
  });

  test("Level skipping blocked", async () => {
    const topLevel = await prisma.level.findFirstOrThrow({
      where: { tenantId: tenant.id },
      orderBy: { rank: "desc" }
    });

    const student = await createStudentAtLevel(
      tenant.id,
      school.id,
      topLevel.id,
      randomId("top")
    );

    const response = await http
      .post(`/api/students/${student.id}/confirm-promotion`)
      .set(authHeader(centerToken))
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error_code).toBe("NEXT_LEVEL_NOT_FOUND");
  });
});
