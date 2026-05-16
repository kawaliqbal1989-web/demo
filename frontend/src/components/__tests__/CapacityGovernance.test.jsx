import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CenterCapacityPanel } from "../CapacityGovernance";

const { useAuth } = vi.hoisted(() => ({
  useAuth: vi.fn()
}));

vi.mock("../../hooks/useAuth", () => ({ useAuth }));

describe("CenterCapacityPanel", () => {
  const snapshot = {
    center: {
      name: "North Center"
    },
    summary: {
      recommendedAction: "Review student seats"
    },
    usage: {
      students: { configured: true, used: 95, limit: 100, utilizationPercent: 95, remaining: 5 },
      teachers: { configured: true, used: 6, limit: 10, utilizationPercent: 60, remaining: 4 }
    }
  };

  beforeEach(() => {
    useAuth.mockReset();
  });

  it("renders center capacity cards and request actions for center role", () => {
    useAuth.mockReturnValue({ role: "CENTER" });

    render(<CenterCapacityPanel snapshot={snapshot} />);

    expect(screen.getByRole("heading", { name: "Capacity governance" })).toBeInTheDocument();
    expect(screen.getByText("Students")).toBeInTheDocument();
    expect(screen.getByText("Teachers")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request student seats" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request teacher seats" })).toBeInTheDocument();
    expect(screen.getAllByText("Critical").length).toBeGreaterThan(0);
  });

  it("hides the center capacity panel for non-center roles", () => {
    useAuth.mockReturnValue({ role: "BP" });

    const { container } = render(<CenterCapacityPanel snapshot={snapshot} />);

    expect(container).toBeEmptyDOMElement();
  });
});