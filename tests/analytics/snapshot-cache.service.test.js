import { jest } from "@jest/globals";
import {
  clearBpDashboardCache,
  getBpDashboardCacheStats,
  invalidateBpDashboardCache,
  resolveCachedBpDashboardSlice
} from "../../src/services/snapshot-cache.service.js";

describe("snapshot-cache.service", () => {
  afterEach(() => {
    clearBpDashboardCache();
  });

  test("resolveCachedBpDashboardSlice caches per segment and scope", async () => {
    const loader = jest.fn().mockResolvedValue({ meta: {}, value: 42 });
    const args = {
      tenantId: "tenant-1",
      segment: "overview",
      bpScope: { businessPartner: { id: "bp-1" }, franchiseIds: [], centerIds: [], hierarchyNodeIds: [] },
      filters: { asOf: null },
      loader
    };

    const first = await resolveCachedBpDashboardSlice(args);
    const second = await resolveCachedBpDashboardSlice(args);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first.meta.cache.hit).toBe(false);
    expect(second.meta.cache.hit).toBe(true);
    expect(getBpDashboardCacheStats().size).toBe(1);
  });

  test("invalidateBpDashboardCache removes only matching tenant and business partner entries", async () => {
    const baseScope = { franchiseIds: [], centerIds: [], hierarchyNodeIds: [] };

    await resolveCachedBpDashboardSlice({
      tenantId: "tenant-1",
      segment: "overview",
      bpScope: { ...baseScope, businessPartner: { id: "bp-1" } },
      filters: {},
      loader: async () => ({ meta: {}, value: 1 })
    });
    await resolveCachedBpDashboardSlice({
      tenantId: "tenant-1",
      segment: "center-health",
      bpScope: { ...baseScope, businessPartner: { id: "bp-2" } },
      filters: {},
      loader: async () => ({ meta: {}, value: 2 })
    });

    const invalidated = invalidateBpDashboardCache({
      tenantId: "tenant-1",
      businessPartnerId: "bp-1",
      segments: ["overview"]
    });

    expect(invalidated.removed).toBe(1);
    expect(getBpDashboardCacheStats().size).toBe(1);
  });
});