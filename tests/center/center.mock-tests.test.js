import {
  authHeader,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";

describe("CENTER mock tests", () => {
  let tenant;
  let centerToken;
  let centerNode;
  let batch;
  let enrollment;
  let student;

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

    student = await prisma.student.findFirstOrThrow({ where: { tenantId: tenant.id, admissionNo: "ADM-1001" } });

    batch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: randomId("Batch")
      }
    });

    enrollment = await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        batchId: batch.id,
        studentId: student.id,
        status: "ACTIVE"
      }
    });
  });

  afterAll(async () => {
    if (!tenant) return;

    await prisma.mockTestResult.deleteMany({ where: { tenantId: tenant.id, mockTest: { batchId: batch?.id } } });
    await prisma.mockTest.deleteMany({ where: { tenantId: tenant.id, batchId: batch?.id } });
    await prisma.enrollment.deleteMany({ where: { tenantId: tenant.id, id: enrollment?.id } });
    await prisma.batch.deleteMany({ where: { tenantId: tenant.id, id: batch?.id } });
  });

  test("Center can create mock test and save results", async () => {
    const create = await http
      .post("/api/center/mock-tests")
      .set(authHeader(centerToken))
      .send({
        batchId: batch.id,
        title: "Weekly Mock Test",
        date: "2026-02-20",
        maxMarks: 100
      });

    expect(create.statusCode).toBe(201);
    expect(create.body.success).toBe(true);

    const testId = create.body.data.id;

    const save = await http
      .put(`/api/center/mock-tests/${testId}/results`)
      .set(authHeader(centerToken))
      .send({
        results: [{ studentId: student.id, marks: 88 }]
      });

    expect(save.statusCode).toBe(200);
    expect(save.body.data.updatedCount).toBe(1);

    const fetched = await http
      .get(`/api/center/mock-tests/${testId}`)
      .set(authHeader(centerToken));

    expect(fetched.statusCode).toBe(200);
    expect(Array.isArray(fetched.body.data.roster)).toBe(true);
    expect(fetched.body.data.roster[0].marks).toBe(88);
  });

  test("Center cannot save results for archived mock test", async () => {
    const create = await http
      .post("/api/center/mock-tests")
      .set(authHeader(centerToken))
      .send({
        batchId: batch.id,
        title: "Archived Mock Test",
        date: "2026-02-21",
        maxMarks: 100
      });

    expect(create.statusCode).toBe(201);
    const testId = create.body.data.id;

    await prisma.mockTest.update({
      where: { id: testId },
      data: { status: "ARCHIVED" }
    });

    const save = await http
      .put(`/api/center/mock-tests/${testId}/results`)
      .set(authHeader(centerToken))
      .send({
        results: [{ studentId: student.id, marks: 77 }]
      });

    expect(save.statusCode).toBe(409);
    expect(save.body?.error_code).toBe("MOCK_TEST_ARCHIVED");
  });

  test("Center can update mock test status and rejects invalid status", async () => {
    const create = await http
      .post("/api/center/mock-tests")
      .set(authHeader(centerToken))
      .send({
        batchId: batch.id,
        title: "Status Transition Test",
        date: "2026-02-22",
        maxMarks: 100
      });

    expect(create.statusCode).toBe(201);
    const testId = create.body.data.id;

    const publish = await http
      .patch(`/api/center/mock-tests/${testId}/status`)
      .set(authHeader(centerToken))
      .send({ status: "PUBLISHED" });

    expect(publish.statusCode).toBe(200);
    expect(publish.body?.data?.status).toBe("PUBLISHED");

    const archive = await http
      .patch(`/api/center/mock-tests/${testId}/status`)
      .set(authHeader(centerToken))
      .send({ status: "ARCHIVED" });

    expect(archive.statusCode).toBe(200);
    expect(archive.body?.data?.status).toBe("ARCHIVED");

    const invalid = await http
      .patch(`/api/center/mock-tests/${testId}/status`)
      .set(authHeader(centerToken))
      .send({ status: "INVALID_STATUS" });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.body?.error_code).toBe("VALIDATION_ERROR");
  });
});
