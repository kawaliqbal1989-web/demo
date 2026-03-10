import { authHeader, http, loginAs, prisma } from "../helpers/test-helpers.js";

describe("SUBSCRIPTION RENEWAL", () => {
  let superadminToken;
  let tenant;
  let partner;

  beforeAll(async () => {
    const login = await loginAs({ email: "superadmin@abacusweb.local" });
    superadminToken = login.body.data.access_token;

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    partner = await prisma.businessPartner.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        code: "BP-001"
      }
    });
  });

  test("renew extends subscriptionExpiresAt and logs audit", async () => {
    const base = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    await prisma.businessPartner.update({
      where: { id: partner.id },
      data: {
        subscriptionStatus: "EXPIRED",
        subscriptionExpiresAt: base
      }
    });

    const response = await http
      .patch(`/api/business-partners/${partner.id}/renew`)
      .set(authHeader(superadminToken))
      .send({ extendDays: 10 });

    expect(response.status).toBe(200);
    expect(response.body.data.subscriptionStatus).toBe("ACTIVE");
    expect(new Date(response.body.data.subscriptionExpiresAt).getTime()).toBeGreaterThan(Date.now());

    const audit = await prisma.auditLog.findFirst({
      where: {
        tenantId: tenant.id,
        action: "SUBSCRIPTION_RENEWAL",
        entityId: partner.id
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    expect(audit).toBeTruthy();
  });
});
