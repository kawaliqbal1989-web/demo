import { jest } from "@jest/globals";
import {
  buildWorkflowNotificationDeepLink,
  evaluateSettlementWorkflowCandidate,
  evaluateSettlementWorkflowSla,
  getSettlementWorkflowEscalationSeverity,
  getSettlementWorkflowReminderCooldownHours
} from "../../src/services/workflow-sla-evaluator.service.js";

function createSettlement(overrides = {}) {
  return {
    id: overrides.id || "set-1",
    tenantId: overrides.tenantId || "tenant-1",
    businessPartnerId: overrides.businessPartnerId || "bp-1",
    status: overrides.status || "PENDING_REVIEW",
    workflowVersion: overrides.workflowVersion || 4,
    currentActionRole: overrides.currentActionRole || "FRANCHISE",
    periodYear: overrides.periodYear || 2099,
    periodMonth: overrides.periodMonth || 4,
    submittedAt: overrides.submittedAt || null,
    reviewedAt: overrides.reviewedAt || null,
    payoutDueAt: overrides.payoutDueAt || null,
    lastWorkflowActionAt: overrides.lastWorkflowActionAt || null,
    createdAt: overrides.createdAt || new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: overrides.updatedAt || new Date("2026-05-01T00:00:00.000Z"),
    escalations: overrides.escalations || [],
    workflowTasks: overrides.workflowTasks || [],
    workflowHistory: overrides.workflowHistory || []
  };
}

describe("workflow-sla-evaluator.service", () => {
  test("maps deterministic severity thresholds for workflow SLA windows", () => {
    expect(getSettlementWorkflowEscalationSeverity(12)).toBeNull();
    expect(getSettlementWorkflowEscalationSeverity(24)).toBe("WARNING");
    expect(getSettlementWorkflowEscalationSeverity(72)).toBe("HIGH");
    expect(getSettlementWorkflowEscalationSeverity(24 * 7)).toBe("CRITICAL");
    expect(getSettlementWorkflowReminderCooldownHours("PAYOUT_DELAY", "CRITICAL")).toBe(12);
  });

  test("evaluates unreviewed settlements with deep-link metadata and cooldown cadence", () => {
    const settlement = createSettlement({
      submittedAt: new Date("2026-05-08T00:00:00.000Z"),
      lastWorkflowActionAt: new Date("2026-05-08T00:00:00.000Z")
    });

    const issues = evaluateSettlementWorkflowCandidate(settlement, {
      asOf: new Date("2026-05-10T02:00:00.000Z")
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual(
      expect.objectContaining({
        escalationType: "UNREVIEWED_SETTLEMENT",
        notificationType: "PENDING_SETTLEMENT",
        severity: "WARNING",
        actionRequiredRole: "FRANCHISE",
        deepLinkPath: "/bp/settlements/set-1"
      })
    );
    expect(issues[0].cooldownUntil).toEqual(new Date("2026-05-11T02:00:00.000Z"));
    expect(issues[0].metadata.workflowVersion).toBe(4);
  });

  test("upgrades unresolved escalation severity without changing the active fingerprint family", () => {
    const settlement = createSettlement({
      status: "ESCALATED",
      currentActionRole: "BP",
      escalations: [
        {
          id: "esc-1",
          escalationType: "UNAPPROVED_SETTLEMENT",
          severity: "WARNING",
          state: "ACTIVE",
          triggeredAt: new Date("2026-05-01T00:00:00.000Z"),
          createdAt: new Date("2026-05-01T00:00:00.000Z")
        }
      ]
    });

    const issues = evaluateSettlementWorkflowCandidate(settlement, {
      asOf: new Date("2026-05-10T00:00:00.000Z")
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual(
      expect.objectContaining({
        escalationType: "UNAPPROVED_SETTLEMENT",
        escalationId: "esc-1",
        existingSeverity: "WARNING",
        severity: "CRITICAL"
      })
    );
    expect(issues[0].activeFingerprint).toContain("esc-1");
    expect(issues[0].metadata.notificationType).toBe("SETTLEMENT_ESCALATION_SEVERITY_INCREASED");
  });

  test("detects repeated rejection cycles deterministically", () => {
    const settlement = createSettlement({
      status: "DRAFT",
      currentActionRole: null,
      workflowHistory: [
        { id: "hist-3", actionType: "REJECT", createdAt: new Date("2026-05-09T00:00:00.000Z") },
        { id: "hist-2", actionType: "REJECT", createdAt: new Date("2026-05-07T00:00:00.000Z") },
        { id: "hist-1", actionType: "SUBMIT", createdAt: new Date("2026-05-06T00:00:00.000Z") }
      ]
    });

    const issues = evaluateSettlementWorkflowCandidate(settlement, {
      asOf: new Date("2026-05-10T00:00:00.000Z")
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual(
      expect.objectContaining({
        escalationType: "REPEATED_REJECTION",
        severity: "HIGH",
        notificationType: "SETTLEMENT_REPEATED_REJECTION"
      })
    );
    expect(issues[0].metadata.rejectionCount).toBe(2);
  });

  test("loads settlement SLA candidates with tenant and BP isolation", async () => {
    const tx = {
      settlement: {
        findMany: jest.fn().mockResolvedValue([
          createSettlement({ id: "set-tenant-1", tenantId: "tenant-1", businessPartnerId: "bp-1" })
        ])
      }
    };

    const result = await evaluateSettlementWorkflowSla({
      tenantId: "tenant-1",
      businessPartnerId: "bp-1",
      asOf: new Date("2026-05-10T02:00:00.000Z"),
      tx
    });

    expect(tx.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-1",
          businessPartnerId: "bp-1"
        })
      })
    );
    expect(result.scannedCount).toBe(1);
    expect(result.issueCount).toBe(1);
    expect(buildWorkflowNotificationDeepLink("set-tenant-1")).toBe("/bp/settlements/set-tenant-1");
  });
});