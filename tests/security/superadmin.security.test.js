import crypto from "crypto";
import jwt from "jsonwebtoken";
import {
  authHeader,
  ensureAuthUser,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";

const createdTenantIds = new Set();
const createdAuthUserIds = new Set();
const createdSuperadminIds = new Set();

function trackAuthUser(userId) {
  if (userId) {
    createdAuthUserIds.add(userId);
  }
}

function trackSuperadmin(superadminId) {
  if (superadminId) {
    createdSuperadminIds.add(superadminId);
  }
}

async function signRefreshToken(userId, overrides = {}) {
  const user = await prisma.authUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      tenantId: true,
      hierarchyNodeId: true,
      studentId: true
    }
  });

  if (!user) {
    throw new Error(`Cannot sign refresh token. User not found: ${userId}`);
  }

  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      tenantId: user.tenantId,
      hierarchyNodeId: user.hierarchyNodeId,
      studentId: user.studentId,
      tokenId: overrides.tokenId || crypto.randomUUID(),
      tokenType: "refresh"
    },
    process.env.JWT_REFRESH_SECRET,
    {
      algorithm: "HS256",
      issuer: overrides.issuer || process.env.JWT_ISSUER,
      audience: overrides.audience || process.env.JWT_AUDIENCE,
      expiresIn: overrides.expiresIn || "7d"
    }
  );
}

function signAccessToken(role, tenantId, overrides = {}) {
  return jwt.sign(
    {
      userId: overrides.userId || `sec-${randomId("actor")}`,
      role,
      tenantId,
      hierarchyNodeId: overrides.hierarchyNodeId || null,
      studentId: overrides.studentId || null,
      ...(overrides.tokenType ? { tokenType: overrides.tokenType } : {})
    },
    process.env.JWT_ACCESS_SECRET,
    {
      algorithm: "HS256",
      issuer: overrides.issuer || process.env.JWT_ISSUER,
      audience: overrides.audience || process.env.JWT_AUDIENCE,
      expiresIn: overrides.expiresIn || "20m"
    }
  );
}

async function createRoleUser({ role, hierarchyNodeCode }) {
  const email = `sec_${role.toLowerCase()}_${randomId("u")}@abacusweb.local`;
  const user = await ensureAuthUser({
    tenantCode: "DEFAULT",
    email,
    role,
    hierarchyNodeCode
  });
  trackAuthUser(user.id);

  const loginResponse = await loginAs({ email });
  expect(loginResponse.status).toBe(200);

  return {
    user,
    email,
    token: loginResponse.body.data.access_token
  };
}

async function createIsolatedTenantWithSingleSuperadmin() {
  const code = `SEC_TENANT_${randomId("t")}`.toUpperCase();

  const created = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: `Security Tenant ${code}`,
        code
      }
    });

    const country = await tx.hierarchyNode.create({
      data: {
        tenantId: tenant.id,
        name: `Sec Country ${code}`,
        code: `${code}_COUNTRY`,
        type: "COUNTRY"
      }
    });

    const level = await tx.level.create({
      data: {
        tenantId: tenant.id,
        name: `Sec Level ${code}`,
        rank: 1
      }
    });

    const authUser = await tx.authUser.create({
      data: {
        tenantId: tenant.id,
        username: `SA${Math.floor(Math.random() * 999).toString().padStart(3, "0")}`,
        email: `sec_only_superadmin_${randomId("sa")}@abacusweb.local`,
        passwordHash: "not-used-here",
        role: "SUPERADMIN",
        hierarchyNodeId: country.id,
        isActive: true
      }
    });

    const actorUser = await tx.authUser.create({
      data: {
        tenantId: tenant.id,
        username: `BP${Math.floor(Math.random() * 999).toString().padStart(3, "0")}`,
        email: `sec_actor_${randomId("bp")}@abacusweb.local`,
        passwordHash: "not-used-here",
        role: "BP",
        hierarchyNodeId: country.id,
        isActive: true
      }
    });

    const superadmin = await tx.superadmin.create({
      data: {
        tenantId: tenant.id,
        authUserId: authUser.id,
        email: authUser.email,
        fullName: "Only Superadmin"
      }
    });

    await tx.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `SEC-ADM-${randomId("st")}`,
        firstName: "Sec",
        lastName: "Student",
        email: `sec_student_${randomId("st")}@abacusweb.local`,
        hierarchyNodeId: country.id,
        levelId: level.id
      }
    });

    return { tenant, authUser, superadmin, actorUser };
  });

  createdTenantIds.add(created.tenant.id);
  trackAuthUser(created.authUser.id);
  trackAuthUser(created.actorUser.id);
  trackSuperadmin(created.superadmin.id);

  return created;
}

async function createTenantWithStudentForIsolation() {
  const code = `SEC_ISO_${randomId("t")}`.toUpperCase();

  const created = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: `Isolation Tenant ${code}`,
        code
      }
    });

    const node = await tx.hierarchyNode.create({
      data: {
        tenantId: tenant.id,
        name: `Isolation Node ${code}`,
        code: `${code}_NODE`,
        type: "SCHOOL"
      }
    });

    const level = await tx.level.create({
      data: {
        tenantId: tenant.id,
        name: `Isolation Level ${code}`,
        rank: 1
      }
    });

    const student = await tx.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `ISO-ADM-${randomId("s")}`,
        firstName: "Iso",
        lastName: "Target",
        email: `iso_target_${randomId("s")}@abacusweb.local`,
        hierarchyNodeId: node.id,
        levelId: level.id
      }
    });

    return { tenant, student };
  });

  createdTenantIds.add(created.tenant.id);
  return created;
}

async function cleanupCreatedData() {
  const tenantIds = Array.from(createdTenantIds);
  const authUserIds = Array.from(createdAuthUserIds);
  const superadminIds = Array.from(createdSuperadminIds);

  if (authUserIds.length || tenantIds.length || superadminIds.length) {
    await prisma.$transaction(async (tx) => {
      if (authUserIds.length) {
        await tx.notification.deleteMany({ where: { recipientUserId: { in: authUserIds } } });
        await tx.competition.deleteMany({ where: { createdByUserId: { in: authUserIds } } });
        await tx.worksheet.deleteMany({ where: { createdByUserId: { in: authUserIds } } });
        await tx.businessPartner.deleteMany({ where: { createdByUserId: { in: authUserIds } } });
        await tx.refreshToken.deleteMany({ where: { userId: { in: authUserIds } } });
        await tx.auditLog.deleteMany({ where: { userId: { in: authUserIds } } });
      }

      if (superadminIds.length) {
        await tx.superadmin.deleteMany({ where: { id: { in: superadminIds } } });
      }

      if (authUserIds.length) {
        await tx.authUser.deleteMany({ where: { id: { in: authUserIds } } });
      }

      if (tenantIds.length) {
        await tx.refreshToken.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.notification.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.abuseFlag.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.studentLevelCompletion.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.worksheetQuestion.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.worksheetSubmission.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.competitionWorksheet.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.competitionEnrollment.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.competition.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.worksheet.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.businessPartner.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.student.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.levelRule.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.level.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.superadmin.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.authUser.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.hierarchyNode.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      }
    });
  }

  createdTenantIds.clear();
  createdAuthUserIds.clear();
  createdSuperadminIds.clear();
}

afterEach(async () => {
  await cleanupCreatedData();
});

describe("SECURITY: SUPERADMIN regression suite", () => {
  describe("GOVERNANCE REALIGNMENT", () => {
    test("BP cannot mutate academic engine (create level)", async () => {
      const bp = await createRoleUser({ role: "BP", hierarchyNodeCode: "IN-NORTH" });

      const response = await http
        .post("/api/levels")
        .set(authHeader(bp.token))
        .send({
          name: `BP Level ${randomId("lvl")}`,
          rank: 999,
          description: "Should be blocked"
        });

      expect(response.status).toBe(403);
      expect(response.body.error_code).toBe("ROLE_FORBIDDEN");
    });

    test("SUPERADMIN can mutate operational flow (create student)", async () => {
      const superadminLogin = await loginAs({ email: "superadmin@abacusweb.local" });
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
      const hierarchyNode = await prisma.hierarchyNode.findFirstOrThrow({
        where: { tenantId: tenant.id, code: "SCH-001" }
      });
      const level = await prisma.level.findFirstOrThrow({
        where: { tenantId: tenant.id, rank: 1 }
      });

      const response = await http
        .post("/api/students")
        .set(authHeader(superadminLogin.body.data.access_token))
        .send({
          admissionNo: `SA-BLOCK-${randomId("adm")}`,
          firstName: "Blocked",
          lastName: "Student",
          email: `blocked_${randomId("sa")}@abacusweb.local`,
          hierarchyNodeId: hierarchyNode.id,
          levelId: level.id
        });

      expect(response.status).toBe(201);
      expect(response.body?.success).toBe(true);
    });

    test("Client cannot inject competition status on creation", async () => {
      const center = await createRoleUser({ role: "CENTER", hierarchyNodeCode: "SCH-001" });
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
      const level = await prisma.level.findFirstOrThrow({
        where: { tenantId: tenant.id, rank: 1 }
      });
      const node = await prisma.hierarchyNode.findFirstOrThrow({
        where: { tenantId: tenant.id, code: "SCH-001" }
      });

      const response = await http
        .post("/api/competitions")
        .set(authHeader(center.token))
        .send({
          title: `Status Injection ${randomId("cmp")}`,
          description: "Attempt to force ACTIVE",
          status: "ACTIVE",
          startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          endsAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          hierarchyNodeId: node.id,
          levelId: level.id
        });

      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe("DRAFT");
      expect(response.body.data.workflowStage).toBe("CENTER_REVIEW");
    });
  });

  describe("1) ROLE ESCALATION BLOCKING", () => {
    test("BP cannot create SUPERADMIN", async () => {
      const bp = await createRoleUser({ role: "BP", hierarchyNodeCode: "IN-NORTH" });

      const response = await http
        .post("/api/superadmins")
        .set(authHeader(bp.token))
        .send({
          email: `sec_escalate_${randomId("bp")}@abacusweb.local`,
          password: "Pass@123",
          fullName: "Blocked BP"
        });

      expect(response.status).toBe(403);
      expect(response.body.error_code).toBe("ROLE_FORBIDDEN");
    });

    test("FRANCHISE cannot mutate SUPERADMIN role", async () => {
      const franchise = await createRoleUser({ role: "FRANCHISE", hierarchyNodeCode: "IN-NORTH" });
      const superadminLogin = await loginAs({ email: "superadmin@abacusweb.local" });
      const superadminId = superadminLogin.body.data.user.id;

      const response = await http
        .patch(`/api/superadmins/${superadminId}/role`)
        .set(authHeader(franchise.token))
        .send({ role: "BP" });

      expect(response.status).toBe(403);
      expect(response.body.error_code).toBe("ROLE_FORBIDDEN");
    });

    test("CENTER cannot access analytics", async () => {
      const center = await createRoleUser({ role: "CENTER", hierarchyNodeCode: "SCH-001" });

      const response = await http
        .get("/api/admin/analytics/level-distribution")
        .set(authHeader(center.token));

      expect(response.status).toBe(403);
      expect(response.body.error_code).toBe("ROLE_FORBIDDEN");
    });

    test("TEACHER cannot create hierarchy", async () => {
      const teacher = await createRoleUser({ role: "TEACHER", hierarchyNodeCode: "SCH-001" });

      const response = await http
        .post("/api/hierarchy")
        .set(authHeader(teacher.token))
        .send({
          name: `Teacher Attempt ${randomId("h")}`,
          code: `T-H-${randomId("h")}`,
          type: "SCHOOL"
        });

      expect(response.status).toBe(403);
      expect(response.body.error_code).toBe("ROLE_FORBIDDEN");
    });

    test("SUPERADMIN cannot self-downgrade", async () => {
      const superadminLogin = await loginAs({ email: "superadmin@abacusweb.local" });
      const superadminId = superadminLogin.body.data.user.id;

      const response = await http
        .patch(`/api/superadmins/${superadminId}/role`)
        .set(authHeader(superadminLogin.body.data.access_token))
        .send({ role: "CENTER" });

      expect(response.status).toBe(403);
      expect(response.body.error_code).toBe("SELF_ROLE_MUTATION_FORBIDDEN");
    });
  });

  describe("2) LAST SUPERADMIN PROTECTION", () => {
    test("Attempt downgrade of only SUPERADMIN => 403 LAST_SUPERADMIN_PROTECTED", async () => {
      const { tenant, authUser, actorUser } = await createIsolatedTenantWithSingleSuperadmin();
      const actorToken = signAccessToken("SUPERADMIN", tenant.id, {
        userId: actorUser.id
      });

      const response = await http
        .patch(`/api/superadmins/${authUser.id}/role`)
        .set(authHeader(actorToken))
        .send({ role: "CENTER" });

      expect(response.status).toBe(403);
      expect(response.body.error_code).toBe("LAST_SUPERADMIN_PROTECTED");
    });

    test("Attempt deletion endpoint (if exists) must be forbidden", async () => {
      const superadminLogin = await loginAs({ email: "superadmin@abacusweb.local" });
      const superadminId = superadminLogin.body.data.user.id;

      const response = await http
        .delete(`/api/superadmins/${superadminId}`)
        .set(authHeader(superadminLogin.body.data.access_token));

      if (response.status === 404) {
        expect(response.status).toBe(404);
      } else {
        expect(response.status).toBe(403);
      }
    });
  });

  describe("3) REFRESH TOKEN REPLAY", () => {
    test("Reuse old refresh token after rotation => 401 REFRESH_TOKEN_REUSED", async () => {
      const loginResponse = await loginAs({ email: "superadmin@abacusweb.local" });
      expect(loginResponse.status).toBe(200);

      const oldRefreshToken = loginResponse.body.data.refresh_token;

      const firstRefresh = await http.post("/api/auth/refresh").send({
        refreshToken: oldRefreshToken
      });
      expect(firstRefresh.status).toBe(200);

      const replayAttempt = await http.post("/api/auth/refresh").send({
        refreshToken: oldRefreshToken
      });

      expect(replayAttempt.status).toBe(401);
      expect(replayAttempt.body.error_code).toBe("REFRESH_TOKEN_REUSED");
    });
  });

  describe("4) JWT CLAIM ENFORCEMENT", () => {
    test("Wrong audience => 401", async () => {
      const token = signAccessToken("SUPERADMIN", "tenant_default", {
        audience: "wrong-audience"
      });

      const response = await http
        .get("/api/students")
        .set(authHeader(token));

      expect(response.status).toBe(401);
      expect(response.body.error_code).toBe("INVALID_ACCESS_TOKEN");
    });

    test("Wrong issuer => 401", async () => {
      const token = signAccessToken("SUPERADMIN", "tenant_default", {
        issuer: "wrong-issuer"
      });

      const response = await http
        .get("/api/students")
        .set(authHeader(token));

      expect(response.status).toBe(401);
      expect(response.body.error_code).toBe("INVALID_ACCESS_TOKEN");
    });

    test("Wrong token type on access route => 401", async () => {
      const superadminLogin = await loginAs({ email: "superadmin@abacusweb.local" });
      const token = await signRefreshToken(superadminLogin.body.data.user.id);

      const response = await http
        .get("/api/students")
        .set(authHeader(token));

      expect(response.status).toBe(401);
      expect(response.body.error_code).toBe("INVALID_ACCESS_TOKEN");
    });

    test("Expired token => 401", async () => {
      const token = signAccessToken("SUPERADMIN", "tenant_default", {
        expiresIn: -1
      });

      const response = await http
        .get("/api/students")
        .set(authHeader(token));

      expect(response.status).toBe(401);
      expect(response.body.error_code).toBe("INVALID_ACCESS_TOKEN");
    });
  });

  describe("5) TENANT ISOLATION", () => {
    test("Tenant A user cannot access Tenant B student => 403", async () => {
      const bp = await createRoleUser({ role: "BP", hierarchyNodeCode: "IN-NORTH" });
      const { student } = await createTenantWithStudentForIsolation();

      const response = await http
        .get(`/api/students/${student.id}/promotion-status`)
        .set(authHeader(bp.token));

      expect(response.status).toBe(403);
      expect(["SCOPE_FORBIDDEN", "TENANT_SCOPE_DENIED"]).toContain(response.body.error_code);
    });
  });
});
