import { beforeEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock("../../../../services/apiClient", () => ({
  apiClient: {
    get: apiGet,
    post: apiPost
  }
}));

describe("settlement workflow api client", () => {
  beforeEach(async () => {
    apiGet.mockReset();
    apiPost.mockReset();
    const module = await import("../settlementWorkflowService");
    module.clearSettlementWorkflowClientCache();
  });

  it("normalizes queue params and empty payloads", async () => {
    apiGet.mockResolvedValue({ data: { data: null } });

    const { getSettlementWorkflowQueue } = await import("../settlementWorkflowService");
    const response = await getSettlementWorkflowQueue({
      limit: "bad",
      offset: -20,
      status: [" reviewed ", ""],
      currentActionRole: " bp ",
      overdueOnly: true,
      escalationOnly: false,
      pendingActionOnly: true,
      q: "  April 2099  ",
      sortBy: "lastWorkflowActionAt",
      sortOrder: "sideways"
    });

    expect(apiGet).toHaveBeenCalledWith(
      "/partner/workflows/settlements",
      expect.objectContaining({
        params: {
          limit: 20,
          offset: 0,
          status: "REVIEWED",
          currentActionRole: "BP",
          overdueOnly: "true",
          escalationOnly: "false",
          pendingActionOnly: "true",
          q: "April 2099",
          sortBy: "lastWorkflowActionAt",
          sortOrder: "desc"
        }
      })
    );
    expect(response.items).toEqual([]);
    expect(response.total).toBe(0);
  });

  it("normalizes workflowVersion payloads for workflow actions", async () => {
    apiPost.mockResolvedValue({ data: { data: { workflowVersion: 4, allowedActions: ["REJECT"] } } });

    const { approveSettlementWorkflow } = await import("../settlementWorkflowService");
    const response = await approveSettlementWorkflow("set-1", {
      workflowVersion: 3,
      notes: "  approve now  ",
      payoutDueAt: "2099-06-15T00:00:00.000Z"
    });

    expect(apiPost).toHaveBeenCalledWith(
      "/partner/workflows/settlements/set-1/actions/approve",
      {
        expectedVersion: 3,
        notes: "approve now",
        payoutDueAt: "2099-06-15T00:00:00.000Z"
      },
      expect.any(Object)
    );
    expect(response.workflowVersion).toBe(4);
    expect(response.allowedActions).toEqual(["REJECT"]);
  });

  it("passes upload progress callbacks to supporting record uploads", async () => {
    apiPost.mockImplementation(async (_path, _payload, config) => {
      config.onUploadProgress?.({ loaded: 25, total: 100 });
      config.onUploadProgress?.({ loaded: 100, total: 100 });

      return {
        data: {
          data: {
            id: "record-1",
            recordType: "CENTER_REVENUE_SHEET",
            fileName: "revenue.csv"
          }
        }
      };
    });

    const { uploadSettlementSupportingRecord } = await import("../settlementWorkflowService");
    const progress = [];
    const response = await uploadSettlementSupportingRecord(
      "set-1",
      {
        recordType: " CENTER_REVENUE_SHEET ",
        fileUrl: " https://files.example.local/revenue.csv ",
        fileName: " revenue.csv "
      },
      {
        onProgress: (value) => {
          progress.push(value);
        }
      }
    );

    expect(progress).toEqual([25, 100]);
    expect(response.fileName).toBe("revenue.csv");
  });
});