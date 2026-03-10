import {
  authHeader,
  http,
  loginAs,
  prisma
} from "../helpers/test-helpers.js";

describe("TENANT ISOLATION", () => {
  test("BP cannot access other tenant student", async () => {
    const bpLogin = await loginAs({
      email: "bp.manager@abacusweb.local"
    });

    const otherTenant = await prisma.tenant.findUniqueOrThrow({
      where: { code: "OTHER" }
    });

    const otherStudent = await prisma.student.findFirst({
      where: { tenantId: otherTenant.id }
    });

    const studentId = otherStudent
      ? otherStudent.id
      : (
          await prisma.student.create({
            data: {
              tenantId: otherTenant.id,
              admissionNo: `OT-${Date.now()}`,
              firstName: "Other",
              lastName: "Student",
              email: `other.${Date.now()}@example.com`,
              hierarchyNodeId: (
                await prisma.hierarchyNode.findFirstOrThrow({
                  where: { tenantId: otherTenant.id }
                })
              ).id,
              levelId: (
                await prisma.level.findFirstOrThrow({
                  where: { tenantId: otherTenant.id }
                })
              ).id
            }
          })
        ).id;

    const response = await http
      .get(`/api/students/${studentId}/promotion-status`)
      .set(authHeader(bpLogin.body.data.access_token));

    expect(response.status).toBe(403);
    expect(response.body.error_code).toBe("TENANT_SCOPE_DENIED");
  });

  test("Cross-tenant competition access blocked", async () => {
    const centerLogin = await loginAs({
      email: "center.manager@abacusweb.local"
    });

    const otherTenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "OTHER" } });
    const otherCompetition = await prisma.competition.findFirstOrThrow({
      where: { tenantId: otherTenant.id }
    });

    const response = await http
      .get(`/api/competitions/${otherCompetition.id}/leaderboard`)
      .set(authHeader(centerLogin.body.data.access_token));

    expect(response.status).toBe(403);
    expect(response.body.error_code).toBe("TENANT_SCOPE_DENIED");
  });
});
