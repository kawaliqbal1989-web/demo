import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { authHeader, ensureAuthUser, loginAs, randomId } from "../helpers/test-helpers.js";

const http = request(app);

function unwrapApiData(response) {
  return response.body?.data?.data || response.body?.data || null;
}

async function createTeacherWorkflowContext(label) {
  const suffix = randomId(label);
  const tenant = await prisma.tenant.create({
    data: {
      name: `Teacher Workflow ${suffix}`,
      code: `TW_${suffix}`
    }
  });

  const centerNode = await prisma.hierarchyNode.create({
    data: {
      tenantId: tenant.id,
      name: `Workflow Center ${suffix}`,
      code: `WF_${suffix}`,
      type: "BRANCH"
    }
  });

  const level = await prisma.level.create({
    data: {
      tenantId: tenant.id,
      name: `Workflow Level ${suffix}`,
      rank: 1,
      description: "Teacher workflow test level"
    }
  });

  const centerUser = await ensureAuthUser({
    tenantCode: tenant.code,
    email: `center.${suffix}@example.com`,
    username: `CWF_${suffix}`,
    role: "CENTER",
    hierarchyNodeCode: centerNode.code
  });

  const teacher = await ensureAuthUser({
    tenantCode: tenant.code,
    email: `teacher.${suffix}@example.com`,
    username: `TWF_${suffix}`,
    role: "TEACHER",
    hierarchyNodeCode: centerNode.code,
    parentUserId: centerUser.id
  });

  const otherTeacher = await ensureAuthUser({
    tenantCode: tenant.code,
    email: `teacher.other.${suffix}@example.com`,
    username: `TWO_${suffix}`,
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
      name: `Other Batch ${suffix}`,
      levelId: level.id,
      primaryTeacherUserId: otherTeacher.id
    }
  });

  await prisma.batchTeacherAssignment.createMany({
    data: [
      { tenantId: tenant.id, batchId: batch.id, teacherUserId: teacher.id },
      { tenantId: tenant.id, batchId: otherBatch.id, teacherUserId: otherTeacher.id }
    ]
  });

  const student = await prisma.student.create({
    data: {
      tenantId: tenant.id,
      admissionNo: `S_${suffix}`,
      firstName: "Workflow",
      lastName: "Primary",
      hierarchyNodeId: centerNode.id,
      levelId: level.id,
      currentTeacherUserId: teacher.id,
      isActive: true
    }
  });

  const otherStudent = await prisma.student.create({
    data: {
      tenantId: tenant.id,
      admissionNo: `O_${suffix}`,
      firstName: "Workflow",
      lastName: "Other",
      hierarchyNodeId: centerNode.id,
      levelId: level.id,
      currentTeacherUserId: otherTeacher.id,
      isActive: true
    }
  });

  await prisma.enrollment.createMany({
    data: [
      {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: student.id,
        batchId: batch.id,
        assignedTeacherUserId: teacher.id,
        levelId: level.id,
        status: "ACTIVE"
      },
      {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: otherStudent.id,
        batchId: otherBatch.id,
        assignedTeacherUserId: otherTeacher.id,
        levelId: level.id,
        status: "ACTIVE"
      }
    ]
  });

  const now = new Date();
  const delayedAttendanceDate = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
  const publishedAttendanceDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

  const delayedSession = await prisma.attendanceSession.create({
    data: {
      tenantId: tenant.id,
      hierarchyNodeId: centerNode.id,
      batchId: batch.id,
      date: delayedAttendanceDate,
      status: "DRAFT",
      createdByUserId: teacher.id
    }
  });

  await prisma.attendanceEntry.create({
    data: {
      tenantId: tenant.id,
      sessionId: delayedSession.id,
      studentId: student.id,
      status: "PRESENT",
      markedAt: delayedAttendanceDate,
      markedByUserId: teacher.id
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

  const primarySubmissionIds = [];
  for (let index = 0; index < 4; index += 1) {
    const worksheet = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `Workflow Worksheet ${suffix} ${index}`,
        description: "Teacher workflow worksheet",
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
        assignedAt: new Date(now.getTime() - (index + 7) * 24 * 60 * 60 * 1000),
        isActive: true
      }
    });

    const submission = await prisma.worksheetSubmission.create({
      data: {
        tenantId: tenant.id,
        worksheetId: worksheet.id,
        studentId: student.id,
        submittedAt: new Date(now.getTime() - (index + 5) * 24 * 60 * 60 * 1000),
        status: index === 0 ? "REVIEWED" : "PENDING",
        score: index === 0 ? 91 : null
      }
    });

    if (submission.status === "PENDING") {
      primarySubmissionIds.push(submission.id);
    }
  }

  const foreignWorksheet = await prisma.worksheet.create({
    data: {
      tenantId: tenant.id,
      title: `Foreign Worksheet ${suffix}`,
      description: "Foreign teacher worksheet",
      levelId: level.id,
      createdByUserId: otherTeacher.id,
      isPublished: true
    }
  });

  await prisma.worksheetAssignment.create({
    data: {
      tenantId: tenant.id,
      worksheetId: foreignWorksheet.id,
      studentId: otherStudent.id,
      createdByUserId: otherTeacher.id,
      assignedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
      isActive: true
    }
  });

  await prisma.worksheetSubmission.create({
    data: {
      tenantId: tenant.id,
      worksheetId: foreignWorksheet.id,
      studentId: otherStudent.id,
      submittedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
      status: "PENDING"
    }
  });

  const staleDate = new Date(now.getTime() - 11 * 24 * 60 * 60 * 1000);
  await prisma.$executeRaw`
    UPDATE student
    SET updatedAt = ${staleDate}
    WHERE id = ${student.id}
  `;

  return {
    tenant,
    teacherEmail: `teacher.${suffix}@example.com`,
    otherTeacherEmail: `teacher.other.${suffix}@example.com`,
    delayedSessionId: delayedSession.id,
    primarySubmissionIds
  };
}

describe("teacher workflow APIs", () => {
  test("teacher workflow queues synchronize with teacher-scoped detail and history", async () => {
    const context = await createTeacherWorkflowContext("teacher_wf_scope");

    const login = await loginAs({
      tenantCode: context.tenant.code,
      email: context.teacherEmail
    });
    expect(login.status).toBe(200);
    const token = login.body?.data?.access_token;

    const queue = await http.get("/api/teacher/workflows/queues?limit=20&offset=0").set(authHeader(token));
    expect(queue.status).toBe(200);
    const queueData = unwrapApiData(queue);
    expect(queueData?.total).toBeGreaterThanOrEqual(5);
    expect(queueData?.summary?.attendanceQueueCount).toBe(1);
    expect(queueData?.summary?.gradingQueueCount).toBeGreaterThanOrEqual(2);
    expect(queueData?.summary?.classroomQueueCount).toEqual(expect.any(Number));
    expect(queueData?.summary?.anomalyQueueCount).toEqual(expect.any(Number));

    const queueItems = queueData?.items || [];
    const attendanceWorkflow = queueItems.find((item) => item.workflowType === "DELAYED_ATTENDANCE_SUBMISSION");
    const gradingWorkflow = queueItems.find((item) => item.queueType === "GRADING");

    expect(attendanceWorkflow).toBeTruthy();
    expect(gradingWorkflow).toBeTruthy();

    const attendanceQueue = await http.get("/api/teacher/workflows/queues/attendance?limit=10&offset=0").set(authHeader(token));
    expect(attendanceQueue.status).toBe(200);
    expect((unwrapApiData(attendanceQueue)?.items || []).every((item) => item.queueType === "ATTENDANCE")).toBe(true);

    const anomalyQueue = await http.get("/api/teacher/workflows/queues/anomalies?limit=20&offset=0").set(authHeader(token));
    expect(anomalyQueue.status).toBe(200);
    expect((unwrapApiData(anomalyQueue)?.items || []).every((item) => ["CLASSROOM", "ANOMALY"].includes(item.queueType))).toBe(true);

    const detail = await http.get(`/api/teacher/workflows/${attendanceWorkflow.id}`).set(authHeader(token));
    expect(detail.status).toBe(200);
    const detailData = unwrapApiData(detail);
    expect(detailData?.workflow).toMatchObject({
      id: attendanceWorkflow.id,
      workflowType: "DELAYED_ATTENDANCE_SUBMISSION",
      queueType: "ATTENDANCE"
    });
    expect(detailData?.history?.[0]?.actionType).toBe("OPEN");

    const history = await http.get(`/api/teacher/workflows/${attendanceWorkflow.id}/history?limit=10&offset=0`).set(authHeader(token));
    expect(history.status).toBe(200);
    expect(unwrapApiData(history)?.items.some((item) => item.actionType === "OPEN")).toBe(true);

    const foreignLogin = await loginAs({
      tenantCode: context.tenant.code,
      email: context.otherTeacherEmail
    });
    expect(foreignLogin.status).toBe(200);
    const foreignToken = foreignLogin.body?.data?.access_token;

    const foreignDetail = await http.get(`/api/teacher/workflows/${attendanceWorkflow.id}`).set(authHeader(foreignToken));
    expect(foreignDetail.status).toBe(404);
  }, 30000);

  test("teacher workflow actions mutate attendance and grading with immutable history and stale-version protection", async () => {
    const context = await createTeacherWorkflowContext("teacher_wf_actions");

    const login = await loginAs({
      tenantCode: context.tenant.code,
      email: context.teacherEmail
    });
    expect(login.status).toBe(200);
    const token = login.body?.data?.access_token;

    const queue = await http.get("/api/teacher/workflows/queues?limit=20&offset=0").set(authHeader(token));
    expect(queue.status).toBe(200);
    const queueItems = unwrapApiData(queue)?.items || [];
    const attendanceWorkflow = queueItems.find((item) => item.workflowType === "DELAYED_ATTENDANCE_SUBMISSION");
    const gradingWorkflow = queueItems.find((item) => item.queueType === "GRADING");

    expect(attendanceWorkflow).toBeTruthy();
    expect(gradingWorkflow).toBeTruthy();

    const attendanceAction = await http
      .post(`/api/teacher/workflows/${attendanceWorkflow.id}/actions/mark-attendance`)
      .set(authHeader(token))
      .send({
        expectedVersion: attendanceWorkflow.workflowVersion,
        publish: true,
        notes: "Attendance published from workflow execution."
      });

    expect(attendanceAction.status).toBe(200);
    const attendanceActionData = unwrapApiData(attendanceAction);
    expect(attendanceActionData?.workflow?.status).toBe("RESOLVED");
    expect(attendanceActionData?.mutationResult).toMatchObject({
      attendanceSessionId: context.delayedSessionId,
      published: true
    });

    const attendanceSession = await prisma.attendanceSession.findUniqueOrThrow({
      where: { id: context.delayedSessionId },
      select: { status: true, publishedAt: true }
    });
    expect(attendanceSession.status).toBe("PUBLISHED");
    expect(attendanceSession.publishedAt).not.toBeNull();

    const gradingAction = await http
      .post(`/api/teacher/workflows/${gradingWorkflow.id}/actions/bulk-grade`)
      .set(authHeader(token))
      .send({
        expectedVersion: gradingWorkflow.workflowVersion,
        submissionIds: context.primarySubmissionIds,
        remarks: "Reviewed during classroom recovery."
      });

    expect(gradingAction.status).toBe(200);
    const gradingActionData = unwrapApiData(gradingAction);
    expect(gradingActionData?.workflow?.status).toBe("RESOLVED");
    expect(gradingActionData?.mutationResult?.updatedSubmissionCount).toBe(context.primarySubmissionIds.length);

    const reviewedSubmissions = await prisma.worksheetSubmission.findMany({
      where: { id: { in: context.primarySubmissionIds } },
      select: { id: true, status: true, finalSubmittedAt: true }
    });
    expect(reviewedSubmissions.every((item) => item.status === "REVIEWED" && item.finalSubmittedAt)).toBe(true);

    const staleConflict = await http
      .post(`/api/teacher/workflows/${gradingWorkflow.id}/actions/review`)
      .set(authHeader(token))
      .send({
        expectedVersion: gradingWorkflow.workflowVersion,
        notes: "This stale review should fail."
      });

    expect(staleConflict.status).toBe(409);

    const gradingHistory = await http
      .get(`/api/teacher/workflows/${gradingWorkflow.id}/history?limit=10&offset=0`)
      .set(authHeader(token));
    expect(gradingHistory.status).toBe(200);
    expect(unwrapApiData(gradingHistory)?.items.map((item) => item.actionType)).toEqual(
      expect.arrayContaining(["BULK_GRADE", "OPEN"])
    );
  }, 30000);
});