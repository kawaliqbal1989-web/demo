import { authHeader, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";

describe("SUBSCRIPTION ENFORCEMENT", () => {
  let bpToken;
  let superadminToken;
  let tenant;
  let school;
  let level1;
  let bpPartner;

  beforeAll(async () => {
    const [bpLogin, superadminLogin] = await Promise.all([
      loginAs({ email: "bp.manager@abacusweb.local" }),
      loginAs({ email: "superadmin@abacusweb.local" })
    ]);

    bpToken = bpLogin.body.data.access_token;
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

    bpPartner = await prisma.businessPartner.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        contactEmail: "bp.manager@abacusweb.local"
      }
    });
  });

  afterEach(async () => {
    // Reset to active after each test.
    await prisma.businessPartner.update({
      where: { id: bpPartner.id },
      data: {
        subscriptionStatus: "ACTIVE",
        subscriptionExpiresAt: null,
        gracePeriodUntil: null
      }
    });
  });

  test("expired BP cannot create student", async () => {
    const now = Date.now();

    await prisma.businessPartner.update({
      where: { id: bpPartner.id },
      data: {
        subscriptionStatus: "ACTIVE",
        subscriptionExpiresAt: new Date(now - 60 * 60 * 1000),
        gracePeriodUntil: new Date(now - 30 * 60 * 1000)
      }
    });

    const admissionNo = `ADM-${randomId("sub_expired")}`;

    const response = await http
      .post("/api/students")
      .set(authHeader(bpToken))
      .send({
        admissionNo,
        firstName: "Expired",
        lastName: "BP",
        email: null,
        hierarchyNodeId: school.id,
        levelId: level1.id
      });

    expect(response.status).toBe(402);
    expect(response.body.error_code).toBe("SUBSCRIPTION_EXPIRED");
  });

  test("expired BP cannot enroll competition", async () => {
    const now = Date.now();

    await prisma.businessPartner.update({
      where: { id: bpPartner.id },
      data: {
        subscriptionStatus: "ACTIVE",
        subscriptionExpiresAt: new Date(now - 60 * 60 * 1000),
        gracePeriodUntil: new Date(now - 30 * 60 * 1000)
      }
    });

    const superadmin = await prisma.authUser.findFirstOrThrow({
      where: { tenantId: tenant.id, email: "superadmin@abacusweb.local" }
    });

    const student = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `ADM-${randomId("sub_comp_student")}`,
        firstName: "Comp",
        lastName: "Student",
        email: null,
        hierarchyNodeId: school.id,
        levelId: level1.id
      }
    });

    const competition = await prisma.competition.create({
      data: {
        tenantId: tenant.id,
        title: `Comp ${randomId("sub_comp")}`,
        description: "subscription comp",
        status: "DRAFT",
        workflowStage: "CENTER_REVIEW",
        startsAt: new Date(Date.now() + 3600 * 1000),
        endsAt: new Date(Date.now() + 7200 * 1000),
        hierarchyNodeId: school.id,
        levelId: level1.id,
        createdByUserId: superadmin.id
      }
    });

    const response = await http
      .post(`/api/competitions/${competition.id}/enrollments`)
      .set(authHeader(bpToken))
      .send({ studentId: student.id });

    expect(response.status).toBe(402);
    expect(response.body.error_code).toBe("SUBSCRIPTION_EXPIRED");
  });

  test("SUPERADMIN can override and write even when BP expired", async () => {
    const now = Date.now();

    await prisma.businessPartner.update({
      where: { id: bpPartner.id },
      data: {
        subscriptionStatus: "EXPIRED",
        subscriptionExpiresAt: new Date(now - 24 * 60 * 60 * 1000),
        gracePeriodUntil: new Date(now - 23 * 60 * 60 * 1000)
      }
    });

    const superadmin = await prisma.authUser.findFirstOrThrow({
      where: { tenantId: tenant.id, email: "superadmin@abacusweb.local" }
    });

    const student = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `ADM-${randomId("sub_sa_student")}`,
        firstName: "Super",
        lastName: "Admin",
        email: null,
        hierarchyNodeId: school.id,
        levelId: level1.id
      }
    });

    const competition = await prisma.competition.create({
      data: {
        tenantId: tenant.id,
        title: `Comp ${randomId("sub_sa_comp")}`,
        description: "subscription override comp",
        status: "DRAFT",
        workflowStage: "CENTER_REVIEW",
        startsAt: new Date(Date.now() + 3600 * 1000),
        endsAt: new Date(Date.now() + 7200 * 1000),
        hierarchyNodeId: school.id,
        levelId: level1.id,
        createdByUserId: superadmin.id
      }
    });

    const response = await http
      .post(`/api/competitions/${competition.id}/enrollments`)
      .set(authHeader(superadminToken))
      .send({ studentId: student.id });

    expect(response.status).toBe(201);
  });

  test("grace period respected (writes allowed before grace end)", async () => {
    const now = Date.now();

    await prisma.businessPartner.update({
      where: { id: bpPartner.id },
      data: {
        subscriptionStatus: "ACTIVE",
        subscriptionExpiresAt: new Date(now - 60 * 60 * 1000),
        gracePeriodUntil: new Date(now + 60 * 60 * 1000)
      }
    });

    const admissionNo = `ADM-${randomId("sub_grace")}`;

    const response = await http
      .post("/api/students")
      .set(authHeader(bpToken))
      .send({
        admissionNo,
        firstName: "Grace",
        lastName: "Allowed",
        email: null,
        hierarchyNodeId: school.id,
        levelId: level1.id
      });

    expect(response.status).toBe(201);

    const refreshed = await prisma.businessPartner.findUniqueOrThrow({ where: { id: bpPartner.id } });
    expect(refreshed.subscriptionStatus).toBe("EXPIRED");
  });
});
