import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SuperadminExamPendingListsPage } from "../SuperadminExamPendingListsPage";

const examCycleMocks = vi.hoisted(() => ({
  approveEnrollmentListAsSuperadmin: vi.fn(),
  exportEnrollmentListCsv: vi.fn(),
  getEnrollmentListLevelBreakdown: vi.fn(),
  listPendingEnrollmentLists: vi.fn(),
  rejectPendingEnrollmentList: vi.fn()
}));

const worksheetMocks = vi.hoisted(() => ({
  listWorksheets: vi.fn()
}));

vi.mock("../../../services/examCyclesService", () => ({
  approveEnrollmentListAsSuperadmin: examCycleMocks.approveEnrollmentListAsSuperadmin,
  exportEnrollmentListCsv: examCycleMocks.exportEnrollmentListCsv,
  getEnrollmentListLevelBreakdown: examCycleMocks.getEnrollmentListLevelBreakdown,
  listPendingEnrollmentLists: examCycleMocks.listPendingEnrollmentLists,
  rejectPendingEnrollmentList: examCycleMocks.rejectPendingEnrollmentList
}));

vi.mock("../../../services/worksheetsService", () => ({
  listWorksheets: worksheetMocks.listWorksheets
}));

describe("SuperadminExamPendingListsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    examCycleMocks.listPendingEnrollmentLists.mockResolvedValue({
      data: [
        {
          id: "list-1",
          centerNode: {
            name: "Main Center",
            code: "SCH-001"
          },
          entriesCount: 1,
          status: "SUBMITTED_TO_SUPERADMIN",
          forwardedAt: "2026-04-03T10:00:00.000Z"
        }
      ]
    });

    examCycleMocks.getEnrollmentListLevelBreakdown.mockResolvedValue({
      data: [
        {
          levelId: "level-1",
          levelName: "Level 1",
          levelRank: 1,
          studentCount: 1
        }
      ]
    });

    worksheetMocks.listWorksheets.mockResolvedValue({
      data: [
        {
          id: "ws-1",
          title: "Published Worksheet",
          questionCount: 3,
          examCycleId: null
        }
      ]
    });

    examCycleMocks.approveEnrollmentListAsSuperadmin.mockRejectedValue({
      response: {
        data: {
          error_code: "EXAM_WORKSHEET_NOT_PUBLISHED"
        }
      }
    });
  });

  it("surfaces approval errors using friendly exam workflow messages", async () => {
    render(
      <MemoryRouter initialEntries={["/superadmin/exam-cycles/cycle-1/pending"]}>
        <Routes>
          <Route path="/superadmin/exam-cycles/:examCycleId/pending" element={<SuperadminExamPendingListsPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Main Center (SCH-001)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(await screen.findByText(/Select one published exam worksheet per level/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(worksheetMocks.listWorksheets).toHaveBeenCalledWith({
        levelId: "level-1",
        limit: 200,
        offset: 0,
        published: true
      });
    });

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "ws-1" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Confirm Approve" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(examCycleMocks.approveEnrollmentListAsSuperadmin).toHaveBeenCalledWith("cycle-1", "list-1", {
        selections: [
          {
            levelId: "level-1",
            worksheetId: "ws-1"
          }
        ]
      });
    });

    expect(await screen.findByText("Selected exam worksheets must be published before approval.")).toBeInTheDocument();
  });
});