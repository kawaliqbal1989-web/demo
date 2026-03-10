import { authHeader, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";

describe("REVENUE SPLIT VALIDATION", () => {
  let superadminToken;
  let centerToken;
  let tenant;
  let school;
  let level1;
  let partner;

  beforeAll(async () => {
    const [saLogin, centerLogin] = await Promise.all([
      loginAs({ email: "superadmin@abacusweb.local" }),
      loginAs({ email: "center.manager@abacusweb.local" })
    ]);

    superadminToken = saLogin.body.data.access_token;
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
    level1 = await prisma.level.findFirstOrThrow({ where: { tenantId: tenant.id, rank: 1 } });

    partner = await prisma.businessPartner.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        code: "BP-001"
      }
    });
  });

  test("invalid split (sum != 100) is rejected", async () => {
    const response = await http
      .post("/api/business-partners")
      .set(authHeader(superadminToken))
      .send({
        name: `Split ${randomId("bp")}`,
        code: `BP-SPL-${randomId("bp")}`,
        contactEmail: `${randomId("bp")}@split.local`,
        hierarchyNodeId: school.id,
        adminPassword: "Pass@123",
        centerSharePercent: 10,
        franchiseSharePercent: 10,
        bpSharePercent: 10,
        platformSharePercent: 10
      });

    expect(response.status).toBe(400);
    expect(response.body.error_code).toBe("REVENUE_SPLIT_SUM_INVALID");
  });

  test("ledger applies configured split percents on new enrollment transaction", async () => {
    await prisma.businessPartner.update({
      where: { id: partner.id },
      data: {
        centerSharePercent: 10,
        franchiseSharePercent: 0,
        bpSharePercent: 20,
        platformSharePercent: 70
      }
    });

    const admissionNo = `ADM-${randomId("split")}`;

    const createResponse = await http
      .post("/api/students")
      .set(authHeader(centerToken))
      .send({
        admissionNo,
        firstName: "Split",
        lastName: "Student",
        email: null,
        hierarchyNodeId: school.id,
        levelId: level1.id,
        enrollmentFeeAmount: 100
      });

    expect(createResponse.status).toBe(201);

    const studentId = createResponse.body.data.id;

    const rows = await prisma.financialTransaction.findMany({
      where: {
        tenantId: tenant.id,
        studentId,
        type: "ENROLLMENT"
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1
    });

    expect(rows.length).toBe(1);
    expect(Number(rows[0].grossAmount)).toBe(100);
    expect(Number(rows[0].centerShare)).toBe(10);
    expect(Number(rows[0].bpShare)).toBe(20);
    expect(Number(rows[0].platformShare)).toBe(70);
  });
});
