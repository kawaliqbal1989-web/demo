import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  approveSettlementWorkflow: vi.fn(),
  clearSettlementWorkflowClientCache: vi.fn(),
  escalateSettlementWorkflow: vi.fn(),
  getSettlementWorkflowDetail: vi.fn(),
  getSettlementWorkflowQueue: vi.fn(),
  getSettlementWorkflowSummary: vi.fn(),
  markSettlementWorkflowPaid: vi.fn(),
  rejectSettlementWorkflow: vi.fn(),
  reopenSettlementWorkflow: vi.fn(),
  resolveSettlementEscalationWorkflow: vi.fn(),
  reviewSettlementWorkflow: vi.fn(),
  submitSettlementWorkflow: vi.fn(),
  uploadSettlementSupportingRecord: vi.fn()
}));

function stableSerializeWorkflowValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeWorkflowValue(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}:${stableSerializeWorkflowValue(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}

function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

vi.mock("../../services/settlementWorkflowService", () => ({
  approveSettlementWorkflow: apiMocks.approveSettlementWorkflow,
  clearSettlementWorkflowClientCache: apiMocks.clearSettlementWorkflowClientCache,
  escalateSettlementWorkflow: apiMocks.escalateSettlementWorkflow,
  getSettlementWorkflowDetail: apiMocks.getSettlementWorkflowDetail,
  getSettlementWorkflowQueue: apiMocks.getSettlementWorkflowQueue,
  getSettlementWorkflowSummary: apiMocks.getSettlementWorkflowSummary,
  markSettlementWorkflowPaid: apiMocks.markSettlementWorkflowPaid,
  rejectSettlementWorkflow: apiMocks.rejectSettlementWorkflow,
  reopenSettlementWorkflow: apiMocks.reopenSettlementWorkflow,
  resolveSettlementEscalationWorkflow: apiMocks.resolveSettlementEscalationWorkflow,
  reviewSettlementWorkflow: apiMocks.reviewSettlementWorkflow,
  stableSerializeWorkflowValue,
  submitSettlementWorkflow: apiMocks.submitSettlementWorkflow,
  uploadSettlementSupportingRecord: apiMocks.uploadSettlementSupportingRecord
}));

import { useSettlementWorkflowActions } from "../useSettlementWorkflowActions";
import { useSettlementWorkflowDetail } from "../useSettlementWorkflowDetail";
import { useSettlementWorkflowQueue } from "../useSettlementWorkflowQueue";

describe("settlement workflow hooks", () => {
  beforeEach(() => {
    apiMocks.approveSettlementWorkflow.mockReset();
    apiMocks.clearSettlementWorkflowClientCache.mockReset();
    apiMocks.escalateSettlementWorkflow.mockReset();
    apiMocks.getSettlementWorkflowDetail.mockReset();
    apiMocks.getSettlementWorkflowQueue.mockReset();
    apiMocks.getSettlementWorkflowSummary.mockReset();
    apiMocks.markSettlementWorkflowPaid.mockReset();
    apiMocks.rejectSettlementWorkflow.mockReset();
    apiMocks.reopenSettlementWorkflow.mockReset();
    apiMocks.resolveSettlementEscalationWorkflow.mockReset();
    apiMocks.reviewSettlementWorkflow.mockReset();
    apiMocks.submitSettlementWorkflow.mockReset();
    apiMocks.uploadSettlementSupportingRecord.mockReset();
  });

  it("clears stale queue data when filters change", async () => {
    const secondRequest = createDeferred();
    apiMocks.getSettlementWorkflowQueue
      .mockResolvedValueOnce({ items: [{ id: "set-1" }], limit: 20, offset: 0, total: 1, sortBy: "updatedAt", sortOrder: "desc" })
      .mockReturnValueOnce(secondRequest.promise);

    const { result, rerender } = renderHook(
      ({ filters }) => useSettlementWorkflowQueue(filters),
      { initialProps: { filters: { status: ["REVIEWED"] } } }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);

    rerender({ filters: { status: ["ESCALATED"] } });

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    expect(result.current.items).toEqual([]);

    await act(async () => {
      secondRequest.resolve({ items: [{ id: "set-2" }], limit: 20, offset: 0, total: 1, sortBy: "updatedAt", sortOrder: "desc" });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items[0].id).toBe("set-2");
  });

  it("clears stale workflow detail when the settlement id changes", async () => {
    const secondRequest = createDeferred();
    apiMocks.getSettlementWorkflowDetail
      .mockResolvedValueOnce({
        settlement: { id: "set-1" },
        workflow: { workflowVersion: 3, allowedActions: ["APPROVE"] },
        history: [],
        tasks: [],
        escalations: [],
        supportingRecords: []
      })
      .mockReturnValueOnce(secondRequest.promise);

    const { result, rerender } = renderHook(
      ({ settlementId }) => useSettlementWorkflowDetail(settlementId),
      { initialProps: { settlementId: "set-1" } }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.settlement.id).toBe("set-1");

    rerender({ settlementId: "set-2" });

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    expect(result.current.settlement).toBeNull();
    expect(result.current.workflow.allowedActions).toEqual([]);

    await act(async () => {
      secondRequest.resolve({
        settlement: { id: "set-2" },
        workflow: { workflowVersion: 4, allowedActions: ["REJECT"] },
        history: [],
        tasks: [],
        escalations: [],
        supportingRecords: []
      });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.settlement.id).toBe("set-2");
  });

  it("surfaces optimistic concurrency conflicts and allows retry-safe action reruns", async () => {
    const conflictError = {
      response: {
        data: {
          error_code: "WORKFLOW_VERSION_CONFLICT"
        }
      }
    };
    apiMocks.approveSettlementWorkflow
      .mockRejectedValueOnce(conflictError)
      .mockResolvedValueOnce({ workflowVersion: 5, allowedActions: ["REJECT"] });

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useSettlementWorkflowActions("set-1", { onSuccess }));

    await act(async () => {
      await expect(
        result.current.approveSettlement({ workflowVersion: 4, notes: "approve" })
      ).rejects.toBe(conflictError);
    });

    await waitFor(() => {
      expect(result.current.conflictError).toBe(true);
      expect(result.current.canRetry).toBe(true);
    });

    act(() => {
      result.current.retry();
    });

    expect(apiMocks.clearSettlementWorkflowClientCache).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();

    await act(async () => {
      await result.current.approveSettlement({ workflowVersion: 5, notes: "approve again" });
    });

    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ workflowVersion: 5 }),
      "APPROVE"
    );
    expect(result.current.conflictError).toBe(false);
  });
});