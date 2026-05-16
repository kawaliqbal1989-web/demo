import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { resolveBusinessPartnerForUser } from "./bp-scope.service.js";
import { emitSettlementWorkflowLifecycleNotification } from "./workflow-notification.service.js";

const ACTIVE_TASK_STATES = ["OPEN", "IN_PROGRESS", "OVERDUE"];
const ACTIVE_ESCALATION_STATES = ["ACTIVE", "ACKNOWLEDGED"];
const RESUMABLE_ESCALATION_STATUSES = new Set(["PENDING_REVIEW", "REVIEWED", "APPROVED", "OVERDUE"]);

const TRANSITION_DEFINITIONS = {
  SUBMIT: {
    allowedRoles: ["CENTER", "FRANCHISE"],
    fromStatuses: ["DRAFT"],
    toStatus: "PENDING_REVIEW"
  },
  REVIEW: {
    allowedRoles: ["FRANCHISE"],
    fromStatuses: ["PENDING_REVIEW"],
    toStatus: "REVIEWED"
  },
  APPROVE: {
    allowedRoles: ["BP"],
    fromStatuses: ["REVIEWED"],
    toStatus: "APPROVED"
  },
  REJECT: {
    allowedRoles: ["BP"],
    fromStatuses: ["PENDING_REVIEW", "REVIEWED", "ESCALATED"],
    toStatus: "REJECTED"
  },
  REOPEN: {
    allowedRoles: ["FRANCHISE", "BP"],
    fromStatuses: ["REJECTED"],
    toStatus: "DRAFT"
  },
  ESCALATE: {
    allowedRoles: ["BP"],
    fromStatuses: ["PENDING_REVIEW", "REVIEWED", "APPROVED", "OVERDUE"],
    toStatus: "ESCALATED"
  },
  MARK_PAID: {
    allowedRoles: ["SUPERADMIN"],
    fromStatuses: ["APPROVED", "OVERDUE", "ESCALATED"],
    toStatus: "PAID"
  }
};

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
    throw createHttpError(400, `${fieldName} is required`, "INVALID_TRANSITION");
  }
  return normalized;
}

function normalizeExpectedVersion(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw createHttpError(409, "Expected workflow version is required", "WORKFLOW_VERSION_CONFLICT");
  }
  return parsed;
}

function normalizeDate(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(normalized.getTime())) {
    throw createHttpError(400, `${fieldName} must be a valid date`, "INVALID_TRANSITION");
  }

  return normalized;
}

function normalizeMetadata(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "object") {
    throw createHttpError(400, "metadata must be an object", "INVALID_TRANSITION");
  }

  return value;
}

function buildCurrentActionRole(status) {
  switch (status) {
    case "PENDING_REVIEW":
      return "FRANCHISE";
    case "REVIEWED":
      return "BP";
    case "APPROVED":
    case "OVERDUE":
      return "SUPERADMIN";
    case "REJECTED":
      return "FRANCHISE";
    case "ESCALATED":
      return "BP";
    default:
      return null;
  }
}

function assertRoleAllowed({ actionType, actorRole }) {
  const definition = TRANSITION_DEFINITIONS[actionType];
  if (!definition?.allowedRoles.includes(actorRole)) {
    throw createHttpError(403, "Role cannot perform this workflow action", "WORKFLOW_PERMISSION_DENIED");
  }
}

function assertStatusAllowed({ actionType, settlementStatus }) {
  const definition = TRANSITION_DEFINITIONS[actionType];
  if (!definition?.fromStatuses.includes(settlementStatus)) {
    throw createHttpError(409, "Settlement cannot transition from the current status", "INVALID_TRANSITION");
  }
}

function assertWorkflowVersion({ expectedVersion, settlement }) {
  if (settlement.workflowVersion !== expectedVersion) {
    throw createHttpError(409, "Settlement workflow version is stale", "WORKFLOW_VERSION_CONFLICT");
  }
}

async function resolveBusinessPartnerPrimaryUserId({ tx, tenantId, businessPartnerId }) {
  const businessPartner = await tx.businessPartner.findFirst({
    where: {
      id: businessPartnerId,
      tenantId
    },
    select: {
      code: true,
      contactEmail: true,
      hierarchyNodeId: true
    }
  });

  if (!businessPartner) {
    return null;
  }

  const clauses = [];
  if (businessPartner.contactEmail) {
    clauses.push({ email: String(businessPartner.contactEmail).trim().toLowerCase() });
  }
  if (businessPartner.hierarchyNodeId) {
    clauses.push({ hierarchyNodeId: businessPartner.hierarchyNodeId });
  }
  if (businessPartner.code) {
    clauses.push({ username: businessPartner.code });
  }

  if (!clauses.length) {
    return null;
  }

  const user = await tx.authUser.findFirst({
    where: {
      tenantId,
      role: "BP",
      isActive: true,
      OR: clauses
    },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });

  return user?.id || null;
}

async function resolveSuperadminUserId({ tx, tenantId }) {
  const user = await tx.authUser.findFirst({
    where: {
      tenantId,
      role: "SUPERADMIN",
      isActive: true
    },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });

  return user?.id || null;
}

async function getSettlementWorkflowAutomationActor({ tenantId, businessPartnerId, tx = prisma }) {
  const actorUserId = await resolveBusinessPartnerPrimaryUserId({ tx, tenantId, businessPartnerId });
  if (!actorUserId) {
    throw createHttpError(409, "Business partner automation actor could not be resolved", "WORKFLOW_AUTOMATION_ACTOR_NOT_FOUND");
  }

  return {
    actorUserId,
    actorRole: "BP"
  };
}

async function resolveActorScope({ tx, tenantId, actorUserId, actorRole }) {
  const actor = await tx.authUser.findFirst({
    where: {
      id: actorUserId,
      tenantId,
      isActive: true
    },
    select: {
      id: true,
      role: true
    }
  });

  if (!actor || actor.role !== actorRole) {
    throw createHttpError(403, "Actor role is not permitted for this workflow action", "WORKFLOW_PERMISSION_DENIED");
  }

  if (actorRole === "SUPERADMIN") {
    return {
      actor,
      businessPartnerId: null,
      franchiseId: null,
      centerId: null,
      franchiseTargetUserId: null
    };
  }

  if (actorRole === "BP") {
    const businessPartner = await resolveBusinessPartnerForUser({
      tenantId,
      userId: actorUserId,
      tx
    });

    if (!businessPartner) {
      throw createHttpError(403, "Actor does not have business partner workflow access", "WORKFLOW_SCOPE_VIOLATION");
    }

    return {
      actor,
      businessPartnerId: businessPartner.id,
      franchiseId: null,
      centerId: null,
      franchiseTargetUserId: null
    };
  }

  if (actorRole === "FRANCHISE") {
    const franchise = await tx.franchiseProfile.findUnique({
      where: { authUserId: actorUserId },
      select: {
        id: true,
        authUserId: true,
        businessPartnerId: true,
        tenantId: true
      }
    });

    if (!franchise || franchise.tenantId !== tenantId) {
      throw createHttpError(403, "Actor does not have franchise workflow access", "WORKFLOW_SCOPE_VIOLATION");
    }

    return {
      actor,
      businessPartnerId: franchise.businessPartnerId,
      franchiseId: franchise.id,
      centerId: null,
      franchiseTargetUserId: franchise.authUserId
    };
  }

  if (actorRole === "CENTER") {
    const center = await tx.centerProfile.findUnique({
      where: { authUserId: actorUserId },
      select: {
        id: true,
        authUserId: true,
        tenantId: true,
        franchiseProfile: {
          select: {
            id: true,
            authUserId: true,
            businessPartnerId: true
          }
        }
      }
    });

    if (!center || center.tenantId !== tenantId || !center.franchiseProfile) {
      throw createHttpError(403, "Actor does not have center workflow access", "WORKFLOW_SCOPE_VIOLATION");
    }

    return {
      actor,
      businessPartnerId: center.franchiseProfile.businessPartnerId,
      franchiseId: center.franchiseProfile.id,
      centerId: center.id,
      franchiseTargetUserId: center.franchiseProfile.authUserId
    };
  }

  throw createHttpError(403, "Role cannot perform settlement workflow actions", "WORKFLOW_PERMISSION_DENIED");
}

async function loadSettlement({ tx, tenantId, settlementId }) {
  const settlement = await tx.settlement.findFirst({
    where: {
      id: settlementId,
      tenantId
    },
    select: {
      id: true,
      tenantId: true,
      businessPartnerId: true,
      status: true,
      workflowVersion: true,
      currentActionRole: true,
      payoutDueAt: true,
      submittedAt: true,
      reviewedAt: true,
      approvedAt: true,
      rejectedAt: true,
      reopenedAt: true,
      escalatedAt: true,
      paidAt: true,
      rejectionReason: true,
      payoutReference: true,
      lastWorkflowActionAt: true
    }
  });

  if (!settlement) {
    throw createHttpError(404, "Settlement not found", "SETTLEMENT_NOT_FOUND");
  }

  return settlement;
}

async function getFranchiseScopeRecord({ tx, tenantId, businessPartnerId, franchiseId }) {
  if (!franchiseId) {
    return null;
  }

  const franchise = await tx.franchiseProfile.findFirst({
    where: {
      tenantId,
      id: franchiseId,
      businessPartnerId
    },
    select: {
      id: true,
      authUserId: true
    }
  });

  if (!franchise) {
    throw createHttpError(403, "Franchise is outside the settlement workflow scope", "WORKFLOW_SCOPE_VIOLATION");
  }

  return franchise;
}

async function getCenterScopeRecord({ tx, tenantId, businessPartnerId, centerId }) {
  if (!centerId) {
    return null;
  }

  const center = await tx.centerProfile.findFirst({
    where: {
      tenantId,
      id: centerId,
      franchiseProfile: {
        businessPartnerId
      }
    },
    select: {
      id: true,
      authUserId: true,
      franchiseProfileId: true,
      franchiseProfile: {
        select: {
          id: true,
          authUserId: true
        }
      }
    }
  });

  if (!center) {
    throw createHttpError(403, "Center is outside the settlement workflow scope", "WORKFLOW_SCOPE_VIOLATION");
  }

  return center;
}

async function resolveWorkflowScope({
  tx,
  tenantId,
  settlement,
  actorScope,
  franchiseId,
  centerId
}) {
  let resolvedFranchise = actorScope.franchiseId
    ? await getFranchiseScopeRecord({
        tx,
        tenantId,
        businessPartnerId: settlement.businessPartnerId,
        franchiseId: actorScope.franchiseId
      })
    : null;

  let resolvedCenter = actorScope.centerId
    ? await getCenterScopeRecord({
        tx,
        tenantId,
        businessPartnerId: settlement.businessPartnerId,
        centerId: actorScope.centerId
      })
    : null;

  if (franchiseId) {
    if (resolvedFranchise && resolvedFranchise.id !== franchiseId) {
      throw createHttpError(403, "Franchise scope cannot be reassigned for this actor", "WORKFLOW_SCOPE_VIOLATION");
    }

    resolvedFranchise = await getFranchiseScopeRecord({
      tx,
      tenantId,
      businessPartnerId: settlement.businessPartnerId,
      franchiseId
    });
  }

  if (centerId) {
    if (resolvedCenter && resolvedCenter.id !== centerId) {
      throw createHttpError(403, "Center scope cannot be reassigned for this actor", "WORKFLOW_SCOPE_VIOLATION");
    }

    resolvedCenter = await getCenterScopeRecord({
      tx,
      tenantId,
      businessPartnerId: settlement.businessPartnerId,
      centerId
    });
  }

  if (resolvedCenter && !resolvedFranchise) {
    resolvedFranchise = resolvedCenter.franchiseProfile;
  }

  if (resolvedCenter && resolvedFranchise && resolvedCenter.franchiseProfileId !== resolvedFranchise.id) {
    throw createHttpError(403, "Center scope does not belong to the provided franchise scope", "WORKFLOW_SCOPE_VIOLATION");
  }

  return {
    businessPartnerId: settlement.businessPartnerId,
    franchiseId: resolvedFranchise?.id || null,
    centerId: resolvedCenter?.id || null,
    franchiseTargetUserId: resolvedFranchise?.authUserId || actorScope.franchiseTargetUserId || null
  };
}

function assertActorSettlementAccess({ settlement, actorScope, actorRole }) {
  if (actorRole === "SUPERADMIN") {
    return;
  }

  if (!actorScope.businessPartnerId || actorScope.businessPartnerId !== settlement.businessPartnerId) {
    throw createHttpError(403, "Actor does not own this settlement workflow", "WORKFLOW_SCOPE_VIOLATION");
  }
}

async function closeActiveTasks({ tx, settlementId, now }) {
  await tx.settlementWorkflowTask.updateMany({
    where: {
      settlementId,
      state: { in: ACTIVE_TASK_STATES }
    },
    data: {
      state: "COMPLETED",
      completedAt: now,
      resolvedAt: now
    }
  });
}

async function createNextTask({ tx, settlement, status, scope, dueAt, metadata }) {
  let taskType = null;
  let targetRole = null;
  let targetUserId = null;

  if (status === "PENDING_REVIEW") {
    taskType = "REVIEW_REQUIRED";
    targetRole = "FRANCHISE";
    targetUserId = scope.franchiseTargetUserId || null;
  } else if (status === "REVIEWED") {
    taskType = "APPROVAL_REQUIRED";
    targetRole = "BP";
    targetUserId = await resolveBusinessPartnerPrimaryUserId({
      tx,
      tenantId: settlement.tenantId,
      businessPartnerId: settlement.businessPartnerId
    });
  } else if (status === "REJECTED") {
    taskType = "REJECTION_RESPONSE";
    targetRole = "FRANCHISE";
    targetUserId = scope.franchiseTargetUserId || null;
  } else if (status === "APPROVED") {
    taskType = "PAYOUT_CONFIRMATION";
    targetRole = "SUPERADMIN";
    targetUserId = await resolveSuperadminUserId({
      tx,
      tenantId: settlement.tenantId
    });
  } else if (status === "ESCALATED") {
    taskType = "ESCALATION_RESPONSE";
    targetRole = "BP";
    targetUserId = await resolveBusinessPartnerPrimaryUserId({
      tx,
      tenantId: settlement.tenantId,
      businessPartnerId: settlement.businessPartnerId
    });
  }

  if (!taskType || !targetRole) {
    return null;
  }

  return tx.settlementWorkflowTask.create({
    data: {
      settlementId: settlement.id,
      tenantId: settlement.tenantId,
      businessPartnerId: scope.businessPartnerId,
      franchiseId: scope.franchiseId,
      centerId: scope.centerId,
      targetRole,
      targetUserId,
      taskType,
      dueAt: dueAt || null,
      metadata: metadata || null
    }
  });
}

async function fetchUpdatedSettlement({ tx, settlementId }) {
  return tx.settlement.findUniqueOrThrow({
    where: { id: settlementId },
    include: {
      workflowTasks: {
        orderBy: [{ createdAt: "asc" }]
      },
      escalations: {
        orderBy: [{ createdAt: "asc" }]
      },
      workflowHistory: {
        orderBy: [{ createdAt: "asc" }]
      },
      supportingRecords: {
        orderBy: [{ createdAt: "asc" }]
      }
    }
  });
}

async function persistWorkflowHistory({
  tx,
  settlement,
  scope,
  actorUserId,
  actorRole,
  actionType,
  toStatus,
  expectedVersion,
  notes,
  reason,
  payoutReference,
  metadata
}) {
  return tx.settlementWorkflowHistory.create({
    data: {
      settlementId: settlement.id,
      tenantId: settlement.tenantId,
      businessPartnerId: scope.businessPartnerId,
      franchiseId: scope.franchiseId,
      centerId: scope.centerId,
      fromStatus: settlement.status,
      toStatus,
      actionType,
      actorUserId,
      actorRole,
      expectedVersion,
      resultingVersion: expectedVersion + 1,
      reason: reason || null,
      notes: notes || null,
      payoutReference: payoutReference || null,
      metadata: metadata || null
    }
  });
}

async function executeSettlementTransition({
  tenantId,
  settlementId,
  actorUserId,
  actorRole,
  expectedVersion,
  actionType,
  notes,
  reason,
  payoutReference,
  franchiseId,
  centerId,
  taskDueAt,
  transitionData = {},
  historyMetadata = null,
  escalationFactory = null,
  escalationResolver = null
}) {
  const normalizedExpectedVersion = normalizeExpectedVersion(expectedVersion);
  const normalizedNotes = normalizeOptionalText(notes);
  const normalizedReason = normalizeOptionalText(reason);
  const normalizedPayoutReference = normalizeOptionalText(payoutReference);
  const normalizedTaskDueAt = normalizeDate(taskDueAt, "taskDueAt");
  const normalizedHistoryMetadata = normalizeMetadata(historyMetadata);

  const result = await prisma.$transaction(async (tx) => {
    const settlement = await loadSettlement({ tx, tenantId, settlementId });
    const actorScope = await resolveActorScope({ tx, tenantId, actorUserId, actorRole });

    assertRoleAllowed({ actionType, actorRole });
    assertActorSettlementAccess({ settlement, actorScope, actorRole });
    assertStatusAllowed({ actionType, settlementStatus: settlement.status });
    assertWorkflowVersion({ expectedVersion: normalizedExpectedVersion, settlement });

    const scope = await resolveWorkflowScope({
      tx,
      tenantId,
      settlement,
      actorScope,
      franchiseId,
      centerId
    });

    const now = new Date();
    const toStatus = transitionData.toStatus || TRANSITION_DEFINITIONS[actionType].toStatus;
    const updateFields = {
      currentActionRole: buildCurrentActionRole(toStatus),
      lastWorkflowActionAt: now,
      ...transitionData.updateFields
    };

    const updateResult = await tx.settlement.updateMany({
      where: {
        id: settlement.id,
        tenantId,
        workflowVersion: normalizedExpectedVersion
      },
      data: {
        status: toStatus,
        workflowVersion: normalizedExpectedVersion + 1,
        ...updateFields
      }
    });

    if (updateResult.count !== 1) {
      throw createHttpError(409, "Settlement workflow version is stale", "WORKFLOW_VERSION_CONFLICT");
    }

    let escalation = null;
    if (typeof escalationFactory === "function") {
      escalation = await escalationFactory({ tx, settlement, scope, now, notes: normalizedNotes, reason: normalizedReason });
    }

    if (typeof escalationResolver === "function") {
      escalation = await escalationResolver({ tx, settlement, now });
    }

    await closeActiveTasks({ tx, settlementId: settlement.id, now });

    const nextTask = await createNextTask({
      tx,
      settlement,
      status: toStatus,
      scope,
      dueAt: normalizedTaskDueAt || updateFields.payoutDueAt || settlement.payoutDueAt,
      metadata: {
        actionType,
        resultingStatus: toStatus,
        workflowVersion: normalizedExpectedVersion + 1,
        ...(normalizedHistoryMetadata || {})
      }
    });

    const history = await persistWorkflowHistory({
      tx,
      settlement,
      scope,
      actorUserId,
      actorRole,
      actionType,
      toStatus,
      expectedVersion: normalizedExpectedVersion,
      notes: normalizedNotes,
      reason: normalizedReason,
      payoutReference: normalizedPayoutReference,
      metadata: normalizedHistoryMetadata
    });

    const updatedSettlement = await fetchUpdatedSettlement({ tx, settlementId: settlement.id });

    return {
      settlement: updatedSettlement,
      history,
      nextTask,
      escalation
    };
  });

  try {
    await emitSettlementWorkflowLifecycleNotification({
      settlement: result.settlement,
      history: result.history,
      escalation: result.escalation,
      nextTask: result.nextTask
    });
  } catch (error) {
    logger.error("settlement_workflow_lifecycle_notification_failed", {
      settlementId,
      actionType,
      error: error.message
    });
  }

  return result;
}

async function submitSettlementForReview({
  tenantId,
  settlementId,
  actorUserId,
  actorRole,
  expectedVersion,
  notes,
  franchiseId,
  centerId,
  taskDueAt
}) {
  return executeSettlementTransition({
    tenantId,
    settlementId,
    actorUserId,
    actorRole,
    expectedVersion,
    actionType: "SUBMIT",
    notes,
    franchiseId,
    centerId,
    taskDueAt,
    transitionData: {
      updateFields: {
        submittedAt: new Date()
      }
    }
  });
}

async function markSettlementReviewed({
  tenantId,
  settlementId,
  actorUserId,
  actorRole,
  expectedVersion,
  notes,
  franchiseId,
  centerId,
  taskDueAt
}) {
  return executeSettlementTransition({
    tenantId,
    settlementId,
    actorUserId,
    actorRole,
    expectedVersion,
    actionType: "REVIEW",
    notes,
    franchiseId,
    centerId,
    taskDueAt,
    transitionData: {
      updateFields: {
        reviewedAt: new Date()
      }
    }
  });
}

async function approveSettlement({
  tenantId,
  settlementId,
  actorUserId,
  actorRole,
  expectedVersion,
  notes,
  franchiseId,
  centerId,
  payoutDueAt,
  taskDueAt
}) {
  const normalizedPayoutDueAt = normalizeDate(payoutDueAt, "payoutDueAt");

  return executeSettlementTransition({
    tenantId,
    settlementId,
    actorUserId,
    actorRole,
    expectedVersion,
    actionType: "APPROVE",
    notes,
    franchiseId,
    centerId,
    taskDueAt,
    transitionData: {
      updateFields: {
        approvedAt: new Date(),
        approvalActorUserId: actorUserId,
        payoutDueAt: normalizedPayoutDueAt
      }
    }
  });
}

async function rejectSettlement({
  tenantId,
  settlementId,
  actorUserId,
  actorRole,
  expectedVersion,
  reason,
  notes,
  franchiseId,
  centerId,
  taskDueAt
}) {
  const normalizedReason = normalizeRequiredText(reason, "reason");

  return executeSettlementTransition({
    tenantId,
    settlementId,
    actorUserId,
    actorRole,
    expectedVersion,
    actionType: "REJECT",
    notes,
    reason: normalizedReason,
    franchiseId,
    centerId,
    taskDueAt,
    transitionData: {
      updateFields: {
        rejectedAt: new Date(),
        rejectionActorUserId: actorUserId,
        rejectionReason: normalizedReason
      }
    }
  });
}

async function reopenSettlement({
  tenantId,
  settlementId,
  actorUserId,
  actorRole,
  expectedVersion,
  notes,
  franchiseId,
  centerId
}) {
  return executeSettlementTransition({
    tenantId,
    settlementId,
    actorUserId,
    actorRole,
    expectedVersion,
    actionType: "REOPEN",
    notes,
    franchiseId,
    centerId,
    transitionData: {
      updateFields: {
        reopenedAt: new Date(),
        currentActionRole: null,
        submittedAt: null,
        reviewedAt: null,
        approvedAt: null,
        rejectedAt: null,
        rejectionActorUserId: null,
        rejectionReason: null
      }
    }
  });
}

async function escalateSettlement({
  tenantId,
  settlementId,
  actorUserId,
  actorRole,
  expectedVersion,
  escalationType,
  severity,
  reason,
  notes,
  franchiseId,
  centerId,
  taskDueAt,
  metadata
}) {
  const normalizedEscalationType = normalizeRequiredText(escalationType, "escalationType");
  const normalizedSeverity = normalizeRequiredText(severity, "severity");
  const normalizedReason = normalizeRequiredText(reason, "reason");
  const normalizedMetadata = normalizeMetadata(metadata);

  return executeSettlementTransition({
    tenantId,
    settlementId,
    actorUserId,
    actorRole,
    expectedVersion,
    actionType: "ESCALATE",
    notes,
    reason: normalizedReason,
    franchiseId,
    centerId,
    taskDueAt,
    historyMetadata: normalizedMetadata,
    transitionData: {
      updateFields: {
        escalatedAt: new Date()
      }
    },
    escalationFactory: async ({ tx, settlement, scope, now, notes: nextNotes, reason: nextReason }) => {
      const existing = await tx.settlementEscalation.findFirst({
        where: {
          settlementId: settlement.id,
          escalationType: normalizedEscalationType,
          state: { in: ACTIVE_ESCALATION_STATES }
        },
        select: { id: true }
      });

      if (existing) {
        throw createHttpError(409, "Settlement already has an active escalation of this type", "INVALID_TRANSITION");
      }

      return tx.settlementEscalation.create({
        data: {
          settlementId: settlement.id,
          tenantId: settlement.tenantId,
          businessPartnerId: scope.businessPartnerId,
          franchiseId: scope.franchiseId,
          centerId: scope.centerId,
          escalationType: normalizedEscalationType,
          severity: normalizedSeverity,
          escalationReason: nextReason,
          metadata: {
            ...(normalizedMetadata || {}),
            previousStatus: settlement.status,
            notes: nextNotes || null
          }
        }
      });
    }
  });
}

async function resolveSettlementEscalation({
  tenantId,
  settlementId,
  escalationId,
  actorUserId,
  actorRole,
  expectedVersion,
  notes,
  franchiseId,
  centerId,
  taskDueAt
}) {
  const normalizedEscalationId = normalizeOptionalText(escalationId);

  const normalizedExpectedVersion = normalizeExpectedVersion(expectedVersion);
  const normalizedNotes = normalizeOptionalText(notes);
  const normalizedTaskDueAt = normalizeDate(taskDueAt, "taskDueAt");

  return prisma.$transaction(async (tx) => {
    const settlement = await loadSettlement({ tx, tenantId, settlementId });
    const actorScope = await resolveActorScope({ tx, tenantId, actorUserId, actorRole });

    if (actorRole !== "BP") {
      throw createHttpError(403, "Role cannot resolve settlement escalations", "WORKFLOW_PERMISSION_DENIED");
    }

    assertActorSettlementAccess({ settlement, actorScope, actorRole });
    assertWorkflowVersion({ expectedVersion: normalizedExpectedVersion, settlement });

    if (settlement.status !== "ESCALATED") {
      throw createHttpError(409, "Settlement is not in an escalated state", "INVALID_TRANSITION");
    }

    const scope = await resolveWorkflowScope({
      tx,
      tenantId,
      settlement,
      actorScope,
      franchiseId,
      centerId
    });

    const escalation = await tx.settlementEscalation.findFirst({
      where: {
        settlementId,
        tenantId,
        ...(normalizedEscalationId ? { id: normalizedEscalationId } : {}),
        state: { in: ACTIVE_ESCALATION_STATES }
      },
      orderBy: [{ triggeredAt: "desc" }, { createdAt: "desc" }]
    });

    if (!escalation) {
      throw createHttpError(409, "Settlement does not have an active escalation to resolve", "INVALID_TRANSITION");
    }

    const previousStatus = escalation.metadata?.previousStatus;
    const toStatus = RESUMABLE_ESCALATION_STATUSES.has(previousStatus) ? previousStatus : "REVIEWED";
    const now = new Date();

    const updateResult = await tx.settlement.updateMany({
      where: {
        id: settlement.id,
        tenantId,
        workflowVersion: normalizedExpectedVersion
      },
      data: {
        status: toStatus,
        workflowVersion: normalizedExpectedVersion + 1,
        currentActionRole: buildCurrentActionRole(toStatus),
        lastWorkflowActionAt: now
      }
    });

    if (updateResult.count !== 1) {
      throw createHttpError(409, "Settlement workflow version is stale", "WORKFLOW_VERSION_CONFLICT");
    }

    const resolvedEscalation = await tx.settlementEscalation.update({
      where: { id: escalation.id },
      data: {
        state: "RESOLVED",
        resolvedAt: now
      }
    });

    await closeActiveTasks({ tx, settlementId, now });

    const nextTask = await createNextTask({
      tx,
      settlement,
      status: toStatus,
      scope,
      dueAt: normalizedTaskDueAt,
      metadata: {
        actionType: "RESOLVE",
        escalationId: escalation.id,
        workflowVersion: normalizedExpectedVersion + 1
      }
    });

    const history = await persistWorkflowHistory({
      tx,
      settlement,
      scope,
      actorUserId,
      actorRole,
      actionType: "RESOLVE",
      toStatus,
      expectedVersion: normalizedExpectedVersion,
      notes: normalizedNotes,
      reason: escalation.escalationReason || null,
      payoutReference: null,
      metadata: {
        escalationId: escalation.id,
        previousStatus: previousStatus || null
      }
    });

    const updatedSettlement = await fetchUpdatedSettlement({ tx, settlementId });

    return {
      settlement: updatedSettlement,
      history,
      nextTask,
      escalation: resolvedEscalation
    };
  });
}

async function markSettlementPaid({
  tenantId,
  settlementId,
  actorUserId,
  actorRole,
  expectedVersion,
  payoutReference,
  notes,
  paidAt
}) {
  const normalizedPayoutReference = normalizeRequiredText(payoutReference, "payoutReference");
  const normalizedPaidAt = normalizeDate(paidAt, "paidAt") || new Date();

  return prisma.$transaction(async (tx) => {
    const settlement = await loadSettlement({ tx, tenantId, settlementId });
    const actorScope = await resolveActorScope({ tx, tenantId, actorUserId, actorRole });
    const normalizedExpectedVersion = normalizeExpectedVersion(expectedVersion);
    const normalizedNotes = normalizeOptionalText(notes);

    assertRoleAllowed({ actionType: "MARK_PAID", actorRole });
    assertStatusAllowed({ actionType: "MARK_PAID", settlementStatus: settlement.status });
    assertWorkflowVersion({ expectedVersion: normalizedExpectedVersion, settlement });

    const scope = {
      businessPartnerId: settlement.businessPartnerId,
      franchiseId: null,
      centerId: null
    };

    const now = new Date();
    const updateResult = await tx.settlement.updateMany({
      where: {
        id: settlement.id,
        tenantId,
        workflowVersion: normalizedExpectedVersion
      },
      data: {
        status: "PAID",
        workflowVersion: normalizedExpectedVersion + 1,
        currentActionRole: null,
        paidAt: normalizedPaidAt,
        paidActorUserId: actorUserId,
        payoutReference: normalizedPayoutReference,
        lastWorkflowActionAt: now
      }
    });

    if (updateResult.count !== 1) {
      throw createHttpError(409, "Settlement workflow version is stale", "WORKFLOW_VERSION_CONFLICT");
    }

    await tx.settlementEscalation.updateMany({
      where: {
        settlementId,
        state: { in: ACTIVE_ESCALATION_STATES }
      },
      data: {
        state: "RESOLVED",
        resolvedAt: now
      }
    });

    await closeActiveTasks({ tx, settlementId, now });

    const history = await persistWorkflowHistory({
      tx,
      settlement,
      scope,
      actorUserId,
      actorRole,
      actionType: "MARK_PAID",
      toStatus: "PAID",
      expectedVersion: normalizedExpectedVersion,
      notes: normalizedNotes,
      reason: null,
      payoutReference: normalizedPayoutReference,
      metadata: null
    });

    const updatedSettlement = await fetchUpdatedSettlement({ tx, settlementId });

    return {
      settlement: updatedSettlement,
      history,
      nextTask: null,
      escalation: null
    };
  });
}

async function addSettlementSupportingRecord({
  tenantId,
  settlementId,
  actorUserId,
  actorRole,
  recordType,
  fileUrl,
  fileName,
  mimeType,
  notes,
  metadata,
  franchiseId,
  centerId
}) {
  if (!["CENTER", "FRANCHISE"].includes(actorRole)) {
    throw createHttpError(403, "Role cannot attach settlement supporting records", "WORKFLOW_PERMISSION_DENIED");
  }

  const normalizedRecordType = normalizeRequiredText(recordType, "recordType");
  const normalizedFileUrl = normalizeRequiredText(fileUrl, "fileUrl");
  const normalizedFileName = normalizeRequiredText(fileName, "fileName");
  const normalizedMimeType = normalizeOptionalText(mimeType);
  const normalizedNotes = normalizeOptionalText(notes);
  const normalizedMetadata = normalizeMetadata(metadata);

  return prisma.$transaction(async (tx) => {
    const settlement = await loadSettlement({ tx, tenantId, settlementId });
    const actorScope = await resolveActorScope({ tx, tenantId, actorUserId, actorRole });

    assertActorSettlementAccess({ settlement, actorScope, actorRole });

    const scope = await resolveWorkflowScope({
      tx,
      tenantId,
      settlement,
      actorScope,
      franchiseId,
      centerId
    });

    return tx.settlementSupportingRecord.create({
      data: {
        settlementId,
        tenantId,
        uploadedByUserId: actorUserId,
        uploadedByRole: actorRole,
        recordType: normalizedRecordType,
        fileUrl: normalizedFileUrl,
        fileName: normalizedFileName,
        mimeType: normalizedMimeType,
        notes: normalizedNotes,
        metadata: {
          ...(normalizedMetadata || {}),
          scope
        }
      }
    });
  });
}

async function listSettlementSupportingRecords({ tenantId, settlementId }) {
  await loadSettlement({ tx: prisma, tenantId, settlementId });

  return prisma.settlementSupportingRecord.findMany({
    where: {
      tenantId,
      settlementId
    },
    orderBy: [{ createdAt: "asc" }]
  });
}

function createBpWorkflowScopeError(message = "Business partner scope not resolved", errorCode = "BP_SCOPE_REQUIRED") {
  return createHttpError(403, message, errorCode);
}

function assertBpScope({ tenantId, bpScope }) {
  if (!tenantId) {
    throw createHttpError(400, "tenantId is required", "TENANT_REQUIRED");
  }

  if (!bpScope || bpScope.tenantId !== tenantId || !bpScope.businessPartner?.id) {
    throw createBpWorkflowScopeError();
  }

  return bpScope.businessPartner.id;
}

function normalizeIdArray(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    )
  );
}

function buildWorkflowListOrderBy(sortBy = "updatedAt", sortOrder = "desc") {
  const direction = String(sortOrder || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const sortableFields = new Set([
    "createdAt",
    "generatedAt",
    "updatedAt",
    "lastWorkflowActionAt",
    "payoutDueAt",
    "periodStart",
    "periodEnd",
    "grossAmount",
    "partnerEarnings",
    "status",
    "currentActionRole"
  ]);
  const normalizedSortBy = sortableFields.has(sortBy) ? sortBy : "updatedAt";

  return [{ [normalizedSortBy]: direction }, { createdAt: "desc" }, { id: "desc" }];
}

function buildSettlementBaseSelect() {
  return {
    id: true,
    tenantId: true,
    businessPartnerId: true,
    periodYear: true,
    periodMonth: true,
    periodStart: true,
    periodEnd: true,
    grossAmount: true,
    partnerEarnings: true,
    platformEarnings: true,
    status: true,
    workflowVersion: true,
    currentActionRole: true,
    submittedAt: true,
    reviewedAt: true,
    approvedAt: true,
    rejectedAt: true,
    reopenedAt: true,
    escalatedAt: true,
    payoutDueAt: true,
    paidAt: true,
    rejectionReason: true,
    payoutReference: true,
    operationalNotes: true,
    lastWorkflowActionAt: true,
    generatedAt: true,
    createdAt: true,
    updatedAt: true,
    businessPartner: {
      select: {
        id: true,
        code: true,
        name: true,
        displayName: true
      }
    }
  };
}

function buildSettlementListSelect() {
  return {
    ...buildSettlementBaseSelect(),
    workflowTasks: {
      where: {
        state: { in: ACTIVE_TASK_STATES }
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: 1,
      select: {
        id: true,
        taskType: true,
        state: true,
        targetRole: true,
        targetUserId: true,
        dueAt: true,
        escalationCount: true,
        metadata: true
      }
    },
    escalations: {
      where: {
        state: { in: ACTIVE_ESCALATION_STATES }
      },
      orderBy: [{ triggeredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: 1,
      select: {
        id: true,
        escalationType: true,
        severity: true,
        state: true,
        triggeredAt: true,
        escalationReason: true,
        metadata: true
      }
    },
    _count: {
      select: {
        workflowHistory: true,
        workflowTasks: true,
        escalations: true,
        supportingRecords: true
      }
    }
  };
}

function buildActiveTaskWhere({ role } = {}) {
  return {
    state: { in: ACTIVE_TASK_STATES },
    ...(role ? { targetRole: role } : {})
  };
}

function buildActiveEscalationWhere() {
  return {
    state: { in: ACTIVE_ESCALATION_STATES }
  };
}

function buildOverdueWhere(now, role = null) {
  return {
    OR: [
      {
        workflowTasks: {
          some: {
            ...buildActiveTaskWhere({ role }),
            dueAt: { lt: now }
          }
        }
      },
      {
        payoutDueAt: { lt: now },
        status: { in: ["APPROVED", "OVERDUE", "ESCALATED"] }
      }
    ]
  };
}

function buildFranchiseRelationWhere(franchiseId) {
  return {
    OR: [
      { workflowHistory: { some: { franchiseId } } },
      { workflowTasks: { some: { franchiseId } } },
      { escalations: { some: { franchiseId } } }
    ]
  };
}

function buildCenterRelationWhere(centerId) {
  return {
    OR: [
      { workflowHistory: { some: { centerId } } },
      { workflowTasks: { some: { centerId } } },
      { escalations: { some: { centerId } } }
    ]
  };
}

function buildSearchWhere(query) {
  const normalized = normalizeOptionalText(query);
  if (!normalized) {
    return null;
  }

  const periodMatch = normalized.match(/^(\d{4})-(\d{1,2})$/);
  const orClauses = [
    { payoutReference: { contains: normalized } },
    { rejectionReason: { contains: normalized } },
    { operationalNotes: { contains: normalized } },
    {
      businessPartner: {
        is: {
          OR: [
            { code: { contains: normalized } },
            { name: { contains: normalized } },
            { displayName: { contains: normalized } }
          ]
        }
      }
    }
  ];

  if (periodMatch) {
    orClauses.push({
      periodYear: Number.parseInt(periodMatch[1], 10),
      periodMonth: Number.parseInt(periodMatch[2], 10)
    });
  }

  return { OR: orClauses };
}

function buildWorkflowListWhere({ tenantId, bpScope, filters = {}, actorRole = "BP", now = new Date() }) {
  const businessPartnerId = assertBpScope({ tenantId, bpScope });
  const clauses = [{ tenantId, businessPartnerId }];

  const statuses = normalizeIdArray(filters.statuses);
  if (statuses.length) {
    clauses.push({ status: { in: statuses } });
  }

  const roles = normalizeIdArray(filters.currentActionRoles);
  if (roles.length) {
    clauses.push({ currentActionRole: { in: roles } });
  }

  if (filters.franchiseId) {
    clauses.push(buildFranchiseRelationWhere(filters.franchiseId));
  }

  if (filters.centerId) {
    clauses.push(buildCenterRelationWhere(filters.centerId));
  }

  if (filters.overdueOnly) {
    clauses.push(buildOverdueWhere(now, actorRole));
  }

  if (filters.escalationOnly) {
    clauses.push({ escalations: { some: buildActiveEscalationWhere() } });
  }

  if (filters.pendingActionOnly) {
    clauses.push({
      OR: [
        { currentActionRole: actorRole },
        { workflowTasks: { some: buildActiveTaskWhere({ role: actorRole }) } }
      ]
    });
  }

  const searchWhere = buildSearchWhere(filters.query);
  if (searchWhere) {
    clauses.push(searchWhere);
  }

  return clauses.length === 1 ? clauses[0] : { AND: clauses };
}

function getAllowedSettlementWorkflowActions({ actorRole, settlement, escalations = null }) {
  const actions = Object.entries(TRANSITION_DEFINITIONS)
    .filter(([, definition]) => definition.allowedRoles.includes(actorRole) && definition.fromStatuses.includes(settlement.status))
    .map(([actionType]) => actionType);

  const escalationItems = Array.isArray(escalations)
    ? escalations
    : Array.isArray(settlement?.escalations)
      ? settlement.escalations
      : [];
  const hasActiveEscalation = escalationItems.some((item) => ACTIVE_ESCALATION_STATES.includes(item.state));

  if (actorRole === "BP" && settlement?.status === "ESCALATED" && hasActiveEscalation) {
    actions.unshift("RESOLVE");
  }

  return Array.from(new Set(actions));
}

function mapSettlementWorkflowSummary(settlement, actorRole = "BP") {
  return {
    id: settlement.id,
    tenantId: settlement.tenantId,
    businessPartnerId: settlement.businessPartnerId,
    periodYear: settlement.periodYear,
    periodMonth: settlement.periodMonth,
    periodStart: settlement.periodStart,
    periodEnd: settlement.periodEnd,
    grossAmount: settlement.grossAmount,
    partnerEarnings: settlement.partnerEarnings,
    platformEarnings: settlement.platformEarnings,
    status: settlement.status,
    workflowVersion: settlement.workflowVersion,
    currentActionRole: settlement.currentActionRole,
    submittedAt: settlement.submittedAt,
    reviewedAt: settlement.reviewedAt,
    approvedAt: settlement.approvedAt,
    rejectedAt: settlement.rejectedAt,
    reopenedAt: settlement.reopenedAt,
    escalatedAt: settlement.escalatedAt,
    payoutDueAt: settlement.payoutDueAt,
    paidAt: settlement.paidAt,
    rejectionReason: settlement.rejectionReason,
    payoutReference: settlement.payoutReference,
    operationalNotes: settlement.operationalNotes,
    lastWorkflowActionAt: settlement.lastWorkflowActionAt,
    generatedAt: settlement.generatedAt,
    createdAt: settlement.createdAt,
    updatedAt: settlement.updatedAt,
    businessPartner: settlement.businessPartner,
    activeTask: Array.isArray(settlement.workflowTasks) ? settlement.workflowTasks[0] || null : null,
    activeEscalation: Array.isArray(settlement.escalations) ? settlement.escalations[0] || null : null,
    counts: settlement._count || null,
    allowedActions: getAllowedSettlementWorkflowActions({ actorRole, settlement }),
    canUploadSupportingRecord: ["CENTER", "FRANCHISE"].includes(actorRole)
  };
}

function mapHistoryEntry(entry) {
  return {
    id: entry.id,
    settlementId: entry.settlementId,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    actionType: entry.actionType,
    actorRole: entry.actorRole,
    expectedVersion: entry.expectedVersion,
    resultingVersion: entry.resultingVersion,
    reason: entry.reason,
    notes: entry.notes,
    payoutReference: entry.payoutReference,
    metadata: entry.metadata,
    createdAt: entry.createdAt,
    actorUser: entry.actorUser,
    franchise: entry.franchise,
    center: entry.center
  };
}

function mapTaskEntry(task) {
  return {
    id: task.id,
    settlementId: task.settlementId,
    targetRole: task.targetRole,
    targetUserId: task.targetUserId,
    taskType: task.taskType,
    state: task.state,
    dueAt: task.dueAt,
    completedAt: task.completedAt,
    escalatedAt: task.escalatedAt,
    resolvedAt: task.resolvedAt,
    escalationCount: task.escalationCount,
    metadata: task.metadata,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    targetUser: task.targetUser,
    franchise: task.franchise,
    center: task.center
  };
}

function mapEscalationEntry(escalation) {
  return {
    id: escalation.id,
    settlementId: escalation.settlementId,
    escalationType: escalation.escalationType,
    severity: escalation.severity,
    state: escalation.state,
    triggeredAt: escalation.triggeredAt,
    acknowledgedAt: escalation.acknowledgedAt,
    resolvedAt: escalation.resolvedAt,
    escalationReason: escalation.escalationReason,
    metadata: escalation.metadata,
    createdAt: escalation.createdAt,
    updatedAt: escalation.updatedAt,
    franchise: escalation.franchise,
    center: escalation.center
  };
}

function mapSupportingRecordEntry(record) {
  return {
    id: record.id,
    settlementId: record.settlementId,
    uploadedByUserId: record.uploadedByUserId,
    uploadedByRole: record.uploadedByRole,
    recordType: record.recordType,
    fileUrl: record.fileUrl,
    fileName: record.fileName,
    mimeType: record.mimeType,
    notes: record.notes,
    metadata: record.metadata,
    createdAt: record.createdAt,
    uploadedByUser: record.uploadedByUser
  };
}

async function getScopedSettlementForPartner({ tenantId, bpScope, settlementId, select = { id: true } }) {
  const businessPartnerId = assertBpScope({ tenantId, bpScope });
  const settlement = await prisma.settlement.findFirst({
    where: {
      id: settlementId,
      tenantId,
      businessPartnerId
    },
    select
  });

  if (!settlement) {
    throw createHttpError(404, "Settlement not found", "SETTLEMENT_NOT_FOUND");
  }

  return settlement;
}

async function listSettlementWorkflows({
  tenantId,
  bpScope,
  actorRole = "BP",
  filters = {},
  limit = 20,
  offset = 0,
  sortBy = "updatedAt",
  sortOrder = "desc",
  now = new Date()
}) {
  const where = buildWorkflowListWhere({ tenantId, bpScope, filters, actorRole, now });
  const orderBy = buildWorkflowListOrderBy(sortBy, sortOrder);

  const [total, items] = await prisma.$transaction([
    prisma.settlement.count({ where }),
    prisma.settlement.findMany({
      where,
      orderBy,
      skip: offset,
      take: limit,
      select: buildSettlementListSelect()
    })
  ]);

  return {
    total,
    items: items.map((item) => mapSettlementWorkflowSummary(item, actorRole)),
    limit,
    offset,
    sortBy,
    sortOrder: String(sortOrder || "desc").toLowerCase() === "asc" ? "asc" : "desc"
  };
}

async function getSettlementWorkflowQueueSummary({ tenantId, bpScope, actorRole = "BP", now = new Date() }) {
  const businessPartnerId = assertBpScope({ tenantId, bpScope });
  const baseWhere = { tenantId, businessPartnerId };

  const [pendingReviewCount, approvalQueueCount, overdueCount, escalationCount, payoutPendingCount] = await prisma.$transaction([
    prisma.settlement.count({
      where: {
        ...baseWhere,
        status: "PENDING_REVIEW"
      }
    }),
    prisma.settlement.count({
      where: {
        ...baseWhere,
        OR: [
          { status: "REVIEWED" },
          { currentActionRole: actorRole },
          { workflowTasks: { some: buildActiveTaskWhere({ role: actorRole }) } }
        ]
      }
    }),
    prisma.settlement.count({
      where: {
        ...baseWhere,
        ...buildOverdueWhere(now, actorRole)
      }
    }),
    prisma.settlement.count({
      where: {
        ...baseWhere,
        escalations: { some: buildActiveEscalationWhere() }
      }
    }),
    prisma.settlement.count({
      where: {
        ...baseWhere,
        status: { in: ["APPROVED", "OVERDUE", "ESCALATED"] }
      }
    })
  ]);

  return {
    pendingReviewCount,
    approvalQueueCount,
    overdueCount,
    escalationCount,
    payoutPendingCount
  };
}

async function listSettlementWorkflowHistory({ tenantId, bpScope, settlementId, limit = 20, offset = 0 }) {
  await getScopedSettlementForPartner({ tenantId, bpScope, settlementId });

  const where = { tenantId, settlementId };
  const [total, items] = await prisma.$transaction([
    prisma.settlementWorkflowHistory.count({ where }),
    prisma.settlementWorkflowHistory.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: offset,
      take: limit,
      select: {
        id: true,
        settlementId: true,
        fromStatus: true,
        toStatus: true,
        actionType: true,
        actorRole: true,
        expectedVersion: true,
        resultingVersion: true,
        reason: true,
        notes: true,
        payoutReference: true,
        metadata: true,
        createdAt: true,
        actorUser: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true
          }
        },
        franchise: {
          select: {
            id: true,
            code: true,
            name: true,
            displayName: true
          }
        },
        center: {
          select: {
            id: true,
            code: true,
            name: true,
            displayName: true
          }
        }
      }
    })
  ]);

  return {
    total,
    items: items.map(mapHistoryEntry),
    limit,
    offset
  };
}

async function listSettlementWorkflowTasks({
  tenantId,
  bpScope,
  settlementId,
  limit = 20,
  offset = 0,
  activeOnly = false
}) {
  await getScopedSettlementForPartner({ tenantId, bpScope, settlementId });

  const where = {
    tenantId,
    settlementId,
    ...(activeOnly ? { state: { in: ACTIVE_TASK_STATES } } : {})
  };

  const [total, items] = await prisma.$transaction([
    prisma.settlementWorkflowTask.count({ where }),
    prisma.settlementWorkflowTask.findMany({
      where,
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      skip: offset,
      take: limit,
      select: {
        id: true,
        settlementId: true,
        targetRole: true,
        targetUserId: true,
        taskType: true,
        state: true,
        dueAt: true,
        completedAt: true,
        escalatedAt: true,
        resolvedAt: true,
        escalationCount: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        targetUser: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true
          }
        },
        franchise: {
          select: {
            id: true,
            code: true,
            name: true,
            displayName: true
          }
        },
        center: {
          select: {
            id: true,
            code: true,
            name: true,
            displayName: true
          }
        }
      }
    })
  ]);

  return {
    total,
    items: items.map(mapTaskEntry),
    limit,
    offset
  };
}

async function listSettlementWorkflowEscalations({ tenantId, bpScope, settlementId, limit = 20, offset = 0 }) {
  await getScopedSettlementForPartner({ tenantId, bpScope, settlementId });

  const where = { tenantId, settlementId };
  const [total, items] = await prisma.$transaction([
    prisma.settlementEscalation.count({ where }),
    prisma.settlementEscalation.findMany({
      where,
      orderBy: [{ triggeredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: offset,
      take: limit,
      select: {
        id: true,
        settlementId: true,
        escalationType: true,
        severity: true,
        state: true,
        triggeredAt: true,
        acknowledgedAt: true,
        resolvedAt: true,
        escalationReason: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        franchise: {
          select: {
            id: true,
            code: true,
            name: true,
            displayName: true
          }
        },
        center: {
          select: {
            id: true,
            code: true,
            name: true,
            displayName: true
          }
        }
      }
    })
  ]);

  return {
    total,
    items: items.map(mapEscalationEntry),
    limit,
    offset
  };
}

async function listSettlementSupportingRecordsScoped({ tenantId, bpScope, settlementId, limit = 20, offset = 0 }) {
  await getScopedSettlementForPartner({ tenantId, bpScope, settlementId });

  const where = { tenantId, settlementId };
  const [total, items] = await prisma.$transaction([
    prisma.settlementSupportingRecord.count({ where }),
    prisma.settlementSupportingRecord.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: offset,
      take: limit,
      select: {
        id: true,
        settlementId: true,
        uploadedByUserId: true,
        uploadedByRole: true,
        recordType: true,
        fileUrl: true,
        fileName: true,
        mimeType: true,
        notes: true,
        metadata: true,
        createdAt: true,
        uploadedByUser: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true
          }
        }
      }
    })
  ]);

  return {
    total,
    items: items.map(mapSupportingRecordEntry),
    limit,
    offset
  };
}

async function getSettlementWorkflowDetail({ tenantId, bpScope, settlementId, actorRole = "BP" }) {
  const businessPartnerId = assertBpScope({ tenantId, bpScope });

  const [settlement, history, tasks, escalations, supportingRecords] = await prisma.$transaction([
    prisma.settlement.findFirst({
      where: {
        id: settlementId,
        tenantId,
        businessPartnerId
      },
      select: buildSettlementBaseSelect()
    }),
    prisma.settlementWorkflowHistory.findMany({
      where: { tenantId, settlementId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        settlementId: true,
        fromStatus: true,
        toStatus: true,
        actionType: true,
        actorRole: true,
        expectedVersion: true,
        resultingVersion: true,
        reason: true,
        notes: true,
        payoutReference: true,
        metadata: true,
        createdAt: true,
        actorUser: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true
          }
        },
        franchise: {
          select: {
            id: true,
            code: true,
            name: true,
            displayName: true
          }
        },
        center: {
          select: {
            id: true,
            code: true,
            name: true,
            displayName: true
          }
        }
      }
    }),
    prisma.settlementWorkflowTask.findMany({
      where: {
        tenantId,
        settlementId,
        state: { in: ACTIVE_TASK_STATES }
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        settlementId: true,
        targetRole: true,
        targetUserId: true,
        taskType: true,
        state: true,
        dueAt: true,
        completedAt: true,
        escalatedAt: true,
        resolvedAt: true,
        escalationCount: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        targetUser: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true
          }
        },
        franchise: {
          select: {
            id: true,
            code: true,
            name: true,
            displayName: true
          }
        },
        center: {
          select: {
            id: true,
            code: true,
            name: true,
            displayName: true
          }
        }
      }
    }),
    prisma.settlementEscalation.findMany({
      where: {
        tenantId,
        settlementId
      },
      orderBy: [{ triggeredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        settlementId: true,
        escalationType: true,
        severity: true,
        state: true,
        triggeredAt: true,
        acknowledgedAt: true,
        resolvedAt: true,
        escalationReason: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        franchise: {
          select: {
            id: true,
            code: true,
            name: true,
            displayName: true
          }
        },
        center: {
          select: {
            id: true,
            code: true,
            name: true,
            displayName: true
          }
        }
      }
    }),
    prisma.settlementSupportingRecord.findMany({
      where: {
        tenantId,
        settlementId
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        settlementId: true,
        uploadedByUserId: true,
        uploadedByRole: true,
        recordType: true,
        fileUrl: true,
        fileName: true,
        mimeType: true,
        notes: true,
        metadata: true,
        createdAt: true,
        uploadedByUser: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true
          }
        }
      }
    })
  ]);

  if (!settlement) {
    throw createHttpError(404, "Settlement not found", "SETTLEMENT_NOT_FOUND");
  }

  return {
    settlement: mapSettlementWorkflowSummary(settlement, actorRole),
    workflow: {
      status: settlement.status,
      workflowVersion: settlement.workflowVersion,
      currentActionRole: settlement.currentActionRole,
      allowedActions: getAllowedSettlementWorkflowActions({ actorRole, settlement, escalations }),
      canUploadSupportingRecord: ["CENTER", "FRANCHISE"].includes(actorRole)
    },
    history: history.map(mapHistoryEntry),
    tasks: tasks.map(mapTaskEntry),
    escalations: escalations.map(mapEscalationEntry),
    supportingRecords: supportingRecords.map(mapSupportingRecordEntry)
  };
}

export {
  addSettlementSupportingRecord,
  approveSettlement,
  escalateSettlement,
  getSettlementWorkflowAutomationActor,
  getSettlementWorkflowDetail,
  getSettlementWorkflowQueueSummary,
  listSettlementSupportingRecords,
  listSettlementSupportingRecordsScoped,
  listSettlementWorkflowEscalations,
  listSettlementWorkflowHistory,
  listSettlementWorkflowTasks,
  listSettlementWorkflows,
  markSettlementPaid,
  markSettlementReviewed,
  rejectSettlement,
  reopenSettlement,
  resolveSettlementEscalation,
  submitSettlementForReview
};