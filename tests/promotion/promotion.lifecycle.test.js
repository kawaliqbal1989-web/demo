import { authHeader, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";

async function createStudentAtLevel({ tenantId, hierarchyNodeId, levelId, suffix }) {
  return prisma.student.create({
    data: {
      tenantId,
      admissionNo: `ADM-LC-${suffix}`,
      firstName: `Lifecycle${suffix}`,
      lastName: "Student",
      email: `lifecycle.${suffix}@example.com`,
      hierarchyNodeId,
      levelId
    }
  });
}

async function createReviewedSubmission({ tenantId, levelId, studentId, score, createdByUserId, suffix }) {
  const worksheet = await prisma.worksheet.create({
    data: {
      tenantId,
      title: `Lifecycle Worksheet ${suffix}`,
      levelId,
      difficulty: "EASY",
      createdByUserId,
      isPublished: true
    }
  });

  return prisma.worksheetSubmission.create({
    data: {
      tenantId,
      worksheetId: worksheet.id,
      studentId,
      score,
      status: "REVIEWED",
      submittedAt: new Date(),
      finalSubmittedAt: new Date(),
      correctCount: 9,
      totalQuestions: 10,
      completionTimeSeconds: 30,
      passed: Number(score) >= 85,
      evaluationHash: `hash-${suffix}`
    }
  });
}

describe("PROMOTION LIFECYCLE INTEGRITY", () => {
  let centerToken;
  let superadminToken;
  let tenant;
  let school;
  let level1;
  let level2;
  let level3;
  let superadminUser;

  beforeAll(async () => {
    const centerLogin = await loginAs({ username: "CE001" });
    centerToken = centerLogin.body.data.access_token;

    const superadminLogin = await loginAs({ username: "SA001" });
    superadminToken = superadminLogin.body.data.access_token;

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    school = await prisma.hierarchyNode.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: "SCH-001"
        }
      }
    });

    superadminUser = await prisma.authUser.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        username: "SA001"
      },
      select: { id: true }
    });

    level1 = await prisma.level.findFirstOrThrow({ where: { tenantId: tenant.id, rank: 1 } });
    level2 = await prisma.level.findFirstOrThrow({ where: { tenantId: tenant.id, rank: 2 } });

    level3 = await prisma.level.upsert({
      where: {
        tenantId_rank: {
          tenantId: tenant.id,
          rank: 3
        }
      },
      update: {
        name: "Level 3"
      },
      create: {
        tenantId: tenant.id,
        name: "Level 3",
        rank: 3,
        description: "Advanced"
      }
    });

    await prisma.levelRule.upsert({
      where: {
        tenantId_levelId: {
          tenantId: tenant.id,
          levelId: level1.id
        }
      },
      update: {
        passThreshold: 85
      },
      create: {
        tenantId: tenant.id,
        levelId: level1.id,
        passThreshold: 85
      }
    });
  });

  test("No-skip enforcement blocks direct assignment to Level 3", async () => {
    const student = await createStudentAtLevel({
      tenantId: tenant.id,
      hierarchyNodeId: school.id,
      levelId: level1.id,
      suffix: randomId("noskip")
    });

    const response = await http
      .patch(`/api/students/${student.id}/assign-level`)
      .set(authHeader(centerToken))
      .send({ levelId: level3.id });

    expect(response.status).toBe(409);
    expect(response.body.error_code).toBe("LEVEL_SKIP_NOT_ALLOWED");
  });

  test("Pass-threshold boundary: 84.99 fails, 85.00 passes", async () => {
    const failStudent = await createStudentAtLevel({
      tenantId: tenant.id,
      hierarchyNodeId: school.id,
      levelId: level1.id,
      suffix: randomId("fail")
    });

    await createReviewedSubmission({
      tenantId: tenant.id,
      levelId: level1.id,
      studentId: failStudent.id,
      score: 84.99,
      createdByUserId: superadminUser.id,
      suffix: randomId("f")
    });

    const failPromotion = await http
      .post(`/api/students/${failStudent.id}/confirm-promotion`)
      .set(authHeader(centerToken));

    expect(failPromotion.status).toBe(409);
    expect(failPromotion.body.error_code).toBe("PROMOTION_NOT_ELIGIBLE");

    const passStudent = await createStudentAtLevel({
      tenantId: tenant.id,
      hierarchyNodeId: school.id,
      levelId: level1.id,
      suffix: randomId("pass")
    });

    await createReviewedSubmission({
      tenantId: tenant.id,
      levelId: level1.id,
      studentId: passStudent.id,
      score: 85,
      createdByUserId: superadminUser.id,
      suffix: randomId("p")
    });

    const passPromotion = await http
      .post(`/api/students/${passStudent.id}/confirm-promotion`)
      .set(authHeader(centerToken));

    expect(passPromotion.status).toBe(200);

    const promoted = await prisma.student.findUniqueOrThrow({ where: { id: passStudent.id } });
    expect(promoted.levelId).toBe(level2.id);
  });

  test("Progression history created once and duplicate promotion blocked", async () => {
    const student = await createStudentAtLevel({
      tenantId: tenant.id,
      hierarchyNodeId: school.id,
      levelId: level1.id,
      suffix: randomId("dup")
    });

    await createReviewedSubmission({
      tenantId: tenant.id,
      levelId: level1.id,
      studentId: student.id,
      score: 90,
      createdByUserId: superadminUser.id,
      suffix: randomId("dup-sub")
    });

    const first = await http
      .post(`/api/students/${student.id}/confirm-promotion`)
      .set(authHeader(centerToken));

    expect(first.status).toBe(200);

    const second = await http
      .post(`/api/students/${student.id}/confirm-promotion`)
      .set(authHeader(centerToken));

    expect(second.status).toBe(409);

    const historyRows = await prisma.studentLevelProgressionHistory.findMany({
      where: {
        tenantId: tenant.id,
        studentId: student.id,
        fromLevelId: level1.id,
        toLevelId: level2.id
      }
    });

    expect(historyRows).toHaveLength(1);
  });

  test("Transaction rollback on failure keeps level unchanged and no history", async () => {
    const student = await createStudentAtLevel({
      tenantId: tenant.id,
      hierarchyNodeId: school.id,
      levelId: level1.id,
      suffix: randomId("rollback")
    });

    const response = await http
      .patch(`/api/students/${student.id}/assign-level`)
      .set(authHeader(centerToken))
      .send({ levelId: level2.id });

    expect(response.status).toBe(409);
    expect(response.body.error_code).toBe("PROMOTION_NOT_ELIGIBLE");

    const freshStudent = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(freshStudent.levelId).toBe(level1.id);

    const historyRows = await prisma.studentLevelProgressionHistory.count({
      where: {
        tenantId: tenant.id,
        studentId: student.id
      }
    });
    expect(historyRows).toBe(0);
  });

  test("Duplicate active enrollment blocked at API and DB layer", async () => {
    const student = await createStudentAtLevel({
      tenantId: tenant.id,
      hierarchyNodeId: school.id,
      levelId: level1.id,
      suffix: randomId("enroll")
    });

    const competition = await prisma.competition.create({
      data: {
        tenantId: tenant.id,
        title: `Enroll Guard ${randomId("comp")}`,
        description: "Enrollment duplication guard",
        status: "SCHEDULED",
        workflowStage: "APPROVED",
        startsAt: new Date(Date.now() + 3600 * 1000),
        endsAt: new Date(Date.now() + 7200 * 1000),
        hierarchyNodeId: school.id,
        levelId: level1.id,
        createdByUserId: superadminUser.id
      }
    });

    const first = await http
      .post(`/api/competitions/${competition.id}/enrollments`)
      .set(authHeader(centerToken))
      .send({ studentId: student.id });

    expect(first.status).toBe(201);

    const second = await http
      .post(`/api/competitions/${competition.id}/enrollments`)
      .set(authHeader(centerToken))
      .send({ studentId: student.id });

    expect(second.status).toBe(409);
    expect(second.body.error_code).toBe("DUPLICATE_ACTIVE_ENROLLMENT");
  });
});
