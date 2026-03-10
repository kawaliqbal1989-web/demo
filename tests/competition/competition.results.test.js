import {
  authHeader,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";

describe("COMPETITION RESULTS", () => {
  let centerToken;
  let superadminToken;
  let tenant;
  let school;
  let level1;
  let superadmin;

  beforeAll(async () => {
    const centerLogin = await loginAs({ email: "center.manager@abacusweb.local" });
    centerToken = centerLogin.body.data.access_token;

    const superadminLogin = await loginAs({ email: "superadmin@abacusweb.local" });
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
    level1 = await prisma.level.findFirstOrThrow({ where: { tenantId: tenant.id, rank: 1 } });
    superadmin = await prisma.authUser.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        email: "superadmin@abacusweb.local"
      }
    });
  });

  async function createCompetition() {
    return prisma.competition.create({
      data: {
        tenantId: tenant.id,
        title: `Comp ${randomId("results")}`,
        description: "results flow test",
        status: "SCHEDULED",
        workflowStage: "APPROVED",
        startsAt: new Date(Date.now() - 3600 * 1000),
        endsAt: new Date(Date.now() + 3600 * 1000),
        hierarchyNodeId: school.id,
        levelId: level1.id,
        createdByUserId: superadmin.id
      }
    });
  }

  test("Superadmin can fetch competition results payload", async () => {
    const competition = await createCompetition();

    const response = await http
      .get(`/api/competitions/${competition.id}/results`)
      .set(authHeader(superadminToken));

    expect(response.status).toBe(200);
    expect(response.body?.data?.competitionId).toBe(competition.id);
    expect(response.body?.data?.competitionTitle).toBe(competition.title);
    expect(Array.isArray(response.body?.data?.leaderboard)).toBe(true);
    expect(response.body?.data).toHaveProperty("status");
    expect(response.body?.data).toHaveProperty("resultPublishedAt");
    expect(response.body?.data).toHaveProperty("legacyResultStatus");
  });

  test("Publish/unpublish endpoints work or return migration-required", async () => {
    const competition = await createCompetition();

    const publishResponse = await http
      .post(`/api/competitions/${competition.id}/results/publish`)
      .set(authHeader(superadminToken));

    if (publishResponse.status === 409) {
      expect(publishResponse.body.error_code).toBe("COMPETITION_RESULT_STATUS_MIGRATION_REQUIRED");

      const unpublishLegacyResponse = await http
        .post(`/api/competitions/${competition.id}/results/unpublish`)
        .set(authHeader(superadminToken));

      expect(unpublishLegacyResponse.status).toBe(409);
      expect(unpublishLegacyResponse.body.error_code).toBe("COMPETITION_RESULT_STATUS_MIGRATION_REQUIRED");
      return;
    }

    expect(publishResponse.status).toBe(200);
    expect(publishResponse.body?.data?.resultStatus).toBe("PUBLISHED");
    expect(publishResponse.body?.data?.resultPublishedAt).toBeTruthy();

    const unpublishResponse = await http
      .post(`/api/competitions/${competition.id}/results/unpublish`)
      .set(authHeader(superadminToken));

    expect(unpublishResponse.status).toBe(200);
    expect(unpublishResponse.body?.data?.resultStatus).toBe("LOCKED");
    expect(unpublishResponse.body?.data?.resultPublishedAt).toBeNull();
  });

  test("Superadmin can export competition results CSV", async () => {
    const competition = await createCompetition();
    const student = await prisma.student.findFirstOrThrow({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" }
    });

    await prisma.competitionEnrollment.create({
      data: {
        tenantId: tenant.id,
        competitionId: competition.id,
        studentId: student.id,
        isActive: true
      }
    });

    const response = await http
      .get(`/api/competitions/${competition.id}/results.csv`)
      .set(authHeader(superadminToken));

    expect(response.status).toBe(200);
    expect(String(response.headers["content-type"] || "")).toContain("text/csv");
    expect(String(response.headers["content-disposition"] || "")).toContain(`competition_${competition.id}_results.csv`);
    expect(response.text).toContain("competitionId,competitionTitle,resultStatus,studentId,admissionNo,studentName,rank,totalScore,enrolledAt");
    expect(response.text).toContain(competition.id);
    expect(response.text).toContain(student.id);
  });

  test("Center cannot publish competition results", async () => {
    const competition = await createCompetition();

    const response = await http
      .post(`/api/competitions/${competition.id}/results/publish`)
      .set(authHeader(centerToken));

    expect(response.status).toBe(403);
  });
});
