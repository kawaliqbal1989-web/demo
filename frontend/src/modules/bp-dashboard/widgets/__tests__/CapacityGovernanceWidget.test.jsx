import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CapacityGovernanceWidget } from "../CapacityGovernanceWidget";

const { useAuth } = vi.hoisted(() => ({
  useAuth: vi.fn()
}));

const { getBpCenterCapacitySummary } = vi.hoisted(() => ({
  getBpCenterCapacitySummary: vi.fn()
}));

vi.mock("../../../../hooks/useAuth", () => ({ useAuth }));
vi.mock("../../../../services/capacityService", () => ({ getBpCenterCapacitySummary }));

describe("CapacityGovernanceWidget", () => {
  beforeEach(() => {
    useAuth.mockReset();
    getBpCenterCapacitySummary.mockReset();
  });

  it("renders BP capacity metrics and utilization table", async () => {
    useAuth.mockReturnValue({ role: "BP" });
    getBpCenterCapacitySummary.mockResolvedValue({
      data: {
        items: [
          {
            centerId: "c1",
            centerName: "Center Alpha",
            franchiseName: "North Franchise",
            studentsUsed: 120,
            studentLimit: 150,
            teachersUsed: 8,
            teacherLimit: 10,
            maxUtilizationPercent: 80,
            recommendedAction: "Plan student upgrade",
            usage: {
              students: { configured: true, used: 120, limit: 150, utilizationPercent: 80, remaining: 30 },
              teachers: { configured: true, used: 8, limit: 10, utilizationPercent: 80, remaining: 2 }
            }
          },
          {
            centerId: "c2",
            centerName: "Center Beta",
            franchiseName: "South Franchise",
            studentsUsed: 90,
            studentLimit: 90,
            teachersUsed: 4,
            teacherLimit: 6,
            maxUtilizationPercent: 100,
            recommendedAction: "Raise student capacity",
            usage: {
              students: { configured: true, used: 90, limit: 90, utilizationPercent: 100, remaining: 0 },
              teachers: { configured: true, used: 4, limit: 6, utilizationPercent: 66.7, remaining: 2 }
            }
          }
        ],
        meta: {
          generatedAt: "2026-05-12T14:00:00.000Z"
        }
      }
    });

    render(<CapacityGovernanceWidget filters={{}} refreshTick={0} />);

    expect(await screen.findByRole("heading", { name: "Capacity governance" })).toBeInTheDocument();
    expect(await screen.findByText("Center Alpha")).toBeInTheDocument();
    expect(screen.getByText("Total students")).toBeInTheDocument();
    expect(screen.getByText("210")).toBeInTheDocument();
    expect(screen.getByText("Centers near limit")).toBeInTheDocument();
    expect(screen.getByText("Center Beta")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
  });

  it("does not render for non-BP roles", () => {
    useAuth.mockReturnValue({ role: "CENTER" });

    const { container } = render(<CapacityGovernanceWidget filters={{}} refreshTick={0} />);

    expect(container).toBeEmptyDOMElement();
    expect(getBpCenterCapacitySummary).not.toHaveBeenCalled();
  });
});