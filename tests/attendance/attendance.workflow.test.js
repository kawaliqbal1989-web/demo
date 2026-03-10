import {
  authHeader,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";

describe("ATTENDANCE workflows", () => {
  let tenant;
  let centerNode;
  let centerToken;
  let teacherToken;
  let teacherUser;
  let student1;
  let student2;

  let batch;
  let enrollment1;
  let enrollment2;

  const date = "2026-02-20";

  beforeAll(async () => {
    const centerLogin = await loginAs({ email: "center.manager@abacusweb.local" });
    expect(centerLogin.statusCode).toBe(200);
    centerToken = centerLogin.body.data.access_token;

    const teacherLogin = await loginAs({ email: "teacher.one@abacusweb.local" });
    expect(teacherLogin.statusCode).toBe(200);
    teacherToken = teacherLogin.body.data.access_token;

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    centerNode = await prisma.hierarchyNode.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: "SCH-001"
        }
      }
    });

    teacherUser = await prisma.authUser.findFirstOrThrow({
      where: { tenantId: tenant.id, email: "teacher.one@abacusweb.local" },
      select: { id: true, hierarchyNodeId: true }
    });

    student1 = await prisma.student.findFirstOrThrow({
      where: { tenantId: tenant.id, admissionNo: "ADM-1001" },
      select: { id: true, hierarchyNodeId: true }
    });

    student2 = await prisma.student.findFirstOrThrow({
      where: { tenantId: tenant.id, admissionNo: "ADM-1002" },
      select: { id: true, hierarchyNodeId: true }
    });

    // Create batch + assignment + enrollments
    batch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: randomId("Batch")
      }
    });

    await prisma.batchTeacherAssignment.create({
      data: {
        tenantId: tenant.id,
        batchId: batch.id,
        teacherUserId: teacherUser.id
      }
    });

    enrollment1 = await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        batchId: batch.id,
        studentId: student1.id,
        status: "ACTIVE",
        assignedTeacherUserId: teacherUser.id
      }
    });

    enrollment2 = await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        batchId: batch.id,
        studentId: student2.id,
        status: "ACTIVE",
        assignedTeacherUserId: teacherUser.id
      }
    });
  });

  afterAll(async () => {
    if (!tenant) return;

    await prisma.attendanceCorrectionRequest.deleteMany({
      where: { tenantId: tenant.id, session: { batchId: batch?.id } }
    });

    await prisma.attendanceEntry.deleteMany({
      where: { tenantId: tenant.id, session: { batchId: batch?.id } }
    });

    await prisma.attendanceSession.deleteMany({
      where: { tenantId: tenant.id, batchId: batch?.id }
    });

    await prisma.enrollment.deleteMany({
      where: { tenantId: tenant.id, id: { in: [enrollment1?.id, enrollment2?.id].filter(Boolean) } }
    });

    await prisma.batchTeacherAssignment.deleteMany({
      where: { tenantId: tenant.id, batchId: batch?.id }
    });

    await prisma.batch.deleteMany({
      where: { tenantId: tenant.id, id: batch?.id }
    });
  });

  test("Create session enforces uniqueness and snapshots roster", async () => {
    const create1 = await http
      .post("/api/attendance/sessions")
      .set(authHeader(centerToken))
      .send({ batchId: batch.id, date });

    expect(create1.statusCode).toBe(201);
    expect(create1.body.success).toBe(true);
    expect(create1.body.data.status).toBe("DRAFT");

    const sessionId = create1.body.data.id;

    const fetch = await http
      .get(`/api/attendance/sessions/${sessionId}`)
      .set(authHeader(centerToken));

    expect(fetch.statusCode).toBe(200);
    expect(fetch.body.success).toBe(true);
    expect(fetch.body.data.entries.length).toBe(2);

    const statuses = fetch.body.data.entries.map((e) => e.status);
    expect(statuses.every((s) => s === "ABSENT")).toBe(true);

    const create2 = await http
      .post("/api/attendance/sessions")
      .set(authHeader(centerToken))
      .send({ batchId: batch.id, date });

    expect(create2.statusCode).toBe(409);
  });

  test("Marking entries increments version and detects version conflicts", async () => {
    const session = await prisma.attendanceSession.findFirstOrThrow({
      where: { tenantId: tenant.id, batchId: batch.id, date: new Date(`${date}T00:00:00.000Z`) },
      select: { id: true, version: true }
    });

    const mark = await http
      .put(`/api/attendance/sessions/${session.id}/entries`)
      .set(authHeader(teacherToken))
      .send({
        version: session.version,
        reason: "Initial marking",
        entries: [
          { studentId: student1.id, status: "PRESENT" },
          { studentId: student2.id, status: "LATE", note: "Arrived 10m late" }
        ]
      });

    expect(mark.statusCode).toBe(200);
    expect(mark.body.success).toBe(true);
    expect(mark.body.data.updatedCount).toBe(2);
    expect(mark.body.data.version).toBeGreaterThan(session.version);

    const conflict = await http
      .put(`/api/attendance/sessions/${session.id}/entries`)
      .set(authHeader(teacherToken))
      .send({
        version: session.version,
        reason: "Stale update",
        entries: [{ studentId: student1.id, status: "ABSENT" }]
      });

    expect(conflict.statusCode).toBe(409);
  });

  test("Publish -> lock prevents edits; teachers cannot lock", async () => {
    const session = await prisma.attendanceSession.findFirstOrThrow({
      where: { tenantId: tenant.id, batchId: batch.id, date: new Date(`${date}T00:00:00.000Z`) },
      select: { id: true, version: true }
    });

    const pub = await http
      .post(`/api/attendance/sessions/${session.id}/publish`)
      .set(authHeader(teacherToken));

    expect(pub.statusCode).toBe(200);
    expect(pub.body.data.status).toBe("PUBLISHED");

    const teacherLock = await http
      .post(`/api/attendance/sessions/${session.id}/lock`)
      .set(authHeader(teacherToken));

    expect(teacherLock.statusCode).toBe(403);

    const lock = await http
      .post(`/api/attendance/sessions/${session.id}/lock`)
      .set(authHeader(centerToken));

    expect(lock.statusCode).toBe(200);
    expect(lock.body.data.status).toBe("LOCKED");

    const editAfterLock = await http
      .put(`/api/attendance/sessions/${session.id}/entries`)
      .set(authHeader(centerToken))
      .send({
        version: lock.body.data.version,
        reason: "Attempt edit after lock",
        entries: [{ studentId: student1.id, status: "ABSENT" }]
      });

    expect(editAfterLock.statusCode).toBe(409);
  });

  test("Correction request -> approve applies changes and writes audit logs", async () => {
    const session = await prisma.attendanceSession.findFirstOrThrow({
      where: { tenantId: tenant.id, batchId: batch.id, date: new Date(`${date}T00:00:00.000Z`) },
      select: { id: true }
    });

    const request = await http
      .post(`/api/attendance/sessions/${session.id}/corrections`)
      .set(authHeader(teacherToken))
      .send({
        reason: "Correction for student2",
        entries: [{ studentId: student2.id, status: "PRESENT", note: "Late entry corrected" }]
      });

    expect(request.statusCode).toBe(201);
    expect(request.body.data.status).toBe("PENDING");

    const approve = await http
      .post(`/api/attendance/corrections/${request.body.data.id}/review`)
      .set(authHeader(centerToken))
      .send({ action: "APPROVE" });

    expect(approve.statusCode).toBe(200);
    expect(["APPLIED", "APPROVED"].includes(approve.body.data.status)).toBe(true);

    const entry = await prisma.attendanceEntry.findUniqueOrThrow({
      where: {
        sessionId_studentId: {
          sessionId: session.id,
          studentId: student2.id
        }
      },
      select: { status: true, note: true }
    });

    expect(entry.status).toBe("PRESENT");

    const audits = await prisma.auditLog.findMany({
      where: {
        tenantId: tenant.id,
        entityType: "ATTENDANCE_SESSION",
        entityId: session.id,
        action: { in: ["ATTENDANCE_UPDATE_ENTRIES", "ATTENDANCE_CORRECTION_APPLIED", "ATTENDANCE_PUBLISH", "ATTENDANCE_LOCK"] }
      }
    });

    expect(audits.length).toBeGreaterThan(0);
  });
});
