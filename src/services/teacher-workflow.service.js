import { prisma } from "../lib/prisma.js";
import {
  getTeacherAttendanceProductivityAnalytics,
  getTeacherGradingProductivityAnalytics,
  getTeacherOperationalAnomaliesAnalytics,
  resolveTeacherOperationalScope
} from "./teacher-analytics.service.js";

const ACTIVE_TASK_STATES = ["OPEN", "IN_PROGRESS", "OVERDUE"];
const REVIEWABLE_STATUSES = new Set(["OPEN", "REVIEWED", "ACKNOWLEDGED", "IN_PROGRESS", "FOLLOW_UP_REQUIRED", "RESOLVED"]);
const ATTENDANCE_ENTRY_STATUSES = new Set(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);

function createHttpError(statusCode, message, errorCode, metadata = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  if (metadata) {
    error.metadata = metadata;
  }
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

function normalizeSubmissionIds(values, fallback = []) {
  const source = Array.isArray(values) ? values : fallback;
  return Array.from(new Set(source.map((value) => String(value || "").trim()).filter(Boolean)));
}

function normalizeAttendanceEntries(entries = []) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => ({
      studentId: String(entry?.studentId || "").trim(),
      status: String(entry?.status || "").trim().toUpperCase(),
      note: entry?.note === undefined ? undefined : String(entry.note || "").slice(0, 191)
    }))
    .filter((entry) => entry.studentId && ATTENDANCE_ENTRY_STATUSES.has(entry.status));
}

function buildDueAtFromSeverity(severity, referenceDate = new Date()) {
  const dueAt = new Date(referenceDate);
  const dayCount = severity === "CRITICAL" ? 1 : severity === "HIGH" ? 2 : severity === "WARNING" ? 3 : 5;
  dueAt.setUTCDate(dueAt.getUTCDate() + dayCount);
  return dueAt;
}

function computeQueueType(workflowType, queueTypeHint) {
  if (queueTypeHint === "ATTENDANCE") {
    return "ATTENDANCE";
  }

  if (queueTypeHint === "GRADING") {
    return "GRADING";
  }

  if (queueTypeHint === "CLASSROOM") {
    return "CLASSROOM";
  }

  if (["DELAYED_ATTENDANCE_SUBMISSION"].includes(workflowType)) {
    return "ATTENDANCE";
  }

  if (["OVERDUE_WORKSHEET_REVIEW", "GRADING_BACKLOG"].includes(workflowType)) {
    return "GRADING";
  }

  if (["INACTIVE_CLASSROOM_ACTIVITY", "PENDING_OPERATIONAL_TASKS"].includes(workflowType)) {
    return "CLASSROOM";
  }

  return "ANOMALY";
}

function buildWorkflowKey({ teacherUserId, workflowType, batchId, studentId, attendanceSessionId, worksheetSubmissionId }) {
  return [
    "teacher",
    teacherUserId,
    workflowType,
    batchId || "none",
    studentId || "none",
    attendanceSessionId || worksheetSubmissionId || "none"
  ].join(":");
}

function buildCurrentActionRole(status, fallbackRole = "TEACHER") {
  if (status === "RESOLVED") {
    return null;
  }

  return fallbackRole;
}

function buildAllowedActions(workflow) {
  if (!workflow) {
    return [];
  }

  if (workflow.status === "RESOLVED") {
    return ["REOPEN"];
  }

  const baseActions = ["REVIEW", "ACKNOWLEDGE", "START_RECOVERY", "RESOLVE"];
  if (workflow.queueType === "ATTENDANCE") {
    return [...baseActions, "MARK_ATTENDANCE"];
  }

  if (workflow.queueType === "GRADING") {
    return [...baseActions, "COMPLETE_GRADING", "BULK_GRADE"];
  }

  return baseActions;
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
    teacherProfileId: workflow.teacherProfileId,
    teacherUserId: workflow.teacherUserId,
    batchId: workflow.batchId || null,
    batchName: workflow.batchName || null,
    studentId: workflow.studentId || null,
    studentName: workflow.studentName || null,
    attendanceSessionId: workflow.attendanceSessionId || null,
    worksheetSubmissionId: workflow.worksheetSubmissionId || null,
    workflowVersion: workflow.workflowVersion,
    firstDetectedAt: workflow.firstDetectedAt,
    lastDetectedAt: workflow.lastDetectedAt,
    lastWorkflowActionAt: workflow.lastWorkflowActionAt,
    acknowledgedAt: workflow.acknowledgedAt,
    inProgressAt: workflow.inProgressAt,
    followUpAt: workflow.followUpAt,
    resolvedAt: workflow.resolvedAt,
    allowedActions: buildAllowedActions(workflow)
  };
}

function buildSourcePreviewMap({ attendanceAnalytics, gradingAnalytics, anomaliesAnalytics }) {
  const anomaliesSummary = anomaliesAnalytics?.summary || null;
  return {
    DELAYED_ATTENDANCE_SUBMISSION: {
      summary: attendanceAnalytics.summary,
      delayedSessions: normalizePreviewItems(attendanceAnalytics.delayedSessions),
      absenteePreview: normalizePreviewItems(attendanceAnalytics.absenteePreview)
    },
    OVERDUE_WORKSHEET_REVIEW: {
      summary: gradingAnalytics.summary,
      backlogPreview: normalizePreviewItems(gradingAnalytics.backlogPreview),
      overduePreview: normalizePreviewItems(gradingAnalytics.overduePreview)
    },
    GRADING_BACKLOG: {
      summary: gradingAnalytics.summary,
      backlogPreview: normalizePreviewItems(gradingAnalytics.backlogPreview),
      overduePreview: normalizePreviewItems(gradingAnalytics.overduePreview)
    },
    INACTIVE_CLASSROOM_ACTIVITY: {
      attendanceSummary: attendanceAnalytics.summary,
      gradingSummary: gradingAnalytics.summary,
      anomaliesSummary
    },
    PENDING_OPERATIONAL_TASKS: {
      attendanceSummary: attendanceAnalytics.summary,
      gradingSummary: gradingAnalytics.summary,
      anomaliesSummary
    },
    UNRESOLVED_CLASSROOM_ANOMALIES: {
      attendanceSummary: attendanceAnalytics.summary,
      gradingSummary: gradingAnalytics.summary,
      anomaliesSummary
    }
  };
}

function buildSourceWorkflows({ scope, attendanceAnalytics, gradingAnalytics, anomaliesAnalytics }) {
  const source = anomaliesAnalytics?.meta?.source || {};
  const snapshotDate = anomaliesAnalytics?.meta?.asOf || source.snapshotDate || new Date().toISOString();
  const previewMap = buildSourcePreviewMap({ attendanceAnalytics, gradingAnalytics, anomaliesAnalytics });
  const items = Array.isArray(anomaliesAnalytics?.items) ? anomaliesAnalytics.items : [];

  return items.map((item) => {
    const queueType = computeQueueType(item.itemType, item.queueType);
    return {
      workflowKey: buildWorkflowKey({
        teacherUserId: scope.teacherUserId,
        workflowType: item.itemType,
        batchId: item.batchId || null,
        studentId: item.studentId || null,
        attendanceSessionId: item.sessionId || null,
        worksheetSubmissionId: item.submissionId || null
      }),
      workflowType: item.itemType,
      queueType,
      severity: item.severity || "WARNING",
      title: item.title,
      summary: item.summary,
      metricKey: item.itemType,
      thresholdValue: null,
      observedValue: item.priorityScore ?? item.delayedDays ?? null,
      deltaPercent: null,
      batchId: item.batchId || null,
      batchName: item.batchName || null,
      studentId: item.studentId || null,
      studentName: item.studentName || null,
      attendanceSessionId: item.sessionId || null,
      worksheetSubmissionId: item.submissionId || null,
      sourceSnapshotDate: snapshotDate ? new Date(snapshotDate) : null,
      sourceWindowKey: source.snapshotDate || snapshotDate || null,
      detectedAt: new Date(item.updatedAt || item.createdAt || snapshotDate || Date.now()),
      metadata: {
        source: "teacher-productivity-anomalies",
        anomaly: item,
        preview: previewMap[item.itemType] || null,
        recommendedActions: buildAllowedActions({ status: "OPEN", queueType }),
        dueAt: item.dueAt || null
      }
    };
  });
}

async function closeActiveTasks({ tx, workflowId, now }) {
  await tx.teacherOperationalWorkflowTask.updateMany({
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

  return tx.teacherOperationalWorkflowTask.create({
    data: {
      workflowId: workflow.id,
      tenantId: workflow.tenantId,
      businessPartnerId: workflow.businessPartnerId,
      franchiseId: workflow.franchiseId,
      centerId: workflow.centerId,
      teacherProfileId: workflow.teacherProfileId,
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
  return tx.teacherOperationalWorkflowHistory.create({
    data: {
      workflowId: workflow.id,
      tenantId: workflow.tenantId,
      businessPartnerId: workflow.businessPartnerId,
      franchiseId: workflow.franchiseId,
      centerId: workflow.centerId,
      teacherProfileId: workflow.teacherProfileId,
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
  return tx.teacherOperationalWorkflow.findUniqueOrThrow({
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
      teacherProfile: {
        select: {
          id: true,
          fullName: true,
          authUserId: true,
          hierarchyNodeId: true
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

function buildWorkflowWhere({ tenantId, teacherUserId, filters = {}, queueTypes = null }) {
  const where = {
    tenantId,
    teacherUserId
  };

  if (Array.isArray(queueTypes) && queueTypes.length) {
    where.queueType = { in: queueTypes };
  } else if (typeof queueTypes === "string" && queueTypes) {
    where.queueType = queueTypes;
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
      { workflowType: { contains: filters.query } },
      { batchName: { contains: filters.query } },
      { studentName: { contains: filters.query } }
    ];
  }

  return where;
}

function buildSummaryCountWhere(baseWhere, queueTypes) {
  if (!queueTypes) {
    return baseWhere;
  }

  if (Array.isArray(queueTypes)) {
    return {
      ...baseWhere,
      queueType: { in: queueTypes }
    };
  }

  return {
    ...baseWhere,
    queueType: queueTypes
  };
}

function buildOrderBy(sortBy = "updatedAt", sortOrder = "desc") {
  return [{ [sortBy]: sortOrder }, { id: sortOrder }];
}

function buildInitialTaskType(sourceWorkflow) {
  if (sourceWorkflow.queueType === "ATTENDANCE") {
    return "ATTENDANCE_SUBMISSION";
  }

  if (sourceWorkflow.queueType === "GRADING") {
    return "GRADING_REVIEW";
  }

  return "REVIEW_REQUIRED";
}

async function synchronizeTeacherOperationalWorkflows({
  tenantId,
  authUserId,
  hierarchyNodeId,
  teacherScope = null,
  tx = prisma,
  dependencies = {}
} = {}) {
  const resolveScope = dependencies.resolveTeacherOperationalScope || resolveTeacherOperationalScope;
  const scopedTeacher = teacherScope || await resolveScope({ tenantId, authUserId, hierarchyNodeId, tx });

  if (!scopedTeacher?.teacherProfileId || !scopedTeacher?.teacherUserId) {
    throw createHttpError(403, "Teacher scope not resolved", "TEACHER_SCOPE_REQUIRED");
  }

  const loadAttendance = dependencies.getTeacherAttendanceProductivityAnalytics || getTeacherAttendanceProductivityAnalytics;
  const loadGrading = dependencies.getTeacherGradingProductivityAnalytics || getTeacherGradingProductivityAnalytics;
  const loadAnomalies = dependencies.getTeacherOperationalAnomaliesAnalytics || getTeacherOperationalAnomaliesAnalytics;

  return tx.$transaction(async (db) => {
    const analyticsPayload = {
      tenantId,
      authUserId: scopedTeacher.teacherUserId,
      hierarchyNodeId: scopedTeacher.hierarchyNodeId,
      tx: db
    };

    const [attendanceAnalytics, gradingAnalytics, anomaliesAnalytics] = await Promise.all([
      loadAttendance({ ...analyticsPayload, query: { limit: 25, offset: 0 } }),
      loadGrading({ ...analyticsPayload, query: { limit: 25, offset: 0 } }),
      loadAnomalies({
        ...analyticsPayload,
        query: { limit: 50, offset: 0, sortBy: "priorityScore", sortDirection: "desc" }
      })
    ]);

    const sourceWorkflows = buildSourceWorkflows({
      scope: scopedTeacher,
      attendanceAnalytics,
      gradingAnalytics,
      anomaliesAnalytics
    });

    const existingWorkflows = await db.teacherOperationalWorkflow.findMany({
      where: {
        tenantId,
        teacherUserId: scopedTeacher.teacherUserId
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
        businessPartnerId: scopedTeacher.businessPartnerId,
        franchiseId: scopedTeacher.franchiseId,
        centerId: scopedTeacher.centerId,
        teacherProfileId: scopedTeacher.teacherProfileId,
        teacherUserId: scopedTeacher.teacherUserId,
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
        batchId: sourceWorkflow.batchId,
        batchName: sourceWorkflow.batchName,
        studentId: sourceWorkflow.studentId,
        studentName: sourceWorkflow.studentName,
        attendanceSessionId: sourceWorkflow.attendanceSessionId,
        worksheetSubmissionId: sourceWorkflow.worksheetSubmissionId,
        sourceSnapshotDate: sourceWorkflow.sourceSnapshotDate,
        sourceWindowKey: sourceWorkflow.sourceWindowKey,
        lastDetectedAt: sourceWorkflow.detectedAt,
        metadata: sourceWorkflow.metadata
      };

      if (!existingWorkflow) {
        const createdWorkflow = await db.teacherOperationalWorkflow.create({
          data: {
            ...baseData,
            firstDetectedAt: sourceWorkflow.detectedAt,
            status: "OPEN",
            currentActionRole: "TEACHER"
          }
        });

        await createWorkflowTask({
          tx: db,
          workflow: createdWorkflow,
          targetRole: "TEACHER",
          targetUserId: scopedTeacher.teacherUserId,
          taskType: buildInitialTaskType(sourceWorkflow),
          dueAt: buildDueAtFromSeverity(sourceWorkflow.severity, sourceWorkflow.detectedAt),
          metadata: {
            source: "teacher-productivity-sync",
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
          notes: "Workflow initialized from teacher productivity anomalies.",
          reason: null,
          metadata: {
            source: "teacher-productivity-sync",
            workflowType: sourceWorkflow.workflowType
          }
        });
        continue;
      }

      const shouldReopen =
        existingWorkflow.status === "RESOLVED"
        && (!existingWorkflow.resolvedAt || sourceWorkflow.detectedAt > existingWorkflow.resolvedAt);

      if (shouldReopen) {
        await db.teacherOperationalWorkflow.update({
          where: { id: existingWorkflow.id },
          data: {
            ...baseData,
            status: "OPEN",
            currentActionRole: "TEACHER",
            resolvedAt: null,
            reopenedAt: now,
            lastWorkflowActionAt: now,
            workflowVersion: { increment: 1 }
          }
        });

        await createWorkflowTask({
          tx: db,
          workflow: existingWorkflow,
          targetRole: "TEACHER",
          targetUserId: scopedTeacher.teacherUserId,
          taskType: buildInitialTaskType(sourceWorkflow),
          dueAt: buildDueAtFromSeverity(sourceWorkflow.severity, sourceWorkflow.detectedAt),
          metadata: {
            source: "teacher-productivity-sync",
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
          notes: "Workflow reopened because the teacher productivity anomaly retriggered.",
          reason: null,
          metadata: {
            source: "teacher-productivity-sync",
            workflowType: sourceWorkflow.workflowType
          }
        });
        continue;
      }

      await db.teacherOperationalWorkflow.update({
        where: { id: existingWorkflow.id },
        data: {
          ...baseData,
          currentActionRole: buildCurrentActionRole(existingWorkflow.status, existingWorkflow.currentActionRole || "TEACHER")
        }
      });
    }

    for (const workflow of existingWorkflows) {
      if (workflow.status === "RESOLVED" || seenKeys.has(workflow.workflowKey)) {
        continue;
      }

      await closeActiveTasks({ tx: db, workflowId: workflow.id, now });
      await db.teacherOperationalWorkflow.update({
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
        notes: "Workflow auto-resolved because the teacher productivity anomaly normalized.",
        reason: null,
        metadata: {
          source: "teacher-productivity-sync",
          autoResolved: true
        }
      });
    }

    return {
      workflowCount: sourceWorkflows.length,
      teacherUserId: scopedTeacher.teacherUserId
    };
  });
}

async function listTeacherWorkflows({
  tenantId,
  authUserId,
  hierarchyNodeId,
  filters = {},
  limit = 20,
  offset = 0,
  sortBy = "updatedAt",
  sortOrder = "desc",
  queueTypes = null,
  teacherScope = null,
  dependencies = {}
} = {}) {
  const resolveScope = dependencies.resolveTeacherOperationalScope || resolveTeacherOperationalScope;
  const scopedTeacher = teacherScope || await resolveScope({ tenantId, authUserId, hierarchyNodeId });

  await synchronizeTeacherOperationalWorkflows({
    tenantId,
    authUserId,
    hierarchyNodeId,
    teacherScope: scopedTeacher,
    dependencies
  });

  const where = buildWorkflowWhere({
    tenantId,
    teacherUserId: scopedTeacher.teacherUserId,
    filters,
    queueTypes
  });
  const baseWhere = { tenantId, teacherUserId: scopedTeacher.teacherUserId };

  const [items, total, attendanceQueueCount, gradingQueueCount, classroomQueueCount, anomalyQueueCount, resolvedCount] = await Promise.all([
    prisma.teacherOperationalWorkflow.findMany({
      where,
      orderBy: buildOrderBy(sortBy, sortOrder),
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
    prisma.teacherOperationalWorkflow.count({ where }),
    prisma.teacherOperationalWorkflow.count({ where: buildSummaryCountWhere(baseWhere, "ATTENDANCE") }),
    prisma.teacherOperationalWorkflow.count({ where: buildSummaryCountWhere(baseWhere, "GRADING") }),
    prisma.teacherOperationalWorkflow.count({ where: buildSummaryCountWhere(baseWhere, "CLASSROOM") }),
    prisma.teacherOperationalWorkflow.count({ where: buildSummaryCountWhere(baseWhere, "ANOMALY") }),
    prisma.teacherOperationalWorkflow.count({ where: { ...baseWhere, status: "RESOLVED" } })
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
      gradingQueueCount,
      classroomQueueCount,
      anomalyQueueCount,
      resolvedCount
    }
  };
}

async function getTeacherWorkflowDetail({
  tenantId,
  authUserId,
  hierarchyNodeId,
  workflowId,
  teacherScope = null,
  dependencies = {}
} = {}) {
  const resolveScope = dependencies.resolveTeacherOperationalScope || resolveTeacherOperationalScope;
  const scopedTeacher = teacherScope || await resolveScope({ tenantId, authUserId, hierarchyNodeId });

  await synchronizeTeacherOperationalWorkflows({
    tenantId,
    authUserId,
    hierarchyNodeId,
    teacherScope: scopedTeacher,
    dependencies
  });

  const workflow = await prisma.teacherOperationalWorkflow.findFirst({
    where: {
      id: workflowId,
      tenantId,
      teacherUserId: scopedTeacher.teacherUserId
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
    teacher: detail.teacherProfile,
    tasks: detail.tasks,
    history: detail.history
  };
}

async function listTeacherWorkflowHistory({
  tenantId,
  authUserId,
  hierarchyNodeId,
  workflowId,
  limit = 20,
  offset = 0,
  teacherScope = null,
  dependencies = {}
} = {}) {
  const resolveScope = dependencies.resolveTeacherOperationalScope || resolveTeacherOperationalScope;
  const scopedTeacher = teacherScope || await resolveScope({ tenantId, authUserId, hierarchyNodeId });

  const workflow = await prisma.teacherOperationalWorkflow.findFirst({
    where: {
      id: workflowId,
      tenantId,
      teacherUserId: scopedTeacher.teacherUserId
    },
    select: { id: true }
  });

  if (!workflow) {
    throw createHttpError(404, "Workflow not found", "WORKFLOW_NOT_FOUND");
  }

  const [items, total] = await Promise.all([
    prisma.teacherOperationalWorkflowHistory.findMany({
      where: { workflowId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
    prisma.teacherOperationalWorkflowHistory.count({ where: { workflowId } })
  ]);

  return {
    items,
    limit,
    offset,
    total
  };
}

function assertTeacherActor(actorRole) {
  if (actorRole !== "TEACHER") {
    throw createHttpError(403, "Only teacher actors can execute teacher workflows", "WORKFLOW_ROLE_DENIED");
  }
}

function assertTeacherWorkflowScope({ teacherScope, workflow }) {
  if (!teacherScope?.teacherUserId || workflow?.teacherUserId !== teacherScope.teacherUserId) {
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
    return workflow.workflowType === "DELAYED_ATTENDANCE_SUBMISSION" ? "ATTENDANCE_SUBMISSION" : "ATTENDANCE_RECOVERY";
  }

  if (workflow.queueType === "GRADING") {
    return workflow.workflowType === "OVERDUE_WORKSHEET_REVIEW" ? "GRADING_REVIEW" : "GRADING_RECOVERY";
  }

  return "CLASSROOM_RECOVERY";
}

async function ensureTeacherAssignedToBatch({ tx, tenantId, teacherUserId, batchId }) {
  if (!batchId) {
    return false;
  }

  const assignment = await tx.batchTeacherAssignment.findFirst({
    where: {
      tenantId,
      batchId,
      teacherUserId
    },
    select: { batchId: true }
  });

  return Boolean(assignment);
}

async function executeAttendanceMutation({ tx, workflow, scopedTeacher, payload, now }) {
  const sessionId = payload.attendanceSessionId || workflow.attendanceSessionId || workflow.metadata?.anomaly?.sessionId || null;
  if (!sessionId) {
    throw createHttpError(409, "Attendance workflow has no session target", "WORKFLOW_TARGET_REQUIRED");
  }

  const session = await tx.attendanceSession.findFirst({
    where: {
      id: sessionId,
      tenantId: scopedTeacher.tenantId,
      hierarchyNodeId: scopedTeacher.hierarchyNodeId
    },
    select: {
      id: true,
      batchId: true,
      status: true,
      version: true
    }
  });

  if (!session) {
    throw createHttpError(404, "Attendance session not found", "SESSION_NOT_FOUND");
  }

  const allowed = await ensureTeacherAssignedToBatch({
    tx,
    tenantId: scopedTeacher.tenantId,
    teacherUserId: scopedTeacher.teacherUserId,
    batchId: session.batchId
  });

  if (!allowed) {
    throw createHttpError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
  }

  const entries = normalizeAttendanceEntries(payload.entries);
  let updatedEntryCount = 0;

  if (entries.length) {
    const rosterEntries = await tx.attendanceEntry.findMany({
      where: {
        tenantId: scopedTeacher.tenantId,
        sessionId: session.id
      },
      select: { studentId: true }
    });

    const rosterSet = new Set(rosterEntries.map((entry) => entry.studentId));

    for (const entry of entries) {
      if (!rosterSet.has(entry.studentId)) {
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await tx.attendanceEntry.update({
        where: {
          sessionId_studentId: {
            sessionId: session.id,
            studentId: entry.studentId
          }
        },
        data: {
          status: entry.status,
          ...(entry.note !== undefined ? { note: entry.note } : {}),
          markedAt: now,
          markedByUserId: scopedTeacher.teacherUserId
        }
      });

      updatedEntryCount += 1;
    }

    if (updatedEntryCount > 0) {
      await tx.attendanceSession.update({
        where: { id: session.id },
        data: {
          version: { increment: 1 }
        }
      });
    }
  }

  const shouldPublish = payload.publish !== false;
  let published = false;
  if (shouldPublish && session.status !== "PUBLISHED") {
    const entriesCount = await tx.attendanceEntry.count({
      where: {
        tenantId: scopedTeacher.tenantId,
        sessionId: session.id
      }
    });

    if (!entriesCount) {
      throw createHttpError(409, "Session has no entries", "SESSION_EMPTY");
    }

    await tx.attendanceSession.update({
      where: { id: session.id },
      data: {
        status: "PUBLISHED",
        publishedAt: now,
        version: { increment: 1 }
      }
    });
    published = true;
  }

  return {
    attendanceSessionId: session.id,
    batchId: session.batchId,
    updatedEntryCount,
    published
  };
}

async function executeGradingMutation({ tx, workflow, scopedTeacher, payload, now, bulk = false }) {
  const preview = workflow.metadata?.preview || {};
  const previewSubmissionIds = [
    ...normalizePreviewItems(preview.backlogPreview).map((item) => item.submissionId),
    ...normalizePreviewItems(preview.overduePreview).map((item) => item.submissionId)
  ];
  const submissionIds = normalizeSubmissionIds(
    payload.submissionIds,
    workflow.worksheetSubmissionId ? [workflow.worksheetSubmissionId, ...previewSubmissionIds] : previewSubmissionIds
  );

  if (!submissionIds.length) {
    throw createHttpError(400, "submissionIds are required", "VALIDATION_ERROR");
  }

  const submissions = await tx.worksheetSubmission.findMany({
    where: {
      id: { in: submissionIds },
      tenantId: scopedTeacher.tenantId,
      student: {
        tenantId: scopedTeacher.tenantId,
        hierarchyNodeId: scopedTeacher.hierarchyNodeId,
        currentTeacherUserId: scopedTeacher.teacherUserId
      }
    },
    select: {
      id: true,
      studentId: true,
      worksheetId: true,
      status: true,
      finalSubmittedAt: true
    }
  });

  if (!submissions.length) {
    throw createHttpError(404, "Worksheet submissions not found", "WORKFLOW_TARGET_NOT_FOUND");
  }

  const normalizedScore = payload.score === undefined || payload.score === null || payload.score === ""
    ? undefined
    : Number(payload.score);
  if (normalizedScore !== undefined && !Number.isFinite(normalizedScore)) {
    throw createHttpError(400, "score must be a valid number", "VALIDATION_ERROR");
  }

  const remarks = normalizeOptionalText(payload.remarks);

  for (const submission of submissions) {
    // eslint-disable-next-line no-await-in-loop
    await tx.worksheetSubmission.update({
      where: { id: submission.id },
      data: {
        status: "REVIEWED",
        finalSubmittedAt: submission.finalSubmittedAt || now,
        ...(normalizedScore !== undefined ? { score: normalizedScore } : {}),
        ...(remarks ? { remarks } : {})
      }
    });
  }

  return {
    updatedSubmissionCount: submissions.length,
    updatedSubmissionIds: submissions.map((submission) => submission.id),
    bulk
  };
}

async function executeTeacherWorkflowAction({
  tenantId,
  authUserId,
  hierarchyNodeId,
  teacherScope = null,
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
  assertTeacherActor(actorRole);
  const normalizedExpectedVersion = normalizeExpectedVersion(expectedVersion);
  const normalizedNotes = normalizeOptionalText(notes);
  const normalizedReason = normalizeOptionalText(reason);
  const normalizedTaskDueAt = normalizeDate(taskDueAt, "taskDueAt");
  const normalizedMetadata = normalizeMetadata(metadata);
  const resolveScope = dependencies.resolveTeacherOperationalScope || resolveTeacherOperationalScope;
  const scopedTeacher = teacherScope || await resolveScope({ tenantId, authUserId, hierarchyNodeId });

  return prisma.$transaction(async (tx) => {
    const workflow = await tx.teacherOperationalWorkflow.findUniqueOrThrow({
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
        teacherProfile: {
          select: {
            id: true,
            fullName: true,
            authUserId: true,
            hierarchyNodeId: true
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

    assertTeacherWorkflowScope({ teacherScope: scopedTeacher, workflow });
    assertWorkflowVersion({ expectedVersion: normalizedExpectedVersion, workflow });
    assertActionAllowed(actionType, workflow);

    const now = new Date();
    let mutationResult = null;
    if (typeof transition.executeMutation === "function") {
      mutationResult = await transition.executeMutation({
        tx,
        workflow,
        scopedTeacher,
        payload: {
          notes: normalizedNotes,
          reason: normalizedReason,
          taskDueAt: normalizedTaskDueAt,
          metadata: normalizedMetadata,
          ...transition.payload
        },
        now
      });
    }

    const nextStatus = transition.toStatus;
    const updateResult = await tx.teacherOperationalWorkflow.updateMany({
      where: {
        id: workflow.id,
        tenantId,
        teacherUserId: scopedTeacher.teacherUserId,
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
      metadata: {
        ...(normalizedMetadata || {}),
        ...(mutationResult ? { mutationResult } : {})
      }
    });

    let nextTask = null;
    if (typeof transition.createTask === "function") {
      nextTask = await transition.createTask({
        tx,
        workflow,
        scopedTeacher,
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
      teacher: updatedWorkflow.teacherProfile,
      tasks: updatedWorkflow.tasks,
      history: updatedWorkflow.history,
      lastHistory: history,
      nextTask,
      mutationResult,
      workflowVersion: updatedWorkflow.workflowVersion
    };
  });
}

async function reviewTeacherWorkflow(payload) {
  return executeTeacherWorkflowAction({
    ...payload,
    actionType: "REVIEW",
    transition: {
      toStatus: "REVIEWED",
      currentActionRole: "TEACHER",
      updateFields: {
        acknowledgedAt: null
      }
    }
  });
}

async function acknowledgeTeacherWorkflow(payload) {
  return executeTeacherWorkflowAction({
    ...payload,
    actionType: "ACKNOWLEDGE",
    transition: {
      toStatus: "ACKNOWLEDGED",
      currentActionRole: "TEACHER",
      updateFields: {
        acknowledgedAt: new Date()
      }
    }
  });
}

async function startTeacherWorkflowRecovery(payload) {
  return executeTeacherWorkflowAction({
    ...payload,
    actionType: "START_RECOVERY",
    transition: {
      toStatus: "IN_PROGRESS",
      currentActionRole: "TEACHER",
      updateFields: {
        inProgressAt: new Date()
      },
      createTask: async ({ tx, workflow, scopedTeacher, now, dueAt, notes, reason }) =>
        createWorkflowTask({
          tx,
          workflow,
          targetRole: "TEACHER",
          targetUserId: scopedTeacher.teacherUserId,
          taskType: buildRecoveryTaskType(workflow),
          dueAt: dueAt || buildDueAtFromSeverity(workflow.severity, now),
          metadata: {
            source: "teacher-workflow",
            reason,
            notes
          }
        })
    }
  });
}

async function markTeacherWorkflowAttendance(payload) {
  return executeTeacherWorkflowAction({
    ...payload,
    actionType: "MARK_ATTENDANCE",
    transition: {
      toStatus: "RESOLVED",
      currentActionRole: null,
      updateFields: {
        resolvedAt: new Date()
      },
      payload: {
        entries: payload.entries,
        publish: payload.publish,
        attendanceSessionId: payload.attendanceSessionId
      },
      executeMutation: executeAttendanceMutation
    }
  });
}

async function completeTeacherWorkflowGrading(payload) {
  return executeTeacherWorkflowAction({
    ...payload,
    actionType: "COMPLETE_GRADING",
    transition: {
      toStatus: "RESOLVED",
      currentActionRole: null,
      updateFields: {
        resolvedAt: new Date()
      },
      payload: {
        submissionIds: payload.submissionIds,
        score: payload.score,
        remarks: payload.remarks
      },
      executeMutation: (context) => executeGradingMutation({ ...context, bulk: false })
    }
  });
}

async function bulkGradeTeacherWorkflow(payload) {
  return executeTeacherWorkflowAction({
    ...payload,
    actionType: "BULK_GRADE",
    transition: {
      toStatus: "RESOLVED",
      currentActionRole: null,
      updateFields: {
        resolvedAt: new Date()
      },
      payload: {
        submissionIds: payload.submissionIds,
        score: payload.score,
        remarks: payload.remarks
      },
      executeMutation: (context) => executeGradingMutation({ ...context, bulk: true })
    }
  });
}

async function resolveTeacherWorkflow(payload) {
  return executeTeacherWorkflowAction({
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

async function reopenTeacherWorkflow(payload) {
  return executeTeacherWorkflowAction({
    ...payload,
    actionType: "REOPEN",
    transition: {
      toStatus: "OPEN",
      currentActionRole: "TEACHER",
      updateFields: {
        resolvedAt: null,
        reopenedAt: new Date()
      },
      createTask: async ({ tx, workflow, scopedTeacher, now }) =>
        createWorkflowTask({
          tx,
          workflow,
          targetRole: "TEACHER",
          targetUserId: scopedTeacher.teacherUserId,
          taskType: buildInitialTaskType(workflow),
          dueAt: buildDueAtFromSeverity(workflow.severity, now),
          metadata: {
            source: "teacher-workflow",
            reopened: true
          }
        })
    }
  });
}

export {
  acknowledgeTeacherWorkflow,
  bulkGradeTeacherWorkflow,
  completeTeacherWorkflowGrading,
  getTeacherWorkflowDetail,
  listTeacherWorkflowHistory,
  listTeacherWorkflows,
  markTeacherWorkflowAttendance,
  reopenTeacherWorkflow,
  resolveTeacherWorkflow,
  reviewTeacherWorkflow,
  startTeacherWorkflowRecovery,
  synchronizeTeacherOperationalWorkflows
};