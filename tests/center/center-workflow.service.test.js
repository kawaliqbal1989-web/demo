import { jest } from "@jest/globals";
import {
  acknowledgeCenterWorkflow,
  getCenterWorkflowDetail,
  listCenterWorkflowHistory,
  listCenterWorkflows,
  resolveCenterWorkflow,
  reviewCenterWorkflow,
  startCenterWorkflowRecovery
} from "../../src/services/center-workflow.service.js";
import { ensureAuthUser, prisma, randomId } from "../helpers/test-helpers.js";

const snapshotDate = "2026-05-11T00:00:00.000Z";

function buildMockAnalyticsDependencies() {
  return {
    getCenterAttendanceOperationalAnalytics: jest.fn().mockResolvedValue({
      meta: {
        asOf: snapshotDate,
        source: {
          snapshotDate,
          liveFallback: false
        }
      },
      summary: {
        attendanceHealthScore: 58,
        chronicAbsenteeCount: 4
      },
      previews: {
        chronicAbsentees: [
          { id: "student-1", studentName: "Asha One", attendanceRate: 41 },
          { id: "student-2", studentName: "Bina Two", attendanceRate: 52 }
        ],
        inactiveStudents: [{ id: "student-3", studentName: "Chirag Three", inactiveDays: 16 }]
      },
      items: [{ id: "batch-1", batchName: "Batch Alpha", attendanceRate: 61 }]
    }),
    getCenterWorksheetOperationalAnalytics: jest.fn().mockResolvedValue({
      meta: {
        asOf: snapshotDate,
        source: {
          snapshotDate,
          liveFallback: false
        }
      },
      summary: {
        worksheetOperationalScore: 62,
        backlogCount: 7,
        delayedReviewCount: 3
      },
      backlogPreview: [{ id: "batch-1", batchName: "Batch Alpha", worksheetCompletionRate: 48 }],
      delayedReviewPreview: [{ id: "batch-2", batchName: "Batch Beta", delayedReviewCount: 3 }],
      items: [{ id: "batch-1", batchName: "Batch Alpha", worksheetCompletionRate: 48 }]
    }),
    getCenterTeacherOperationalAnalytics: jest.fn().mockResolvedValue({
      meta: {
        asOf: snapshotDate,
        source: {
          snapshotDate,
          liveFallback: false
        }
      },
      summary: {
        teacherCoordinationScore: 67,
        inactiveTeacherCount: 1
      },
      items: [{ id: "teacher-1", teacherUserId: "teacher-1", teacherName: "Teacher One", inactiveDays: 17 }]
    }),
    getCenterBatchHealthAnalytics: jest.fn().mockResolvedValue({
      meta: {
        asOf: snapshotDate,
        source: {
          snapshotDate,
          liveFallback: false
        }
      },
      summary: {
        inactiveBatchCount: 1,
        atRiskBatchCount: 1
      },
      items: [{ id: "batch-1", batchId: "batch-1", batchName: "Batch Alpha", operationalHealthScore: 43, inactiveDays: 18 }]
    }),
    getCenterOperationalAnomaliesAnalytics: jest.fn().mockResolvedValue({
      meta: {
        asOf: snapshotDate,
        source: {
          snapshotDate,
          liveFallback: false
        }
      },
      items: [
        {
          type: "ATTENDANCE_COLLAPSE",
          severity: "CRITICAL",
          title: "Attendance collapsed",
          message: "Attendance fell sharply across the current governance window.",
          metricKey: "attendancePercent",
          threshold: 65,
          observedValue: 51,
          centerId: "center-placeholder",
          centerName: "Center Placeholder"
        },
        {
          type: "WORKSHEET_BACKLOG",
          severity: "HIGH",
          title: "Worksheet backlog exceeded threshold",
          message: "Worksheet backlog is above the operational threshold.",
          metricKey: "worksheetBacklogRate",
          threshold: 25,
          observedValue: 40,
          centerId: "center-placeholder",
          centerName: "Center Placeholder"
        },
        {
          type: "TEACHER_INACTIVITY",
          severity: "WARNING",
          title: "Teacher inactivity detected",
          message: "A teacher has no recent coordination activity.",
          metricKey: "inactiveDays",
          threshold: 14,
          observedValue: 17,
          centerId: "center-placeholder",
          centerName: "Center Placeholder"
        }
      ]
    })
  };
}

describe("center-workflow.service", () => {
  const cleanup = {
    workflowIds: [],
    historyIds: [],
    taskIds: [],
    userIds: [],
    centerIds: [],
    franchiseIds: []
  };

  let tenant;
  let centerUser;
  let foreignCenterUser;

  beforeAll(async () => {
    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    const nodes = await prisma.hierarchyNode.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ createdAt: "asc" }],
      take: 2
    });

    centerUser = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `${randomId("center-wf")}@abacusweb.local`,
      username: randomId("cewf"),
      role: "CENTER",
      hierarchyNodeCode: nodes[0].code
    });
    foreignCenterUser = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `${randomId("center-wf-foreign")}@abacusweb.local`,
      username: randomId("cewff"),
      role: "CENTER",
      hierarchyNodeCode: (nodes[1] || nodes[0]).code
    });

    cleanup.userIds.push(centerUser.id, foreignCenterUser.id);

    const centers = await prisma.centerProfile.findMany({
      where: {
        authUserId: { in: [centerUser.id, foreignCenterUser.id] }
      },
      select: {
        id: true,
        authUserId: true,
        franchiseProfileId: true
      }
    });

    cleanup.centerIds.push(...centers.map((item) => item.id));
    cleanup.franchiseIds.push(...centers.map((item) => item.franchiseProfileId));
  });

  afterAll(async () => {
    await prisma.centerOperationalWorkflowTask.deleteMany({ where: { id: { in: cleanup.taskIds } } }).catch(() => {});
    await prisma.centerOperationalWorkflowHistory.deleteMany({ where: { id: { in: cleanup.historyIds } } }).catch(() => {});
    await prisma.centerOperationalWorkflow.deleteMany({ where: { id: { in: cleanup.workflowIds } } }).catch(() => {});
    await prisma.centerProfile.deleteMany({ where: { id: { in: cleanup.centerIds } } }).catch(() => {});
    await prisma.franchiseProfile.deleteMany({ where: { id: { in: cleanup.franchiseIds } } }).catch(() => {});
    await prisma.authUser.deleteMany({ where: { id: { in: cleanup.userIds } } }).catch(() => {});
  });

  test("workflow queues synchronize from center anomalies and paginate deterministically", async () => {
    const dependencies = buildMockAnalyticsDependencies();
    const response = await listCenterWorkflows({
      tenantId: tenant.id,
      authUserId: centerUser.id,
      hierarchyNodeId: centerUser.hierarchyNodeId,
      limit: 2,
      offset: 0,
      sortBy: "updatedAt",
      sortOrder: "desc",
      dependencies
    });

    expect(response.total).toBe(3);
    expect(response.items).toHaveLength(2);
    expect(response.summary).toMatchObject({
      attendanceQueueCount: 1,
      worksheetQueueCount: 1,
      teacherQueueCount: 1,
      anomalyQueueCount: 0
    });

    const stored = await prisma.centerOperationalWorkflow.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ createdAt: "asc" }]
    });
    cleanup.workflowIds.push(...stored.map((item) => item.id));

    const histories = await prisma.centerOperationalWorkflowHistory.findMany({
      where: { workflowId: { in: stored.map((item) => item.id) } }
    });
    cleanup.historyIds.push(...histories.map((item) => item.id));

    const tasks = await prisma.centerOperationalWorkflowTask.findMany({
      where: { workflowId: { in: stored.map((item) => item.id) } }
    });
    cleanup.taskIds.push(...tasks.map((item) => item.id));

    expect(stored.map((item) => item.workflowType)).toEqual(
      expect.arrayContaining(["ATTENDANCE_COLLAPSE", "WORKSHEET_BACKLOG", "TEACHER_INACTIVITY"])
    );
    expect(histories.every((item) => item.actionType === "OPEN")).toBe(true);
    expect(tasks.every((item) => item.taskType === "REVIEW_REQUIRED")).toBe(true);
  });

  test("workflow actions append immutable history and update versions safely", async () => {
    const workflow = await prisma.centerOperationalWorkflow.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        workflowType: "WORKSHEET_BACKLOG"
      }
    });

    const reviewed = await reviewCenterWorkflow({
      tenantId: tenant.id,
      authUserId: centerUser.id,
      hierarchyNodeId: centerUser.hierarchyNodeId,
      workflowId: workflow.id,
      actorUserId: centerUser.id,
      actorRole: "CENTER",
      expectedVersion: workflow.workflowVersion,
      notes: "Backlog reviewed"
    });
    expect(reviewed.workflow.status).toBe("REVIEWED");

    const recovery = await startCenterWorkflowRecovery({
      tenantId: tenant.id,
      authUserId: centerUser.id,
      hierarchyNodeId: centerUser.hierarchyNodeId,
      workflowId: workflow.id,
      actorUserId: centerUser.id,
      actorRole: "CENTER",
      expectedVersion: reviewed.workflow.workflowVersion,
      reason: "Teacher grading recovery underway",
      notes: "Coordinated review session",
      taskDueAt: "2026-05-15T10:00:00.000Z"
    });
    expect(recovery.workflow.status).toBe("IN_PROGRESS");
    expect(recovery.nextTask?.taskType).toBe("WORKSHEET_RECOVERY");

    const resolved = await resolveCenterWorkflow({
      tenantId: tenant.id,
      authUserId: centerUser.id,
      hierarchyNodeId: centerUser.hierarchyNodeId,
      workflowId: workflow.id,
      actorUserId: centerUser.id,
      actorRole: "CENTER",
      expectedVersion: recovery.workflow.workflowVersion,
      notes: "Backlog cleared"
    });
    expect(resolved.workflow.status).toBe("RESOLVED");

    const history = await listCenterWorkflowHistory({
      tenantId: tenant.id,
      authUserId: centerUser.id,
      hierarchyNodeId: centerUser.hierarchyNodeId,
      workflowId: workflow.id,
      limit: 10,
      offset: 0
    });

    expect(history.items.map((item) => item.actionType)).toEqual(["RESOLVE", "START_RECOVERY", "REVIEW", "OPEN"]);
  });

  test("stale workflow versions reject safely", async () => {
    const workflow = await prisma.centerOperationalWorkflow.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        workflowType: "ATTENDANCE_COLLAPSE"
      }
    });

    const acknowledged = await acknowledgeCenterWorkflow({
      tenantId: tenant.id,
      authUserId: centerUser.id,
      hierarchyNodeId: centerUser.hierarchyNodeId,
      workflowId: workflow.id,
      actorUserId: centerUser.id,
      actorRole: "CENTER",
      expectedVersion: workflow.workflowVersion,
      notes: "Center acknowledged the attendance risk"
    });
    expect(acknowledged.workflow.status).toBe("ACKNOWLEDGED");

    await expect(
      reviewCenterWorkflow({
        tenantId: tenant.id,
        authUserId: centerUser.id,
        hierarchyNodeId: centerUser.hierarchyNodeId,
        workflowId: workflow.id,
        actorUserId: centerUser.id,
        actorRole: "CENTER",
        expectedVersion: workflow.workflowVersion,
        notes: "Stale review attempt"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "WORKFLOW_VERSION_CONFLICT"
    });
  });

  test("center isolation blocks foreign workflow access", async () => {
    const foreignCenter = await prisma.centerProfile.findUniqueOrThrow({
      where: { authUserId: foreignCenterUser.id },
      include: {
        franchiseProfile: {
          select: {
            businessPartnerId: true
          }
        }
      }
    });

    const foreignWorkflow = await prisma.centerOperationalWorkflow.create({
      data: {
        tenantId: tenant.id,
        businessPartnerId: foreignCenter.franchiseProfile.businessPartnerId,
        franchiseId: foreignCenter.franchiseProfileId,
        centerId: foreignCenter.id,
        workflowKey: `center:${foreignCenter.id}:MANUAL_FOREIGN_TEST`,
        workflowType: "MANUAL_FOREIGN_TEST",
        queueType: "ANOMALY",
        status: "OPEN",
        currentActionRole: "CENTER",
        severity: "HIGH",
        title: "Foreign workflow",
        summary: "Foreign workflow for isolation validation",
        firstDetectedAt: new Date(snapshotDate),
        lastDetectedAt: new Date(snapshotDate),
        workflowVersion: 1,
        metadata: { source: "test" }
      }
    });
    cleanup.workflowIds.push(foreignWorkflow.id);

    const foreignHistory = await prisma.centerOperationalWorkflowHistory.create({
      data: {
        workflowId: foreignWorkflow.id,
        tenantId: tenant.id,
        businessPartnerId: foreignCenter.franchiseProfile.businessPartnerId,
        franchiseId: foreignCenter.franchiseProfileId,
        centerId: foreignCenter.id,
        fromStatus: null,
        toStatus: "OPEN",
        actionType: "OPEN",
        expectedVersion: 0,
        resultingVersion: 1,
        notes: "Foreign test open"
      }
    });
    cleanup.historyIds.push(foreignHistory.id);

    await expect(
      getCenterWorkflowDetail({
        tenantId: tenant.id,
        authUserId: centerUser.id,
        hierarchyNodeId: centerUser.hierarchyNodeId,
        workflowId: foreignWorkflow.id
      })
    ).rejects.toMatchObject({
      statusCode: 404,
      errorCode: "WORKFLOW_NOT_FOUND"
    });
  });
});