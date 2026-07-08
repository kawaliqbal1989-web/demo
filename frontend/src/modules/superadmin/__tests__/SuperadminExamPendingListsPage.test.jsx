import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SuperadminExamPendingListsPage } from "../SuperadminExamPendingListsPage";

const examCycleMocks = vi.hoisted(() => ({
  approveEnrollmentListAsSuperadmin: vi.fn(),
  exportEnrollmentListCsv: vi.fn(),
  getExamCycleAssessmentConfig: vi.fn(),
  listPendingEnrollmentLists: vi.fn(),
  rejectPendingEnrollmentList: vi.fn(),
  saveExamCycleAssessmentConfig: vi.fn()
}));

vi.mock("../../../services/examCyclesService", () => ({
  approveEnrollmentListAsSuperadmin: examCycleMocks.approveEnrollmentListAsSuperadmin,
  exportEnrollmentListCsv: examCycleMocks.exportEnrollmentListCsv,
  getExamCycleAssessmentConfig: examCycleMocks.getExamCycleAssessmentConfig,
  listPendingEnrollmentLists: examCycleMocks.listPendingEnrollmentLists,
  rejectPendingEnrollmentList: examCycleMocks.rejectPendingEnrollmentList,
  saveExamCycleAssessmentConfig: examCycleMocks.saveExamCycleAssessmentConfig
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

    examCycleMocks.getExamCycleAssessmentConfig.mockResolvedValue({
      data: {
        levels: [
          {
            levelId: "level-1",
            levelName: "Level 1",
            levelRank: 1,
            studentCount: 1
          }
        ],
        configs: [
          {
            levelId: "level-1",
            assessmentType: "WORKSHEET",
            worksheetId: "ws-1",
            questionBankId: null,
            questionCount: null,
            timeLimitMinutes: null
          }
        ],
        worksheetsByLevelId: {
          "level-1": [
            {
              id: "ws-1",
              title: "Published Worksheet",
              questionCount: 3
            }
          ]
        },
        questionBanksByLevelId: {
          "level-1": []
        },
        isComplete: true
      }
    });

    examCycleMocks.saveExamCycleAssessmentConfig.mockResolvedValue({
      data: {
        saved: true
      }
    });

    examCycleMocks.approveEnrollmentListAsSuperadmin.mockResolvedValue({
      data: {
        id: "list-1",
        status: "APPROVED"
      }
    });
  });

  it("forwards exam course context to assessment config service calls", async () => {
    render(
      <MemoryRouter initialEntries={["/superadmin/exam-cycles/cycle-1/pending?examCourseId=course-1&examLevelNumber=1"]}>
        <Routes>
          <Route path="/superadmin/exam-cycles/:examCycleId/pending" element={<SuperadminExamPendingListsPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Main Center (SCH-001)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(examCycleMocks.getExamCycleAssessmentConfig).toHaveBeenCalledWith("cycle-1", {
        listId: "list-1",
        courseId: "course-1",
        levelNumber: "1"
      });
    });

    fireEvent.click(await screen.findByRole("button", { name: "Save Configuration" }));

    await waitFor(() => {
      expect(examCycleMocks.saveExamCycleAssessmentConfig).toHaveBeenCalledWith(
        "cycle-1",
        {
          listId: "list-1",
          configs: [
            {
              levelId: "level-1",
              assessmentType: "WORKSHEET",
              worksheetId: "ws-1",
              questionBankId: null,
              questionCount: null,
              timeLimitMinutes: null
            }
          ]
        },
        {
          courseId: "course-1",
          levelNumber: "1"
        }
      );
    });
  });
});
