import { authHeader, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";

describe("BUSINESS PARTNER ONBOARDING", () => {
  let superadminToken;
  let tenant;
  let region;

  beforeAll(async () => {
    const superadminLogin = await loginAs({ email: "superadmin@abacusweb.local" });
    superadminToken = superadminLogin.body.data.access_token;

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    region = await prisma.hierarchyNode.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: "IN-NORTH"
        }
      }
    });
  });

  test("onboarding is transactional (auth user create failure rolls back partner)", async () => {
    const code = `BP-TX-${randomId("bp")}`;

    // contactEmail duplicates seed BP user email, forcing authUser unique constraint failure.
    const response = await http
      .post("/api/business-partners")
      .set(authHeader(superadminToken))
      .send({
        name: "Tx Partner",
        code,
        contactEmail: "bp.manager@abacusweb.local",
        hierarchyNodeId: region.id,
        adminPassword: "Pass@123",
        trialDays: 30,
        centerSharePercent: 0,
        franchiseSharePercent: 0,
        bpSharePercent: 0,
        platformSharePercent: 100
      });

    expect(response.status).toBe(409);

    const partner = await prisma.businessPartner.findFirst({
      where: {
        tenantId: tenant.id,
        code
      },
      select: { id: true }
    });

    expect(partner).toBeNull();
  });

  test("onboarding creates partner with ACTIVE trial expiry and admin user", async () => {
    const code = `BP-OK-${randomId("bp")}`;
    const email = `${randomId("bp")}.partner@pilot.local`;

    const response = await http
      .post("/api/business-partners")
      .set(authHeader(superadminToken))
      .send({
        name: "Pilot Partner",
        code,
        contactEmail: email,
        hierarchyNodeId: region.id,
        adminPassword: "Pass@123",
        trialDays: 30,
        centerSharePercent: 10,
        franchiseSharePercent: 0,
        bpSharePercent: 20,
        platformSharePercent: 70
      });

    expect(response.status).toBe(201);

    const createdPartnerId = response.body.data.businessPartner.id;
    const createdAdminUsername = response.body.data.adminUser.username;

    const partner = await prisma.businessPartner.findUniqueOrThrow({ where: { id: createdPartnerId } });
    expect(partner.subscriptionStatus).toBe("ACTIVE");
    expect(partner.subscriptionExpiresAt).toBeTruthy();

    const adminUser = await prisma.authUser.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        email
      },
      select: {
        username: true,
        role: true
      }
    });

    expect(adminUser.role).toBe("BP");
    expect(adminUser.username).toBe(createdAdminUsername);
  });
});
