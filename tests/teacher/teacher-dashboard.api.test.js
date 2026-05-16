import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { authHeader, ensureAuthUser, loginAs, randomId } from "../helpers/test-helpers.js";

const http = request(app);

async function createTeacherDashboardContext(label) {
  const suffix = randomId(label);
  const tenant = await prisma.tenant.create({
    data: {
      name: `Teacher Dashboard ${suffix}`,
      code: `TD_${suffix}`
    }
  });

  const centerNode = await prisma.hierarchyNode.create({
    data: {
      tenantId: tenant.id,
      name: `Center ${suffix}`,
      code: `CTR_${suffix}`,
      type: "BRANCH"
    }
  });

  const level = await prisma.level.create({
    data: {
      tenantId: tenant.id,
      name: `Level ${suffix}`,
      rank: 1,
      description: "Teacher dashboard level"
    }
  });

  const centerEmail = `center.${suffix}@example.com`;
  const teacherEmail = `teacher.${suffix}@example.com`;
  const otherTeacherEmail = `teacher.other.${suffix}@example.com`;

  const centerUser = await ensureAuthUser({
    tenantCode: tenant.code,
    email: centerEmail,
    username: `CE_${suffix}`,
    role: "CENTER",
    hierarchyNodeCode: centerNode.code
  });

  const teacher = await ensureAuthUser({
    tenantCode: tenant.code,
    email: teacherEmail,
    username: `TE_${suffix}`,
    role: "TEACHER",
    hierarchyNodeCode: centerNode.code,
    parentUserId: centerUser.id
  });

  const otherTeacher = await ensureAuthUser({
    tenantCode: tenant.code,
    email: otherTeacherEmail,
    username: `TO_${suffix}`,
    role: "TEACHER",
    hierarchyNodeCode: centerNode.code,
    parentUserId: centerUser.id
  });

  const batch = await prisma.batch.create({
    data: {
      tenantId: tenant.id,
      hierarchyNodeId: centerNode.id,
      name: `Batch ${suffix}`,
      levelId: level.id,
      primaryTeacherUserId: teacher.id
    }
  });

  const otherBatch = await prisma.batch.create({
    data: {
      tenantId: tenant.id,
      hierarchyNodeId: centerNode.id,
      name: `Batch Other ${suffix}`,
      levelId: level.id,
      primaryTeacherUserId: otherTeacher.id
    }
  });

  await prisma.batchTeacherAssignment.create({
    data: {
      tenantId: tenant.id,
      batchId: batch.id,
      teacherUserId: teacher.id
    }
  });

  await prisma.batchTeacherAssignment.create({
    data: {
      tenantId: tenant.id,
      batchId: otherBatch.id,
      teacherUserId: otherTeacher.id
    }
  });

  const student = await prisma.student.create({
    data: {
      tenantId: tenant.id,
      admissionNo: `ST_${suffix}`,
      firstName: "Teacher",
      lastName: "Owned",
      hierarchyNodeId: centerNode.id,
      levelId: level.id,
      currentTeacherUserId: teacher.id,
      isActive: true
    }
  });

  const otherStudent = await prisma.student.create({
    data: {
      tenantId: tenant.id,
      admissionNo: `OT_${suffix}`,
      firstName: "Other",
      lastName: "Teacher",
      hierarchyNodeId: centerNode.id,
      levelId: level.id,
      currentTeacherUserId: otherTeacher.id,
      isActive: true
    }
  });

  await prisma.enrollment.create({
    data: {
      tenantId: tenant.id,
      hierarchyNodeId: centerNode.id,
      studentId: student.id,
      batchId: batch.id,
      assignedTeacherUserId: teacher.id,
      levelId: level.id,
      status: "ACTIVE"
    }
  });

  await prisma.enrollment.create({
    data: {
      tenantId: tenant.id,
      hierarchyNodeId: centerNode.id,
      studentId: otherStudent.id,
      batchId: otherBatch.id,
      assignedTeacherUserId: otherTeacher.id,
      levelId: level.id,
      status: "ACTIVE"
    }
  });

  const now = new Date();
  const delayedAttendanceDate = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
  const publishedAttendanceDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

  await prisma.attendanceSession.create({
    data: {
      tenantId: tenant.id,
      hierarchyNodeId: centerNode.id,
      batchId: batch.id,
      date: delayedAttendanceDate,
      status: "DRAFT",
      createdByUserId: teacher.id
    }
  });

  const publishedSession = await prisma.attendanceSession.create({
    data: {
      tenantId: tenant.id,
      hierarchyNodeId: centerNode.id,
      batchId: batch.id,
      date: publishedAttendanceDate,
      status: "PUBLISHED",
      createdByUserId: teacher.id,
      publishedAt: now
    }
  });

  await prisma.attendanceEntry.create({
    data: {
      tenantId: tenant.id,
      sessionId: publishedSession.id,
      studentId: student.id,
      status: "ABSENT",
      markedAt: now,
      markedByUserId: teacher.id
    }
  });

  await prisma.attendanceSession.create({
    data: {
      tenantId: tenant.id,
      hierarchyNodeId: centerNode.id,
      batchId: otherBatch.id,
      date: delayedAttendanceDate,
      status: "DRAFT",
      createdByUserId: otherTeacher.id
    }
  });

  for (let index = 0; index < 9; index += 1) {
    const worksheet = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `Worksheet ${suffix} ${index}`,
        description: "Teacher productivity worksheet",
        levelId: level.id,
        createdByUserId: teacher.id,
        isPublished: true
      }
    });

    await prisma.worksheetAssignment.create({
      data: {
        tenantId: tenant.id,
        worksheetId: worksheet.id,
        studentId: student.id,
        createdByUserId: teacher.id,
        assignedAt: new Date(now.getTime() - (index + 8) * 24 * 60 * 60 * 1000),
        isActive: true
      }
    });

    await prisma.worksheetSubmission.create({
      data: {
        tenantId: tenant.id,
        worksheetId: worksheet.id,
        studentId: student.id,
        submittedAt: new Date(now.getTime() - (index + 6) * 24 * 60 * 60 * 1000),
        status: index === 0 ? "REVIEWED" : "PENDING",
        score: index === 0 ? 88 : null
      }
    });
  }

  const otherWorksheet = await prisma.worksheet.create({
    data: {
      tenantId: tenant.id,
      title: `Other Worksheet ${suffix}`,
      description: "Other teacher worksheet",
      levelId: level.id,
      createdByUserId: otherTeacher.id,
      isPublished: true
    }
  });

  await prisma.worksheetAssignment.create({
    data: {
      tenantId: tenant.id,
      worksheetId: otherWorksheet.id,
      studentId: otherStudent.id,
      createdByUserId: otherTeacher.id,
      assignedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      isActive: true
    }
  });

  await prisma.worksheetSubmission.create({
    data: {
      tenantId: tenant.id,
      worksheetId: otherWorksheet.id,
      studentId: otherStudent.id,
      submittedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      status: "PENDING"
    }
  });

  const staleDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  await prisma.$executeRaw`
    UPDATE student
    SET updatedAt = ${staleDate}
    WHERE id = ${student.id}
  `;

  return {
    tenant,
    teacherEmail,
    otherStudentId: otherStudent.id
  };
}

describe("teacher dashboard APIs", () => {
  test("teacher dashboard endpoints expose scoped productivity analytics and reminders", async () => {
    const primary = await createTeacherDashboardContext("td_primary");
    await createTeacherDashboardContext("td_secondary");

    const login = await loginAs({
      tenantCode: primary.tenant.code,
      email: primary.teacherEmail
    });

    expect(login.status).toBe(200);
    const token = login.body?.data?.access_token;

    const overview = await http.get("/api/teacher/dashboard/overview").set(authHeader(token));
    expect(overview.status).toBe(200);
    expect(overview.body?.data?.data).toMatchObject({
      assignedStudentCount: 1,
      assignedBatchCount: 1,
      overdueActionCount: expect.any(Number),
      inactiveTaskDetected: true
    });
    expect(overview.body?.data?.meta?.source?.liveFallback).toBe(true);

    const attendance = await http.get("/api/teacher/dashboard/attendance-productivity").set(authHeader(token));
    expect(attendance.status).toBe(200);
    expect(attendance.body?.data?.data?.summary).toMatchObject({
      assignedBatchCount: 1,
      completedSessionCount: 1,
      delayedAttendanceCount: 1,
      absenteeFollowUpCount: 1
    });

    const grading = await http.get("/api/teacher/dashboard/grading-productivity").set(authHeader(token));
    expect(grading.status).toBe(200);
    expect(grading.body?.data?.data?.summary).toMatchObject({
      assignedWorksheetCount: 9,
      completedWorksheetCount: 9,
      pendingReviewCount: 8,
      overdueReviewCount: 8,
      backlogDetected: true
    });

    const queue = await http.get("/api/teacher/dashboard/task-queue").set(authHeader(token));
    expect(queue.status).toBe(200);
    expect(queue.body?.data?.data?.summary).toMatchObject({
      attendanceCount: 1,
      classroomCount: 1,
      workflowCount: expect.any(Number)
    });

    const anomalies = await http.get("/api/teacher/dashboard/anomalies").set(authHeader(token));
    expect(anomalies.status).toBe(200);
    const anomalyTypes = new Set((anomalies.body?.data?.items || []).map((item) => item.itemType));
    expect(anomalyTypes.has("DELAYED_ATTENDANCE_SUBMISSION")).toBe(true);
    expect(anomalyTypes.has("OVERDUE_WORKSHEET_REVIEW")).toBe(true);
    expect(anomalyTypes.has("INACTIVE_CLASSROOM_ACTIVITY")).toBe(true);
    expect(anomalyTypes.has("PENDING_OPERATIONAL_TASKS")).toBe(true);
    expect(anomalyTypes.has("GRADING_BACKLOG")).toBe(true);
    expect(anomalyTypes.has("UNRESOLVED_CLASSROOM_ANOMALIES")).toBe(true);
    expect((anomalies.body?.data?.items || []).every((item) => item.studentId !== primary.otherStudentId)).toBe(true);

    const trends = await http.get("/api/teacher/dashboard/trends?months=4").set(authHeader(token));
    expect(trends.status).toBe(200);
    expect(trends.body?.data?.items).toHaveLength(4);
    expect(trends.body?.data?.summary?.latestProductivityScore).toEqual(expect.any(Number));
  }, 30000);
});