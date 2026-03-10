import {
  authHeader,
  http,
  loginAs,
  ensureAuthUser,
  randomId,
  prisma
} from "../helpers/test-helpers.js";

describe("RBAC", () => {
  test("CENTER cannot create Business Partner (expect 403)", async () => {
    const centerLogin = await loginAs({
      email: "center.manager@abacusweb.local"
    });

    const response = await http
      .post("/api/business-partners")
      .set(authHeader(centerLogin.body.data.access_token))
      .send({
        name: `BP ${randomId("rbac")}`,
        code: `BP-${Date.now()}`,
        contactEmail: "rbac.bp@example.com"
      });

    expect(response.status).toBe(403);
    expect(response.body.error_code).toBe("ROLE_FORBIDDEN");
  });

  test("Teacher cannot confirm promotion (expect 403)", async () => {
    await ensureAuthUser({
      email: "teacher.test@abacusweb.local",
      role: "TEACHER",
      hierarchyNodeCode: "SCH-001"
    });

    const teacherLogin = await loginAs({
      email: "teacher.test@abacusweb.local"
    });

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    const student = await prisma.student.findFirstOrThrow({
      where: { tenantId: tenant.id }
    });

    const response = await http
      .post(`/api/students/${student.id}/confirm-promotion`)
      .set(authHeader(teacherLogin.body.data.access_token))
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error_code).toBe("ROLE_FORBIDDEN");
  });
});
