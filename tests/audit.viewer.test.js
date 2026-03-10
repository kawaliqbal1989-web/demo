import { authHeader, ensureAuthUser, http, loginAs, prisma, randomId } from "./helpers/test-helpers.js";

describe("Audit viewer (SUPERADMIN)", () => {
  test("Non-superadmin gets 403", async () => {
    const tenant = await prisma.tenant.findUnique({ where: { code: "DEFAULT" } });
    expect(tenant).toBeTruthy();

    const node = await prisma.hierarchyNode.findFirst({ where: { tenantId: tenant.id }, select: { id: true } });
    expect(node).toBeTruthy();

    const bpUser = await ensureAuthUser({
      tenantCode: "DEFAULT",
      role: "BP",
      email: `bp_${randomId()}@internal.local`,
      username: `BP_${Date.now()}`,
      hierarchyNodeCode: null,
      parentUserId: null
    });

    // Make a partner so subscription middleware can resolve cleanly, even though this is a GET.
    await prisma.businessPartner.create({
      data: {
        tenantId: tenant.id,
        name: "BP Test",
        code: randomId("BP"),
        contactEmail: bpUser.email,
        hierarchyNodeId: node.id,
        subscriptionStatus: "ACTIVE",
        subscriptionExpiresAt: null,
        gracePeriodUntil: null,
        centerSharePercent: 0,
        franchiseSharePercent: 0,
        bpSharePercent: 0,
        platformSharePercent: 100,
        createdByUserId: bpUser.id
      }
    });

    const login = await loginAs({ username: bpUser.username });
    expect(login.statusCode).toBe(200);

    const token = login.body.data.access_token;

    const response = await http.get("/api/audit-logs").set(authHeader(token));

    expect(response.statusCode).toBe(403);
    expect(response.body?.error_code).toBe("ROLE_FORBIDDEN");
  });

  test("SUPERADMIN can fetch logs cross-tenant with deterministic ordering", async () => {
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

    const t1User = await prisma.authUser.findFirst({
      where: { tenantId: tenantDefault.id, role: "SUPERADMIN" },
      select: { id: true, role: true }
    });
    expect(t1User).toBeTruthy();

    const t2User = await ensureAuthUser({
      tenantCode: tenant2Code,
      role: "SUPERADMIN",
      email: `${tenant2Code.toLowerCase()}_sa@internal.local`,
      username: `SA_${tenant2Code}`,
      hierarchyNodeCode: null
    });

    const createdOld = new Date(Date.UTC(2099, 0, 1, 0, 0, 0));
    const createdNew = new Date(Date.UTC(2099, 0, 2, 0, 0, 0));

    const log1 = await prisma.auditLog.create({
      data: {
        tenantId: tenantDefault.id,
        userId: t1User.id,
        role: "SUPERADMIN",
        action: "T1_ACTION",
        entityType: "TEST",
        entityId: "t1",
        metadata: { ok: true }
      },
      select: { id: true }
    });

    const log2 = await prisma.auditLog.create({
      data: {
        tenantId: tenant2.id,
        userId: t2User.id,
        role: "SUPERADMIN",
        action: "T2_ACTION",
        entityType: "TEST",
        entityId: "t2",
        metadata: { ok: true },
        createdAt: createdNew
      },
      select: { id: true }
    });

    // Adjust createdAt for deterministic ordering validation
    await prisma.auditLog.update({ where: { id: log1.id }, data: { createdAt: createdOld } });

    const response = await http
      .get("/api/audit-logs?from=2099-01-01&to=2099-01-31&limit=20&offset=0")
      .set(authHeader(token));

    expect(response.statusCode).toBe(200);
    expect(response.body?.success).toBe(true);
    expect(response.body?.data?.total).toBeGreaterThanOrEqual(2);

    const items = response.body.data.items;
    const firstMatch = items.find((i) => i.id === log2.id);
    expect(firstMatch).toBeTruthy();

    // Ensure newer createdAt appears before older
    const indexNew = items.findIndex((i) => i.id === log2.id);
    const indexOld = items.findIndex((i) => i.id === log1.id);
    expect(indexNew).toBeGreaterThanOrEqual(0);
    expect(indexOld).toBeGreaterThanOrEqual(0);
    expect(indexNew).toBeLessThan(indexOld);

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { id: { in: [log1.id, log2.id] } } });
    await prisma.authUser.delete({ where: { id: t2User.id } });
    await prisma.tenant.delete({ where: { id: tenant2.id } });
  });

  test("Pagination enforced (max 100) and filters work", async () => {
    const login = await loginAs({ username: "SA001" });
    expect(login.statusCode).toBe(200);

    const token = login.body.data.access_token;
    const tenantDefault = await prisma.tenant.findUnique({ where: { code: "DEFAULT" } });

    const actor = await prisma.authUser.findFirst({
      where: { tenantId: tenantDefault.id, role: "SUPERADMIN" },
      select: { id: true }
    });

    const createdAt = new Date(Date.UTC(2099, 1, 10, 0, 0, 0));

    const logs = await Promise.all(
      [
        { action: "FILTER_ME", role: "SUPERADMIN", userId: actor.id },
        { action: "FILTER_ME", role: "SUPERADMIN", userId: actor.id },
        { action: "OTHER", role: "SUPERADMIN", userId: actor.id }
      ].map((item) =>
        prisma.auditLog.create({
          data: {
            tenantId: tenantDefault.id,
            userId: item.userId,
            role: item.role,
            action: item.action,
            entityType: "TEST",
            entityId: randomId("e"),
            metadata: { password: "should_redact" },
            createdAt
          },
          select: { id: true }
        })
      )
    );

    // limit should be capped to 100 by parsePagination; request 999 to ensure no crash and limit in response <= 100.
    const response = await http
      .get("/api/audit-logs?limit=999&offset=0&action=FILTER_ME&from=2099-02-10&to=2099-02-10")
      .set(authHeader(token));

    expect(response.statusCode).toBe(200);
    expect(response.body?.success).toBe(true);
    expect(response.body?.data?.limit).toBeLessThanOrEqual(100);

    const items = response.body.data.items;
    expect(items.length).toBe(2);
    expect(items.every((i) => i.action === "FILTER_ME")).toBe(true);

    // Redaction check
    expect(items[0].metadata.password).toBe("[REDACTED]");

    await prisma.auditLog.deleteMany({ where: { id: { in: logs.map((l) => l.id) } } });
  });
});
