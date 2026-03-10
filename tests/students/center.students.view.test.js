import { authHeader, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";

describe("CENTER student admission view", () => {
  let tenant;
  let centerNode;
  let centerToken;

  beforeAll(async () => {
    const centerLogin = await loginAs({ email: "center.manager@abacusweb.local" });
    expect(centerLogin.statusCode).toBe(200);
    centerToken = centerLogin.body.data.access_token;

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    centerNode = await prisma.hierarchyNode.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: "SCH-001"
        }
      }
    });
  });

  test("admits student with optional login creation", async () => {
    const admissionNo = randomId("ST");
    const email = `${admissionNo.toLowerCase()}@student.local`;

    const res = await http
      .post("/api/students")
      .set(authHeader(centerToken))
      .send({
        admissionNo,
        firstName: "Center",
        lastName: "Student",
        email,
        dateOfBirth: "2015-01-01",
        guardianName: "Guardian",
        guardianPhone: "9999999999",
        address: "Test Address",
        isActive: true,
        createLoginAccount: true,
        enrollmentFeeAmount: 0
      });

    expect(res.statusCode).toBe(201);
    expect(res.body?.data?.admissionNo).toBe(admissionNo);
    expect(res.body?.data?.hierarchyNodeId).toBe(centerNode.id);
    expect(res.body?.data?.createdLogin?.email).toBe(email);
    expect(res.body?.data?.tempPassword).toBe(admissionNo);

    const login = await prisma.authUser.findFirst({
      where: { tenantId: tenant.id, studentId: res.body.data.id },
      select: { id: true, role: true, username: true, email: true }
    });

    expect(login?.role).toBe("STUDENT");
    expect(login?.username).toBe(admissionNo);
    expect(login?.email).toBe(email);
  });

  test("creates login later and can reset password", async () => {
    const admissionNo = randomId("ST");
    const email = `${admissionNo.toLowerCase()}@student.local`;

    const createRes = await http
      .post("/api/students")
      .set(authHeader(centerToken))
      .send({
        admissionNo,
        firstName: "No",
        lastName: "Login",
        email,
        createLoginAccount: false
      });

    expect(createRes.statusCode).toBe(201);

    const loginRes = await http
      .post(`/api/students/${createRes.body.data.id}/create-login`)
      .set(authHeader(centerToken))
      .send({});

    expect(loginRes.statusCode).toBe(201);
    expect(loginRes.body?.data?.login?.username).toBe(admissionNo);

    const resetRes = await http
      .post(`/api/students/${createRes.body.data.id}/reset-password`)
      .set(authHeader(centerToken))
      .send({ newPassword: "NewPass@123", mustChangePassword: true });

    expect(resetRes.statusCode).toBe(200);
  });

  test("lists students with teacher filter shape", async () => {
    const res = await http
      .get("/api/students?limit=5&offset=0")
      .set(authHeader(centerToken));

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body?.data)).toBe(true);

    if (res.body.data.length) {
      const row = res.body.data[0];
      expect(row).toHaveProperty("level");
      expect(row).toHaveProperty("authUsers");
      expect(row).toHaveProperty("batchEnrollments");
    }
  });
});
