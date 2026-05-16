import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FranchiseOverviewKpiGrid } from "../FranchiseOverviewKpiGrid";

describe("FranchiseOverviewKpiGrid", () => {
  const retry = vi.fn();

  beforeEach(() => {
    retry.mockReset();
  });

  it("renders franchise KPI cards from overview data", () => {
    render(
      <FranchiseOverviewKpiGrid
        resource={{
          data: {
            kpis: {
              totalStudents: { label: "Total students", value: 66, unit: "count", deltaPercent: 4.5, delta: 3 },
              activeStudents: { label: "Active students", value: 54, unit: "count", deltaPercent: 2.1, delta: 1 },
              totalCenters: { label: "Total centers", value: 3, unit: "count", deltaPercent: 0, delta: 0 },
              activeCenters: { label: "Active centers", value: 2, unit: "count", deltaPercent: 0, delta: 0 },
              totalRevenue: { label: "Revenue", value: 1900, unit: "currency", deltaPercent: 6.4, delta: 100 },
              pendingFees: { label: "Pending fees", value: 250, unit: "currency", deltaPercent: -1.2, delta: -10 },
              admissionsThisMonth: { label: "Admissions", value: 8, unit: "count", deltaPercent: 10, delta: 2 },
              growthPercent: { label: "Growth %", value: 11, unit: "percent", deltaPercent: 1.4, delta: 1.4 },
              healthScore: { label: "Health score", value: 87.4, unit: "score", deltaPercent: 0.5, delta: 0.5 }
            }
          },
          error: null,
          hasData: true,
          loading: false,
          meta: {
            source: {
              mode: "snapshot"
            }
          },
          retry
        }}
      />
    );

    expect(screen.getByText("Franchise Overview")).toBeInTheDocument();
    expect(screen.getByText("Total students")).toBeInTheDocument();
    expect(screen.getByText("66")).toBeInTheDocument();
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("₹1,900")).toBeInTheDocument();
    expect(screen.getByText("Health score")).toBeInTheDocument();
  });

  it("preserves retry compatibility when the initial overview request fails", () => {
    render(
      <FranchiseOverviewKpiGrid
        resource={{
          data: {
            kpis: {}
          },
          error: new Error("overview failed"),
          hasData: false,
          loading: false,
          meta: null,
          retry
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry widget" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});