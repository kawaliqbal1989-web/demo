import { prisma } from "../lib/prisma.js";
import {
  getCenterAttendanceOperationalAnalytics,
  getCenterBatchHealthAnalytics,
  getCenterOperationalAnomaliesAnalytics,
  getCenterTeacherOperationalAnalytics,
  getCenterWorksheetOperationalAnalytics,
  resolveCenterOperationalScope
} from "./center-operational-analytics.service.js";

const ACTIVE_TASK_STATES = ["OPEN", "IN_PROGRESS", "OVERDUE"];
const CENTER_QUEUE_TYPES = ["ATTENDANCE", "WORKSHEET", "TEACHER", "ANOMALY"];
const REVIEWABLE_STATUSES = new Set(["OPEN", "REVIEWED", "ACKNOWLEDGED", "IN_PROGRESS", "FOLLOW_UP_REQUIRED", "ESCALATED", "RESOLVED"]);

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeRequiredText(value, fieldName) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw createHttpError(400, `${fieldName} is required`, "VALIDATION_ERROR");
  }

  return normalized;
}

function normalizeExpectedVersion(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw createHttpError(400, "workflowVersion must be a positive integer", "VALIDATION_ERROR");
  }

  return parsed;
}

function normalizeDate(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, `${fieldName} must be a valid date`, "VALIDATION_ERROR");
  }

  return parsed;
}

function normalizeMetadata(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw createHttpError(400, "metadata must be an object", "VALIDATION_ERROR");
  }

  return value;
}

function normalizePreviewItems(items = [], limit = 5) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.slice(0, limit);
}

function computeQueueType(workflowType) {
  if (["ATTENDANCE_COLLAPSE", "CHRONIC_ABSENTEE_SPIKE"].includes(workflowType)) {
    return "ATTENDANCE";
  }

  if (["WORKSHEET_BACKLOG", "DELAYED_WORKSHEET_REVIEW"].includes(workflowType)) {
    return "WORKSHEET";
  }

  if (["TEACHER_INACTIVITY"].includes(workflowType)) {
    return "TEACHER";
  }

  return "ANOMALY";
}

function buildCurrentActionRole(status, fallbackRole = "CENTER") {
  if (status === "RESOLVED") {
    return null;
  }

  if (status === "ESCALATED") {
    return "FRANCHISE";
  }

  return fallbackRole;
}

function buildDueAtFromSeverity(severity, referenceDate = new Date()) {
  const dueAt = new Date(referenceDate);
  const dayCount = severity === "CRITICAL" ? 1 : severity === "HIGH" ? 2 : severity === "WARNING" ? 3 : 5;
  dueAt.setUTCDate(dueAt.getUTCDate() + dayCount);
  return dueAt;
}

function buildWorkflowKey({ centerId, workflowType }) {
  return ["center", centerId, workflowType].join(":");
}

function buildAllowedActions(workflow) {
  if (!workflow) {
    return [];
  }

  if (workflow.status === "RESOLVED") {
    return ["REOPEN"];
  }

  if (workflow.status === "ESCALATED") {
    return ["RESOLVE"];
  }

  if (workflow.status === "OPEN") {
    return ["REVIEW", "ACKNOWLEDGE", "START_RECOVERY", "SCHEDULE_FOLLOW_UP", "ESCALATE_TO_FRANCHISE", "RESOLVE"];
  }

  if (workflow.status === "REVIEWED" || workflow.status === "ACKNOWLEDGED") {
    return ["START_RECOVERY", "SCHEDULE_FOLLOW_UP", "ESCALATE_TO_FRANCHISE", "RESOLVE"];
  }

  if (workflow.status === "IN_PROGRESS" || workflow.status === "FOLLOW_UP_REQUIRED") {
    return ["SCHEDULE_FOLLOW_UP", "ESCALATE_TO_FRANCHISE", "RESOLVE"];
  }

  return [];
}

function buildWorkflowSummary(workflow) {
  return {
    id: workflow.id,
    title: workflow.title,
    summary: workflow.summary,
    queueType: workflow.queueType,
    workflowType: workflow.workflowType,
    status: workflow.status,
    currentActionRole: workflow.currentActionRole,
    severity: workflow.severity,
    centerId: workflow.centerId,
    centerName: workflow.center?.name || null,
    centerCode: workflow.center?.code || null,
    workflowVersion: workflow.workflowVersion,
    firstDetectedAt: workflow.firstDetectedAt,
    lastDetectedAt: workflow.lastDetectedAt,
    lastWorkflowActionAt: workflow.lastWorkflowActionAt,
    acknowledgedAt: workflow.acknowledgedAt,
    inProgressAt: workflow.inProgressAt,
    followUpAt: workflow.followUpAt,
    escalatedAt: workflow.escalatedAt,
    resolvedAt: workflow.resolvedAt,
    allowedActions: buildAllowedActions(workflow)
  };
}

function buildSourcePreviewMap({ attendanceAnalytics, worksheetAnalytics, teacherAnalytics, batchAnalytics }) {
  return {
    ATTENDANCE_COLLAPSE: {
      summary: attendanceAnalytics.summary,
      chronicAbsentees: normalizePreviewItems(attendanceAnalytics.previews?.chronicAbsentees),
      inactiveStudents: normalizePreviewItems(attendanceAnalytics.previews?.inactiveStudents),
      batchRisks: normalizePreviewItems(attendanceAnalytics.items)
    },
    CHRONIC_ABSENTEE_SPIKE: {
      summary: attendanceAnalytics.summary,
      chronicAbsentees: normalizePreviewItems(attendanceAnalytics.previews?.chronicAbsentees),
      inactiveStudents: normalizePreviewItems(attendanceAnalytics.previews?.inactiveStudents)
    },
    WORKSHEET_BACKLOG: {
      summary: worksheetAnalytics.summary,
      backlogPreview: normalizePreviewItems(worksheetAnalytics.backlogPreview),
      delayedReviewPreview: normalizePreviewItems(worksheetAnalytics.delayedReviewPreview)
    },
    DELAYED_WORKSHEET_REVIEW: {
      summary: worksheetAnalytics.summary,
      backlogPreview: normalizePreviewItems(worksheetAnalytics.backlogPreview),
      delayedReviewPreview: normalizePreviewItems(worksheetAnalytics.delayedReviewPreview)
    },
    TEACHER_INACTIVITY: {
      summary: teacherAnalytics.summary,
      inactiveTeachers: normalizePreviewItems(teacherAnalytics.items)
    },
    INACTIVE_BATCHES: {
      summary: batchAnalytics.summary,
      batchRisks: normalizePreviewItems(batchAnalytics.items)
    },
    OPERATIONAL_CLASSROOM_RISK: {
      summary: batchAnalytics.summary,
      batchRisks: normalizePreviewItems(batchAnalytics.items)
    }
  };
}

function buildSourceWorkflows({ centerScope, anomaliesAnalytics, attendanceAnalytics, worksheetAnalytics, teacherAnalytics, batchAnalytics }) {
  const source = anomaliesAnalytics?.meta?.source || {};
  const snapshotDate = anomaliesAnalytics?.meta?.asOf || source.snapshotDate || new Date().toISOString();
  const previewMap = buildSourcePreviewMap({ attendanceAnalytics, worksheetAnalytics, teacherAnalytics, batchAnalytics });
  const items = Array.isArray(anomaliesAnalytics?.items) ? anomaliesAnalytics.items : [];

  return items.map((item) => ({
    workflowKey: buildWorkflowKey({ centerId: centerScope.center.id, workflowType: item.type }),
    workflowType: item.type,
    queueType: computeQueueType(item.type),
    severity: item.severity,
    title: item.title,
    summary: item.message,
    metricKey: item.metricKey || null,
    thresholdValue: item.threshold ?? null,
    observedValue: item.observedValue ?? null,
    deltaPercent: item.deltaPercent ?? null,
    sourceSnapshotDate: snapshotDate ? new Date(snapshotDate) : null,
    sourceWindowKey: source.snapshotDate || snapshotDate || null,
    detectedAt: new Date(snapshotDate || Date.now()),
    metadata: {
      originalType: item.type,
      centerName: item.centerName || centerScope.center.name,
      preview: previewMap[item.type] || null,
      recommendedActions: buildAllowedActions({ status: "OPEN" }),
      anomaly: item
    }
  }));
}

async function closeActiveTasks({ tx, workflowId, now }) {
  await tx.centerOperationalWorkflowTask.updateMany({
    where: {
      workflowId,
      state: { in: ACTIVE_TASK_STATES }
    },
    data: {
      state: "COMPLETED",
      completedAt: now,
      resolvedAt: now
    }
  });
}

async function createWorkflowTask({ tx, workflow, targetRole, targetUserId, taskType, dueAt, metadata }) {
  if (!taskType || !targetRole) {
    return null;
  }

  return tx.centerOperationalWorkflowTask.create({
    data: {
      workflowId: workflow.id,
      tenantId: workflow.tenantId,
      businessPartnerId: workflow.businessPartnerId,
      franchiseId: workflow.franchiseId,
      centerId: workflow.centerId,
      targetRole,
      targetUserId: targetUserId || null,
      taskType,
      dueAt: dueAt || null,
      metadata: metadata || null
    }
  });
}

async function appendHistory({
  tx,
  workflow,
  fromStatus,
  toStatus,
  actionType,
  actorUserId,
  actorRole,
  expectedVersion,
  notes,
  reason,
  metadata
}) {
  return tx.centerOperationalWorkflowHistory.create({
    data: {
      workflowId: workflow.id,
      tenantId: workflow.tenantId,
      businessPartnerId: workflow.businessPartnerId,
      franchiseId: workflow.franchiseId,
      centerId: workflow.centerId,
      fromStatus,
      toStatus,
      actionType,
      actorUserId: actorUserId || null,
      actorRole: actorRole || null,
      expectedVersion,
      resultingVersion: expectedVersion + 1,
      notes: notes || null,
      reason: reason || null,
      metadata: metadata || null
    }
  });
}

async function fetchWorkflowDetailRecord({ tx, workflowId }) {
  return tx.centerOperationalWorkflow.findUniqueOrThrow({
    where: { id: workflowId },
    include: {
      center: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          authUserId: true
        }
      },
      tasks: {
        orderBy: [{ createdAt: "asc" }]
      },
      history: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          actorUser: {
            select: {
              id: true,
              username: true,
              email: true,
              role: true
            }
          }
        }
      }
    }
  });
}

async function synchronizeCenterOperationalWorkflows({
  tenantId,
  authUserId,
  hierarchyNodeId,
  centerScope = null,
  tx = prisma,
  dependencies = {}
} = {}) {
  const resolveScope = dependencies.resolveCenterOperationalScope || resolveCenterOperationalScope;
  const scopedCenter = centerScope || await resolveScope({ tenantId, authUserId, hierarchyNodeId, tx });

  if (!scopedCenter?.center?.id) {
    throw createHttpError(403, "Center scope not resolved", "CENTER_SCOPE_REQUIRED");
  }

  const loadAttendance = dependencies.getCenterAttendanceOperationalAnalytics || getCenterAttendanceOperationalAnalytics;
  const loadWorksheets = dependencies.getCenterWorksheetOperationalAnalytics || getCenterWorksheetOperationalAnalytics;
  const loadTeachers = dependencies.getCenterTeacherOperationalAnalytics || getCenterTeacherOperationalAnalytics;
  const loadBatchHealth = dependencies.getCenterBatchHealthAnalytics || getCenterBatchHealthAnalytics;
  const loadAnomalies = dependencies.getCenterOperationalAnomaliesAnalytics || getCenterOperationalAnomaliesAnalytics;

  return tx.$transaction(async (db) => {
    const analyticsPayload = {
      tenantId,
      authUserId: scopedCenter.center.authUserId,
      hierarchyNodeId: scopedCenter.center.hierarchyNodeId,
      query: { limit: 50, offset: 0, sortBy: "severity", sortDirection: "desc" },
      tx: db
    };

    const [attendanceAnalytics, worksheetAnalytics, teacherAnalytics, batchAnalytics, anomaliesAnalytics] = await Promise.all([
      loadAttendance(analyticsPayload),
      loadWorksheets({ ...analyticsPayload, query: { limit: 25, offset: 0, sortBy: "worksheetBacklogCount", sortDirection: "desc" } }),
      loadTeachers({ ...analyticsPayload, query: { limit: 25, offset: 0, inactiveOnly: "true", sortBy: "inactiveDays", sortDirection: "desc" } }),
      loadBatchHealth({ ...analyticsPayload, query: { limit: 25, offset: 0, riskOnly: "true", sortBy: "operationalHealthScore", sortDirection: "asc" } }),
      loadAnomalies(analyticsPayload)
    ]);

    const sourceWorkflows = buildSourceWorkflows({
      centerScope: scopedCenter,
      anomaliesAnalytics,
      attendanceAnalytics,
      worksheetAnalytics,
      teacherAnalytics,
      batchAnalytics
    });

    const existingWorkflows = await db.centerOperationalWorkflow.findMany({
      where: {
        tenantId,
        centerId: scopedCenter.center.id
      }
    });

    const existingByKey = new Map(existingWorkflows.map((workflow) => [workflow.workflowKey, workflow]));
    const seenKeys = new Set();
    const now = new Date();

    for (const sourceWorkflow of sourceWorkflows) {
      seenKeys.add(sourceWorkflow.workflowKey);
      const existingWorkflow = existingByKey.get(sourceWorkflow.workflowKey) || null;
      const baseData = {
        tenantId,
        businessPartnerId: scopedCenter.center.businessPartnerId,
        franchiseId: scopedCenter.center.franchiseId,
        centerId: scopedCenter.center.id,
        workflowKey: sourceWorkflow.workflowKey,
        workflowType: sourceWorkflow.workflowType,
        queueType: sourceWorkflow.queueType,
        severity: sourceWorkflow.severity,
        title: sourceWorkflow.title,
        summary: sourceWorkflow.summary,
        metricKey: sourceWorkflow.metricKey,
        thresholdValue: sourceWorkflow.thresholdValue,
        observedValue: sourceWorkflow.observedValue,
        deltaPercent: sourceWorkflow.deltaPercent,
        sourceSnapshotDate: sourceWorkflow.sourceSnapshotDate,
        sourceWindowKey: sourceWorkflow.sourceWindowKey,
        lastDetectedAt: sourceWorkflow.detectedAt,
        metadata: sourceWorkflow.metadata
      };

      if (!existingWorkflow) {
        const createdWorkflow = await db.centerOperationalWorkflow.create({
          data: {
            ...baseData,
            firstDetectedAt: sourceWorkflow.detectedAt,
            status: "OPEN",
            currentActionRole: "CENTER"
          }
        });

        await createWorkflowTask({
          tx: db,
          workflow: createdWorkflow,
          targetRole: "CENTER",
          targetUserId: scopedCenter.center.authUserId || null,
          taskType: "REVIEW_REQUIRED",
          dueAt: buildDueAtFromSeverity(sourceWorkflow.severity, sourceWorkflow.detectedAt),
          metadata: {
            source: "center-operational-anomaly-sync",
            workflowType: sourceWorkflow.workflowType
          }
        });

        await appendHistory({
          tx: db,
          workflow: createdWorkflow,
          fromStatus: null,
          toStatus: "OPEN",
          actionType: "OPEN",
          actorUserId: null,
          actorRole: null,
          expectedVersion: 0,
          notes: "Workflow initialized from center operational anomalies.",
          reason: null,
          metadata: {
            source: "center-operational-anomaly-sync",
            workflowType: sourceWorkflow.workflowType
          }
        });
        continue;
      }

      const shouldReopen =
        existingWorkflow.status === "RESOLVED"
        && (!existingWorkflow.resolvedAt || sourceWorkflow.detectedAt > existingWorkflow.resolvedAt);

      if (shouldReopen) {
        await db.centerOperationalWorkflow.update({
          where: { id: existingWorkflow.id },
          data: {
            ...baseData,
            status: "OPEN",
            currentActionRole: "CENTER",
            resolvedAt: null,
            reopenedAt: now,
            lastWorkflowActionAt: now,
            workflowVersion: { increment: 1 }
          }
        });

        await createWorkflowTask({
          tx: db,
          workflow: existingWorkflow,
          targetRole: "CENTER",
          targetUserId: scopedCenter.center.authUserId || null,
          taskType: "REVIEW_REQUIRED",
          dueAt: buildDueAtFromSeverity(sourceWorkflow.severity, sourceWorkflow.detectedAt),
          metadata: {
            source: "center-operational-anomaly-sync",
            reopened: true,
            workflowType: sourceWorkflow.workflowType
          }
        });

        await appendHistory({
          tx: db,
          workflow: existingWorkflow,
          fromStatus: "RESOLVED",
          toStatus: "OPEN",
          actionType: "REOPEN",
          actorUserId: null,
          actorRole: null,
          expectedVersion: existingWorkflow.workflowVersion,
          notes: "Workflow reopened because the center anomaly retriggered.",
          reason: null,
          metadata: {
            source: "center-operational-anomaly-sync",
            workflowType: sourceWorkflow.workflowType
          }
        });

        continue;
      }

      await db.centerOperationalWorkflow.update({
        where: { id: existingWorkflow.id },
        data: {
          ...baseData,
          currentActionRole: buildCurrentActionRole(existingWorkflow.status, existingWorkflow.currentActionRole || "CENTER")
        }
      });
    }

    for (const workflow of existingWorkflows) {
      if (workflow.status === "RESOLVED" || seenKeys.has(workflow.workflowKey)) {
        continue;
      }

      await closeActiveTasks({ tx: db, workflowId: workflow.id, now });
      await db.centerOperationalWorkflow.update({
        where: { id: workflow.id },
        data: {
          status: "RESOLVED",
          currentActionRole: null,
          resolvedAt: now,
          lastWorkflowActionAt: now,
          workflowVersion: { increment: 1 }
        }
      });

      await appendHistory({
        tx: db,
        workflow,
        fromStatus: workflow.status,
        toStatus: "RESOLVED",
        actionType: "RESOLVE",
        actorUserId: null,
        actorRole: null,
        expectedVersion: workflow.workflowVersion,
        notes: "Workflow auto-resolved because the underlying center anomaly normalized.",
        reason: null,
        metadata: {
          source: "center-operational-anomaly-sync",
          autoResolved: true
        }
      });
    }

    return {
      workflowCount: sourceWorkflows.length,
      centerId: scopedCenter.center.id
    };
  });
}

function buildWorkflowWhere({ tenantId, centerId, filters = {}, queueType = null }) {
  const where = {
    tenantId,
    centerId
  };

  if (queueType) {
    where.queueType = queueType;
  }

  if (Array.isArray(filters.statuses) && filters.statuses.length) {
    where.status = { in: filters.statuses.filter((item) => REVIEWABLE_STATUSES.has(item)) };
  }

  if (Array.isArray(filters.severities) && filters.severities.length) {
    where.severity = { in: filters.severities };
  }

  if (Array.isArray(filters.workflowTypes) && filters.workflowTypes.length) {
    where.workflowType = { in: filters.workflowTypes };
  }

  if (filters.query) {
    where.OR = [
      { title: { contains: filters.query } },
      { summary: { contains: filters.query } },
      { workflowType: { contains: filters.query } }
    ];
  }

  return where;
}

function buildSummaryCountWhere(baseWhere, queueType) {
  if (!queueType) {
    return baseWhere;
  }

  return {
    ...baseWhere,
    queueType
  };
}

async function listCenterWorkflows({
  tenantId,
  authUserId,
  hierarchyNodeId,
  filters = {},
  limit = 20,
  offset = 0,
  sortBy = "updatedAt",
  sortOrder = "desc",
  queueType = null,
  centerScope = null,
  dependencies = {}
} = {}) {
  const resolveScope = dependencies.resolveCenterOperationalScope || resolveCenterOperationalScope;
  const scopedCenter = centerScope || await resolveScope({ tenantId, authUserId, hierarchyNodeId });

  await synchronizeCenterOperationalWorkflows({
    tenantId,
    authUserId,
    hierarchyNodeId,
    centerScope: scopedCenter,
    dependencies
  });

  const where = buildWorkflowWhere({
    tenantId,
    centerId: scopedCenter.center.id,
    filters,
    queueType
  });
  const orderBy = { [sortBy]: sortOrder };

  const [items, total, attendanceQueueCount, worksheetQueueCount, teacherQueueCount, anomalyQueueCount, resolvedCount] = await Promise.all([
    prisma.centerOperationalWorkflow.findMany({
      where,
      orderBy,
      skip: offset,
      take: limit,
      include: {
        center: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true
          }
        },
        tasks: {
          where: { state: { in: ACTIVE_TASK_STATES } },
          orderBy: [{ createdAt: "asc" }],
          take: 3
        }
      }
    }),
    prisma.centerOperationalWorkflow.count({ where }),
    prisma.centerOperationalWorkflow.count({ where: buildSummaryCountWhere({ tenantId, centerId: scopedCenter.center.id }, "ATTENDANCE") }),
    prisma.centerOperationalWorkflow.count({ where: buildSummaryCountWhere({ tenantId, centerId: scopedCenter.center.id }, "WORKSHEET") }),
    prisma.centerOperationalWorkflow.count({ where: buildSummaryCountWhere({ tenantId, centerId: scopedCenter.center.id }, "TEACHER") }),
    prisma.centerOperationalWorkflow.count({ where: buildSummaryCountWhere({ tenantId, centerId: scopedCenter.center.id }, "ANOMALY") }),
    prisma.centerOperationalWorkflow.count({ where: { tenantId, centerId: scopedCenter.center.id, status: "RESOLVED" } })
  ]);

  return {
    items: items.map((item) => buildWorkflowSummary(item)),
    limit,
    offset,
    total,
    sortBy,
    sortOrder,
    summary: {
      attendanceQueueCount,
      worksheetQueueCount,
      teacherQueueCount,
      anomalyQueueCount,
      resolvedCount
    }
  };
}

async function getCenterWorkflowDetail({ tenantId, authUserId, hierarchyNodeId, workflowId, centerScope = null, dependencies = {} } = {}) {
  const resolveScope = dependencies.resolveCenterOperationalScope || resolveCenterOperationalScope;
  const scopedCenter = centerScope || await resolveScope({ tenantId, authUserId, hierarchyNodeId });

  await synchronizeCenterOperationalWorkflows({
    tenantId,
    authUserId,
    hierarchyNodeId,
    centerScope: scopedCenter,
    dependencies
  });

  const workflow = await prisma.centerOperationalWorkflow.findFirst({
    where: {
      id: workflowId,
      tenantId,
      centerId: scopedCenter.center.id
    },
    select: { id: true }
  });

  if (!workflow) {
    throw createHttpError(404, "Workflow not found", "WORKFLOW_NOT_FOUND");
  }

  const detail = await prisma.$transaction(async (tx) => fetchWorkflowDetailRecord({ tx, workflowId }));

  return {
    workflow: {
      ...buildWorkflowSummary(detail),
      workflowKey: detail.workflowKey,
      metadata: detail.metadata || null
    },
    center: detail.center,
    tasks: detail.tasks,
    history: detail.history
  };
}

async function listCenterWorkflowHistory({
  tenantId,
  authUserId,
  hierarchyNodeId,
  workflowId,
  limit = 20,
  offset = 0,
  centerScope = null,
  dependencies = {}
} = {}) {
  const resolveScope = dependencies.resolveCenterOperationalScope || resolveCenterOperationalScope;
  const scopedCenter = centerScope || await resolveScope({ tenantId, authUserId, hierarchyNodeId });

  const workflow = await prisma.centerOperationalWorkflow.findFirst({
    where: {
      id: workflowId,
      tenantId,
      centerId: scopedCenter.center.id
    },
    select: { id: true }
  });

  if (!workflow) {
    throw createHttpError(404, "Workflow not found", "WORKFLOW_NOT_FOUND");
  }

  const [items, total] = await Promise.all([
    prisma.centerOperationalWorkflowHistory.findMany({
      where: { workflowId },
      orderBy: [{ createdAt: "desc" }],
      skip: offset,
      take: limit,
      include: {
        actorUser: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true
          }
        }
      }
    }),
    prisma.centerOperationalWorkflowHistory.count({ where: { workflowId } })
  ]);

  return {
    items,
    limit,
    offset,
    total
  };
}

function assertCenterActor(actorRole) {
  if (actorRole !== "CENTER") {
    throw createHttpError(403, "Only center actors can govern center workflows", "WORKFLOW_ROLE_DENIED");
  }
}

function assertCenterWorkflowScope({ centerScope, workflow }) {
  const scopedCenterId = centerScope?.center?.id;
  if (!scopedCenterId || workflow?.centerId !== scopedCenterId) {
    throw createHttpError(404, "Workflow not found", "WORKFLOW_NOT_FOUND");
  }
}

function assertWorkflowVersion({ expectedVersion, workflow }) {
  if (expectedVersion !== workflow.workflowVersion) {
    throw createHttpError(409, "Workflow version is stale", "WORKFLOW_VERSION_CONFLICT");
  }
}

function assertActionAllowed(actionType, workflow) {
  if (!buildAllowedActions(workflow).includes(actionType)) {
    throw createHttpError(409, `Action ${actionType} is not allowed in the current workflow state`, "INVALID_TRANSITION");
  }
}

function buildRecoveryTaskType(workflow) {
  if (workflow.queueType === "ATTENDANCE") {
    return "ATTENDANCE_RECOVERY";
  }

  if (workflow.queueType === "WORKSHEET") {
    return "WORKSHEET_RECOVERY";
  }

  if (workflow.queueType === "TEACHER") {
    return "TEACHER_COORDINATION";
  }

  return "BATCH_FOLLOW_UP";
}

async function executeCenterWorkflowAction({
  tenantId,
  authUserId,
  hierarchyNodeId,
  centerScope = null,
  workflowId,
  actorUserId,
  actorRole,
  expectedVersion,
  actionType,
  notes,
  reason,
  taskDueAt,
  metadata,
  transition,
  dependencies = {}
} = {}) {
  assertCenterActor(actorRole);
  const normalizedExpectedVersion = normalizeExpectedVersion(expectedVersion);
  const normalizedNotes = normalizeOptionalText(notes);
  const normalizedReason = normalizeOptionalText(reason);
  const normalizedTaskDueAt = normalizeDate(taskDueAt, "taskDueAt");
  const normalizedMetadata = normalizeMetadata(metadata);
  const resolveScope = dependencies.resolveCenterOperationalScope || resolveCenterOperationalScope;
  const scopedCenter = centerScope || await resolveScope({ tenantId, authUserId, hierarchyNodeId });

  return prisma.$transaction(async (tx) => {
    const workflow = await tx.centerOperationalWorkflow.findUniqueOrThrow({
      where: { id: workflowId },
      include: {
        center: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            authUserId: true
          }
        },
        tasks: {
          where: { state: { in: ACTIVE_TASK_STATES } },
          orderBy: [{ createdAt: "asc" }]
        }
      }
    });

    if (workflow.tenantId !== tenantId) {
      throw createHttpError(404, "Workflow not found", "WORKFLOW_NOT_FOUND");
    }

    assertCenterWorkflowScope({ centerScope: scopedCenter, workflow });
    assertWorkflowVersion({ expectedVersion: normalizedExpectedVersion, workflow });
    assertActionAllowed(actionType, workflow);

    const now = new Date();
    const nextStatus = transition.toStatus;
    const updateResult = await tx.centerOperationalWorkflow.updateMany({
      where: {
        id: workflow.id,
        tenantId,
        centerId: scopedCenter.center.id,
        workflowVersion: normalizedExpectedVersion
      },
      data: {
        status: nextStatus,
        currentActionRole: transition.currentActionRole || buildCurrentActionRole(nextStatus),
        workflowVersion: { increment: 1 },
        lastWorkflowActionAt: now,
        ...transition.updateFields
      }
    });

    if (updateResult.count !== 1) {
      throw createHttpError(409, "Workflow version is stale", "WORKFLOW_VERSION_CONFLICT");
    }

    await closeActiveTasks({ tx, workflowId: workflow.id, now });

    const history = await appendHistory({
      tx,
      workflow,
      fromStatus: workflow.status,
      toStatus: nextStatus,
      actionType,
      actorUserId,
      actorRole,
      expectedVersion: normalizedExpectedVersion,
      notes: normalizedNotes,
      reason: normalizedReason,
      metadata: normalizedMetadata
    });

    let nextTask = null;
    if (typeof transition.createTask === "function") {
      nextTask = await transition.createTask({
        tx,
        workflow,
        now,
        dueAt: normalizedTaskDueAt,
        notes: normalizedNotes,
        reason: normalizedReason
      });
    }

    const updatedWorkflow = await fetchWorkflowDetailRecord({ tx, workflowId: workflow.id });

    return {
      workflow: {
        ...buildWorkflowSummary(updatedWorkflow),
        workflowKey: updatedWorkflow.workflowKey,
        metadata: updatedWorkflow.metadata || null
      },
      center: updatedWorkflow.center,
      tasks: updatedWorkflow.tasks,
      history: updatedWorkflow.history,
      lastHistory: history,
      nextTask,
      workflowVersion: updatedWorkflow.workflowVersion
    };
  });
}

async function reviewCenterWorkflow(payload) {
  return executeCenterWorkflowAction({
    ...payload,
    actionType: "REVIEW",
    transition: {
      toStatus: "REVIEWED",
      currentActionRole: "CENTER",
      updateFields: {
        acknowledgedAt: null
      }
    }
  });
}

async function acknowledgeCenterWorkflow(payload) {
  return executeCenterWorkflowAction({
    ...payload,
    actionType: "ACKNOWLEDGE",
    transition: {
      toStatus: "ACKNOWLEDGED",
      currentActionRole: "CENTER",
      updateFields: {
        acknowledgedAt: new Date()
      }
    }
  });
}

async function startCenterWorkflowRecovery(payload) {
  return executeCenterWorkflowAction({
    ...payload,
    actionType: "START_RECOVERY",
    transition: {
      toStatus: "IN_PROGRESS",
      currentActionRole: "CENTER",
      updateFields: {
        inProgressAt: new Date()
      },
      createTask: async ({ tx, workflow, now, dueAt, notes, reason }) =>
        createWorkflowTask({
          tx,
          workflow,
          targetRole: "CENTER",
          targetUserId: workflow.center?.authUserId || null,
          taskType: buildRecoveryTaskType(workflow),
          dueAt: dueAt || buildDueAtFromSeverity(workflow.severity, now),
          metadata: {
            source: "center-governance",
            reason,
            notes
          }
        })
    }
  });
}

async function scheduleCenterWorkflowFollowUp(payload) {
  return executeCenterWorkflowAction({
    ...payload,
    actionType: "SCHEDULE_FOLLOW_UP",
    transition: {
      toStatus: "FOLLOW_UP_REQUIRED",
      currentActionRole: "CENTER",
      updateFields: {
        followUpAt: new Date()
      },
      createTask: async ({ tx, workflow, now, dueAt, notes, reason }) =>
        createWorkflowTask({
          tx,
          workflow,
          targetRole: "CENTER",
          targetUserId: workflow.center?.authUserId || null,
          taskType: "FOLLOW_UP_CHECKPOINT",
          dueAt: dueAt || buildDueAtFromSeverity(workflow.severity, now),
          metadata: {
            source: "center-governance",
            reason,
            notes
          }
        })
    }
  });
}

async function escalateCenterWorkflowToFranchise(payload) {
  const normalizedReason = normalizeRequiredText(payload.reason, "reason");

  return executeCenterWorkflowAction({
    ...payload,
    reason: normalizedReason,
    actionType: "ESCALATE_TO_FRANCHISE",
    transition: {
      toStatus: "ESCALATED",
      currentActionRole: "FRANCHISE",
      updateFields: {
        escalatedAt: new Date()
      },
      createTask: async ({ tx, workflow, now, dueAt, notes, reason }) =>
        createWorkflowTask({
          tx,
          workflow,
          targetRole: "FRANCHISE",
          targetUserId: null,
          taskType: "FRANCHISE_ESCALATION_REVIEW",
          dueAt: dueAt || buildDueAtFromSeverity(workflow.severity, now),
          metadata: {
            source: "center-governance",
            reason,
            notes
          }
        })
    }
  });
}

async function resolveCenterWorkflow(payload) {
  return executeCenterWorkflowAction({
    ...payload,
    actionType: "RESOLVE",
    transition: {
      toStatus: "RESOLVED",
      currentActionRole: null,
      updateFields: {
        resolvedAt: new Date()
      }
    }
  });
}

async function reopenCenterWorkflow(payload) {
  return executeCenterWorkflowAction({
    ...payload,
    actionType: "REOPEN",
    transition: {
      toStatus: "OPEN",
      currentActionRole: "CENTER",
      updateFields: {
        resolvedAt: null,
        reopenedAt: new Date()
      },
      createTask: async ({ tx, workflow, now }) =>
        createWorkflowTask({
          tx,
          workflow,
          targetRole: "CENTER",
          targetUserId: workflow.center?.authUserId || null,
          taskType: "REVIEW_REQUIRED",
          dueAt: buildDueAtFromSeverity(workflow.severity, now),
          metadata: {
            source: "center-governance",
            reopened: true
          }
        })
    }
  });
}

export {
  acknowledgeCenterWorkflow,
  escalateCenterWorkflowToFranchise,
  getCenterWorkflowDetail,
  listCenterWorkflowHistory,
  listCenterWorkflows,
  reopenCenterWorkflow,
  resolveCenterWorkflow,
  reviewCenterWorkflow,
  scheduleCenterWorkflowFollowUp,
  startCenterWorkflowRecovery,
  synchronizeCenterOperationalWorkflows
};