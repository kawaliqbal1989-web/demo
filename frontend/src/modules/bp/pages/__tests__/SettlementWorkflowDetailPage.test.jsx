import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const detailHookMocks = vi.hoisted(() => ({
  useSettlementWorkflowDetail: vi.fn()
}));

const actionHookMocks = vi.hoisted(() => ({
  useSettlementWorkflowActions: vi.fn()
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn()
}));

vi.mock("../../hooks/useSettlementWorkflowDetail", () => ({ useSettlementWorkflowDetail: detailHookMocks.useSettlementWorkflowDetail }));
vi.mock("../../hooks/useSettlementWorkflowActions", () => ({ useSettlementWorkflowActions: actionHookMocks.useSettlementWorkflowActions }));
vi.mock("react-hot-toast", () => ({ default: toastMocks }));

import { SettlementWorkflowDetailPage } from "../SettlementWorkflowDetailPage";

describe("SettlementWorkflowDetailPage", () => {
  beforeEach(() => {
    const approveSettlement = vi.fn(async (payload) => payload);

    toastMocks.success.mockReset();
    toastMocks.error.mockReset();

    detailHookMocks.useSettlementWorkflowDetail.mockReturnValue({
      error: null,
      escalations: [
        {
          id: "esc-1",
          escalationType: "UNAPPROVED_SETTLEMENT",
          severity: "HIGH",
          state: "ACTIVE",
          escalationReason: "Missing approval evidence",
          triggeredAt: "2026-05-10T09:00:00.000Z",
          resolvedAt: null,
          franchise: { displayName: "Franchise One" },
          center: { displayName: "Center One" },
          metadata: { previousStatus: "REVIEWED" }
        }
      ],
      hasData: true,
      history: [
        {
          id: "hist-1",
          actionType: "ESCALATE",
          fromStatus: "REVIEWED",
          toStatus: "ESCALATED",
          actorRole: "BP",
          expectedVersion: 3,
          resultingVersion: 4,
          createdAt: "2026-05-10T09:00:00.000Z",
          actorUser: { username: "bp-user" },
          notes: "Escalated for missing evidence",
          reason: "Missing approval evidence",
          payoutReference: null,
          metadata: { escalationId: "esc-1" },
          franchise: { displayName: "Franchise One" },
          center: { displayName: "Center One" }
        }
      ],
      loading: false,
      retry: vi.fn(),
      settlement: {
        id: "set-1",
        periodLabel: "2026-05",
        franchise: { displayName: "Franchise One" },
        center: { displayName: "Center One" },
        grossAmount: 5200,
        partnerEarnings: 3100,
        platformEarnings: 2100,
        generatedAt: "2026-05-01T00:00:00.000Z",
        submittedAt: "2026-05-08T10:00:00.000Z",
        reviewedAt: "2026-05-09T10:00:00.000Z",
        approvedAt: null,
        rejectedAt: null,
        lastWorkflowActionAt: "2026-05-10T09:00:00.000Z",
        payoutDueAt: null,
        paidAt: null,
        payoutReference: null,
        rejectionReason: null,
        operationalNotes: "Awaiting supporting evidence",
        workflowVersion: 4,
        status: "ESCALATED",
        currentActionRole: "BP"
      },
      supportingRecords: [
        {
          id: "record-1",
          recordType: "CENTER_REVENUE_SHEET",
          fileName: "revenue.csv",
          fileUrl: "https://files.example/revenue.csv",
          uploadedByRole: "CENTER",
          uploadedByUser: { username: "center-user" },
          createdAt: "2026-05-09T07:00:00.000Z",
          notes: "Uploaded source sheet",
          metadata: { checksum: "abc123" }
        }
      ],
      tasks: [
        {
          id: "task-1",
          taskType: "ESCALATION_RESPONSE",
          state: "OPEN",
          targetRole: "BP",
          targetUser: { username: "bp-user" },
          dueAt: "2026-05-11T10:00:00.000Z",
          franchise: { displayName: "Franchise One" },
          center: { displayName: "Center One" },
          metadata: { workflowVersion: 4 }
        }
      ],
      workflow: {
        status: "ESCALATED",
        workflowVersion: 4,
        currentActionRole: "BP",
        allowedActions: ["APPROVE", "RESOLVE", "REJECT"],
        canUploadSupportingRecord: false
      }
    });

    actionHookMocks.useSettlementWorkflowActions.mockImplementation(() => {
      return {
        approveSettlement,
      busyAction: null,
      canRetry: false,
      conflictError: false,
      error: null,
      escalateSettlement: vi.fn(),
      isBusy: false,
      lastResult: null,
      markSettlementPaid: vi.fn(),
      rejectSettlement: vi.fn(),
      reopenSettlement: vi.fn(),
      resolveEscalation: vi.fn(),
      retry: vi.fn(),
      reviewSettlement: vi.fn(),
      submitSettlement: vi.fn(),
      uploadProgress: 0,
      uploadSupportingRecord: vi.fn()
      };
    });
  });

  it("renders workflow detail sections and runs approve with workflowVersion", async () => {
    render(
      <MemoryRouter initialEntries={["/bp/settlements/set-1"]}>
        <Routes>
          <Route path="/bp/settlements/:id" element={<SettlementWorkflowDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Settlement 2026-05")).toBeInTheDocument();
    expect(screen.getByText("Audit Timeline")).toBeInTheDocument();
    expect(screen.getByText("Escalations")).toBeInTheDocument();
    expect(screen.getByText("Supporting Records")).toBeInTheDocument();
    expect(screen.getByText("revenue.csv")).toBeInTheDocument();
    expect(screen.getByText("Escalation Response")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Approve/i }));

    const firstHookValue = actionHookMocks.useSettlementWorkflowActions.mock.results[0].value;

    await waitFor(() => {
      expect(firstHookValue.approveSettlement).toHaveBeenCalledWith({ expectedVersion: 4 });
    });
  });

  it("shows supporting-record upload as read-only for BP routes", () => {
    render(
      <MemoryRouter initialEntries={["/bp/settlements/set-1"]}>
        <Routes>
          <Route path="/bp/settlements/:id" element={<SettlementWorkflowDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/Supporting-record upload is read-only on BP routes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upload Record/i })).toBeDisabled();
  });
});