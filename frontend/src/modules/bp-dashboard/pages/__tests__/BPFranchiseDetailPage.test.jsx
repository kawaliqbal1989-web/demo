import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { BPFranchiseDetailPage } from "../BPFranchiseDetailPage";

const { clearBpDashboardClientCache } = vi.hoisted(() => ({ clearBpDashboardClientCache: vi.fn() }));
const updateFilter = vi.fn();
const resetFilters = vi.fn();
const overviewRetry = vi.fn();
const centersRetry = vi.fn();
const alertsRetry = vi.fn();

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
const { useDashboardFilters } = vi.hoisted(() => ({ useDashboardFilters: vi.fn() }));
const { useDashboardFilterOptions } = vi.hoisted(() => ({ useDashboardFilterOptions: vi.fn() }));
const { useNetworkStatus } = vi.hoisted(() => ({ useNetworkStatus: vi.fn() }));
const { useFranchiseOverview } = vi.hoisted(() => ({ useFranchiseOverview: vi.fn() }));
const { useFranchiseRevenueTrend } = vi.hoisted(() => ({ useFranchiseRevenueTrend: vi.fn() }));
const { useFranchiseStudentGrowth } = vi.hoisted(() => ({ useFranchiseStudentGrowth: vi.fn() }));
const { useFranchiseCenters } = vi.hoisted(() => ({ useFranchiseCenters: vi.fn() }));
const { useFranchiseAlerts } = vi.hoisted(() => ({ useFranchiseAlerts: vi.fn() }));

vi.mock("../../../../hooks/useAuth", () => ({ useAuth }));
vi.mock("../../hooks/useDashboardFilters", () => ({ useDashboardFilters }));
vi.mock("../../hooks/useDashboardFilterOptions", () => ({ useDashboardFilterOptions }));
vi.mock("../../hooks/useNetworkStatus", () => ({ useNetworkStatus }));
vi.mock("../../hooks/useFranchiseOverview", () => ({ useFranchiseOverview }));
vi.mock("../../hooks/useFranchiseRevenueTrend", () => ({ useFranchiseRevenueTrend }));
vi.mock("../../hooks/useFranchiseStudentGrowth", () => ({ useFranchiseStudentGrowth }));
vi.mock("../../hooks/useFranchiseCenters", () => ({ useFranchiseCenters }));
vi.mock("../../hooks/useFranchiseAlerts", () => ({ useFranchiseAlerts }));

vi.mock("../../services/bp-dashboard.api", async () => {
  const actual = await vi.importActual("../../services/bp-dashboard.api");
  return {
    ...actual,
    clearBpDashboardClientCache
  };
});

vi.mock("../../components/DashboardFilters", () => ({
  DashboardFilters: ({ filters, onFilterChange, onRefresh, onReset }) => (
    <div>
      <div>Filters for {filters.franchiseId}</div>
      <button onClick={() => onFilterChange("franchiseId", "fr-2")}>Switch franchise</button>
      <button onClick={() => onFilterChange("centerId", "center-node-1")}>Select center</button>
      <button onClick={onRefresh}>Refresh filters</button>
      <button onClick={onReset}>Reset filters</button>
    </div>
  )
}));

vi.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="line-chart" />
}));

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname}{location.search}</div>;
}

function buildOverviewResource(overrides = {}) {
  return {
    data: {
      kpis: {
        activeCenters: { label: "Active centers", value: 2, unit: "count", deltaPercent: 0, delta: 0 },
        activeStudents: { label: "Active students", value: 54, unit: "count", deltaPercent: 2, delta: 1 },
        admissionsThisMonth: { label: "Admissions", value: 8, unit: "count", deltaPercent: 4, delta: 2 },
        growthPercent: { label: "Growth", value: 11, unit: "percent", deltaPercent: 1.4, delta: 1.4 },
        healthScore: { label: "Health", value: 87.4, unit: "score", deltaPercent: 0.5, delta: 0.5 },
        pendingFees: { label: "Pending fees", value: 250, unit: "currency", deltaPercent: -1.2, delta: -10 },
        teacherCount: { label: "Teacher count", value: 4, unit: "count", deltaPercent: 0, delta: 0 },
        totalCenters: { label: "Total centers", value: 3, unit: "count", deltaPercent: 0, delta: 0 },
        totalRevenue: { label: "Revenue", value: 1900, unit: "currency", deltaPercent: 6.4, delta: 100 },
        totalStudents: { label: "Total students", value: 66, unit: "count", deltaPercent: 4.5, delta: 3 }
      }
    },
    error: null,
    hasData: true,
    loading: false,
    meta: {
      source: { mode: "snapshot" }
    },
    retry: overviewRetry,
    ...overrides
  };
}

function buildTrendResource(overrides = {}) {
  return {
    error: null,
    hasData: true,
    loading: false,
    meta: { source: { mode: "snapshot" } },
    retry: overviewRetry,
    series: [
      { activeStudents: 50, growthPercent: 9, label: "Jan", newAdmissions: 5, revenue: 1200 },
      { activeStudents: 54, growthPercent: 11, label: "Feb", newAdmissions: 8, revenue: 1900 }
    ],
    summary: {
      averageGrowthPercent: 10,
      averageRevenue: 1550,
      growthPercent: 8,
      latestActiveStudents: 54,
      totalNewAdmissions: 13,
      totalRevenue: 3100
    },
    ...overrides
  };
}

function buildCentersResource(overrides = {}) {
  const items = [
    {
      activeStudents: 30,
      attendancePercent: 88,
      centerCode: "C-1",
      centerId: "center-1",
      centerName: "Center One",
      franchiseName: "Franchise One",
      healthScore: 91,
      monthlyRevenue: 1200,
      pendingFees: 150,
      studentGrowthPercent: 9
    },
    {
      activeStudents: 24,
      attendancePercent: 63,
      centerCode: "C-2",
      centerId: "center-2",
      centerName: "Center Two",
      franchiseName: "Franchise One",
      healthScore: 58,
      monthlyRevenue: 700,
      pendingFees: 300,
      studentGrowthPercent: -4
    }
  ];

  return {
    error: null,
    hasData: true,
    items,
    loading: false,
    meta: { source: { mode: "snapshot" } },
    pagination: { limit: 100, offset: 0, returned: 2, total: 2 },
    retry: centersRetry,
    sort: { sortBy: "healthScore", sortDirection: "desc" },
    ...overrides
  };
}

function buildAlertsResource(overrides = {}) {
  return {
    error: null,
    hasData: true,
    items: [
      {
        centerId: "center-2",
        centerName: "Center Two",
        description: "Attendance slipped below target.",
        severity: "high",
        type: "LOW_ATTENDANCE"
      }
    ],
    loading: false,
    meta: { source: { mode: "snapshot" } },
    retry: alertsRetry,
    summary: { criticalCount: 0, highCount: 1, lowCount: 0, mediumCount: 0, totalAlerts: 1 },
    ...overrides
  };
}

describe("BPFranchiseDetailPage", () => {
  beforeEach(() => {
    clearBpDashboardClientCache.mockReset();
    overviewRetry.mockReset();
    centersRetry.mockReset();
    alertsRetry.mockReset();
    updateFilter.mockReset();
    resetFilters.mockReset();

    useAuth.mockReturnValue({
      branding: {
        displayName: "Abacus BP"
      }
    });
    useDashboardFilters.mockReturnValue({
      appliedFilters: {
        centerId: "",
        dateFrom: "2026-01-01",
        dateTo: "2026-05-10",
        franchiseId: "fr-1"
      },
      draftFilters: {
        centerId: "",
        dateFrom: "2026-01-01",
        dateTo: "2026-05-10",
        franchiseId: "fr-1"
      },
      resetFilters,
      updateFilter
    });
    useDashboardFilterOptions.mockReturnValue({
      centers: [
        { label: "Center One", parentNodeId: "node-fr-1", value: "center-node-1" },
        { label: "Center Two", parentNodeId: "node-fr-1", value: "center-node-2" }
      ],
      error: null,
      franchises: [
        { label: "Franchise One", nodeId: "node-fr-1", value: "fr-1" },
        { label: "Franchise Two", nodeId: "node-fr-2", value: "fr-2" }
      ],
      loading: false,
      retry: vi.fn()
    });
    useNetworkStatus.mockReturnValue({ isOnline: true });
    useFranchiseOverview.mockReturnValue(buildOverviewResource());
    useFranchiseRevenueTrend.mockReturnValue(buildTrendResource());
    useFranchiseStudentGrowth.mockReturnValue(buildTrendResource());
    useFranchiseCenters.mockReturnValue(buildCentersResource());
    useFranchiseAlerts.mockReturnValue(buildAlertsResource());
  });

  it("renders the franchise detail page widgets and supports route-based franchise switching", () => {
    render(
      <MemoryRouter initialEntries={["/bp/franchises/fr-1?dateFrom=2026-01-01&dateTo=2026-05-10&franchiseId=fr-1"]}>
        <Routes>
          <Route path="/bp/franchises/:id" element={<><BPFranchiseDetailPage /><LocationDisplay /></>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Franchise One")).toBeInTheDocument();
    expect(screen.getByText("Franchise Overview")).toBeInTheDocument();
    expect(screen.getByText("Operational Alerts")).toBeInTheDocument();
    expect(screen.getByText("Center Breakdown")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Switch franchise"));
    expect(screen.getByTestId("location-display").textContent).toContain("/bp/franchises/fr-2");
  });

  it("preserves refresh and retry behavior without crashing on widget errors", () => {
    useFranchiseOverview.mockReturnValue(
      buildOverviewResource({
        data: { kpis: {} },
        error: new Error("overview failed"),
        hasData: false,
        meta: null
      })
    );

    render(
      <MemoryRouter initialEntries={["/bp/franchises/fr-1"]}>
        <Routes>
          <Route path="/bp/franchises/:id" element={<BPFranchiseDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Refresh Franchise View"));
    fireEvent.click(screen.getByRole("button", { name: "Retry widget" }));

    expect(clearBpDashboardClientCache).toHaveBeenCalledTimes(1);
    expect(overviewRetry).toHaveBeenCalledTimes(1);
  });
});