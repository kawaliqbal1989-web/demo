import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { authHeader, ensureAuthUser, getTenantByCode, randomId, loginAs } from "../helpers/test-helpers.js";

const http = request(app);

describe("TEACHER PORTAL (acceptance)", () => {
  let tenant;
  let centerUser;
  let teacher1;
  let teacher2;
  let level1;
  let batch1;
  let batch2;
  let student1;
  let student2;

  beforeAll(async () => {
    tenant = await getTenantByCode("DEFAULT");
    level1 = await prisma.level.findFirst({ where: { tenantId: tenant.id, rank: 1 }, select: { id: true } });

    centerUser = await prisma.authUser.findFirst({
      where: { tenantId: tenant.id, role: "CENTER", email: "center.manager@abacusweb.local" },
      select: { id: true, hierarchyNodeId: true }
    });

    teacher1 = await prisma.authUser.findFirst({
      where: { tenantId: tenant.id, role: "TEACHER", email: "teacher.one@abacusweb.local" },
      select: { id: true, hierarchyNodeId: true, username: true }
    });

    teacher2 = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `teacher.two.${randomId("t")}@abacusweb.local`,
      username: `TE${Math.floor(Math.random() * 100000)}`,
      role: "TEACHER",
      hierarchyNodeCode: null,
      parentUserId: centerUser.id
    });

    // Put teacher2 in same center as teacher1.
    await prisma.authUser.update({
      where: { id: teacher2.id },
      data: { hierarchyNodeId: centerUser.hierarchyNodeId }
    });

    // Ensure teacher profiles exist.
    await prisma.teacherProfile.upsert({
      where: { authUserId: teacher1.id },
      update: { fullName: "Teacher One", hierarchyNodeId: centerUser.hierarchyNodeId, tenantId: tenant.id },
      create: { tenantId: tenant.id, hierarchyNodeId: centerUser.hierarchyNodeId, authUserId: teacher1.id, fullName: "Teacher One" }
    });

    await prisma.teacherProfile.upsert({
      where: { authUserId: teacher2.id },
      update: { fullName: "Teacher Two", hierarchyNodeId: centerUser.hierarchyNodeId, tenantId: tenant.id },
      create: { tenantId: tenant.id, hierarchyNodeId: centerUser.hierarchyNodeId, authUserId: teacher2.id, fullName: "Teacher Two" }
    });

    // Configure attendance edit window to 0 hours for deterministic publish behavior.
    const centerProfile = await prisma.centerProfile.findFirst({
      where: { tenantId: tenant.id, authUserId: centerUser.id },
      select: { id: true }
    });

    if (centerProfile) {
      await prisma.centerProfile.update({
        where: { id: centerProfile.id },
        data: { attendanceConfig: { teacherEditWindowHours: 0, defaultEntryStatus: "ABSENT" } }
      });
    }

    batch1 = await prisma.batch.create({
      data: { tenantId: tenant.id, hierarchyNodeId: centerUser.hierarchyNodeId, name: `BATCH-${randomId("a")}` }
    });

    batch2 = await prisma.batch.create({
      data: { tenantId: tenant.id, hierarchyNodeId: centerUser.hierarchyNodeId, name: `BATCH-${randomId("b")}` }
    });

    await prisma.batchTeacherAssignment.create({ data: { tenantId: tenant.id, batchId: batch1.id, teacherUserId: teacher1.id } });
    await prisma.batchTeacherAssignment.create({ data: { tenantId: tenant.id, batchId: batch2.id, teacherUserId: teacher2.id } });

    student1 = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `ST-${randomId("1")}`,
        firstName: "Seed",
        lastName: "Student1",
        hierarchyNodeId: centerUser.hierarchyNodeId,
        levelId: level1.id,
        isActive: true
      }
    });

    student2 = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `ST-${randomId("2")}`,
        firstName: "Seed",
        lastName: "Student2",
        hierarchyNodeId: centerUser.hierarchyNodeId,
        levelId: level1.id,
        isActive: true
      }
    });

    await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerUser.hierarchyNodeId,
        studentId: student1.id,
        batchId: batch1.id,
        assignedTeacherUserId: teacher1.id,
        levelId: level1.id,
        status: "ACTIVE"
      }
    });

    await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerUser.hierarchyNodeId,
        studentId: student2.id,
        batchId: batch2.id,
        assignedTeacherUserId: teacher2.id,
        levelId: level1.id,
        status: "ACTIVE"
      }
    });
  });

  test("Teacher cannot list students outside assignments", async () => {
    const teacherLogin = await loginAs({ email: "teacher.one@abacusweb.local" });
    expect(teacherLogin.status).toBe(200);

    const token = teacherLogin.body?.data?.access_token;

    const res = await http.get("/api/teacher/students").set(authHeader(token));
    expect(res.status).toBe(200);

    const ids = (res.body?.data || []).map((r) => r.studentId);
    expect(ids).toContain(student1.id);
    expect(ids).not.toContain(student2.id);
  });

  test("Teacher cannot view students outside assignments", async () => {
    const teacherLogin = await loginAs({ email: "teacher.one@abacusweb.local" });
    const token = teacherLogin.body?.data?.access_token;

    const res = await http.get(`/api/teacher/students/${student2.id}`).set(authHeader(token));
    expect(res.status).toBe(403);
    expect(res.body?.error_code).toBe("TEACHER_STUDENT_FORBIDDEN");
  });

  test("Teacher cannot create attendance for unassigned batch", async () => {
    const teacherLogin = await loginAs({ email: "teacher.one@abacusweb.local" });
    const token = teacherLogin.body?.data?.access_token;

    const res = await http
      .post("/api/teacher/attendance/sessions")
      .set(authHeader(token))
      .send({ batchId: batch2.id, date: "2026-02-20" });

    expect(res.status).toBe(403);
    expect(res.body?.error_code).toBe("TEACHER_BATCH_FORBIDDEN");
  });

  test("Creating session twice for same batch+date returns conflict", async () => {
    const teacherLogin = await loginAs({ email: "teacher.one@abacusweb.local" });
    const token = teacherLogin.body?.data?.access_token;

    const first = await http
      .post("/api/teacher/attendance/sessions")
      .set(authHeader(token))
      .send({ batchId: batch1.id, date: "2026-02-20" });

    expect(first.status).toBe(201);

    const second = await http
      .post("/api/teacher/attendance/sessions")
      .set(authHeader(token))
      .send({ batchId: batch1.id, date: "2026-02-20" });

    expect(second.status).toBe(409);
    expect(second.body?.error_code).toBe("SESSION_ALREADY_EXISTS");
  });

  test("Publishing prevents edits when edit window is 0", async () => {
    const teacherLogin = await loginAs({ email: "teacher.one@abacusweb.local" });
    const token = teacherLogin.body?.data?.access_token;

    const created = await http
      .post("/api/teacher/attendance/sessions")
      .set(authHeader(token))
      .send({ batchId: batch1.id, date: "2026-02-21" });

    expect(created.status).toBe(201);
    const sessionId = created.body?.data?.sessionId;

    const detail = await http.get(`/api/teacher/attendance/sessions/${sessionId}`).set(authHeader(token));
    expect(detail.status).toBe(200);
    const firstStudentId = detail.body?.data?.entries?.[0]?.studentId;

    const publish = await http.post(`/api/teacher/attendance/sessions/${sessionId}/publish`).set(authHeader(token));
    expect(publish.status).toBe(200);
    expect(publish.body?.data?.status).toBe("PUBLISHED");

    const edit = await http
      .put(`/api/teacher/attendance/sessions/${sessionId}/entries`)
      .set(authHeader(token))
      .send({
        version: detail.body?.data?.version,
        entries: [{ studentId: firstStudentId, status: "PRESENT" }]
      });

    expect(edit.status).toBe(403);
    expect(edit.body?.error_code).toBe("EDIT_WINDOW_CLOSED");
  });

  test("Notes cannot be created for unassigned student", async () => {
    const teacherLogin = await loginAs({ email: "teacher.one@abacusweb.local" });
    const token = teacherLogin.body?.data?.access_token;

    const res = await http
      .post(`/api/teacher/students/${student2.id}/notes`)
      .set(authHeader(token))
      .send({ note: "Should not be allowed" });

    expect(res.status).toBe(403);
    expect(res.body?.error_code).toBe("TEACHER_STUDENT_FORBIDDEN");
  });

  test("/api/teacher/login returns token for teacher", async () => {
    const res = await http.post("/api/teacher/login").send({
      tenantCode: "DEFAULT",
      username: teacher1.username,
      password: "Pass@123"
    });

    expect(res.status).toBe(200);
    expect(res.body?.data?.token).toBeTruthy();
    expect(res.body?.data?.teacher?.id).toBe(teacher1.id);
  });
});
