import { jest } from "@jest/globals";
import {
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
  reviewFranchiseWorkflow
} from "../../src/services/franchise-workflow.service.js";
import {
  buildFranchiseScope,
  buildWorkflowValidationSummary,
  cleanupFranchiseWorkflowFixture,
  createFranchiseOperationalWorkflow,
  createFranchiseWorkflowFixture,
  expectAppendOnlyHistory,
  expectHistoryTrail,
  simulateWorkflowVersionRace
} from "./franchise-workflow.test-helpers.js";
import { prisma } from "../helpers/test-helpers.js";

jest.setTimeout(120000);

describe("FRANCHISE WORKFLOW SERVICE HARDENING", () => {
  let fixture;

  beforeAll(async () => {
    fixture = await createFranchiseWorkflowFixture({ includeForeignFranchise: true });
  });

  afterAll(async () => {
    await cleanupFranchiseWorkflowFixture(fixture);
  });

  test("orchestrates acknowledge, center-action, resolve, and reopen with append-only history and queue sync", async () => {
    const seeded = await createFranchiseOperationalWorkflow(fixture, {
      title: "Service acknowledge chain",
      severity: "HIGH",
      fingerprintSuffix: "svc-ack-chain"
    });
    const franchiseScope = buildFranchiseScope(fixture.primary.franchiseProfile);

    const initialDetail = await getFranchiseWorkflowDetail({
      tenantId: fixture.tenant.id,
      franchiseScope,
      workflowId: seeded.workflow.id
    });

    expectHistoryTrail(initialDetail.history, ["OPEN"]);

    const acknowledged = await acknowledgeFranchiseWorkflow({
      tenantId: fixture.tenant.id,
      franchiseScope,
      workflowId: seeded.workflow.id,
      actorUserId: fixture.primary.franchiseUser.id,
      actorRole: "FRANCHISE",
      expectedVersion: initialDetail.workflow.workflowVersion,
      notes: "Acknowledged by franchise"
    });

    expect(acknowledged.workflow.status).toBe("ACKNOWLEDGED");
    expect(acknowledged.workflow.queueType).toBe("ANOMALY");
    expect(acknowledged.lastHistory.actionType).toBe("ACKNOWLEDGE");
    expect(acknowledged.lastHistory.actorUserId).toBe(fixture.primary.franchiseUser.id);

    const afterAcknowledgeDetail = await getFranchiseWorkflowDetail({
      tenantId: fixture.tenant.id,
      franchiseScope,
      workflowId: seeded.workflow.id
    });

    expectAppendOnlyHistory(initialDetail.history, afterAcknowledgeDetail.history, ["ACKNOWLEDGE"]);

    const requested = await requestFranchiseCenterAction({
      tenantId: fixture.tenant.id,
      franchiseScope,
      workflowId: seeded.workflow.id,
      actorUserId: fixture.primary.franchiseUser.id,
      actorRole: "FRANCHISE",
      expectedVersion: acknowledged.workflow.workflowVersion,
      notes: "Center must investigate attendance drop",
      taskDueAt: "2026-05-15T00:00:00.000Z"
    });

    expect(requested.workflow.status).toBe("ACTION_REQUESTED");
    expect(requested.nextTask?.taskType).toBe("CENTER_ACTION_REQUIRED");
    expect(requested.nextTask?.targetRole).toBe("CENTER");
    expect(requested.nextTask?.targetUserId).toBe(fixture.primary.centerUser.id);

    const resolved = await resolveFranchiseWorkflow({
      tenantId: fixture.tenant.id,
      franchiseScope,
      workflowId: seeded.workflow.id,
      actorUserId: fixture.primary.franchiseUser.id,
      actorRole: "FRANCHISE",
      expectedVersion: requested.workflow.workflowVersion,
      notes: "Operational issue resolved"
    });

    expect(resolved.workflow.status).toBe("RESOLVED");
    expect(resolved.workflow.currentActionRole).toBeNull();

    const reopened = await reopenFranchiseWorkflow({
      tenantId: fixture.tenant.id,
      franchiseScope,
      workflowId: seeded.workflow.id,
      actorUserId: fixture.primary.franchiseUser.id,
      actorRole: "FRANCHISE",
      expectedVersion: resolved.workflow.workflowVersion,
      notes: "Reopened after issue retriage"
    });

    expect(reopened.workflow.status).toBe("OPEN");
    expect(reopened.workflow.queueType).toBe("REVIEW");
    expect(reopened.nextTask?.taskType).toBe("REVIEW_REQUIRED");

    const finalDetail = await getFranchiseWorkflowDetail({
      tenantId: fixture.tenant.id,
      franchiseScope,
      workflowId: seeded.workflow.id
    });
    const queue = await listFranchiseWorkflows({
      tenantId: fixture.tenant.id,
      franchiseScope,
      filters: {},
      limit: 10,
      offset: 0,
      sortBy: "updatedAt",
      sortOrder: "desc"
    });

    expectHistoryTrail(finalDetail.history, ["OPEN", "ACKNOWLEDGE", "REQUEST_CENTER_ACTION", "RESOLVE", "REOPEN"]);
    expect(finalDetail.history.map((entry) => entry.resultingVersion)).toEqual([1, 2, 3, 4, 5]);
    expect(finalDetail.history.slice(1).every((entry) => entry.actorRole === "FRANCHISE")).toBe(true);
    expect(queue.items.some((item) => item.id === seeded.workflow.id && item.status === "OPEN")).toBe(true);
    expect(queue.summary.reviewQueueCount).toBeGreaterThanOrEqual(1);

    const summary = buildWorkflowValidationSummary({
      label: "acknowledge-request-resolve-reopen",
      workflow: finalDetail.workflow,
      history: finalDetail.history,
      escalations: finalDetail.escalations,
      tasks: finalDetail.tasks,
      queueSummary: queue.summary
    });

    expect(summary).toEqual({
      label: "acknowledge-request-resolve-reopen",
      workflowStatus: "OPEN",
      queueType: "REVIEW",
      workflowVersion: 5,
      currentActionRole: "FRANCHISE",
      historyActions: ["OPEN", "ACKNOWLEDGE", "REQUEST_CENTER_ACTION", "RESOLVE", "REOPEN"],
      historyVersions: [1, 2, 3, 4, 5],
      activeTaskTypes: ["REVIEW_REQUIRED"],
      escalationStates: [],
      escalationSeverities: [],
      conflictCodes: [],
      queueSummary: {
        reviewQueueCount: queue.summary.reviewQueueCount,
        anomalyQueueCount: queue.summary.anomalyQueueCount,
        escalationQueueCount: queue.summary.escalationQueueCount,
        resolvedCount: queue.summary.resolvedCount
      }
    });
  });

  test("orchestrates escalation creation, acknowledgement, forwarding, resolution, and traceable reopen flow", async () => {
    const seeded = await createFranchiseOperationalWorkflow(fixture, {
      title: "Service escalation chain",
      severity: "CRITICAL",
      notificationType: "CRITICAL_ATTENDANCE",
      fingerprintSuffix: "svc-escalation-chain"
    });
    const franchiseScope = buildFranchiseScope(fixture.primary.franchiseProfile);

    const escalated = await escalateFranchiseCenterRisk({
      tenantId: fixture.tenant.id,
      franchiseScope,
      workflowId: seeded.workflow.id,
      actorUserId: fixture.primary.franchiseUser.id,
      actorRole: "FRANCHISE",
      expectedVersion: seeded.workflow.workflowVersion,
      reason: "Attendance collapsed below threshold",
      notes: "Escalating critical attendance anomaly"
    });

    expect(escalated.workflow.status).toBe("ESCALATED");
    expect(escalated.workflow.queueType).toBe("ESCALATION");
    expect(escalated.lastHistory.actionType).toBe("ESCALATE_CENTER_RISK");
    expect(escalated.escalation?.state).toBe("ACTIVE");
    expect(escalated.escalation?.severity).toBe("CRITICAL");
    expect(escalated.nextTask?.taskType).toBe("ESCALATION_ACK_REQUIRED");

    const acknowledgedEscalation = await acknowledgeFranchiseEscalation({
      tenantId: fixture.tenant.id,
      franchiseScope,
      workflowId: seeded.workflow.id,
      actorUserId: fixture.primary.franchiseUser.id,
      actorRole: "FRANCHISE",
      expectedVersion: escalated.workflow.workflowVersion,
      notes: "Escalation acknowledged"
    });

    expect(acknowledgedEscalation.escalation?.state).toBe("ACKNOWLEDGED");
    expect(acknowledgedEscalation.lastHistory.actionType).toBe("ACKNOWLEDGE_ESCALATION");

    const forwarded = await forwardFranchiseEscalation({
      tenantId: fixture.tenant.id,
      franchiseScope,
      workflowId: seeded.workflow.id,
      actorUserId: fixture.primary.franchiseUser.id,
      actorRole: "FRANCHISE",
      expectedVersion: acknowledgedEscalation.workflow.workflowVersion,
      reason: "BP governance review required",
      notes: "Forwarded to BP for deeper governance review"
    });

    expect(forwarded.workflow.status).toBe("ESCALATED");
    expect(forwarded.workflow.currentActionRole).toBe("BP");
    expect(forwarded.escalation?.state).toBe("FORWARDED");
    expect(forwarded.nextTask?.taskType).toBe("BP_ESCALATION_REVIEW");
    expect(forwarded.nextTask?.targetUserId).toBe(fixture.bpUser.id);

    const resolved = await resolveFranchiseWorkflow({
      tenantId: fixture.tenant.id,
      franchiseScope,
      workflowId: seeded.workflow.id,
      actorUserId: fixture.primary.franchiseUser.id,
      actorRole: "FRANCHISE",
      expectedVersion: forwarded.workflow.workflowVersion,
      notes: "Escalation resolved after BP review"
    });

    expect(resolved.workflow.status).toBe("RESOLVED");

    const reopened = await reopenFranchiseWorkflow({
      tenantId: fixture.tenant.id,
      franchiseScope,
      workflowId: seeded.workflow.id,
      actorUserId: fixture.primary.franchiseUser.id,
      actorRole: "FRANCHISE",
      expectedVersion: resolved.workflow.workflowVersion,
      notes: "Reopened for continued monitoring"
    });

    expect(reopened.workflow.status).toBe("OPEN");

    const finalDetail = await getFranchiseWorkflowDetail({
      tenantId: fixture.tenant.id,
      franchiseScope,
      workflowId: seeded.workflow.id
    });

    expectHistoryTrail(finalDetail.history, [
      "OPEN",
      "ESCALATE_CENTER_RISK",
      "ACKNOWLEDGE_ESCALATION",
      "FORWARD_ESCALATION",
      "RESOLVE",
      "REOPEN"
    ]);
    expect(finalDetail.history.map((entry) => entry.resultingVersion)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(finalDetail.escalations).toHaveLength(1);
    expect(finalDetail.escalations[0]).toMatchObject({
      state: "RESOLVED",
      severity: "CRITICAL",
      escalationReason: "BP governance review required"
    });
    expect(finalDetail.escalations[0].metadata).toMatchObject({
      resumeStatus: "OPEN",
      resumeActionRole: "FRANCHISE",
      notes: "Forwarded to BP for deeper governance review"
    });

    const summary = buildWorkflowValidationSummary({
      label: "escalation-forward-resolve-reopen",
      workflow: finalDetail.workflow,
      history: finalDetail.history,
      escalations: finalDetail.escalations,
      tasks: finalDetail.tasks
    });

    expect(summary).toEqual({
      label: "escalation-forward-resolve-reopen",
      workflowStatus: "OPEN",
      queueType: "REVIEW",
      workflowVersion: 6,
      currentActionRole: "FRANCHISE",
      historyActions: [
        "OPEN",
        "ESCALATE_CENTER_RISK",
        "ACKNOWLEDGE_ESCALATION",
        "FORWARD_ESCALATION",
        "RESOLVE",
        "REOPEN"
      ],
      historyVersions: [1, 2, 3, 4, 5, 6],
      activeTaskTypes: ["REVIEW_REQUIRED"],
      escalationStates: ["RESOLVED"],
      escalationSeverities: ["CRITICAL"],
      conflictCodes: [],
      queueSummary: null
    });
  });

  test("rejects stale workflowVersion retries and duplicate governance actions without appending history", async () => {
    const seeded = await createFranchiseOperationalWorkflow(fixture, {
      title: "Service stale and duplicate validation",
      severity: "HIGH",
      fingerprintSuffix: "svc-stale-duplicate"
    });
    const franchiseScope = buildFranchiseScope(fixture.primary.franchiseProfile);

    const acknowledged = await acknowledgeFranchiseWorkflow({
      tenantId: fixture.tenant.id,
      franchiseScope,
      workflowId: seeded.workflow.id,
      actorUserId: fixture.primary.franchiseUser.id,
      actorRole: "FRANCHISE",
      expectedVersion: seeded.workflow.workflowVersion,
      notes: "Acknowledged once"
    });

    const historyAfterSuccess = await listFranchiseWorkflowHistory({
      tenantId: fixture.tenant.id,
      franchiseScope,
      workflowId: seeded.workflow.id,
      limit: 10,
      offset: 0
    });

    await expect(
      acknowledgeFranchiseWorkflow({
        tenantId: fixture.tenant.id,
        franchiseScope,
        workflowId: seeded.workflow.id,
        actorUserId: fixture.primary.franchiseUser.id,
        actorRole: "FRANCHISE",
        expectedVersion: seeded.workflow.workflowVersion,
        notes: "Retry stale acknowledge"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "WORKFLOW_VERSION_CONFLICT"
    });

    await expect(
      acknowledgeFranchiseWorkflow({
        tenantId: fixture.tenant.id,
        franchiseScope,
        workflowId: seeded.workflow.id,
        actorUserId: fixture.primary.franchiseUser.id,
        actorRole: "FRANCHISE",
        expectedVersion: acknowledged.workflow.workflowVersion,
        notes: "Duplicate acknowledge"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "INVALID_TRANSITION"
    });

    const storedWorkflow = await prisma.franchiseOperationalWorkflow.findUniqueOrThrow({
      where: { id: seeded.workflow.id },
      select: {
        status: true,
        workflowVersion: true
      }
    });
    const historyAfterFailures = await listFranchiseWorkflowHistory({
      tenantId: fixture.tenant.id,
      franchiseScope,
      workflowId: seeded.workflow.id,
      limit: 10,
      offset: 0
    });

    expect(storedWorkflow).toEqual({
      status: "ACKNOWLEDGED",
      workflowVersion: 2
    });
    expect(historyAfterSuccess.total).toBe(2);
    expect(historyAfterFailures.total).toBe(2);
    expect(historyAfterFailures.items.map((entry) => entry.actionType)).toEqual(["ACKNOWLEDGE", "OPEN"]);

    const detail = await getFranchiseWorkflowDetail({
      tenantId: fixture.tenant.id,
      franchiseScope,
      workflowId: seeded.workflow.id
    });
    const summary = buildWorkflowValidationSummary({
      label: "stale-version-and-duplicate-protection",
      workflow: detail.workflow,
      history: detail.history,
      escalations: detail.escalations,
      tasks: detail.tasks,
      conflicts: ["WORKFLOW_VERSION_CONFLICT", "INVALID_TRANSITION"]
    });

    expect(summary).toEqual({
      label: "stale-version-and-duplicate-protection",
      workflowStatus: "ACKNOWLEDGED",
      queueType: "ANOMALY",
      workflowVersion: 2,
      currentActionRole: "FRANCHISE",
      historyActions: ["OPEN", "ACKNOWLEDGE"],
      historyVersions: [1, 2],
      activeTaskTypes: [],
      escalationStates: [],
      escalationSeverities: [],
      conflictCodes: ["WORKFLOW_VERSION_CONFLICT", "INVALID_TRANSITION"],
      queueSummary: null
    });
  });

  test("enforces optimistic concurrency so only one simultaneous governance mutation wins", async () => {
    const seeded = await createFranchiseOperationalWorkflow(fixture, {
      title: "Service concurrency race",
      severity: "HIGH",
      fingerprintSuffix: "svc-race"
    });
    const franchiseScope = buildFranchiseScope(fixture.primary.franchiseProfile);

    const race = await simulateWorkflowVersionRace(
      () =>
        acknowledgeFranchiseWorkflow({
          tenantId: fixture.tenant.id,
          franchiseScope,
          workflowId: seeded.workflow.id,
          actorUserId: fixture.primary.franchiseUser.id,
          actorRole: "FRANCHISE",
          expectedVersion: seeded.workflow.workflowVersion,
          notes: "Concurrent acknowledge"
        }),
      () =>
        requestFranchiseCenterAction({
          tenantId: fixture.tenant.id,
          franchiseScope,
          workflowId: seeded.workflow.id,
          actorUserId: fixture.primary.franchiseUser.id,
          actorRole: "FRANCHISE",
          expectedVersion: seeded.workflow.workflowVersion,
          notes: "Concurrent center action request"
        })
    );

    expect(race.successCount).toBe(1);
    expect(race.conflictCount).toBe(1);
    expect(race.errorCodes).toContain("WORKFLOW_VERSION_CONFLICT");

    const detail = await getFranchiseWorkflowDetail({
      tenantId: fixture.tenant.id,
      franchiseScope,
      workflowId: seeded.workflow.id
    });

    expect(detail.workflow.workflowVersion).toBe(2);
    expect(detail.history).toHaveLength(2);
    expect(["ACKNOWLEDGE", "REQUEST_CENTER_ACTION"]).toContain(detail.history[1].actionType);

    const summary = buildWorkflowValidationSummary({
      label: "optimistic-concurrency-race",
      workflow: detail.workflow,
      history: detail.history,
      escalations: detail.escalations,
      tasks: detail.tasks,
      conflicts: race.errorCodes.filter(Boolean)
    });

    expect(summary.conflictCodes).toEqual(["WORKFLOW_VERSION_CONFLICT"]);
  });

  test("denies foreign same-tenant workflow mutation at service level and leaves history untouched", async () => {
    const seeded = await createFranchiseOperationalWorkflow(fixture, {
      actor: "foreign",
      title: "Service foreign isolation",
      severity: "CRITICAL",
      fingerprintSuffix: "svc-foreign-scope"
    });
    const ownScope = buildFranchiseScope(fixture.primary.franchiseProfile);
    const foreignScope = buildFranchiseScope(fixture.foreign.franchiseProfile);

    const foreignHistoryBefore = await listFranchiseWorkflowHistory({
      tenantId: fixture.tenant.id,
      franchiseScope: foreignScope,
      workflowId: seeded.workflow.id,
      limit: 10,
      offset: 0
    });

    await expect(
      reviewFranchiseWorkflow({
        tenantId: fixture.tenant.id,
        franchiseScope: ownScope,
        workflowId: seeded.workflow.id,
        actorUserId: fixture.primary.franchiseUser.id,
        actorRole: "FRANCHISE",
        expectedVersion: seeded.workflow.workflowVersion,
        notes: "Attempt foreign workflow mutation"
      })
    ).rejects.toMatchObject({
      statusCode: 404,
      errorCode: "WORKFLOW_NOT_FOUND"
    });

    const foreignStored = await prisma.franchiseOperationalWorkflow.findUniqueOrThrow({
      where: { id: seeded.workflow.id },
      select: {
        status: true,
        workflowVersion: true
      }
    });
    const foreignHistoryAfter = await listFranchiseWorkflowHistory({
      tenantId: fixture.tenant.id,
      franchiseScope: foreignScope,
      workflowId: seeded.workflow.id,
      limit: 10,
      offset: 0
    });

    expect(foreignStored).toEqual({
      status: "OPEN",
      workflowVersion: 1
    });
    expect(foreignHistoryAfter.total).toBe(foreignHistoryBefore.total);
    expect(foreignHistoryAfter.items.map((entry) => entry.actionType)).toEqual(["OPEN"]);
  });
});