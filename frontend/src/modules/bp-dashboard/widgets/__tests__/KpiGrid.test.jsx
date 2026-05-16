import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiGrid } from "../KpiGrid";

const retry = vi.fn();
const { useDashboardOverview } = vi.hoisted(() => ({
  useDashboardOverview: vi.fn()
}));

vi.mock("../../hooks/useDashboardOverview", () => ({
  useDashboardOverview
}));

describe("KpiGrid", () => {
  beforeEach(() => {
    retry.mockReset();
    useDashboardOverview.mockReset();
  });

  it("renders KPI cards from overview data", () => {
    useDashboardOverview.mockReturnValue({
      data: {
        kpis: {
          totalStudents: { label: "Total students", value: 120, unit: "count", deltaPercent: 12.4, delta: 14 },
          activeStudents: { label: "Active students", value: 98, unit: "count", deltaPercent: 3.2, delta: 3 },
          totalFranchises: { label: "Total franchises", value: 9, unit: "count", deltaPercent: 0, delta: 0 },
          activeCenters: { label: "Active centers", value: 26, unit: "count", deltaPercent: 1.5, delta: 1 },
          monthlyCollections: { label: "Monthly collections", value: 540000, unit: "currency", deltaPercent: 4.4, delta: 23000 },
          pendingFees: { label: "Pending fees", value: 120000, unit: "currency", deltaPercent: -2.2, delta: -3000 },
          newAdmissions: { label: "New admissions", value: 18, unit: "count", deltaPercent: 5.5, delta: 1 },
          studentGrowthPercent: { label: "Student growth", value: 7.2, unit: "percent", deltaPercent: 1.8, delta: 1.8 }
        },
        meta: {
          source: { mode: "snapshot" }
        }
      },
      error: null,
      loading: false,
      retry
    });

    render(<KpiGrid filters={{ dateTo: "2026-05-10" }} refreshTick={0} />);

    expect(screen.getByText("Network KPI Overview")).toBeInTheDocument();
    expect(screen.getByText("Total students")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("Monthly collections")).toBeInTheDocument();
    expect(screen.getByText("₹5,40,000")).toBeInTheDocument();
  });

  it("shows an error state when initial overview load fails", () => {
    useDashboardOverview.mockReturnValue({
      data: null,
      error: new Error("overview failed"),
      loading: false,
      retry
    });

    render(<KpiGrid filters={{ dateTo: "2026-05-10" }} refreshTick={0} />);

    expect(screen.getByText("Network KPI Overview unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry widget" })).toBeInTheDocument();
  });
});