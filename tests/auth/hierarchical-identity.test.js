import { authHeader, ensureAuthUser, getHierarchyNodeByCode, getTenantByCode, http, loginAs, prisma } from "../helpers/test-helpers.js";

describe("AUTH: hierarchical identity", () => {
  test("Parent can reset child password", async () => {
    const tenant = await getTenantByCode("DEFAULT");
    const school = await getHierarchyNodeByCode(tenant.id, "SCH-001");

    const parent = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: "identity.parent@abacusweb.local",
      username: "CE901",
      role: "CENTER",
      hierarchyNodeCode: "SCH-001"
    });

    const child = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: "identity.child@abacusweb.local",
      username: "TE901",
      role: "TEACHER",
      hierarchyNodeCode: "SCH-001",
      parentUserId: parent.id
    });

    await prisma.authUser.update({
      where: { id: child.id },
      data: { hierarchyNodeId: school.id, parentUserId: parent.id }
    });

    const parentLogin = await loginAs({ username: "CE901" });
    const token = parentLogin.body.data.access_token;

    const resetResponse = await http
      .post("/api/auth/reset-password")
      .set(authHeader(token))
      .send({
        targetUserId: child.id,
        newPassword: "NewPass@123",
        mustChangePassword: true
      });

    expect(resetResponse.status).toBe(200);

    const childLogin = await loginAs({
      username: "TE901",
      password: "NewPass@123"
    });

    expect(childLogin.status).toBe(200);
    expect(childLogin.body.data.user.must_change_password).toBe(true);
  });

  test("Child cannot reset parent password", async () => {
    const childLogin = await loginAs({ username: "TE901", password: "NewPass@123" });
    const token = childLogin.body.data.access_token;

    const parent = await prisma.authUser.findFirstOrThrow({
      where: {
        tenantId: "tenant_default",
        username: "CE901"
      },
      select: { id: true }
    });

    const response = await http
      .post("/api/auth/reset-password")
      .set(authHeader(token))
      .send({
        targetUserId: parent.id,
        newPassword: "Another@123"
      });

    expect(response.status).toBe(403);
    expect(response.body.error_code).toBe("RESET_PARENT_RULE_FORBIDDEN");
  });

  test("Account locks after 5 failed attempts", async () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const response = await loginAs({ username: "CE001", password: "wrong-password" });
      expect(response.status).toBe(401);
      expect(response.body.error_code).toBe("INVALID_CREDENTIALS");
    }

    const lockResponse = await loginAs({ username: "CE001", password: "wrong-password" });
    expect(lockResponse.status).toBe(423);
    expect(lockResponse.body.error_code).toBe("ACCOUNT_LOCKED");

    const user = await prisma.authUser.findFirstOrThrow({
      where: {
        tenantId: "tenant_default",
        username: "CE001"
      },
      select: { lockUntil: true }
    });

    expect(user.lockUntil).toBeTruthy();

    await prisma.authUser.update({
      where: {
        tenantId_email: {
          tenantId: "tenant_default",
          email: "center.manager@abacusweb.local"
        }
      },
      data: {
        lockUntil: new Date(Date.now() - 1000),
        failedAttempts: 0
      }
    });
  });

  test("mustChangePassword blocks API until changed", async () => {
    await prisma.authUser.update({
      where: {
        tenantId_email: {
          tenantId: "tenant_default",
          email: "center.manager@abacusweb.local"
        }
      },
      data: {
        mustChangePassword: true,
        lockUntil: null,
        failedAttempts: 0,
        passwordHash: (await prisma.authUser.findFirstOrThrow({
          where: {
            tenantId: "tenant_default",
            username: "CE001"
          },
          select: { passwordHash: true }
        })).passwordHash
      }
    });

    const login = await loginAs({ username: "CE001", password: "Pass@123" });
    expect(login.status).toBe(200);

    const token = login.body.data.access_token;

    const blocked = await http
      .get("/api/students")
      .set(authHeader(token));

    expect(blocked.status).toBe(403);
    expect(blocked.body.error_code).toBe("MUST_CHANGE_PASSWORD");

    const changed = await http
      .post("/api/auth/change-password")
      .set(authHeader(token))
      .send({
        currentPassword: "Pass@123",
        newPassword: "Pass@123"
      });

    expect(changed.status).toBe(200);

    const relogin = await loginAs({ username: "CE001", password: "Pass@123" });
    const nextToken = relogin.body.data.access_token;

    const ok = await http
      .get("/api/students")
      .set(authHeader(nextToken));

    expect(ok.status).toBe(200);
  });
});
