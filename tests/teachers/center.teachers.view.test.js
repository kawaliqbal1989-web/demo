import { authHeader, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";

describe("CENTER teachers view", () => {
  let tenant;
  let centerToken;

  beforeAll(async () => {
    const centerLogin = await loginAs({ email: "center.manager@abacusweb.local" });
    expect(centerLogin.statusCode).toBe(200);
    centerToken = centerLogin.body.data.access_token;

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
  });

  test("creates teacher with teacherCode and returns temp password", async () => {
    const teacherCode = randomId("TE").slice(0, 10);

    const res = await http
      .post("/api/teachers")
      .set(authHeader(centerToken))
      .send({
        teacherCode,
        fullName: "Center Teacher",
        phonePrimary: "9999999996",
        email: "",
        status: "ACTIVE",
        createLoginAccount: true
      });

    expect(res.statusCode).toBe(201);
    expect(res.body?.data?.user?.username).toBe(teacherCode);
    expect(res.body?.data?.tempPassword).toBe(teacherCode);

    const teacherUser = await prisma.authUser.findFirst({
      where: { tenantId: tenant.id, username: teacherCode },
      select: { id: true, role: true, isActive: true }
    });

    expect(teacherUser?.role).toBe("TEACHER");
    expect(teacherUser?.isActive).toBe(true);
  });

  test("lists teachers with q filter", async () => {
    const listRes = await http
      .get("/api/teachers?limit=10&offset=0&q=Teacher")
      .set(authHeader(centerToken));

    expect(listRes.statusCode).toBe(200);
    expect(Array.isArray(listRes.body?.data)).toBe(true);
  });
});
