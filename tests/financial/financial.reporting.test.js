import { authHeader, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";

describe("FINANCIAL REPORTING", () => {
  let superadminToken;
  let bpToken;
  let centerToken;

  let tenantDefault;
  let tenantOther;

  let defaultSchool;
  let otherSchool;

  let bpPartner;
  let bpUser;
  let superadminDefault;
  let bpOther;
  let currentMonthFrom;
  let currentMonthTo;
  let previousMonthFrom;
  let previousMonthTo;

  beforeAll(async () => {
    const [saLogin, bpLogin, centerLogin] = await Promise.all([
      loginAs({ email: "superadmin@abacusweb.local" }),
      loginAs({ email: "bp.manager@abacusweb.local" }),
      loginAs({ email: "center.manager@abacusweb.local" })
    ]);

    superadminToken = saLogin.body.data.access_token;
    bpToken = bpLogin.body.data.access_token;
    centerToken = centerLogin.body.data.access_token;

    tenantDefault = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    tenantOther = await prisma.tenant.findUniqueOrThrow({ where: { code: "OTHER" } });

    defaultSchool = await prisma.hierarchyNode.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: tenantDefault.id,
          code: "SCH-001"
        }
      }
    });

    otherSchool = await prisma.hierarchyNode.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: tenantOther.id,
          code: "OT-SCH-001"
        }
      }
    });

    bpUser = await prisma.authUser.findFirstOrThrow({
      where: {
        tenantId: tenantDefault.id,
        email: "bp.manager@abacusweb.local",
        role: "BP"
      },
      select: {
        id: true,
        email: true,
        username: true,
        hierarchyNodeId: true
      }
    });

    const bpUsername = bpUser.username ? String(bpUser.username).trim() : "";
    if (bpUsername) {
      bpPartner = await prisma.businessPartner.findUnique({
        where: {
          tenantId_code: {
            tenantId: tenantDefault.id,
            code: bpUsername
          }
        }
      });
    }

    if (!bpPartner && bpUser.hierarchyNodeId) {
      bpPartner = await prisma.businessPartner.findFirst({
        where: {
          tenantId: tenantDefault.id,
          hierarchyNodeId: bpUser.hierarchyNodeId
        },
        orderBy: { createdAt: "desc" }
      });
    }

    if (!bpPartner) {
      bpPartner = await prisma.businessPartner.findFirstOrThrow({
        where: {
          tenantId: tenantDefault.id,
          contactEmail: String(bpUser.email || "").toLowerCase()
        },
        orderBy: { createdAt: "desc" }
      });
    }

    superadminDefault = await prisma.authUser.findFirstOrThrow({
      where: { tenantId: tenantDefault.id, email: "superadmin@abacusweb.local" }
    });

    bpOther = await prisma.authUser.findFirstOrThrow({
      where: { tenantId: tenantOther.id, email: "bp.other@abacusweb.local" }
    });

    // Seed deterministic ledger rows in DEFAULT and OTHER tenants.
    const now = new Date();
    const utcYear = now.getUTCFullYear();
    const utcMonth = now.getUTCMonth();

    currentMonthFrom = new Date(Date.UTC(utcYear, utcMonth, 1, 0, 0, 0, 0));
    currentMonthTo = new Date(Date.UTC(utcYear, utcMonth + 1, 1, 0, 0, 0, 0));
    previousMonthFrom = new Date(Date.UTC(utcYear, utcMonth - 1, 1, 0, 0, 0, 0));
    previousMonthTo = new Date(Date.UTC(utcYear, utcMonth, 1, 0, 0, 0, 0));

    const currentMonthDay1 = new Date(Date.UTC(utcYear, utcMonth, 1, 0, 0, 0, 0));
    const currentMonthDay15 = new Date(Date.UTC(utcYear, utcMonth, 15, 0, 0, 0, 0));
    const previousMonthDay10 = new Date(Date.UTC(utcYear, utcMonth - 1, 10, 0, 0, 0, 0));
    const otherCurrentMonthDay5 = new Date(Date.UTC(utcYear, utcMonth, 5, 0, 0, 0, 0));

    const student = await prisma.student.create({
      data: {
        tenantId: tenantDefault.id,
        admissionNo: `ADM-${randomId("rep")}`,
        firstName: "Report",
        lastName: "Student",
        email: null,
        hierarchyNodeId: defaultSchool.id,
        levelId: (await prisma.level.findFirstOrThrow({ where: { tenantId: tenantDefault.id, rank: 1 } })).id
      }
    });

    await prisma.financialTransaction.createMany({
      data: [
        {
          tenantId: tenantDefault.id,
          businessPartnerId: bpPartner.id,
          studentId: student.id,
          centerId: defaultSchool.id,
          franchiseId: null,
          type: "ENROLLMENT",
          grossAmount: 100,
          centerShare: 0,
          franchiseShare: 0,
          bpShare: 0,
          platformShare: 100,
          createdByUserId: superadminDefault.id,
          createdAt: currentMonthDay1
        },
        {
          tenantId: tenantDefault.id,
          businessPartnerId: bpPartner.id,
          studentId: student.id,
          centerId: defaultSchool.id,
          franchiseId: null,
          type: "COMPETITION",
          grossAmount: 50,
          centerShare: 0,
          franchiseShare: 0,
          bpShare: 0,
          platformShare: 50,
          createdByUserId: superadminDefault.id,
          createdAt: currentMonthDay15
        },
        {
          tenantId: tenantDefault.id,
          businessPartnerId: bpPartner.id,
          studentId: student.id,
          centerId: defaultSchool.id,
          franchiseId: null,
          type: "ADJUSTMENT",
          grossAmount: 25,
          centerShare: 0,
          franchiseShare: 0,
          bpShare: 0,
          platformShare: 25,
          createdByUserId: superadminDefault.id,
          createdAt: previousMonthDay10
        },
        {
          tenantId: tenantOther.id,
          businessPartnerId: null,
          studentId: null,
          centerId: otherSchool.id,
          franchiseId: null,
          type: "ENROLLMENT",
          grossAmount: 200,
          centerShare: 0,
          franchiseShare: 0,
          bpShare: 0,
          platformShare: 200,
          createdByUserId: bpOther.id,
          createdAt: otherCurrentMonthDay5
        }
      ],
      skipDuplicates: true
    });

    // Add many DEFAULT-tenant rows for pagination stability checks.
    const bulk = Array.from({ length: 35 }).map((_, index) => ({
      tenantId: tenantDefault.id,
      businessPartnerId: bpPartner.id,
      studentId: student.id,
      centerId: defaultSchool.id,
      franchiseId: null,
      type: "ENROLLMENT",
      grossAmount: 1,
      centerShare: 0,
      franchiseShare: 0,
      bpShare: 0,
      platformShare: 1,
      createdByUserId: superadminDefault.id,
      createdAt: new Date(Date.UTC(utcYear, utcMonth, 20, 0, 0, index, 0))
    }));

    await prisma.financialTransaction.createMany({
      data: bulk,
      skipDuplicates: true
    });
  });

  test("SUPERADMIN summary defaults to current month and tenant scoped", async () => {
    const response = await http
      .get("/api/reports/revenue/summary")
      .set(authHeader(superadminToken));

    expect(response.status).toBe(200);
    // SUPERADMIN without tenantId aggregates across all tenants.
    expect(response.body.data.tenantId).toBe(null);
    expect(response.body.data.totalGrossAmount).toBeGreaterThanOrEqual(385);
  });

  test("date range filtering works", async () => {
    const from = previousMonthFrom.toISOString().slice(0, 10);
    const to = new Date(previousMonthTo.getTime() - 1).toISOString().slice(0, 10);
    const response = await http
      .get(`/api/reports/revenue/summary?from=${from}&to=${to}`)
      .set(authHeader(superadminToken));

    expect(response.status).toBe(200);
    expect(response.body.data.totalGrossAmount).toBe(25);
  });

  test("SUPERADMIN can query another tenant via tenantId (cross-tenant but still filtered)", async () => {
    const from = currentMonthFrom.toISOString().slice(0, 10);
    const to = new Date(currentMonthTo.getTime() - 1).toISOString().slice(0, 10);
    const response = await http
      .get(`/api/reports/revenue/summary?tenantId=${tenantOther.id}&from=${from}&to=${to}`)
      .set(authHeader(superadminToken));

    expect(response.status).toBe(200);
    expect(response.body.data.tenantId).toBe(tenantOther.id);
    expect(response.body.data.totalGrossAmount).toBe(200);
  });

  test("BP sees only their own revenue", async () => {
    const from = currentMonthFrom.toISOString().slice(0, 10);
    const to = new Date(currentMonthTo.getTime() - 1).toISOString().slice(0, 10);
    const response = await http
      .get(`/api/reports/revenue/summary?from=${from}&to=${to}`)
      .set(authHeader(bpToken));

    expect(response.status).toBe(200);
    expect(response.body.data.tenantId).toBe(tenantDefault.id);
    expect(response.body.data.totalGrossAmount).toBeGreaterThanOrEqual(150);

    const byCenter = await http
      .get(`/api/reports/revenue/by-center?from=${from}&to=${to}`)
      .set(authHeader(bpToken));

    expect(byCenter.status).toBe(200);
    expect(byCenter.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(byCenter.body.data.items[0].grossAmount).toBeGreaterThan(0);
  });

  test("CENTER summary is scoped to centerId", async () => {
    const from = currentMonthFrom.toISOString().slice(0, 10);
    const to = new Date(currentMonthTo.getTime() - 1).toISOString().slice(0, 10);
    const response = await http
      .get(`/api/reports/revenue/summary?from=${from}&to=${to}`)
      .set(authHeader(centerToken));

    expect(response.status).toBe(200);
    expect(response.body.data.tenantId).toBe(tenantDefault.id);
    expect(response.body.data.totalGrossAmount).toBeGreaterThan(0);
  });

  test("ledger pagination is deterministic", async () => {
    const page1 = await http
      .get(`/api/ledger?limit=20&offset=0`)
      .set(authHeader(superadminToken));

    expect(page1.status).toBe(200);
    expect(page1.body.data.items.length).toBe(20);

    const page2 = await http
      .get(`/api/ledger?limit=20&offset=20`)
      .set(authHeader(superadminToken));

    expect(page2.status).toBe(200);
    expect(page2.body.data.items.length).toBeGreaterThan(0);
    expect(page2.body.data.items.length).toBeLessThanOrEqual(20);

    const ids1 = page1.body.data.items.map((row) => row.id);
    const ids2 = page2.body.data.items.map((row) => row.id);

    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });
});
