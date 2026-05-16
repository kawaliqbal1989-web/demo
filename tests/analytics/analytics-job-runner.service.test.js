import { jest } from "@jest/globals";
import {
  runAnalyticsSnapshotPipeline,
  runScheduledAnalyticsProcessing
} from "../../src/services/analytics-job-runner.service.js";

describe("analytics-job-runner.service", () => {
  test("runAnalyticsSnapshotPipeline isolates partner failures", async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ lockState: 1 }])
        .mockResolvedValueOnce([{ released: 1 }])
    };

    const result = await runAnalyticsSnapshotPipeline({
      snapshotDate: "2026-05-09",
      tx,
      dependencies: {
        listActiveBusinessPartners: async () => [
          { id: "bp-1", tenantId: "tenant-1" },
          { id: "bp-2", tenantId: "tenant-1" }
        ],
        runCenterSnapshotJob: jest
          .fn()
          .mockResolvedValueOnce({ upsertedCount: 2, affectedFranchiseIds: ["fr-1"] })
          .mockRejectedValueOnce(new Error("center failure")),
        runFranchiseSnapshotJob: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
        runBusinessPartnerSnapshotJob: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
        evaluateBusinessPartnerOperationalAlerts: jest.fn().mockResolvedValue({
          skipped: true,
          events: []
        }),
        recordOperationalRuleStateSuccess: jest.fn().mockResolvedValue(null),
        recordOperationalRuleStateFailure: jest.fn().mockResolvedValue(null),
        emitOperationalFailureNotification: jest.fn().mockResolvedValue({ skipped: true }),
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      }
    });

    expect(result.processedBusinessPartners).toBe(1);
    expect(result.centerSnapshots).toBe(2);
    expect(result.franchiseSnapshots).toBe(1);
    expect(result.bpSnapshots).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].businessPartnerId).toBe("bp-2");
  });

  test("runScheduledAnalyticsProcessing runs cleanup and records scheduler success", async () => {
    const runner = jest.fn().mockResolvedValue({ skipped: false, processedBusinessPartners: 1 });
    const runSettlementWorkflowAutomation = jest.fn().mockResolvedValue({ skipped: false, issueCount: 2 });
    const cleanupOperationalNotifications = jest.fn().mockResolvedValue({
      expiredCount: 0,
      deletedCount: 0
    });
    const recordOperationalRuleStateSuccess = jest.fn().mockResolvedValue(null);

    const result = await runScheduledAnalyticsProcessing({
      asOf: new Date("2026-05-10T02:00:00.000Z"),
      tenantId: "tenant-1",
      dependencies: {
        listActiveBusinessPartners: jest.fn().mockResolvedValue([
          { id: "bp-1", tenantId: "tenant-1" },
          { id: "bp-2", tenantId: "tenant-1" }
        ]),
        runSettlementWorkflowAutomation,
        cleanupOperationalNotifications,
        recordOperationalRuleStateSuccess
      },
      runner
    });

    expect(result.skipped).toBe(false);
    expect(result.runs).toHaveLength(runner.mock.calls.length);
    expect(result.workflowAutomation).toHaveLength(2);
    expect(result.cleanup).toHaveLength(1);
    expect(runSettlementWorkflowAutomation).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        businessPartnerId: "bp-1",
        sourceWindowKey: result.sourceWindowKey
      })
    );
    expect(cleanupOperationalNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        now: new Date("2026-05-10T02:00:00.000Z")
      })
    );
    expect(recordOperationalRuleStateSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        businessPartnerId: "bp-1",
        ruleKey: "WORKFLOW_AUTOMATION",
        sourceWindowKey: result.sourceWindowKey
      })
    );
    expect(recordOperationalRuleStateSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        ruleKey: "SCHEDULER",
        sourceWindowKey: result.sourceWindowKey
      })
    );
  });

  test("runScheduledAnalyticsProcessing records failure and emits scheduler failure events", async () => {
    const runner = jest.fn().mockRejectedValue(new Error("scheduler boom"));
    const recordOperationalRuleStateFailure = jest.fn().mockResolvedValue(null);
    const emitOperationalFailureNotification = jest.fn().mockResolvedValue({ skipped: false });

    await expect(
      runScheduledAnalyticsProcessing({
        asOf: new Date("2026-05-10T02:00:00.000Z"),
        tenantId: "tenant-1",
        businessPartnerId: "bp-1",
        dependencies: {
          listActiveBusinessPartners: jest.fn().mockResolvedValue([
            { id: "bp-1", tenantId: "tenant-1" }
          ]),
          recordOperationalRuleStateFailure,
          emitOperationalFailureNotification
        },
        runner
      })
    ).rejects.toThrow("scheduler boom");

    expect(recordOperationalRuleStateFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        businessPartnerId: "bp-1",
        ruleKey: "SCHEDULER"
      })
    );
    expect(emitOperationalFailureNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        businessPartnerId: "bp-1",
        type: "SCHEDULER_FAILURE"
      })
    );
  });
});