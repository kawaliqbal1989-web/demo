import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FranchiseCenterBreakdownTable } from "../FranchiseCenterBreakdownTable";

function buildCenter(index, overrides = {}) {
  return {
    activeStudents: 10 + index,
    attendancePercent: 70 + index,
    centerCode: `C-${index}`,
    centerId: `center-${index}`,
    centerName: `Center ${index}`,
    franchiseName: "Franchise One",
    healthScore: 60 + index,
    monthlyRevenue: 1000 + index * 100,
    pendingFees: 100 + index * 10,
    studentGrowthPercent: index - 4,
    ...overrides
  };
}

describe("FranchiseCenterBreakdownTable", () => {
  const retry = vi.fn();

  beforeEach(() => {
    retry.mockReset();
  });

  it("supports client-side sorting, filtering, pagination, and mobile-safe rendering", () => {
    const items = Array.from({ length: 4 }, (_, index) => buildCenter(index + 1));

    render(
      <FranchiseCenterBreakdownTable
        initialTableState={{
          limit: 2,
          offset: 0,
          query: "",
          sortBy: "healthScore",
          sortDirection: "desc",
          statusFilter: ""
        }}
        resource={{
          data: {
            items,
            meta: {
              source: {
                mode: "snapshot"
              }
            },
            pagination: {
              total: 4
            }
          },
          error: null,
          hasData: true,
          items,
          loading: false,
          meta: {
            source: {
              mode: "snapshot"
            }
          },
          pagination: {
            total: 4
          },
          retry
        }}
      />
    );

    expect(screen.getByText("Center Breakdown")).toBeInTheDocument();
    expect(screen.getAllByText("Center 4").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Center 2")).toHaveLength(0);
    expect(screen.getByText("Showing 1-2 of 4")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Showing 3-4 of 4")).toBeInTheDocument();
    expect(screen.getAllByText("Center 2").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText("Search center"), {
      target: {
        value: "Center 1"
      }
    });
    expect(screen.getAllByText("Center 1").length).toBeGreaterThan(0);
    expect(screen.getByText("Showing 1-1 of 1")).toBeInTheDocument();

    expect(screen.getAllByText(/Students/i).length).toBeGreaterThan(0);
  });

  it("shows a widget retry control when center data fails", () => {
    render(
      <FranchiseCenterBreakdownTable
        resource={{
          data: {
            items: []
          },
          error: new Error("center load failed"),
          hasData: false,
          items: [],
          loading: false,
          meta: null,
          pagination: {
            total: 0
          },
          retry
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry widget" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});