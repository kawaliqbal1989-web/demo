import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  clearBpDashboardClientCache: vi.fn(),
  getFranchiseOverview: vi.fn(),
  getFranchiseRevenueTrend: vi.fn(),
  getFranchiseStudentGrowth: vi.fn(),
  getFranchiseCenters: vi.fn(),
  getFranchiseAlerts: vi.fn()
}));

function stableSerializeDashboardValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeDashboardValue(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}:${stableSerializeDashboardValue(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}

function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

vi.mock("../../services/bp-dashboard.api", () => ({
  clearBpDashboardClientCache: apiMocks.clearBpDashboardClientCache,
  getFranchiseAlerts: apiMocks.getFranchiseAlerts,
  getFranchiseCenters: apiMocks.getFranchiseCenters,
  getFranchiseOverview: apiMocks.getFranchiseOverview,
  getFranchiseRevenueTrend: apiMocks.getFranchiseRevenueTrend,
  getFranchiseStudentGrowth: apiMocks.getFranchiseStudentGrowth,
  stableSerializeDashboardValue
}));

import { useFranchiseAlerts } from "../useFranchiseAlerts";
import { useFranchiseCenters } from "../useFranchiseCenters";
import { useFranchiseOverview } from "../useFranchiseOverview";

describe("bp franchise dashboard hooks", () => {
  beforeEach(() => {
    apiMocks.clearBpDashboardClientCache.mockReset();
    apiMocks.getFranchiseOverview.mockReset();
    apiMocks.getFranchiseRevenueTrend.mockReset();
    apiMocks.getFranchiseStudentGrowth.mockReset();
    apiMocks.getFranchiseCenters.mockReset();
    apiMocks.getFranchiseAlerts.mockReset();
  });

  it("exposes loading state and normalized overview data", async () => {
    const deferred = createDeferred();
    apiMocks.getFranchiseOverview.mockReturnValueOnce(deferred.promise);

    const { result } = renderHook(() =>
      useFranchiseOverview("fr-1", {
        dateTo: "2026-05-10"
      })
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.hasData).toBe(false);
    expect(result.current.kpis).toEqual({});

    await act(async () => {
      deferred.resolve({
        meta: {
          source: {
            mode: "snapshot"
          }
        },
        kpis: {
          totalStudents: {
            value: 88
          }
        }
      });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.kpis.totalStudents.value).toBe(88);
    expect(result.current.meta.source.mode).toBe("snapshot");
    expect(result.current.isEmpty).toBe(false);
  });

  it("supports retry flow without leaving stale errors behind", async () => {
    apiMocks.getFranchiseOverview
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValueOnce({
        meta: {
          source: {
            mode: "live"
          }
        },
        kpis: {
          totalStudents: {
            value: 12
          }
        }
      });

    const { result } = renderHook(() =>
      useFranchiseOverview("fr-1", {
        dateTo: "2026-05-10"
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeInstanceOf(Error);
    });

    act(() => {
      result.current.retry();
    });

    expect(apiMocks.clearBpDashboardClientCache).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    expect(result.current.kpis.totalStudents.value).toBe(12);
  });

  it("clears stale franchise overview data when the franchise id changes", async () => {
    const secondRequest = createDeferred();
    apiMocks.getFranchiseOverview
      .mockResolvedValueOnce({
        meta: {
          source: {
            mode: "snapshot"
          }
        },
        kpis: {
          totalStudents: {
            value: 44
          }
        }
      })
      .mockReturnValueOnce(secondRequest.promise);

    const { result, rerender } = renderHook(
      ({ franchiseId }) =>
        useFranchiseOverview(franchiseId, {
          dateTo: "2026-05-10"
        }),
      {
        initialProps: {
          franchiseId: "fr-1"
        }
      }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.kpis.totalStudents.value).toBe(44);

    rerender({ franchiseId: "fr-2" });

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    expect(result.current.hasData).toBe(false);
    expect(result.current.kpis).toEqual({});

    await act(async () => {
      secondRequest.resolve({
        meta: {
          source: {
            mode: "live"
          }
        },
        kpis: {
          totalStudents: {
            value: 57
          }
        }
      });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.kpis.totalStudents.value).toBe(57);
  });

  it("normalizes center pagination params and refetches when table state changes", async () => {
    apiMocks.getFranchiseCenters
      .mockResolvedValueOnce({
        meta: {
          source: {
            mode: "snapshot"
          }
        },
        items: [],
        pagination: {
          total: 0
        },
        sort: {
          sortBy: null,
          sortDirection: "desc"
        }
      })
      .mockResolvedValueOnce({
        meta: {
          source: {
            mode: "snapshot"
          }
        },
        items: [
          {
            centerId: "center-2"
          }
        ],
        pagination: {
          limit: 20,
          offset: 20,
          total: 21,
          returned: 1
        },
        sort: {
          sortBy: "healthScore",
          sortDirection: "asc"
        }
      });

    const { result, rerender } = renderHook(
      ({ requestFilters, tableState }) =>
        useFranchiseCenters(
          "fr-1",
          {
            dateTo: "2026-05-10"
          },
          tableState,
          {
            requestFilters
          }
        ),
      {
        initialProps: {
          requestFilters: {
            severity: "",
            types: ["LOW_ATTENDANCE", "", null]
          },
          tableState: {
            limit: "bad",
            offset: -5,
            sortBy: " healthScore ",
            sortOrder: "sideways"
          }
        }
      }
    );

    await waitFor(() => {
      expect(apiMocks.getFranchiseCenters).toHaveBeenCalledTimes(1);
    });

    expect(apiMocks.getFranchiseCenters).toHaveBeenLastCalledWith(
      "fr-1",
      {
        asOf: "2026-05-10",
        limit: 10,
        offset: 0,
        sortBy: "healthScore",
        sortDirection: "desc",
        types: ["LOW_ATTENDANCE"]
      },
      expect.objectContaining({
        signal: expect.any(AbortSignal)
      })
    );
    expect(result.current.isEmpty).toBe(true);

    rerender({
      requestFilters: {
        types: ["LOW_ATTENDANCE"]
      },
      tableState: {
        limit: 20,
        offset: 20,
        sortBy: "healthScore",
        sortDirection: "asc"
      }
    });

    await waitFor(() => {
      expect(apiMocks.getFranchiseCenters).toHaveBeenCalledTimes(2);
    });

    expect(apiMocks.getFranchiseCenters).toHaveBeenLastCalledWith(
      "fr-1",
      {
        asOf: "2026-05-10",
        limit: 20,
        offset: 20,
        sortBy: "healthScore",
        sortDirection: "asc",
        types: ["LOW_ATTENDANCE"]
      },
      expect.objectContaining({
        signal: expect.any(AbortSignal)
      })
    );
    expect(result.current.items).toEqual([
      {
        centerId: "center-2"
      }
    ]);
    expect(result.current.pagination.total).toBe(21);
  });

  it("returns widget-safe empty alert state", async () => {
    apiMocks.getFranchiseAlerts.mockResolvedValueOnce({
      meta: {
        generatedAt: null,
        source: null
      },
      summary: {
        totalAlerts: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0
      },
      items: []
    });

    const { result } = renderHook(() =>
      useFranchiseAlerts("fr-1", {
        dateTo: "2026-05-10"
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.summary.totalAlerts).toBe(0);
    expect(result.current.isEmpty).toBe(true);
  });
});