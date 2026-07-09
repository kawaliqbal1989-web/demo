import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SuperadminExamPendingListsPage } from "../SuperadminExamPendingListsPage";

const examCycleMocks = vi.hoisted(() => ({
  approveEnrollmentListAsSuperadmin: vi.fn(),
  exportEnrollmentListCsv: vi.fn(),
  getEnrollmentListLevelBreakdown: vi.fn(),
  getExamCycleAssessmentConfig: vi.fn(),
  listExamCourses: vi.fn(),
  listPendingEnrollmentLists: vi.fn(),
  rejectPendingEnrollmentList: vi.fn(),
  saveExamCycleAssessmentConfig: vi.fn()
}));

vi.mock("../../../services/examCyclesService", () => ({
  approveEnrollmentListAsSuperadmin: examCycleMocks.approveEnrollmentListAsSuperadmin,
  exportEnrollmentListCsv: examCycleMocks.exportEnrollmentListCsv,
  getEnrollmentListLevelBreakdown: examCycleMocks.getEnrollmentListLevelBreakdown,
  getExamCycleAssessmentConfig: examCycleMocks.getExamCycleAssessmentConfig,
  listExamCourses: examCycleMocks.listExamCourses,
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
            studentCount: 1,
            canConfigureAssessment: true,
            examLevelNumber: 1,
            examCourseLevelId: "course-level-1",
            scopeError: null
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
              title: "EX-GBLS-2026-JULY-L1-W1",
              questionCount: 3,
              isPublished: true,
              status: "PUBLISHED",
              isSelectable: true,
              disabled: false,
              unavailableReason: null
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

    examCycleMocks.listExamCourses.mockResolvedValue({
      data: {
        items: [
          {
            id: "course-1",
            code: "EX-GBLS-2026-JULY",
            name: "EX-GBLS-2026-JULY",
            levels: [{ id: "course-level-1", levelNumber: 1, title: "EXAM Level 1" }]
          }
        ]
      }
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
        courseId: "course-1"
      });
    });

    await waitFor(() => {
      expect(examCycleMocks.getExamCycleAssessmentConfig).toHaveBeenCalledWith("cycle-1", {
        listId: "list-1",
        courseId: "course-1",
        levelNumber: 1
      });
    });

    expect(await screen.findByRole("option", { name: /EX-GBLS-2026-JULY-L1-W1/ })).toBeInTheDocument();

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
          courseId: "course-1"
        }
      );
    });
  });

  it("auto-loads scoped assessment options when no URL context and a single exam course matches", async () => {
    render(
      <MemoryRouter initialEntries={["/superadmin/exam-cycles/cycle-1/pending"]}>
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
        courseId: "course-1"
      });
    });

    expect(await screen.findByRole("option", { name: /EX-GBLS-2026-JULY-L1-W1/ })).toBeInTheDocument();
  });
});
