import { beforeEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.fn();

vi.mock("../../../../services/apiClient", () => ({
  apiClient: {
    get: apiGet
  }
}));

describe("bp-dashboard api client", () => {
  beforeEach(async () => {
    apiGet.mockReset();
    const module = await import("../bp-dashboard.api");
    module.clearBpDashboardClientCache();
  });

  it("deduplicates inflight overview requests with the same params", async () => {
    apiGet.mockResolvedValue({
      data: {
        data: {
          kpis: {
            totalStudents: {
              label: "Total students",
              value: 120
            }
          }
        }
      }
    });

    const { getDashboardOverview } = await import("../bp-dashboard.api");
    const [first, second] = await Promise.all([
      getDashboardOverview({ asOf: "2026-05-10" }),
      getDashboardOverview({ asOf: "2026-05-10" })
    ]);

    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first.kpis.totalStudents.value).toBe(120);
  });

  it("isolates franchise overview cache keys by franchise id", async () => {
    apiGet
      .mockResolvedValueOnce({
        data: {
          data: {
            kpis: {
              totalStudents: {
                value: 42
              }
            }
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            kpis: {
              totalStudents: {
                value: 108
              }
            }
          }
        }
      });

    const { getFranchiseOverview } = await import("../bp-dashboard.api");
    const [first, second] = await Promise.all([
      getFranchiseOverview("fr-1", { asOf: "2026-05-10" }),
      getFranchiseOverview("fr-2", { asOf: "2026-05-10" })
    ]);

    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(apiGet.mock.calls[0][0]).toBe("/partner/franchises/fr-1/overview");
    expect(apiGet.mock.calls[1][0]).toBe("/partner/franchises/fr-2/overview");
    expect(first.kpis.totalStudents.value).toBe(42);
    expect(second.kpis.totalStudents.value).toBe(108);
  });

  it("normalizes malformed franchise center params and safe empty payloads", async () => {
    apiGet.mockResolvedValue({
      data: {
        data: null
      }
    });

    const { getFranchiseCenters } = await import("../bp-dashboard.api");
    const response = await getFranchiseCenters(" fr-1 ", {
      asOf: " 2026-05-10 ",
      limit: "bad",
      offset: -8,
      sortBy: " healthScore ",
      sortOrder: "sideways",
      filters: {
        severity: "",
        types: ["LOW_ATTENDANCE", "", null]
      }
    });

    expect(apiGet).toHaveBeenCalledWith(
      "/partner/franchises/fr-1/centers",
      expect.objectContaining({
        params: {
          asOf: "2026-05-10",
          limit: 10,
          offset: 0,
          sortBy: "healthScore",
          sortDirection: "desc",
          types: ["LOW_ATTENDANCE"]
        }
      })
    );
    expect(response.items).toEqual([]);
    expect(response.pagination).toEqual({
      limit: 0,
      offset: 0,
      returned: 0,
      total: 0
    });
    expect(response.sort).toEqual({
      sortBy: null,
      sortDirection: "desc"
    });
  });

  it("normalizes empty franchise alerts payloads for widget-safe consumption", async () => {
    apiGet.mockResolvedValue({
      data: {
        data: null
      }
    });

    const { getFranchiseAlerts } = await import("../bp-dashboard.api");
    const response = await getFranchiseAlerts("fr-1", {
      asOf: "2026-05-10"
    });

    expect(response.items).toEqual([]);
    expect(response.summary).toEqual({
      totalAlerts: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0
    });
    expect(response.meta).toEqual({
      generatedAt: null,
      source: null
    });
  });
});