import bcrypt from "bcrypt";
import { authHeader, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";

describe("PAGINATION HARDENING", () => {
  let superadminToken;
  let tenant;
  let school;
  let level1;

  beforeAll(async () => {
    const superadminLogin = await loginAs({ email: "superadmin@abacusweb.local" });
    superadminToken = superadminLogin.body.data.access_token;

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    school = await prisma.hierarchyNode.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: "SCH-001"
        }
      }
    });
    level1 = await prisma.level.findFirstOrThrow({ where: { tenantId: tenant.id, rank: 1 } });
  });

  test("students list: default limit=20, max limit=100, stable pages", async () => {
    const prefix = randomId("pg_student");

    const students = Array.from({ length: 120 }).map((_, index) => ({
      tenantId: tenant.id,
      admissionNo: `${prefix}_${String(index).padStart(3, "0")}`,
      firstName: "Paginated",
      lastName: `Student${index}`,
      email: null,
      hierarchyNodeId: school.id,
      levelId: level1.id,
      isActive: true
    }));

    await prisma.student.createMany({
      data: students,
      skipDuplicates: true
    });

    const defaultRes = await http.get("/api/students").set(authHeader(superadminToken));
    expect(defaultRes.status).toBe(200);
    expect(Array.isArray(defaultRes.body.data)).toBe(true);
    expect(defaultRes.body.data.length).toBe(20);

    const maxRes = await http
      .get("/api/students?limit=500")
      .set(authHeader(superadminToken));
    expect(maxRes.status).toBe(200);
    expect(maxRes.body.data.length).toBe(100);

    const pageA = await http
      .get("/api/students?limit=10&offset=0")
      .set(authHeader(superadminToken));
    const pageB = await http
      .get("/api/students?limit=10&offset=10")
      .set(authHeader(superadminToken));
    const pageC = await http
      .get("/api/students?limit=20&offset=0")
      .set(authHeader(superadminToken));

    expect(pageA.status).toBe(200);
    expect(pageB.status).toBe(200);
    expect(pageC.status).toBe(200);

    const idsA = pageA.body.data.map((row) => row.id);
    const idsB = pageB.body.data.map((row) => row.id);
    const idsC = pageC.body.data.map((row) => row.id);

    expect(new Set(idsA).size).toBe(10);
    expect(new Set(idsB).size).toBe(10);
    expect(idsA.some((id) => idsB.includes(id))).toBe(false);
    expect(idsC).toEqual([...idsA, ...idsB]);
  });

  test("worksheets/competitions/teachers/submissions default limit applied", async () => {
    const superadmin = await prisma.authUser.findFirstOrThrow({
      where: { tenantId: tenant.id, email: "superadmin@abacusweb.local" }
    });

    const worksheetPrefix = randomId("pg_ws");
    const worksheetRows = Array.from({ length: 30 }).map((_, index) => ({
      tenantId: tenant.id,
      title: `${worksheetPrefix}_${index}`,
      description: "pagination",
      difficulty: "EASY",
      levelId: level1.id,
      createdByUserId: superadmin.id,
      isPublished: true
    }));

    await prisma.worksheet.createMany({
      data: worksheetRows,
      skipDuplicates: true
    });

    const worksheetsRes = await http.get("/api/worksheets").set(authHeader(superadminToken));
    expect(worksheetsRes.status).toBe(200);
    expect(worksheetsRes.body.data.length).toBe(20);

    const compPrefix = randomId("pg_comp");
    const competitions = Array.from({ length: 30 }).map((_, index) => ({
      tenantId: tenant.id,
      title: `${compPrefix}_${index}`,
      description: "pagination",
      status: "DRAFT",
      workflowStage: "CENTER_REVIEW",
      startsAt: new Date(Date.now() + 3600 * 1000 + index * 1000),
      endsAt: new Date(Date.now() + 7200 * 1000 + index * 1000),
      hierarchyNodeId: school.id,
      levelId: level1.id,
      createdByUserId: superadmin.id
    }));

    await prisma.competition.createMany({
      data: competitions,
      skipDuplicates: true
    });

    const competitionsRes = await http.get("/api/competitions").set(authHeader(superadminToken));
    expect(competitionsRes.status).toBe(200);
    expect(competitionsRes.body.data.length).toBe(20);

    const teacherPrefix = randomId("pg_teacher");
    const passwordHash = await bcrypt.hash("Pass@123", 8);

    const teacherRows = Array.from({ length: 30 }).map((_, index) => ({
      tenantId: tenant.id,
      username: `TST_${teacherPrefix}_${index}`,
      email: `${teacherPrefix}_${index}@teacher.local`,
      passwordHash,
      role: "TEACHER",
      isActive: true,
      hierarchyNodeId: school.id
    }));

    await prisma.authUser.createMany({
      data: teacherRows,
      skipDuplicates: true
    });

    const teachersRes = await http.get("/api/teachers").set(authHeader(superadminToken));
    expect(teachersRes.status).toBe(200);
    expect(teachersRes.body.data.length).toBe(20);

    const student = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `${randomId("pg_sub")}_ADM`,
        firstName: "Submission",
        lastName: "Student",
        email: null,
        hierarchyNodeId: school.id,
        levelId: level1.id
      }
    });

    const submissionWsPrefix = randomId("pg_sub_ws");
    const submissionWorksheets = await Promise.all(
      Array.from({ length: 30 }).map((_, index) =>
        prisma.worksheet.create({
          data: {
            tenantId: tenant.id,
            title: `${submissionWsPrefix}_${index}`,
            description: "pagination submissions",
            difficulty: "EASY",
            levelId: level1.id,
            createdByUserId: superadmin.id,
            isPublished: true
          }
        })
      )
    );

    await prisma.worksheetSubmission.createMany({
      data: submissionWorksheets.map((ws, index) => ({
        tenantId: tenant.id,
        worksheetId: ws.id,
        studentId: student.id,
        score: 90 + (index % 5),
        submittedAt: new Date(Date.now() - index * 1000),
        status: "REVIEWED",
        createdAt: new Date(Date.now() - index * 1000)
      })),
      skipDuplicates: true
    });

    const submissionsRes = await http.get("/api/submissions").set(authHeader(superadminToken));
    expect(submissionsRes.status).toBe(200);
    expect(submissionsRes.body.data.length).toBe(20);
  });
});
