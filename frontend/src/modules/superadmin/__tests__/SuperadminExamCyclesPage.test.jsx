import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SuperadminExamCyclesPage } from "../SuperadminExamCyclesPage";

const serviceMocks = vi.hoisted(() => ({
  listExamCycles: vi.fn()
}));

vi.mock("../../../services/examCyclesService", () => ({
  listExamCycles: serviceMocks.listExamCycles
}));

describe("SuperadminExamCyclesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders explicit fallbacks for missing linked data", async () => {
    serviceMocks.listExamCycles.mockResolvedValue({
      data: {
        items: [
          {
            id: "cycle-1",
            code: "EX-001",
            name: "April Final",
            businessPartner: null,
            enrollmentStartAt: null,
            enrollmentEndAt: null,
            examStartsAt: null,
            examEndsAt: null,
            examDurationMinutes: 45,
            resultStatus: "DRAFT"
          }
        ],
        total: 1,
        limit: 20,
        offset: 0
      }
    });

    render(
      <MemoryRouter>
        <SuperadminExamCyclesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("EX-001")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByText("No business partner linked")).toBeInTheDocument();
  });

  it("shows a clear empty state", async () => {
    serviceMocks.listExamCycles.mockResolvedValue({
      data: {
        items: [],
        total: 0,
        limit: 20,
        offset: 0
      }
    });

    render(
      <MemoryRouter>
        <SuperadminExamCyclesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("No exam cycles found.")).toBeInTheDocument();
  });
});