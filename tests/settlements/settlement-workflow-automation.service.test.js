import { jest } from "@jest/globals";
import {
  buildIssueActiveFingerprint,
  runSettlementWorkflowAutomation
} from "../../src/services/settlement-workflow-automation.service.js";

function createIssue(overrides = {}) {
  return {
    tenantId: overrides.tenantId || "tenant-1",
    businessPartnerId: overrides.businessPartnerId || "bp-1",
    settlementId: overrides.settlementId || "set-1",
    workflowStatus: overrides.workflowStatus || "PENDING_REVIEW",
    workflowVersion: overrides.workflowVersion || 4,
    escalationType: overrides.escalationType || "UNREVIEWED_SETTLEMENT",
    notificationType: overrides.notificationType || "PENDING_SETTLEMENT",
    severity: overrides.severity || "WARNING",
    existingSeverity: overrides.existingSeverity || null,
    escalationId: overrides.escalationId || null,
    actionRequiredRole: overrides.actionRequiredRole || "FRANCHISE",
    deepLinkPath: overrides.deepLinkPath || "/bp/settlements/set-1",
    cooldownUntil: overrides.cooldownUntil || new Date("2026-05-11T02:00:00.000Z"),
    hoursElapsed: overrides.hoursElapsed || 30,
    title: overrides.title || "Workflow requires attention",
    message: overrides.message || "Workflow SLA exceeded",
    franchiseId: overrides.franchiseId || "fr-1",
    centerId: overrides.centerId || "ce-1",
    metadata: overrides.metadata || {
      workflowId: overrides.settlementId || "set-1",
      workflowStatus: overrides.workflowStatus || "PENDING_REVIEW",
      workflowVersion: overrides.workflowVersion || 4
    }
  };
}

describe("settlement-workflow-automation.service", () => {
  test("creates governed escalations and workflow notifications from SLA issues", async () => {
    const tx = {
      settlementWorkflowTask: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      settlementEscalation: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null)
      },
      operationalNotification: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };

    const evaluateSettlementWorkflowSla = jest.fn().mockResolvedValue({
      scannedCount: 1,
      issueCount: 1,
      issues: [createIssue()]
    });
    const getSettlementWorkflowAutomationActor = jest.fn().mockResolvedValue({
      actorUserId: "bp-user-1",
      actorRole: "BP"
    });
    const escalateSettlement = jest.fn().mockResolvedValue({
      settlement: {
        id: "set-1",
        status: "ESCALATED",
        workflowVersion: 5
      },
      escalation: {
        id: "esc-1",
        severity: "WARNING",
        franchiseId: "fr-1",
        centerId: "ce-1"
      }
    });
    const resolveWorkflowNotificationTargets = jest.fn().mockResolvedValue({
      targets: [
        {
          recipientUserId: "bp-user-1",
          recipientRole: "BP",
          targetKey: "bp-user-1:BP"
        }
      ]
    });
    const createOrUpdateOperationalEvent = jest.fn().mockResolvedValue({
      created: true,
      suppressed: false
    });

    const result = await runSettlementWorkflowAutomation({
      tenantId: "tenant-1",
      businessPartnerId: "bp-1",
      asOf: new Date("2026-05-10T02:00:00.000Z"),
      sourceWindowKey: "2026-05-10:2:0",
      dependencies: {
        tx,
        evaluateSettlementWorkflowSla,
        getSettlementWorkflowAutomationActor,
        escalateSettlement,
        resolveWorkflowNotificationTargets,
        createOrUpdateOperationalEvent
      }
    });

    expect(tx.settlementWorkflowTask.updateMany).toHaveBeenCalled();
    expect(escalateSettlement).toHaveBeenCalledWith(
      expect.objectContaining({
        settlementId: "set-1",
        expectedVersion: 4,
        escalationType: "UNREVIEWED_SETTLEMENT",
        severity: "WARNING"
      })
    );
    expect(createOrUpdateOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PENDING_SETTLEMENT",
        deepLinkPath: "/bp/settlements/set-1",
        metadata: expect.objectContaining({
          workflowId: "set-1",
          workflowVersion: 5,
          escalationId: "esc-1"
        })
      }),
      tx
    );
    expect(result.createdEscalations).toBe(1);
    expect(result.createdNotifications).toBe(1);
  });

  test("upgrades escalation severity and emits lifecycle-managed reminder updates", async () => {
    const issue = createIssue({
      workflowStatus: "ESCALATED",
      escalationType: "UNAPPROVED_SETTLEMENT",
      notificationType: "SETTLEMENT_ESCALATION_TRIGGERED",
      escalationId: "esc-1",
      existingSeverity: "WARNING",
      severity: "CRITICAL"
    });

    const tx = {
      settlementWorkflowTask: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      },
      settlementEscalation: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: "esc-1",
            severity: "WARNING",
            metadata: { severityHistory: [] },
            franchiseId: "fr-1",
            centerId: "ce-1"
          }),
        update: jest.fn().mockResolvedValue({
          id: "esc-1",
          severity: "CRITICAL",
          franchiseId: "fr-1",
          centerId: "ce-1",
          metadata: { severityHistory: [{ fromSeverity: "WARNING", toSeverity: "CRITICAL" }] }
        }),
        findMany: jest.fn().mockResolvedValue([])
      },
      operationalNotification: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };

    const createOrUpdateOperationalEvent = jest.fn().mockResolvedValue({
      created: false,
      suppressed: false,
      escalated: true
    });

    const result = await runSettlementWorkflowAutomation({
      tenantId: "tenant-1",
      businessPartnerId: "bp-1",
      asOf: new Date("2026-05-10T02:00:00.000Z"),
      sourceWindowKey: "2026-05-10:2:0",
      dependencies: {
        tx,
        evaluateSettlementWorkflowSla: jest.fn().mockResolvedValue({
          scannedCount: 1,
          issueCount: 1,
          issues: [issue]
        }),
        resolveWorkflowNotificationTargets: jest.fn().mockResolvedValue({
          targets: [{ recipientUserId: "bp-user-1", recipientRole: "BP", targetKey: "bp-user-1:BP" }]
        }),
        createOrUpdateOperationalEvent
      }
    });

    expect(tx.settlementEscalation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "esc-1" },
        data: expect.objectContaining({ severity: "CRITICAL" })
      })
    );
    expect(createOrUpdateOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SETTLEMENT_ESCALATION_SEVERITY_INCREASED",
        activeFingerprint: buildIssueActiveFingerprint(issue)
      }),
      tx
    );
    expect(result.upgradedEscalations).toBe(1);
    expect(result.updatedNotifications).toBe(1);
  });

  test("expires stale escalations and resolves inactive automation notifications", async () => {
    const tx = {
      settlementWorkflowTask: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      },
      settlementEscalation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "esc-stale",
            settlementId: "set-stale",
            escalationType: "PAYOUT_DELAY",
            metadata: {}
          }
        ]),
        update: jest.fn().mockResolvedValue({ id: "esc-stale" })
      },
      operationalNotification: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "opn-1",
            activeFingerprint: "bp:bp-1:workflow:settlement:set-stale:rule:PAYOUT_DELAY:esc-stale",
            metadata: {}
          }
        ])
      }
    };

    const resolveOperationalEventByActiveFingerprint = jest.fn().mockResolvedValue({ resolved: true });

    const result = await runSettlementWorkflowAutomation({
      tenantId: "tenant-1",
      businessPartnerId: "bp-1",
      asOf: new Date("2026-05-10T02:00:00.000Z"),
      sourceWindowKey: "2026-05-10:2:0",
      dependencies: {
        tx,
        evaluateSettlementWorkflowSla: jest.fn().mockResolvedValue({
          scannedCount: 0,
          issueCount: 0,
          issues: []
        }),
        resolveWorkflowNotificationTargets: jest.fn().mockResolvedValue({ targets: [] }),
        resolveOperationalEventByActiveFingerprint
      }
    });

    expect(tx.settlementEscalation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "esc-stale" },
        data: expect.objectContaining({ state: "EXPIRED" })
      })
    );
    expect(resolveOperationalEventByActiveFingerprint).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        activeFingerprint: "bp:bp-1:workflow:settlement:set-stale:rule:PAYOUT_DELAY:esc-stale"
      }),
      tx
    );
    expect(result.expiredEscalations).toBe(1);
    expect(result.resolvedNotifications).toBe(1);
  });
});