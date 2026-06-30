import { authHeader, http, loginAs, prisma } from "../helpers/test-helpers.js";

describe("COMPETITION CREATION", () => {
  let superadminToken;
  let tenant;

  beforeAll(async () => {
    const login = await loginAs({ email: "superadmin@abacusweb.local" });
    superadminToken = login.body.data.access_token;
    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
  });

  test("Superadmin can create a competition without providing a level and gets a fallback level", async () => {
    let template = await prisma.competitionTemplate.findFirst({
      where: { tenantId: tenant.id },
      select: { id: true }
    });

    if (!template) {
      template = await prisma.competitionTemplate.create({
        data: {
          tenantId: tenant.id,
          name: "Test template",
          slug: `test-template-${Date.now()}`,
          isActive: true
        },
        select: { id: true }
      });
    }

    const fallbackLevel = await prisma.level.findFirstOrThrow({
      where: { tenantId: tenant.id },
      orderBy: { rank: "asc" },
      select: { id: true }
    });

    const response = await http
      .post("/api/competitions")
      .set(authHeader(superadminToken))
      .send({
        title: "Create Flow Competition",
        code: `CF-${Date.now()}`,
        description: "Regression test for create flow",
        templateId: template.id,
        businessPartnerIds: [],
        registrationStartsAt: "2026-07-01T10:00:00.000Z",
        registrationEndsAt: "2026-07-02T10:00:00.000Z",
        startsAt: "2026-07-03T10:00:00.000Z",
        endsAt: "2026-07-04T10:00:00.000Z",
        publish: false
      });

    expect(response.status).toBe(201);
    expect(response.body?.success).toBe(true);

    const created = await prisma.competition.findUniqueOrThrow({
      where: { id: response.body?.data?.id },
      select: { id: true, levelId: true }
    });

    expect(created.levelId).toBe(fallbackLevel.id);
  });
});
