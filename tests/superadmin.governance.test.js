import { authHeader, ensureAuthUser, http, loginAs, prisma, randomId } from "./helpers/test-helpers.js";

describe("SUPERADMIN governance alignment", () => {
  test("SUPERADMIN can create students", async () => {
    const login = await loginAs({ username: "SA001" });
    expect(login.statusCode).toBe(200);

    const token = login.body.data.access_token;

    const tenant = await prisma.tenant.findUnique({ where: { code: "DEFAULT" } });
    expect(tenant).toBeTruthy();

    const node = await prisma.hierarchyNode.findFirst({
      where: { tenantId: tenant.id },
      select: { id: true }
    });
    expect(node).toBeTruthy();

    const level = await prisma.level.findFirst({
      where: { tenantId: tenant.id },
      select: { id: true }
    });
    expect(level).toBeTruthy();

    const admissionNo = randomId("adm");

    const response = await http.post("/api/students").set(authHeader(token)).send({
      admissionNo,
      firstName: "Gov",
      lastName: "Test",
      hierarchyNodeId: node.id,
      levelId: level.id
    });

    expect(response.statusCode).toBe(201);
    expect(response.body?.success).toBe(true);

    await prisma.student.deleteMany({ where: { tenantId: tenant.id, admissionNo } });
  });

  test("SUPERADMIN can enroll competition", async () => {
    const login = await loginAs({ username: "SA001" });
    expect(login.statusCode).toBe(200);

    const token = login.body.data.access_token;

    const tenant = await prisma.tenant.findUnique({ where: { code: "DEFAULT" } });
    expect(tenant).toBeTruthy();

    const node = await prisma.hierarchyNode.findFirst({
      where: { tenantId: tenant.id },
      select: { id: true }
    });
    expect(node).toBeTruthy();

    const level = await prisma.level.findFirst({
      where: { tenantId: tenant.id },
      select: { id: true }
    });
    expect(level).toBeTruthy();

    const student = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: randomId("adm"),
        firstName: "Enroll",
        lastName: "Student",
        hierarchyNodeId: node.id,
        levelId: level.id,
        isActive: true
      },
      select: { id: true }
    });

    const competition = await prisma.competition.create({
      data: {
        tenantId: tenant.id,
        title: `Gov-${randomId("cmp")}`,
        description: "gov",
        status: "DRAFT",
        workflowStage: "CENTER_REVIEW",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 60 * 60 * 1000),
        hierarchyNodeId: node.id,
        levelId: level.id,
        createdByUserId: login.body.data.user.id
      },
      select: { id: true }
    });

    const response = await http
      .post(`/api/competitions/${competition.id}/enrollments`)
      .set(authHeader(token))
      .send({ studentId: student.id, competitionFeeAmount: 25 });

    expect(response.statusCode).toBe(201);
    expect(response.body?.success).toBe(true);

    await prisma.competitionEnrollment.deleteMany({ where: { competitionId: competition.id } });
    await prisma.financialTransaction.deleteMany({ where: { studentId: student.id, tenantId: tenant.id } });
    await prisma.student.delete({ where: { id: student.id } });
    await prisma.competition.delete({ where: { id: competition.id } });
  });

  test("SUPERADMIN can renew subscription", async () => {
    const login = await loginAs({ username: "SA001" });
    expect(login.statusCode).toBe(200);

    const token = login.body.data.access_token;

    const partner = await prisma.businessPartner.findFirst({
      where: { tenantId: "tenant_default" },
      select: { id: true }
    });
    expect(partner).toBeTruthy();

    const response = await http
      .patch(`/api/business-partners/${partner.id}/renew`)
      .set(authHeader(token))
      .send({ extendDays: 10 });

    expect(response.statusCode).toBe(200);
    expect(response.body?.success).toBe(true);
  });

  test("SUPERADMIN can view cross-tenant revenue (no tenantId aggregates all)", async () => {
    const login = await loginAs({ username: "SA001" });
    expect(login.statusCode).toBe(200);

    const token = login.body.data.access_token;

    const tenantDefault = await prisma.tenant.findUnique({ where: { code: "DEFAULT" } });
    expect(tenantDefault).toBeTruthy();

    const tenant2Code = `T${Date.now()}`;
    const tenant2 = await prisma.tenant.create({
      data: {
        name: `Tenant ${tenant2Code}`,
        code: tenant2Code
      }
    });

    const node2 = await prisma.hierarchyNode.create({
      data: {
        tenantId: tenant2.id,
        name: "T2 Node",
        code: randomId("NODE"),
        type: "SCHOOL"
      },
      select: { id: true }
    });

    const nodeDefault = await prisma.hierarchyNode.create({
      data: {
        tenantId: tenantDefault.id,
        name: "T1 Node",
        code: randomId("NODE"),
        type: "SCHOOL"
      },
      select: { id: true }
    });

    const actor2 = await ensureAuthUser({
      tenantCode: tenant2Code,
      role: "BP",
      email: `${tenant2Code.toLowerCase()}_bp@internal.local`,
      username: `BP_${tenant2Code}`,
      hierarchyNodeCode: null
    });

    const actorDefault = await prisma.authUser.findFirst({
      where: { tenantId: tenantDefault.id, role: "SUPERADMIN" },
      select: { id: true }
    });
    expect(actorDefault).toBeTruthy();

    const createdAt = new Date(Date.UTC(2099, 0, 15, 12, 0, 0));

    const txDefault = await prisma.financialTransaction.create({
      data: {
        tenantId: tenantDefault.id,
        businessPartnerId: null,
        studentId: null,
        centerId: nodeDefault.id,
        franchiseId: null,
        type: "ADJUSTMENT",
        grossAmount: "10.00",
        centerShare: "0.00",
        franchiseShare: "0.00",
        bpShare: "0.00",
        platformShare: "10.00",
        createdByUserId: actorDefault.id,
        createdAt
      },
      select: { id: true }
    });

    const txTenant2 = await prisma.financialTransaction.create({
      data: {
        tenantId: tenant2.id,
        businessPartnerId: null,
        studentId: null,
        centerId: node2.id,
        franchiseId: null,
        type: "ADJUSTMENT",
        grossAmount: "123.45",
        centerShare: "0.00",
        franchiseShare: "0.00",
        bpShare: "0.00",
        platformShare: "123.45",
        createdByUserId: actor2.id,
        createdAt
      },
      select: { id: true }
    });

    const responseAll = await http
      .get("/api/reports/revenue/summary?from=2099-01-01&to=2099-01-31")
      .set(authHeader(token));

    expect(responseAll.statusCode).toBe(200);
    expect(responseAll.body?.success).toBe(true);
    expect(responseAll.body?.data?.totalGrossAmount).toBeCloseTo(133.45, 2);

    await prisma.financialTransaction.deleteMany({
      where: { id: { in: [txDefault.id, txTenant2.id] } }
    });
    await prisma.authUser.delete({ where: { id: actor2.id } });
    await prisma.hierarchyNode.delete({ where: { id: node2.id } });
    await prisma.hierarchyNode.delete({ where: { id: nodeDefault.id } });
    await prisma.tenant.delete({ where: { id: tenant2.id } });
  });
});
