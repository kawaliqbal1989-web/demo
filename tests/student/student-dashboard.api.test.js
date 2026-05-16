import request from "supertest";
import { app } from "../../src/app.js";
import { createOrUpdateOperationalEvent } from "../../src/services/operational-notification.service.js";
import { authHeader, ensureAuthUser, getTenantByCode, loginAs, prisma, randomId } from "../helpers/test-helpers.js";

const http = request(app);

describe("STUDENT ENGAGEMENT DASHBOARD (API)", () => {
  let tenant;
  let level;
  let centerUser;
  let centerProfile;
  let student;
  let studentAuth;
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
        admissionNo: `ST-${randomId("eng")}`,
        firstName: "Engagement",
        lastName: "Student",
        guardianName: "Parent Viewer",
        hierarchyNodeId: centerUser.hierarchyNodeId,
        levelId: level.id,
        isActive: true
      }
    });

    studentAuth = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `student.${randomId("eng") }@abacusweb.local`,
      username: `STU${Math.floor(Math.random() * 100000)}`,
      role: "STUDENT",
      hierarchyNodeCode: null,
      parentUserId: centerUser.id,
      studentId: student.id,
      password: "Pass@123"
    });

    const worksheetOne = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `Engagement Worksheet ${randomId("w1")}`,
        description: "Student engagement worksheet 1",
        levelId: level.id,
        createdByUserId: centerUser.id,
        isPublished: true
      }
    });

    const worksheetTwo = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `Engagement Worksheet ${randomId("w2")}`,
        description: "Student engagement worksheet 2",
        levelId: level.id,
        createdByUserId: centerUser.id,
        isPublished: true
      }
    });

    const worksheetThree = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `Engagement Worksheet ${randomId("w3")}`,
        description: "Student engagement worksheet 3",
        levelId: level.id,
        createdByUserId: centerUser.id,
        isPublished: true
      }
    });

    await prisma.worksheetQuestion.createMany({
      data: [
        {
          tenantId: tenant.id,
          worksheetId: worksheetOne.id,
          questionNumber: 1,
          operands: { a: 4, b: 1 },
          operation: "+",
          correctAnswer: 5
        },
        {
          tenantId: tenant.id,
          worksheetId: worksheetOne.id,
          questionNumber: 2,
          operands: { a: 9, b: 3 },
          operation: "-",
          correctAnswer: 6
        },
        {
          tenantId: tenant.id,
          worksheetId: worksheetTwo.id,
          questionNumber: 1,
          operands: { a: 6, b: 2 },
          operation: "-",
          correctAnswer: 4
        }
      ]
    });

    const now = new Date();
    const batch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerUser.hierarchyNodeId,
        name: `ENG-BATCH-${randomId("b")}`,
        levelId: level.id,
        status: "ACTIVE",
        isActive: true
      }
    });

    await prisma.worksheetAssignment.createMany({
      data: [
        {
          tenantId: tenant.id,
          worksheetId: worksheetOne.id,
          studentId: student.id,
          createdByUserId: centerUser.id,
          assignedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
          isActive: true
        },
        {
          tenantId: tenant.id,
          worksheetId: worksheetTwo.id,
          studentId: student.id,
          createdByUserId: centerUser.id,
          assignedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          isActive: true
        },
        {
          tenantId: tenant.id,
          worksheetId: worksheetThree.id,
          studentId: student.id,
          createdByUserId: centerUser.id,
          assignedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
          isActive: true
        }
      ]
    });

    await prisma.worksheetSubmission.createMany({
      data: [
        {
          tenantId: tenant.id,
          worksheetId: worksheetOne.id,
          studentId: student.id,
          submittedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          finalSubmittedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          status: "REVIEWED",
          score: 50,
          correctCount: 1,
          totalQuestions: 2,
          submittedAnswers: [
            { questionNumber: 1, answer: 5 },
            { questionNumber: 2, answer: 4 }
          ]
        },
        {
          tenantId: tenant.id,
          worksheetId: worksheetTwo.id,
          studentId: student.id,
          submittedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
          finalSubmittedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
          status: "REVIEWED",
          score: 100,
          correctCount: 1,
          totalQuestions: 1,
          submittedAnswers: [
            { questionNumber: 1, answer: 4 }
          ]
        }
      ]
    });

    const sessionOne = await prisma.attendanceSession.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerUser.hierarchyNodeId,
        batchId: batch.id,
        date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        status: "PUBLISHED",
        createdByUserId: centerUser.id,
        publishedAt: now
      }
    });

    const sessionTwo = await prisma.attendanceSession.create({
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

    await prisma.attendanceEntry.createMany({
      data: [
        {
          tenantId: tenant.id,
          sessionId: sessionOne.id,
          studentId: student.id,
          status: "PRESENT",
          markedAt: now,
          markedByUserId: centerUser.id
        },
        {
          tenantId: tenant.id,
          sessionId: sessionTwo.id,
          studentId: student.id,
          status: "ABSENT",
          markedAt: now,
          markedByUserId: centerUser.id
        }
      ]
    });

    await createOrUpdateOperationalEvent({
      tenantId: tenant.id,
      businessPartnerId: centerProfile.franchiseProfile.businessPartnerId,
      franchiseId: centerProfile.franchiseProfile.id,
      centerId: centerProfile.id,
      type: "STUDENT_ENGAGEMENT_PENDING_WORKSHEETS",
      category: "ACADEMIC",
      severity: "WARNING",
      title: "Pending worksheets need attention",
      message: "Student still has pending worksheets.",
      sourceKind: "SYSTEM",
      fingerprint: `test:student-engagement:${student.id}`,
      activeFingerprint: `test:student-engagement:${student.id}`,
      metadata: {
        reminderScope: "STUDENT_ENGAGEMENT",
        studentId: student.id
      },
      targets: [
        {
          recipientUserId: studentAuth.id,
          recipientRole: "STUDENT",
          businessPartnerId: centerProfile.franchiseProfile.businessPartnerId,
          franchiseId: centerProfile.franchiseProfile.id,
          centerId: centerProfile.id,
          targetKey: `user:${studentAuth.id}`
        }
      ]
    });

    const login = await loginAs({
      tenantCode: "DEFAULT",
      username: studentAuth.username,
      password: "Pass@123"
    });

    token = login.body?.data?.access_token;
  });

  test("GET /api/student/dashboard/overview returns engagement summary", async () => {
    const res = await http.get("/api/student/dashboard/overview").set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body?.data?.data?.student?.studentId).toBe(student.id);
    expect(res.body?.data?.data?.overview?.engagementScore).toEqual(expect.any(Number));
    expect(res.body?.data?.data?.practiceSummary?.totalCompleted).toBeGreaterThanOrEqual(2);
    expect(res.body?.data?.data?.reminderSummary?.total).toBeGreaterThanOrEqual(1);
  });

  test("GET /api/student/dashboard/weak-topics returns operation-level weak spots", async () => {
    const res = await http.get("/api/student/dashboard/weak-topics").set(authHeader(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.data?.data?.items)).toBe(true);
    expect(res.body?.data?.data?.summary?.weakTopicCount).toBeGreaterThanOrEqual(1);
  });

  test("GET /api/student/dashboard/reminders returns engagement reminders for the student", async () => {
    const res = await http.get("/api/student/dashboard/reminders").set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body?.data?.data?.total).toBeGreaterThanOrEqual(1);
    expect(res.body?.data?.data?.items[0]?.type).toBe("STUDENT_ENGAGEMENT_PENDING_WORKSHEETS");
  });
});