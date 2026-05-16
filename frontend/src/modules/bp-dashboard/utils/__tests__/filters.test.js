import { describe, expect, it } from "vitest";
import {
  buildDashboardSearchParams,
  normalizeFranchiseAnalyticsParams,
  normalizeFranchiseQueryFilters,
  getTrendMonths,
  parseDashboardSearchParams
} from "../filters";

describe("bp dashboard filters", () => {
  it("parses and rebuilds dashboard search params", () => {
    const params = new URLSearchParams("from=2026-01-01&to=2026-05-10&franchiseId=fr-1&centerId=ce-1");
    const parsed = parseDashboardSearchParams(params);

    expect(parsed).toEqual({
      centerId: "ce-1",
      dateFrom: "2026-01-01",
      dateTo: "2026-05-10",
      franchiseId: "fr-1"
    });

    expect(buildDashboardSearchParams(parsed).toString()).toBe(
      "from=2026-01-01&to=2026-05-10&franchiseId=fr-1&centerId=ce-1"
    );
  });

  it("derives a bounded trend month window from the selected range", () => {
    expect(
      getTrendMonths({
        dateFrom: "2026-01-01",
        dateTo: "2026-05-10"
      })
    ).toBe(5);

    expect(
      getTrendMonths({
        dateFrom: "2025-01-01",
        dateTo: "2026-05-10"
      })
    ).toBe(12);
  });

  it("normalizes franchise query filters and table params", () => {
    expect(
      normalizeFranchiseQueryFilters({
        severity: "  critical ",
        emptyText: "   ",
        types: ["LOW_ATTENDANCE", "", null, "UNHEALTHY_CENTER"],
        nested: {
          owner: " ops ",
          blank: " "
        }
      })
    ).toEqual({
      nested: {
        owner: "ops"
      },
      severity: "critical",
      types: ["LOW_ATTENDANCE", "UNHEALTHY_CENTER"]
    });

    expect(
      normalizeFranchiseAnalyticsParams(
        {
          asOf: " 2026-05-10 ",
          months: "abc",
          limit: "-5",
          offset: "-2",
          sortBy: " healthScore ",
          sortOrder: "sideways",
          filters: {
            severity: " high ",
            empty: ""
          }
        },
        {
          includeAsOf: true,
          includeMonths: true,
          includePagination: true,
          includeSorting: true,
          includeFilters: true,
          defaultMonths: 4
        }
      )
    ).toEqual({
      asOf: "2026-05-10",
      limit: 10,
      months: 4,
      offset: 0,
      severity: "high",
      sortBy: "healthScore",
      sortDirection: "desc"
    });
  });
});