import { prisma } from "../lib/prisma.js";

const ACTIVE_TASK_STATES = ["OPEN", "IN_PROGRESS", "OVERDUE"];
const ACTIVE_ESCALATION_STATES = ["ACTIVE", "ACKNOWLEDGED", "FORWARDED"];
const REVIEW_QUEUE_STATUSES = new Set(["OPEN", "REVIEWED"]);
const ANOMALY_QUEUE_STATUSES = new Set(["ACKNOWLEDGED", "ACTION_REQUESTED", "RESOLVED"]);

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

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, `${fieldName} must be a valid date`, "VALIDATION_ERROR");
  }

  return parsed;
}

function normalizeMetadata(value) {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw createHttpError(400, "metadata must be an object", "VALIDATION_ERROR");
  }

  return value;
}

function computeQueueType(status) {
  if (status === "ESCALATED") {
    return "ESCALATION";
  }

  if (REVIEW_QUEUE_STATUSES.has(status)) {
    return "REVIEW";
  }

  return "ANOMALY";
}

function buildCurrentActionRole(status, fallbackRole = "FRANCHISE") {
  if (status === "RESOLVED") {
    return null;
  }

  return fallbackRole;
}

function buildDueAtFromSeverity(severity, referenceDate = new Date()) {
  const dueAt = new Date(referenceDate);
  const dayCount = severity === "CRITICAL" ? 1 : severity === "HIGH" ? 2 : severity === "WARNING" ? 3 : 5;
  dueAt.setUTCDate(dueAt.getUTCDate() + dayCount);
  return dueAt;
}

function inferEscalationType(notificationType) {
  switch (notificationType) {
    case "CRITICAL_ATTENDANCE":
      return "ATTENDANCE_COLLAPSE";
    case "LOW_ATTENDANCE":
      return "ATTENDANCE_WARNING";
    case "NO_ADMISSIONS":
    case "WEAK_GROWTH":
      return "GROWTH_RISK";
    case "UNHEALTHY_CENTER":
      return "CENTER_RISK";
    case "REVENUE_DROP":
    case "LOW_COLLECTIONS":
      return "FINANCIAL_RISK";
    default:
      return "OPERATIONS_RISK";
  }
}

function buildWorkflowSummary(notification) {
  return {
    id: notification.id,
    title: notification.title,
    summary: notification.summary,
    status: notification.status,
    queueType: notification.queueType,
    currentActionRole: notification.currentActionRole,
    severity: notification.severity,
    notificationType: notification.notificationType,
    centerId: notification.centerId,
    centerName: notification.center?.name || null,
    centerCode: notification.center?.code || null,
    workflowVersion: notification.workflowVersion,
    firstTriggeredAt: notification.firstTriggeredAt,
    lastTriggeredAt: notification.lastTriggeredAt,
    lastWorkflowActionAt: notification.lastWorkflowActionAt,
    resolvedAt: notification.resolvedAt,
    acknowledgedAt: notification.acknowledgedAt,
    actionRequestedAt: notification.actionRequestedAt,
    escalatedAt: notification.escalatedAt,
    forwardedAt: notification.forwardedAt,
    activeEscalation: Array.isArray(notification.escalations)
      ? notification.escalations.find((item) => ACTIVE_ESCALATION_STATES.includes(item.state)) || null
      : null,
    activeTask: Array.isArray(notification.tasks)
      ? notification.tasks.find((item) => ACTIVE_TASK_STATES.includes(item.state)) || null
      : null,
    allowedActions: buildAllowedActions(notification)
  };
}

function buildAllowedActions(workflow) {
  if (!workflow) {
    return [];
  }

  const activeEscalation = Array.isArray(workflow.escalations)
    ? workflow.escalations.find((item) => ACTIVE_ESCALATION_STATES.includes(item.state)) || null
    : null;

  if (workflow.status === "RESOLVED") {
    return ["REOPEN"];
  }

  if (workflow.status === "ESCALATED") {
    const actions = ["RESOLVE"];

    if (activeEscalation?.state === "ACTIVE") {
      actions.unshift("ACKNOWLEDGE_ESCALATION");
    }

    if (activeEscalation && activeEscalation.state !== "FORWARDED") {
      actions.push("FORWARD_ESCALATION");
    }

    return actions;
  }

  if (workflow.status === "OPEN") {
    return ["REVIEW", "ACKNOWLEDGE", "REQUEST_CENTER_ACTION", "ESCALATE_CENTER_RISK", "RESOLVE"];
  }

  if (workflow.status === "REVIEWED") {
    return ["ACKNOWLEDGE", "REQUEST_CENTER_ACTION", "ESCALATE_CENTER_RISK", "RESOLVE"];
  }

  if (workflow.status === "ACKNOWLEDGED" || workflow.status === "ACTION_REQUESTED") {
    return ["REQUEST_CENTER_ACTION", "ESCALATE_CENTER_RISK", "RESOLVE"];
  }

  return [];
}

async function resolveBusinessPartnerPrimaryUserId({ tx, tenantId, businessPartnerId }) {
  const businessPartner = await tx.businessPartner.findUnique({
    where: { id: businessPartnerId },
    select: { contactEmail: true }
  });

  if (!businessPartner?.contactEmail) {
    return null;
  }

  const user = await tx.authUser.findFirst({
    where: {
      tenantId,
      role: "BP",
      email: String(businessPartner.contactEmail).toLowerCase(),
      isActive: true
    },
    select: { id: true }
  });

  return user?.id || null;
}

async function resolveScopedCenters({ tx, tenantId, franchiseId }) {
  const centers = await tx.centerProfile.findMany({
    where: {
      tenantId,
      franchiseProfileId: franchiseId
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      authUserId: true
    }
  });

  return {
    centers,
    centerIds: centers.map((center) => center.id),
    centerMap: new Map(centers.map((center) => [center.id, center]))
  };
}

async function closeActiveTasks({ tx, workflowId, now }) {
  await tx.franchiseOperationalWorkflowTask.updateMany({
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

async function resolveActiveEscalations({ tx, workflowId, now }) {
  await tx.franchiseOperationalEscalation.updateMany({
    where: {
      workflowId,
      state: { in: ACTIVE_ESCALATION_STATES }
    },
    data: {
      state: "RESOLVED",
      resolvedAt: now
    }
  });
}

async function createWorkflowTask({
  tx,
  workflow,
  targetRole,
  targetUserId,
  taskType,
  dueAt,
  metadata
}) {
  if (!taskType || !targetRole) {
    return null;
  }

  return tx.franchiseOperationalWorkflowTask.create({
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
  return tx.franchiseOperationalWorkflowHistory.create({
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
  return tx.franchiseOperationalWorkflow.findUniqueOrThrow({
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
      operationalNotification: {
        select: {
          id: true,
          type: true,
          category: true,
          severity: true,
          status: true,
          title: true,
          message: true,
          deepLinkPath: true,
          metricKey: true,
          thresholdValue: true,
          observedValue: true,
          deltaPercent: true,
          sourceKind: true,
          sourceSnapshotDate: true,
          sourceWindowKey: true,
          firstTriggeredAt: true,
          lastTriggeredAt: true,
          resolvedAt: true,
          metadata: true
        }
      },
      tasks: {
        orderBy: [{ createdAt: "asc" }]
      },
      escalations: {
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

async function synchronizeFranchiseOperationalWorkflows({ tenantId, franchiseScope }) {
  const franchiseId = franchiseScope?.franchise?.id;
  const businessPartnerId = franchiseScope?.franchise?.businessPartnerId;
  const franchiseUserId = franchiseScope?.franchise?.authUserId || null;

  if (!franchiseId || !businessPartnerId) {
    throw createHttpError(403, "Franchise scope not resolved", "FRANCHISE_SCOPE_REQUIRED");
  }

  await prisma.$transaction(async (tx) => {
    const { centerIds, centerMap } = await resolveScopedCenters({ tx, tenantId, franchiseId });

    const notificationScope = centerIds.length
      ? [{ franchiseId }, { centerId: { in: centerIds } }]
      : [{ franchiseId }];

    const notifications = await tx.operationalNotification.findMany({
      where: {
        tenantId,
        businessPartnerId,
        OR: notificationScope
      },
      include: {
        center: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            authUserId: true
          }
        }
      }
    });

    const workflows = await tx.franchiseOperationalWorkflow.findMany({
      where: {
        tenantId,
        franchiseId
      },
      include: {
        operationalNotification: {
          select: {
            id: true,
            status: true,
            resolvedAt: true,
            lastTriggeredAt: true
          }
        }
      }
    });

    const workflowByFingerprint = new Map(workflows.map((workflow) => [workflow.notificationFingerprint, workflow]));
    const now = new Date();

    for (const notification of notifications) {
      const fingerprint = notification.activeFingerprint || notification.fingerprint;
      if (!fingerprint) {
        continue;
      }

      const existingWorkflow = workflowByFingerprint.get(fingerprint) || null;
      const baseData = {
        tenantId,
        businessPartnerId,
        franchiseId,
        centerId: notification.centerId && centerMap.has(notification.centerId) ? notification.centerId : null,
        operationalNotificationId: notification.id,
        notificationFingerprint: fingerprint,
        notificationType: notification.type,
        severity: notification.severity,
        title: notification.title,
        summary: notification.message,
        metricKey: notification.metricKey || null,
        thresholdValue: notification.thresholdValue ?? null,
        observedValue: notification.observedValue ?? null,
        deltaPercent: notification.deltaPercent ?? null,
        sourceSnapshotDate: notification.sourceSnapshotDate || null,
        sourceWindowKey: notification.sourceWindowKey || null,
        firstTriggeredAt: notification.firstTriggeredAt,
        lastTriggeredAt: notification.lastTriggeredAt,
        metadata: notification.metadata || null
      };

      if (!existingWorkflow) {
        const createdWorkflow = await tx.franchiseOperationalWorkflow.create({
          data: {
            ...baseData,
            queueType: "REVIEW",
            status: "OPEN",
            currentActionRole: "FRANCHISE"
          }
        });

        await createWorkflowTask({
          tx,
          workflow: createdWorkflow,
          targetRole: "FRANCHISE",
          targetUserId: franchiseUserId,
          taskType: "REVIEW_REQUIRED",
          dueAt: buildDueAtFromSeverity(notification.severity, notification.lastTriggeredAt),
          metadata: {
            source: "operational-notification-sync",
            notificationId: notification.id
          }
        });

        await appendHistory({
          tx,
          workflow: createdWorkflow,
          fromStatus: null,
          toStatus: "OPEN",
          actionType: "OPEN",
          actorUserId: null,
          actorRole: null,
          expectedVersion: 0,
          notes: "Workflow initialized from operational notification.",
          reason: null,
          metadata: {
            source: "operational-notification-sync",
            notificationId: notification.id
          }
        });

        workflowByFingerprint.set(fingerprint, {
          ...createdWorkflow,
          operationalNotification: {
            id: notification.id,
            status: notification.status,
            resolvedAt: notification.resolvedAt,
            lastTriggeredAt: notification.lastTriggeredAt
          }
        });
        continue;
      }

      const shouldReopen =
        existingWorkflow.status === "RESOLVED" &&
        notification.status === "ACTIVE" &&
        (!existingWorkflow.resolvedAt || notification.lastTriggeredAt > existingWorkflow.resolvedAt);

      if (shouldReopen) {
        await tx.franchiseOperationalWorkflow.update({
          where: { id: existingWorkflow.id },
          data: {
            ...baseData,
            status: "OPEN",
            queueType: "REVIEW",
            currentActionRole: "FRANCHISE",
            resolvedAt: null,
            reopenedAt: now,
            lastWorkflowActionAt: now,
            workflowVersion: { increment: 1 }
          }
        });

        await createWorkflowTask({
          tx,
          workflow: existingWorkflow,
          targetRole: "FRANCHISE",
          targetUserId: franchiseUserId,
          taskType: "REVIEW_REQUIRED",
          dueAt: buildDueAtFromSeverity(notification.severity, notification.lastTriggeredAt),
          metadata: {
            source: "operational-notification-sync",
            notificationId: notification.id,
            reopened: true
          }
        });

        await appendHistory({
          tx,
          workflow: existingWorkflow,
          fromStatus: "RESOLVED",
          toStatus: "OPEN",
          actionType: "REOPEN",
          actorUserId: null,
          actorRole: null,
          expectedVersion: existingWorkflow.workflowVersion,
          notes: "Workflow reopened because the anomaly retriggered.",
          reason: null,
          metadata: {
            source: "operational-notification-sync",
            notificationId: notification.id
          }
        });

        continue;
      }

      await tx.franchiseOperationalWorkflow.update({
        where: { id: existingWorkflow.id },
        data: {
          ...baseData,
          queueType: computeQueueType(existingWorkflow.status),
          currentActionRole: buildCurrentActionRole(existingWorkflow.status, existingWorkflow.currentActionRole || "FRANCHISE")
        }
      });
    }

    for (const workflow of workflows) {
      const notificationStatus = workflow.operationalNotification?.status || null;
      if (workflow.status === "RESOLVED") {
        continue;
      }

      if (["RESOLVED", "SUPPRESSED", "EXPIRED"].includes(notificationStatus)) {
        await closeActiveTasks({ tx, workflowId: workflow.id, now });
        await resolveActiveEscalations({ tx, workflowId: workflow.id, now });
        await tx.franchiseOperationalWorkflow.update({
          where: { id: workflow.id },
          data: {
            status: "RESOLVED",
            queueType: "ANOMALY",
            currentActionRole: null,
            resolvedAt: workflow.operationalNotification?.resolvedAt || now,
            lastWorkflowActionAt: now,
            workflowVersion: { increment: 1 }
          }
        });

        await appendHistory({
          tx,
          workflow,
          fromStatus: workflow.status,
          toStatus: "RESOLVED",
          actionType: "RESOLVE",
          actorUserId: null,
          actorRole: null,
          expectedVersion: workflow.workflowVersion,
          notes: "Workflow auto-resolved because the underlying operational notification closed.",
          reason: null,
          metadata: {
            source: "operational-notification-sync",
            notificationStatus
          }
        });
      }
    }
  });
}

function buildWorkflowWhere({ tenantId, franchiseId, filters = {}, queueType = null }) {
  const where = {
    tenantId,
    franchiseId
  };

  if (queueType) {
    where.queueType = queueType;
  }

  if (filters.centerId) {
    where.centerId = filters.centerId;
  }

  if (Array.isArray(filters.statuses) && filters.statuses.length) {
    where.status = { in: filters.statuses };
  }

  if (Array.isArray(filters.severities) && filters.severities.length) {
    where.severity = { in: filters.severities };
  }

  if (Array.isArray(filters.notificationTypes) && filters.notificationTypes.length) {
    where.notificationType = { in: filters.notificationTypes };
  }

  if (filters.query) {
    where.OR = [
      { title: { contains: filters.query } },
      { summary: { contains: filters.query } },
      { center: { name: { contains: filters.query } } },
      { center: { code: { contains: filters.query } } }
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

async function listFranchiseWorkflows({
  tenantId,
  franchiseScope,
  filters = {},
  limit = 20,
  offset = 0,
  sortBy = "updatedAt",
  sortOrder = "desc",
  queueType = null
}) {
  await synchronizeFranchiseOperationalWorkflows({ tenantId, franchiseScope });

  const where = buildWorkflowWhere({
    tenantId,
    franchiseId: franchiseScope.franchise.id,
    filters,
    queueType
  });

  const orderBy = { [sortBy]: sortOrder };

  const [items, total, reviewQueueCount, anomalyQueueCount, escalationQueueCount, resolvedCount] = await Promise.all([
    prisma.franchiseOperationalWorkflow.findMany({
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
        },
        escalations: {
          where: { state: { in: ACTIVE_ESCALATION_STATES } },
          orderBy: [{ createdAt: "desc" }],
          take: 3
        }
      }
    }),
    prisma.franchiseOperationalWorkflow.count({ where }),
    prisma.franchiseOperationalWorkflow.count({ where: buildSummaryCountWhere({ tenantId, franchiseId: franchiseScope.franchise.id }, "REVIEW") }),
    prisma.franchiseOperationalWorkflow.count({ where: buildSummaryCountWhere({ tenantId, franchiseId: franchiseScope.franchise.id }, "ANOMALY") }),
    prisma.franchiseOperationalWorkflow.count({ where: buildSummaryCountWhere({ tenantId, franchiseId: franchiseScope.franchise.id }, "ESCALATION") }),
    prisma.franchiseOperationalWorkflow.count({ where: { tenantId, franchiseId: franchiseScope.franchise.id, status: "RESOLVED" } })
  ]);

  return {
    items: items.map((item) => buildWorkflowSummary(item)),
    limit,
    offset,
    total,
    sortBy,
    sortOrder,
    summary: {
      reviewQueueCount,
      anomalyQueueCount,
      escalationQueueCount,
      resolvedCount
    }
  };
}

async function getFranchiseWorkflowDetail({ tenantId, franchiseScope, workflowId }) {
  await synchronizeFranchiseOperationalWorkflows({ tenantId, franchiseScope });

  const workflow = await prisma.franchiseOperationalWorkflow.findFirst({
    where: {
      id: workflowId,
      tenantId,
      franchiseId: franchiseScope.franchise.id
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
      notificationFingerprint: detail.notificationFingerprint,
      metadata: detail.metadata || null
    },
    notification: detail.operationalNotification,
    center: detail.center,
    tasks: detail.tasks,
    escalations: detail.escalations,
    history: detail.history
  };
}

async function listFranchiseWorkflowHistory({ tenantId, franchiseScope, workflowId, limit = 20, offset = 0 }) {
  const workflow = await prisma.franchiseOperationalWorkflow.findFirst({
    where: {
      id: workflowId,
      tenantId,
      franchiseId: franchiseScope.franchise.id
    },
    select: { id: true }
  });

  if (!workflow) {
    throw createHttpError(404, "Workflow not found", "WORKFLOW_NOT_FOUND");
  }

  const [items, total] = await Promise.all([
    prisma.franchiseOperationalWorkflowHistory.findMany({
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
    prisma.franchiseOperationalWorkflowHistory.count({ where: { workflowId } })
  ]);

  return {
    items,
    limit,
    offset,
    total
  };
}

function assertFranchiseActor(actorRole) {
  if (actorRole !== "FRANCHISE") {
    throw createHttpError(403, "Only franchise actors can govern operational workflows", "WORKFLOW_ROLE_DENIED");
  }
}

function assertWorkflowVersion({ expectedVersion, workflow }) {
  if (expectedVersion !== workflow.workflowVersion) {
    throw createHttpError(409, "Workflow version is stale", "WORKFLOW_VERSION_CONFLICT");
  }
}

function assertFranchiseWorkflowScope({ franchiseScope, workflow }) {
  const scopedFranchiseId = franchiseScope?.franchise?.id;
  if (!scopedFranchiseId || workflow?.franchiseId !== scopedFranchiseId) {
    throw createHttpError(404, "Workflow not found", "WORKFLOW_NOT_FOUND");
  }
}

function assertActionAllowed(actionType, workflow) {
  const allowedActions = buildAllowedActions(workflow);
  if (!allowedActions.includes(actionType)) {
    throw createHttpError(409, `Action ${actionType} is not allowed in the current workflow state`, "INVALID_TRANSITION");
  }
}

async function executeWorkflowAction({
  tenantId,
  franchiseScope,
  workflowId,
  actorUserId,
  actorRole,
  expectedVersion,
  actionType,
  notes,
  reason,
  taskDueAt,
  metadata,
  transition
}) {
  assertFranchiseActor(actorRole);
  const normalizedExpectedVersion = normalizeExpectedVersion(expectedVersion);
  const normalizedNotes = normalizeOptionalText(notes);
  const normalizedReason = normalizeOptionalText(reason);
  const normalizedTaskDueAt = normalizeDate(taskDueAt, "taskDueAt");
  const normalizedMetadata = normalizeMetadata(metadata);

  return prisma.$transaction(async (tx) => {
    const workflow = await tx.franchiseOperationalWorkflow.findUniqueOrThrow({
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
        escalations: {
          where: { state: { in: ACTIVE_ESCALATION_STATES } },
          orderBy: [{ createdAt: "desc" }]
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

    assertFranchiseWorkflowScope({ franchiseScope, workflow });
    assertWorkflowVersion({ expectedVersion: normalizedExpectedVersion, workflow });
    assertActionAllowed(actionType, workflow);

    const now = new Date();
    const activeEscalation = workflow.escalations[0] || null;
    const nextStatus = transition.toStatus;
    const currentActionRole = transition.currentActionRole || buildCurrentActionRole(nextStatus);

    const updateResult = await tx.franchiseOperationalWorkflow.updateMany({
      where: {
        id: workflow.id,
        tenantId,
        franchiseId: franchiseScope.franchise.id,
        workflowVersion: normalizedExpectedVersion
      },
      data: {
        status: nextStatus,
        queueType: computeQueueType(nextStatus),
        currentActionRole,
        workflowVersion: { increment: 1 },
        lastWorkflowActionAt: now,
        ...transition.updateFields
      }
    });

    if (updateResult.count !== 1) {
      throw createHttpError(409, "Workflow version is stale", "WORKFLOW_VERSION_CONFLICT");
    }

    await closeActiveTasks({ tx, workflowId: workflow.id, now });

    let escalation = activeEscalation;
    if (typeof transition.afterUpdate === "function") {
      escalation = await transition.afterUpdate({
        tx,
        workflow,
        activeEscalation,
        now,
        notes: normalizedNotes,
        reason: normalizedReason
      });
    }

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
        reason: normalizedReason,
        notes: normalizedNotes
      });
    }

    const updatedWorkflow = await fetchWorkflowDetailRecord({ tx, workflowId: workflow.id });

    return {
      workflow: {
        ...buildWorkflowSummary(updatedWorkflow),
        notificationFingerprint: updatedWorkflow.notificationFingerprint,
        metadata: updatedWorkflow.metadata || null
      },
      notification: updatedWorkflow.operationalNotification,
      center: updatedWorkflow.center,
      tasks: updatedWorkflow.tasks,
      escalations: updatedWorkflow.escalations,
      history: updatedWorkflow.history,
      lastHistory: history,
      nextTask,
      escalation
    };
  });
}

async function reviewFranchiseWorkflow(payload) {
  return executeWorkflowAction({
    ...payload,
    actionType: "REVIEW",
    transition: {
      toStatus: "REVIEWED",
      currentActionRole: "FRANCHISE",
      updateFields: {
        acknowledgedAt: null
      }
    }
  });
}

async function acknowledgeFranchiseWorkflow(payload) {
  return executeWorkflowAction({
    ...payload,
    actionType: "ACKNOWLEDGE",
    transition: {
      toStatus: "ACKNOWLEDGED",
      currentActionRole: "FRANCHISE",
      updateFields: {
        acknowledgedAt: new Date()
      }
    }
  });
}

async function requestFranchiseCenterAction(payload) {
  return executeWorkflowAction({
    ...payload,
    actionType: "REQUEST_CENTER_ACTION",
    transition: {
      toStatus: "ACTION_REQUESTED",
      currentActionRole: "FRANCHISE",
      updateFields: {
        actionRequestedAt: new Date()
      },
      createTask: async ({ tx, workflow, now, dueAt, reason, notes }) =>
        createWorkflowTask({
          tx,
          workflow,
          targetRole: "CENTER",
          targetUserId: workflow.center?.authUserId || null,
          taskType: "CENTER_ACTION_REQUIRED",
          dueAt: dueAt || buildDueAtFromSeverity(workflow.severity, now),
          metadata: {
            reason,
            notes,
            source: "franchise-governance"
          }
        })
    }
  });
}

async function escalateFranchiseCenterRisk(payload) {
  const normalizedReason = normalizeRequiredText(payload.reason, "reason");

  return executeWorkflowAction({
    ...payload,
    reason: normalizedReason,
    actionType: "ESCALATE_CENTER_RISK",
    transition: {
      toStatus: "ESCALATED",
      currentActionRole: "FRANCHISE",
      updateFields: {
        escalatedAt: new Date()
      },
      afterUpdate: async ({ tx, workflow, now, reason, notes }) =>
        tx.franchiseOperationalEscalation.create({
          data: {
            workflowId: workflow.id,
            tenantId: workflow.tenantId,
            businessPartnerId: workflow.businessPartnerId,
            franchiseId: workflow.franchiseId,
            centerId: workflow.centerId,
            escalationType: inferEscalationType(workflow.notificationType),
            severity: workflow.severity,
            escalationReason: reason,
            metadata: {
              notes,
              resumeStatus: workflow.status,
              resumeActionRole: workflow.currentActionRole
            }
          }
        }),
      createTask: async ({ tx, workflow, now, dueAt }) =>
        createWorkflowTask({
          tx,
          workflow,
          targetRole: "FRANCHISE",
          targetUserId: null,
          taskType: "ESCALATION_ACK_REQUIRED",
          dueAt: dueAt || buildDueAtFromSeverity(workflow.severity, now),
          metadata: {
            source: "franchise-governance",
            escalation: true
          }
        })
    }
  });
}

async function acknowledgeFranchiseEscalation(payload) {
  return executeWorkflowAction({
    ...payload,
    actionType: "ACKNOWLEDGE_ESCALATION",
    transition: {
      toStatus: "ESCALATED",
      currentActionRole: "FRANCHISE",
      updateFields: {},
      afterUpdate: async ({ tx, activeEscalation, now }) => {
        if (!activeEscalation) {
          throw createHttpError(409, "No active escalation to acknowledge", "INVALID_TRANSITION");
        }

        return tx.franchiseOperationalEscalation.update({
          where: { id: activeEscalation.id },
          data: {
            state: "ACKNOWLEDGED",
            acknowledgedAt: now
          }
        });
      }
    }
  });
}

async function forwardFranchiseEscalation(payload) {
  const normalizedReason = normalizeRequiredText(payload.reason, "reason");

  return executeWorkflowAction({
    ...payload,
    reason: normalizedReason,
    actionType: "FORWARD_ESCALATION",
    transition: {
      toStatus: "ESCALATED",
      currentActionRole: "BP",
      updateFields: {
        forwardedAt: new Date()
      },
      afterUpdate: async ({ tx, workflow, activeEscalation, now, reason, notes }) => {
        if (!activeEscalation) {
          throw createHttpError(409, "No active escalation to forward", "INVALID_TRANSITION");
        }

        const escalation = await tx.franchiseOperationalEscalation.update({
          where: { id: activeEscalation.id },
          data: {
            state: "FORWARDED",
            acknowledgedAt: activeEscalation.acknowledgedAt || now,
            forwardedAt: now,
            escalationReason: reason,
            metadata: {
              ...(activeEscalation.metadata || {}),
              notes
            }
          }
        });

        return escalation;
      },
      createTask: async ({ tx, workflow, now, dueAt, reason, notes }) => {
        const bpUserId = await resolveBusinessPartnerPrimaryUserId({
          tx,
          tenantId: workflow.tenantId,
          businessPartnerId: workflow.businessPartnerId
        });

        return createWorkflowTask({
          tx,
          workflow,
          targetRole: "BP",
          targetUserId: bpUserId,
          taskType: "BP_ESCALATION_REVIEW",
          dueAt: dueAt || buildDueAtFromSeverity(workflow.severity, now),
          metadata: {
            source: "franchise-governance",
            reason,
            notes
          }
        });
      }
    }
  });
}

async function resolveFranchiseWorkflow(payload) {
  return executeWorkflowAction({
    ...payload,
    actionType: "RESOLVE",
    transition: {
      toStatus: "RESOLVED",
      currentActionRole: null,
      updateFields: {
        resolvedAt: new Date()
      },
      afterUpdate: async ({ tx, workflow, activeEscalation, now }) => {
        if (activeEscalation) {
          await resolveActiveEscalations({ tx, workflowId: workflow.id, now });
        }
        return activeEscalation;
      }
    }
  });
}

async function reopenFranchiseWorkflow(payload) {
  return executeWorkflowAction({
    ...payload,
    actionType: "REOPEN",
    transition: {
      toStatus: "OPEN",
      currentActionRole: "FRANCHISE",
      updateFields: {
        resolvedAt: null,
        reopenedAt: new Date()
      },
      createTask: async ({ tx, workflow, now, dueAt }) =>
        createWorkflowTask({
          tx,
          workflow,
          targetRole: "FRANCHISE",
          targetUserId: null,
          taskType: "REVIEW_REQUIRED",
          dueAt: dueAt || buildDueAtFromSeverity(workflow.severity, now),
          metadata: {
            source: "franchise-governance",
            reopened: true
          }
        })
    }
  });
}

export {
  acknowledgeFranchiseEscalation,
  acknowledgeFranchiseWorkflow,
  escalateFranchiseCenterRisk,
  forwardFranchiseEscalation,
  getFranchiseWorkflowDetail,
  listFranchiseWorkflowHistory,
  listFranchiseWorkflows,
  reopenFranchiseWorkflow,
  requestFranchiseCenterAction,
  resolveFranchiseWorkflow,
  reviewFranchiseWorkflow,
  synchronizeFranchiseOperationalWorkflows
};