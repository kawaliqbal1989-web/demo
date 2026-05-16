import request from "supertest";
import { app } from "../../src/app.js";
import { createOrUpdateOperationalEvent } from "../../src/services/operational-notification.service.js";
import { authHeader, ensureAuthUser, getTenantByCode, loginAs, prisma, randomId } from "../helpers/test-helpers.js";

const http = request(app);

describe("PARENT DASHBOARD (API)", () => {
  let tenant;
  let level;
  let centerUser;
  let centerProfile;
  let student;
  let parentAuth;
  let token;

  beforeAll(async () => {
    tenant = await getTenantByCode("DEFAULT");
    level = await prisma.level.findFirst({
      where: { tenantId: tenant.id, rank: 1 },
      select: { id: true }
    });

    centerUser = await prisma.authUser.findFirst({
      where: { tenantId: tenant.id, role: "CENTER", email: "center.manager@abacusweb.local" },
      select: { id: true, hierarchyNodeId: true }
    });

    centerProfile = await prisma.centerProfile.findFirst({
      where: { tenantId: tenant.id, authUserId: centerUser.id },
      select: {
        id: true,
        franchiseProfile: {
          select: {
            id: true,
            businessPartnerId: true
          }
        }
      }
    });

    student = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `ST-${randomId("par")}`,
        firstName: "Parent",
        lastName: "Visible",
        guardianName: "Parent Guardian",
        hierarchyNodeId: centerUser.hierarchyNodeId,
        levelId: level.id,
        isActive: true
      }
    });

    parentAuth = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `parent.${randomId("par")}@abacusweb.local`,
      username: `PAR${Math.floor(Math.random() * 100000)}`,
      role: "PARENT",
      hierarchyNodeCode: null,
      password: "Pass@123"
    });

    await prisma.parentStudentLink.create({
      data: {
        tenantId: tenant.id,
        parentUserId: parentAuth.id,
        studentId: student.id,
        relationship: "MOTHER",
        isPrimary: true,
        isActive: true,
        visibilityKey: `VIS-${randomId("par")}`
      }
    });

    const worksheet = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `Parent Visibility Worksheet ${randomId("w")}`,
        description: "Parent visibility worksheet",
        levelId: level.id,
        createdByUserId: centerUser.id,
        isPublished: true
      }
    });

    const now = new Date();
    const batch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerUser.hierarchyNodeId,
        name: `PAR-BATCH-${randomId("b")}`,
        levelId: level.id,
        status: "ACTIVE",
        isActive: true
      }
    });

    await prisma.worksheetAssignment.create({
      data: {
        tenantId: tenant.id,
        worksheetId: worksheet.id,
        studentId: student.id,
        createdByUserId: centerUser.id,
        assignedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        isActive: true
      }
    });

    await prisma.worksheetSubmission.create({
      data: {
        tenantId: tenant.id,
        worksheetId: worksheet.id,
        studentId: student.id,
        submittedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        finalSubmittedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        status: "REVIEWED",
        score: 92,
        correctCount: 1,
        totalQuestions: 1,
        submittedAnswers: [{ questionNumber: 1, answer: 5 }]
      }
    });

    const session = await prisma.attendanceSession.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerUser.hierarchyNodeId,
        batchId: batch.id,
        date: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        status: "PUBLISHED",
        createdByUserId: centerUser.id,
        publishedAt: now
      }
    });

    await prisma.attendanceEntry.create({
      data: {
        tenantId: tenant.id,
        sessionId: session.id,
        studentId: student.id,
        status: "PRESENT",
        markedAt: now,
        markedByUserId: centerUser.id
      }
    });

    await createOrUpdateOperationalEvent({
      tenantId: tenant.id,
      businessPartnerId: centerProfile.franchiseProfile.businessPartnerId,
      franchiseId: centerProfile.franchiseProfile.id,
      centerId: centerProfile.id,
      type: "STUDENT_ENGAGEMENT_ATTENDANCE_DECLINE",
      category: "ACADEMIC",
      severity: "WARNING",
      title: "Attendance reminder",
      message: "Parent reminder for student attendance.",
      sourceKind: "SYSTEM",
      fingerprint: `test:parent-engagement:${student.id}`,
      activeFingerprint: `test:parent-engagement:${student.id}`,
      metadata: {
        reminderScope: "STUDENT_ENGAGEMENT",
        studentId: student.id
      },
      targets: [
        {
          recipientUserId: parentAuth.id,
          recipientRole: "PARENT",
          businessPartnerId: centerProfile.franchiseProfile.businessPartnerId,
          franchiseId: centerProfile.franchiseProfile.id,
          centerId: centerProfile.id,
          targetKey: `user:${parentAuth.id}`
        }
      ]
    });

    const login = await loginAs({
      tenantCode: "DEFAULT",
      username: parentAuth.username,
      password: "Pass@123"
    });

    token = login.body?.data?.access_token;
  });

  test("GET /api/parent/dashboard/overview returns linked student visibility", async () => {
    const res = await http.get("/api/parent/dashboard/overview").set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body?.data?.data?.selectedStudent?.studentId).toBe(student.id);
    expect(Array.isArray(res.body?.data?.data?.linkedStudents)).toBe(true);
    expect(res.body?.data?.data?.studentOverview?.engagementScore).toEqual(expect.any(Number));
  });

  test("GET /api/parent/dashboard/engagement returns read-only engagement details", async () => {
    const res = await http
      .get(`/api/parent/dashboard/engagement?studentId=${student.id}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body?.data?.data?.selectedStudent?.studentId).toBe(student.id);
    expect(res.body?.data?.data?.overview?.engagementScore).toEqual(expect.any(Number));
    expect(res.body?.data?.data?.examParticipation).toBeDefined();
  });

  test("GET /api/parent/dashboard/reminders filters reminders to the linked student", async () => {
    const res = await http
      .get(`/api/parent/dashboard/reminders?studentId=${student.id}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body?.data?.data?.total).toBeGreaterThanOrEqual(1);
    expect(res.body?.data?.data?.items[0]?.type).toBe("STUDENT_ENGAGEMENT_ATTENDANCE_DECLINE");
    expect(res.body?.data?.data?.selectedStudent?.studentId).toBe(student.id);
  });
});