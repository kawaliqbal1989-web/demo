import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../helpers/test-helpers.js";
import { authHeader, ensureAuthUser, getTenantByCode, loginAs, randomId } from "../helpers/test-helpers.js";

const http = request(app);

describe("STUDENT PORTAL (API)", () => {
  let tenant;
  let centerUser;
  let level1;
  let student;
  let studentAuth;
  let token;
  let worksheet;

  beforeAll(async () => {
    tenant = await getTenantByCode("DEFAULT");
    level1 = await prisma.level.findFirst({ where: { tenantId: tenant.id, rank: 1 }, select: { id: true } });

    centerUser = await prisma.authUser.findFirst({
      where: { tenantId: tenant.id, role: "CENTER", email: "center.manager@abacusweb.local" },
      select: { id: true, hierarchyNodeId: true }
    });

    student = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `ST-${randomId("p")}`,
        firstName: "Portal",
        lastName: "Student",
        hierarchyNodeId: centerUser.hierarchyNodeId,
        levelId: level1.id,
        isActive: true
      }
    });

    studentAuth = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `student.${randomId("u")}@abacusweb.local`,
      username: `STU${Math.floor(Math.random() * 100000)}`,
      role: "STUDENT",
      hierarchyNodeCode: null,
      parentUserId: centerUser.id,
      studentId: student.id,
      password: "Pass@123"
    });

    const login = await loginAs({ tenantCode: "DEFAULT", username: studentAuth.username, password: "Pass@123" });
    token = login.body?.data?.access_token;

    worksheet = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `WS-${randomId("w")}`,
        description: "Student portal worksheet",
        levelId: level1.id,
        createdByUserId: centerUser.id,
        isPublished: true,
        timeLimitSeconds: 600
      }
    });

    await prisma.worksheetQuestion.createMany({
      data: [
        {
          tenantId: tenant.id,
          worksheetId: worksheet.id,
          questionNumber: 1,
          operands: { a: 1, b: 2 },
          operation: "+",
          correctAnswer: 3
        },
        {
          tenantId: tenant.id,
          worksheetId: worksheet.id,
          questionNumber: 2,
          operands: { a: 5, b: 4 },
          operation: "-",
          correctAnswer: 1
        }
      ]
    });
  });

  test("GET /api/student/me returns student profile", async () => {
    const res = await http.get("/api/student/me").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body?.data?.studentId).toBe(student.id);
    expect(res.body?.data?.studentCode).toBe(student.admissionNo);
    expect(res.body?.data?.status).toBe("ACTIVE");
  });

  test("GET /api/student/worksheets lists published worksheets", async () => {
    const res = await http.get("/api/student/worksheets").set(authHeader(token));
    expect(res.status).toBe(200);
    const ids = res.body?.data?.items?.map((i) => i.worksheetId) || [];
    expect(ids).toContain(worksheet.id);
  });

  test("can list student materials", async () => {
    const response = await http.get("/api/student/materials").set(authHeader(token));

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);

    if (response.body.data.length) {
      const first = response.body.data[0];
      expect(first).toHaveProperty("materialId");
      expect(first).toHaveProperty("title");
      expect(first).toHaveProperty("url");
    }
  });

  test("Start -> submit cycle returns score", async () => {
    const start = await http
      .post(`/api/student/worksheets/${worksheet.id}/start`)
      .set(authHeader(token))
      .send({ attemptMode: "practice" });

    expect([200, 201]).toContain(start.status);
    const attemptId = start.body?.data?.attemptId;
    expect(typeof attemptId).toBe("string");

    const submit = await http
      .post(`/api/student/worksheets/${worksheet.id}/submit`)
      .set(authHeader(token))
      .send({
        attemptId,
        answers: [
          { questionNumber: 1, answer: 3 },
          { questionNumber: 2, answer: 1 }
        ]
      });

    expect(submit.status).toBe(200);
    expect(submit.body?.data?.status).toBe("SUBMITTED");
    expect(submit.body?.data?.score).toBe(100);
    expect(submit.body?.data?.total).toBe(2);
  });

  test("Student cannot submit for another student", async () => {
    const other = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `ST-${randomId("x")}`,
        firstName: "Other",
        lastName: "Student",
        hierarchyNodeId: centerUser.hierarchyNodeId,
        levelId: level1.id,
        isActive: true
      }
    });

    const res = await http
      .post(`/api/worksheets/${worksheet.id}/submit`)
      .set(authHeader(token))
      .send({ studentId: other.id, answers: [{ questionNumber: 1, answer: 3 }] });

    expect(res.status).toBe(403);
    expect(res.body?.error_code).toBe("CROSS_STUDENT_SUBMISSION_DENIED");
  });
});
