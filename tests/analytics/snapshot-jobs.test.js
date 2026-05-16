import { jest } from "@jest/globals";
import { runBusinessPartnerSnapshotJob } from "../../src/jobs/bp-snapshot.job.js";
import { runCenterSnapshotJob } from "../../src/jobs/center-snapshot.job.js";
import { detectChangedCenterIds } from "../../src/services/analytics-snapshot.service.js";

describe("snapshot jobs", () => {
  test("runBusinessPartnerSnapshotJob upserts and invalidates cache", async () => {
    const invalidate = jest.fn().mockReturnValue({ removed: 3 });
    const result = await runBusinessPartnerSnapshotJob({
      tenantId: "tenant-1",
      businessPartnerId: "bp-1",
      snapshotDate: "2026-05-09",
      dependencies: {
        aggregateBusinessPartnerSnapshot: async () => ({
          tenantId: "tenant-1",
          businessPartnerId: "bp-1",
          totalStudents: 10,
          activeStudents: 8,
          totalFranchises: 2,
          activeCenters: 2,
          monthlyCollections: 100,
          pendingFees: 10,
          newAdmissions: 1,
          attendancePercent: 90,
          studentGrowthPercent: 10,
          healthScore: 88
        }),
        upsertBusinessPartnerSnapshot: async () => ({ upsertedCount: 1 }),
        invalidateBpDashboardCache: invalidate,
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
      }
    });

    expect(result.upsertedCount).toBe(1);
    expect(invalidate).toHaveBeenCalledWith({ tenantId: "tenant-1", businessPartnerId: "bp-1" });
    expect(result.cacheInvalidation.removed).toBe(3);
  });

  test("runCenterSnapshotJob is idempotent and skips when there are no incremental changes", async () => {
    const result = await runCenterSnapshotJob({
      tenantId: "tenant-1",
      businessPartnerId: "bp-1",
      snapshotDate: "2026-05-09",
      dependencies: {
        listBusinessPartnerCenters: async () => [
          {
            id: "center-1",
            franchiseProfileId: "fr-1",
            authUser: { hierarchyNodeId: "node-1" }
          }
        ],
        detectChangedCenterIds: async () => [],
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
      }
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("no_incremental_changes");
  });

  test("detectChangedCenterIds includes missing snapshots and day-scoped changes", async () => {
    const tx = {
      centerAnalyticsSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      student: { findMany: jest.fn().mockResolvedValue([{ hierarchyNodeId: "node-1" }]) },
      teacherProfile: { findMany: jest.fn().mockResolvedValue([]) },
      financialTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      attendanceSession: { findMany: jest.fn().mockResolvedValue([]) },
      studentFeeInstallment: { findMany: jest.fn().mockResolvedValue([]) },
      centerProfile: { findMany: jest.fn().mockResolvedValue([]) }
    };

    const changed = await detectChangedCenterIds({
      tenantId: "tenant-1",
      businessPartnerId: "bp-1",
      snapshotDate: "2026-05-09",
      centers: [
        {
          id: "center-1",
          authUser: { hierarchyNodeId: "node-1" }
        }
      ],
      tx
    });

    expect(changed).toEqual(["center-1"]);
  });
});