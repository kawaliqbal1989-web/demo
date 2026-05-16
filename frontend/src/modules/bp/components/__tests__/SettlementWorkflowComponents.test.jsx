import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actionHookMocks = vi.hoisted(() => ({
  useSettlementWorkflowActions: vi.fn()
}));

vi.mock("../../hooks/useSettlementWorkflowActions", () => ({
  useSettlementWorkflowActions: actionHookMocks.useSettlementWorkflowActions
}));

import { SettlementSupportingRecordsSection } from "../SettlementSupportingRecordsSection";
import { SettlementWorkflowActionPanel } from "../SettlementWorkflowActionPanel";
import { SettlementWorkflowTimeline } from "../SettlementWorkflowTimeline";

describe("settlement workflow components", () => {
  beforeEach(() => {
    actionHookMocks.useSettlementWorkflowActions.mockReset();
    actionHookMocks.useSettlementWorkflowActions.mockReturnValue({
      approveSettlement: vi.fn(),
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
    });
  });

  it("renders immutable timeline entries in chronological order", () => {
    render(
      <SettlementWorkflowTimeline
        history={[
          {
            id: "hist-2",
            actionType: "APPROVE",
            fromStatus: "REVIEWED",
            toStatus: "APPROVED",
            createdAt: "2026-05-10T10:00:00.000Z",
            actorRole: "BP",
            expectedVersion: 2,
            resultingVersion: 3,
            notes: "Approved after finance verification"
          },
          {
            id: "hist-1",
            actionType: "SUBMIT",
            fromStatus: "DRAFT",
            toStatus: "PENDING_REVIEW",
            createdAt: "2026-05-09T08:00:00.000Z",
            actorRole: "CENTER",
            expectedVersion: 0,
            resultingVersion: 1,
            notes: "Initial submission"
          }
        ]}
      />
    );

    const entries = screen.getAllByRole("article");
    expect(within(entries[0]).getByText(/Initial submission/i)).toBeInTheDocument();
    expect(within(entries[1]).getByText(/Approved after finance verification/i)).toBeInTheDocument();
  });

  it("submits reject dialog payload with workflowVersion integrity", () => {
    const rejectSettlement = vi.fn(async () => ({}));
    actionHookMocks.useSettlementWorkflowActions.mockReturnValue({
      ...actionHookMocks.useSettlementWorkflowActions.mock.results.at(-1)?.value,
      rejectSettlement
    });

    render(
      <SettlementWorkflowActionPanel
        settlementId="set-1"
        workflow={{ allowedActions: ["REJECT"], workflowVersion: 4, status: "REVIEWED", currentActionRole: "BP" }}
        escalations={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Reject/i }));
    fireEvent.change(screen.getByLabelText(/^Reason$/i), {
      target: { value: "Incorrect earnings distribution" }
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Reject$/i }));

    expect(rejectSettlement).toHaveBeenCalledWith({
      expectedVersion: 4,
      reason: "Incorrect earnings distribution"
    });
  });

  it("submits escalation resolution with escalation id", () => {
    const resolveEscalation = vi.fn(async () => ({}));
    actionHookMocks.useSettlementWorkflowActions.mockReturnValue({
      ...actionHookMocks.useSettlementWorkflowActions.mock.results.at(-1)?.value,
      resolveEscalation
    });

    render(
      <SettlementWorkflowActionPanel
        settlementId="set-1"
        workflow={{ allowedActions: ["RESOLVE"], workflowVersion: 7, status: "ESCALATED", currentActionRole: "BP" }}
        escalations={[{ id: "esc-1", state: "ACTIVE", escalationType: "UNAPPROVED_SETTLEMENT", severity: "HIGH" }]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Resolve Escalation/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Resolve$/i }));

    expect(resolveEscalation).toHaveBeenCalledWith({
      expectedVersion: 7,
      escalationId: "esc-1"
    });
  });

  it("uploads supporting records with append-only evidence fields", () => {
    const uploadSupportingRecord = vi.fn(async () => ({}));
    actionHookMocks.useSettlementWorkflowActions.mockReturnValue({
      ...actionHookMocks.useSettlementWorkflowActions.mock.results.at(-1)?.value,
      uploadSupportingRecord
    });

    render(
      <SettlementSupportingRecordsSection
        settlementId="set-1"
        canUpload={true}
        supportingRecords={[]}
      />
    );

    fireEvent.change(screen.getByLabelText(/File Name/i), {
      target: { value: "revenue.csv" }
    });
    fireEvent.change(screen.getByLabelText(/File URL/i), {
      target: { value: "https://files.example/revenue.csv" }
    });
    fireEvent.change(screen.getByLabelText(/Mime Type/i), {
      target: { value: "text/csv" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Upload Record/i }));

    expect(uploadSupportingRecord).toHaveBeenCalledWith({
      recordType: "CENTER_REVENUE_SHEET",
      fileName: "revenue.csv",
      fileUrl: "https://files.example/revenue.csv",
      mimeType: "text/csv",
      notes: ""
    });
  });
});