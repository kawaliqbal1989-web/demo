import {
  authHeader,
  ensureAuthUser,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";

describe("REPORTING FOUNDATION ALIAS ROUTES", () => {
  let bpToken;
  let teacherToken;
  let superadminToken;
  let tenantDefault;

  beforeAll(async () => {
    const [bpLogin, superadminLogin] = await Promise.all([
      loginAs({ email: "bp.manager@abacusweb.local" }),
      loginAs({ email: "superadmin@abacusweb.local" })
    ]);

    bpToken = bpLogin.body.data.access_token;
    superadminToken = superadminLogin.body.data.access_token;

    tenantDefault = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });

    const teacherUser = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `${randomId("rpt.teacher")}@abacusweb.local`,
      username: randomId("rpt_teacher"),
      role: "TEACHER",
      hierarchyNodeCode: "SCH-001",
      password: "Pass@123",
      mustChangePassword: false
    });

    const teacherLogin = await loginAs({ email: teacherUser.email, password: "Pass@123" });
    teacherToken = teacherLogin.body.data.access_token;
  }, 30000);

  test("report scope route /api/reports/bp returns BP operational report", async () => {
    const response = await http
      .get("/api/reports/bp")
      .set(authHeader(bpToken));

    expect(response.status).toBe(200);
    expect(response.body.data.reportKey).toBe("bp-operational");
    expect(response.body.data.scope.role).toBe("BP");
  });

  test("role isolation blocks teacher access to BP report route", async () => {
    const response = await http
      .get("/api/reports/bp")
      .set(authHeader(teacherToken));

    expect(response.status).toBe(403);
  });

  test("tenant isolation excludes foreign-tenant governance audit records", async () => {
    const foreignTenant = await prisma.tenant.create({
      data: {
        name: `Report Foreign ${randomId("tenant")}`,
        code: `RFA${Date.now().toString().slice(-6)}`
      }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: foreignTenant.id,
        userId: null,
        role: "SUPERADMIN",
        action: "FOUNDATION_ALIAS_FOREIGN_TENANT_EVENT",
        entityType: "REPORT",
        entityId: randomId("entity"),
        metadata: { source: "reporting.foundation.alias" }
      }
    });

    const response = await http
      .get("/api/reports/audit")
      .set(authHeader(superadminToken));

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body.data)).not.toContain("FOUNDATION_ALIAS_FOREIGN_TENANT_EVENT");
  });

  test("export alias routes queue PDF and Excel exports", async () => {
    const [pdfResponse, excelResponse] = await Promise.all([
      http
        .get("/api/reports/export/pdf?reportKey=bp")
        .set(authHeader(bpToken)),
      http
        .get("/api/reports/export/excel?reportKey=bp")
        .set(authHeader(bpToken))
    ]);

    expect([200, 202]).toContain(pdfResponse.status);
    expect([200, 202]).toContain(excelResponse.status);
    expect(pdfResponse.body.data.job.id).toBeTruthy();
    expect(excelResponse.body.data.job.id).toBeTruthy();
    expect(pdfResponse.body.data.job.exportFormat).toBe("PDF");
    expect(excelResponse.body.data.job.exportFormat).toBe("XLSX");
  });
});
