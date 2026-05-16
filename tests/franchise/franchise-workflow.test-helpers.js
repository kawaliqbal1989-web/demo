import { expect } from "@jest/globals";
import { prisma } from "../../src/lib/prisma.js";
import { createOrUpdateOperationalEvent } from "../../src/services/operational-notification.service.js";
import { synchronizeFranchiseOperationalWorkflows } from "../../src/services/franchise-workflow.service.js";
import { ensureAuthUser, randomId } from "../helpers/test-helpers.js";

const ACTIVE_TASK_STATES = new Set(["OPEN", "IN_PROGRESS", "OVERDUE"]);

function buildFranchiseScope(franchiseProfile) {
  return {
    franchise: {
      id: franchiseProfile.id,
      businessPartnerId: franchiseProfile.businessPartnerId,
      authUserId: franchiseProfile.authUserId
    }
  };
}

async function findBaseWorkflowContext() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
  const hierarchyNode = await prisma.hierarchyNode.findFirstOrThrow({
    where: {
      tenantId: tenant.id,
      isActive: true
    },
    orderBy: { createdAt: "asc" }
  });

  const bpUser = await prisma.authUser.findFirstOrThrow({
    where: {
      tenantId: tenant.id,
      role: "BP",
      email: "bp.manager@abacusweb.local"
    }
  });

  const bpPartner = await prisma.businessPartner.findFirstOrThrow({
    where: {
      tenantId: tenant.id,
      contactEmail: String(bpUser.email || "").toLowerCase()
    },
    orderBy: { createdAt: "desc" }
  });

  return {
    tenant,
    hierarchyNode,
    bpUser,
    bpPartner
  };
}

async function createScopedFranchiseActor({ tenantCode, hierarchyNodeCode, businessPartnerId, franchisePrefix, centerPrefix }) {
  const franchiseUser = await ensureAuthUser({
    tenantCode,
    email: `${randomId(franchisePrefix)}@abacusweb.local`,
    username: randomId(`${franchisePrefix}-user`),
    role: "FRANCHISE",
    hierarchyNodeCode
  });

  const franchiseProfile = await prisma.franchiseProfile.update({
    where: { authUserId: franchiseUser.id },
    data: {
      businessPartnerId,
      status: "ACTIVE",
      isActive: true
    }
  });

  const centerUser = await ensureAuthUser({
    tenantCode,
    email: `${randomId(centerPrefix)}@abacusweb.local`,
    username: randomId(`${centerPrefix}-user`),
    role: "CENTER",
    hierarchyNodeCode
  });

  const centerProfile = await prisma.centerProfile.update({
    where: { authUserId: centerUser.id },
    data: {
      franchiseProfileId: franchiseProfile.id,
      status: "ACTIVE",
      isActive: true
    }
  });

  return {
    franchiseUser,
    franchiseProfile,
    centerUser,
    centerProfile
  };
}

async function createFranchiseWorkflowFixture({ includeForeignFranchise = false } = {}) {
  const base = await findBaseWorkflowContext();
  const cleanup = {
    workflowIds: [],
    notificationIds: [],
    centerIds: [],
    franchiseIds: [],
    userIds: []
  };

  const primary = await createScopedFranchiseActor({
    tenantCode: base.tenant.code,
    hierarchyNodeCode: base.hierarchyNode.code,
    businessPartnerId: base.bpPartner.id,
    franchisePrefix: "frsvc-fr",
    centerPrefix: "frsvc-ce"
  });

  cleanup.userIds.push(primary.franchiseUser.id, primary.centerUser.id);
  cleanup.franchiseIds.push(primary.franchiseProfile.id);
  cleanup.centerIds.push(primary.centerProfile.id);

  let foreign = null;
  if (includeForeignFranchise) {
    foreign = await createScopedFranchiseActor({
      tenantCode: base.tenant.code,
      hierarchyNodeCode: base.hierarchyNode.code,
      businessPartnerId: base.bpPartner.id,
      franchisePrefix: "frsvc-foreign-fr",
      centerPrefix: "frsvc-foreign-ce"
    });

    cleanup.userIds.push(foreign.franchiseUser.id, foreign.centerUser.id);
    cleanup.franchiseIds.push(foreign.franchiseProfile.id);
    cleanup.centerIds.push(foreign.centerProfile.id);
  }

  return {
    ...base,
    primary,
    foreign,
    cleanup
  };
}

async function createFranchiseOperationalWorkflow(
  fixture,
  {
    actor = "primary",
    title = `Workflow ${randomId("frsvc")}`,
    severity = "HIGH",
    notificationType,
    triggeredAt = new Date("2026-05-12T10:00:00.000Z"),
    fingerprintSuffix = randomId("wf"),
    observedValue,
    thresholdValue = 75,
    deltaPercent,
    message
  } = {}
) {
  const scopedActor = fixture[actor];
  if (!scopedActor) {
    throw new Error(`Unknown workflow actor context: ${actor}`);
  }

  const resolvedNotificationType = notificationType || (severity === "CRITICAL" ? "CRITICAL_ATTENDANCE" : "LOW_ATTENDANCE");
  const resolvedObservedValue = observedValue ?? (severity === "CRITICAL" ? 39 : 61);
  const resolvedDeltaPercent = deltaPercent ?? (severity === "CRITICAL" ? -28 : -14);

  const createdEvent = await createOrUpdateOperationalEvent({
    tenantId: fixture.tenant.id,
    businessPartnerId: scopedActor.franchiseProfile.businessPartnerId,
    franchiseId: scopedActor.franchiseProfile.id,
    centerId: scopedActor.centerProfile.id,
    type: resolvedNotificationType,
    category: "OPERATIONS",
    severity,
    title,
    message: message || `${title} requires franchise governance`,
    metricKey: "attendancePercent",
    thresholdValue,
    observedValue: resolvedObservedValue,
    deltaPercent: resolvedDeltaPercent,
    sourceKind: "SNAPSHOT",
    sourceSnapshotDate: triggeredAt,
    sourceWindowKey: `window:${fingerprintSuffix}`,
    fingerprint: `frsvc:${fingerprintSuffix}`,
    activeFingerprint: `frsvc-active:${fingerprintSuffix}`,
    triggeredAt,
    deepLinkPath: "/franchise/workflows",
    targets: [
      {
        recipientUserId: scopedActor.franchiseUser.id,
        recipientRole: "FRANCHISE",
        targetKey: `user:${scopedActor.franchiseUser.id}`,
        franchiseId: scopedActor.franchiseProfile.id,
        centerId: scopedActor.centerProfile.id
      }
    ]
  });

  fixture.cleanup.notificationIds.push(createdEvent.notification.id);

  await synchronizeFranchiseOperationalWorkflows({
    tenantId: fixture.tenant.id,
    franchiseScope: buildFranchiseScope(scopedActor.franchiseProfile)
  });

  const workflow = await prisma.franchiseOperationalWorkflow.findFirstOrThrow({
    where: {
      tenantId: fixture.tenant.id,
      franchiseId: scopedActor.franchiseProfile.id,
      centerId: scopedActor.centerProfile.id,
      notificationFingerprint: createdEvent.notification.activeFingerprint || createdEvent.notification.fingerprint
    }
  });

  fixture.cleanup.workflowIds.push(workflow.id);

  return {
    actor: scopedActor,
    notification: createdEvent.notification,
    workflow
  };
}

function expectHistoryTrail(history, expectedActions) {
  expect(history.map((entry) => entry.actionType)).toEqual(expectedActions);
}

function expectAppendOnlyHistory(previousHistory, nextHistory, appendedActions) {
  expect(nextHistory.slice(0, previousHistory.length).map((entry) => entry.id)).toEqual(
    previousHistory.map((entry) => entry.id)
  );
  expect(nextHistory.slice(previousHistory.length).map((entry) => entry.actionType)).toEqual(appendedActions);
}

async function simulateWorkflowVersionRace(firstAction, secondAction) {
  const results = await Promise.allSettled([firstAction(), secondAction()]);

  const successResults = results.filter((entry) => entry.status === "fulfilled");
  const rejectedResults = results.filter((entry) => entry.status === "rejected");

  return {
    results,
    successCount: successResults.length,
    conflictCount: rejectedResults.filter((entry) => entry.reason?.errorCode === "WORKFLOW_VERSION_CONFLICT").length,
    errorCodes: rejectedResults.map((entry) => entry.reason?.errorCode || null)
  };
}

function buildWorkflowValidationSummary({
  label,
  workflow,
  history,
  escalations = [],
  tasks = [],
  conflicts = [],
  queueSummary = null
}) {
  return {
    label,
    workflowStatus: workflow.status,
    queueType: workflow.queueType,
    workflowVersion: workflow.workflowVersion,
    currentActionRole: workflow.currentActionRole,
    historyActions: history.map((entry) => entry.actionType),
    historyVersions: history.map((entry) => entry.resultingVersion),
    activeTaskTypes: tasks.filter((task) => ACTIVE_TASK_STATES.has(task.state)).map((task) => task.taskType),
    escalationStates: escalations.map((escalation) => escalation.state),
    escalationSeverities: escalations.map((escalation) => escalation.severity),
    conflictCodes: conflicts,
    queueSummary: queueSummary
      ? {
          reviewQueueCount: queueSummary.reviewQueueCount,
          anomalyQueueCount: queueSummary.anomalyQueueCount,
          escalationQueueCount: queueSummary.escalationQueueCount,
          resolvedCount: queueSummary.resolvedCount
        }
      : null
  };
}

async function cleanupFranchiseWorkflowFixture(fixture) {
  const deleteManySafe = async (model, where) => {
    try {
      await model.deleteMany({ where });
    } catch {
      // Cleanup is best-effort for isolated test fixtures.
    }
  };

  const uniqueIds = (values) => Array.from(new Set(values.filter(Boolean)));
  const workflowIds = uniqueIds(fixture.cleanup.workflowIds);
  const notificationIds = uniqueIds(fixture.cleanup.notificationIds);
  const centerIds = uniqueIds(fixture.cleanup.centerIds);
  const franchiseIds = uniqueIds(fixture.cleanup.franchiseIds);
  const userIds = uniqueIds(fixture.cleanup.userIds);

  await deleteManySafe(prisma.franchiseOperationalEscalation, { workflowId: { in: workflowIds } });
  await deleteManySafe(prisma.franchiseOperationalWorkflowTask, { workflowId: { in: workflowIds } });
  await deleteManySafe(prisma.franchiseOperationalWorkflowHistory, { workflowId: { in: workflowIds } });
  await deleteManySafe(prisma.franchiseOperationalWorkflow, { id: { in: workflowIds } });
  await deleteManySafe(prisma.operationalNotificationTarget, { notificationId: { in: notificationIds } });
  await deleteManySafe(prisma.operationalNotification, { id: { in: notificationIds } });
  await deleteManySafe(prisma.centerProfile, { id: { in: centerIds } });
  await deleteManySafe(prisma.franchiseProfile, { id: { in: franchiseIds } });
  await deleteManySafe(prisma.authUser, { id: { in: userIds } });
}

export {
  buildFranchiseScope,
  buildWorkflowValidationSummary,
  cleanupFranchiseWorkflowFixture,
  createFranchiseOperationalWorkflow,
  createFranchiseWorkflowFixture,
  expectAppendOnlyHistory,
  expectHistoryTrail,
  simulateWorkflowVersionRace
};