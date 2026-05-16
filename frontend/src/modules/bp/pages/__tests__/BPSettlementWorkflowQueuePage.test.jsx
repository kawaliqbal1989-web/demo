import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hookMocks = vi.hoisted(() => ({
  useSettlementWorkflowQueue: vi.fn(),
  useSettlementWorkflowSummary: vi.fn()
}));

vi.mock("../../hooks/useSettlementWorkflowQueue", () => ({ useSettlementWorkflowQueue: hookMocks.useSettlementWorkflowQueue }));
vi.mock("../../hooks/useSettlementWorkflowSummary", () => ({ useSettlementWorkflowSummary: hookMocks.useSettlementWorkflowSummary }));

import { BPSettlementWorkflowQueuePage } from "../BPSettlementWorkflowQueuePage";

describe("BPSettlementWorkflowQueuePage", () => {
  beforeEach(() => {
    hookMocks.useSettlementWorkflowSummary.mockReturnValue({
      counts: {
        pendingReviewCount: 3,
        approvalQueueCount: 2,
        overdueCount: 1,
        escalationCount: 1,
        payoutPendingCount: 4
      },
      error: null,
      loading: false,
      retry: vi.fn()
    });

    hookMocks.useSettlementWorkflowQueue.mockReturnValue({
      error: null,
      hasData: true,
      hasMore: false,
      items: [
        {
          id: "set-1",
          periodLabel: "2026-05",
          franchise: { displayName: "Franchise One" },
          center: { displayName: "Center One" },
          grossAmount: 5000,
          partnerEarnings: 3200,
          status: "ESCALATED",
          currentActionRole: "BP",
          lastWorkflowActionAt: "2026-05-10T08:00:00.000Z",
          activeEscalation: { escalationType: "UNAPPROVED_SETTLEMENT", severity: "HIGH" },
          activeTask: { taskType: "ESCALATION_RESPONSE", dueAt: "2026-05-11T10:00:00.000Z" },
          allowedActions: ["RESOLVE", "REJECT"]
        }
      ],
      limit: 20,
      loading: false,
      offset: 0,
      retry: vi.fn(),
      sortBy: "updatedAt",
      sortOrder: "desc",
      total: 1
    });
  });

  it("renders the workflow queue summary and settlement rows", () => {
    render(
      <MemoryRouter>
        <BPSettlementWorkflowQueuePage />
      </MemoryRouter>
    );

    expect(screen.getByText("Settlement Workflow Queue")).toBeInTheDocument();
    expect(screen.getAllByText("Pending Review").length).toBeGreaterThan(0);
    expect(screen.getByText("2026-05")).toBeInTheDocument();
    expect(screen.getByText("Franchise One / Center One")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open workflow/i })).toHaveAttribute("href", "/bp/settlements/set-1");
  });

  it("updates queue filters when escalation-only is toggled", () => {
    render(
      <MemoryRouter>
        <BPSettlementWorkflowQueuePage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText(/Escalations only/i));

    const lastCall = hookMocks.useSettlementWorkflowQueue.mock.calls.at(-1);
    expect(lastCall[0]).toEqual(expect.objectContaining({ escalationOnly: true }));
  });

  it("updates queue sorting controls and payout queue preset", () => {
    render(
      <MemoryRouter>
        <BPSettlementWorkflowQueuePage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/Sort By/i), {
      target: { value: "lastWorkflowActionAt" }
    });

    let lastCall = hookMocks.useSettlementWorkflowQueue.mock.calls.at(-1);
    expect(lastCall[0]).toEqual(expect.objectContaining({ sortBy: "lastWorkflowActionAt" }));

    fireEvent.click(screen.getByRole("button", { name: /Payout Queue/i }));

    lastCall = hookMocks.useSettlementWorkflowQueue.mock.calls.at(-1);
    expect(lastCall[0]).toEqual(
      expect.objectContaining({
        pendingActionOnly: false,
        status: ["APPROVED"],
        sortBy: "payoutDueAt",
        sortOrder: "asc"
      })
    );
  });
});