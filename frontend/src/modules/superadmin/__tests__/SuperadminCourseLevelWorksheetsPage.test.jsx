import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SuperadminCourseLevelWorksheetsPage } from "../SuperadminCourseLevelWorksheetsPage";

const serviceMocks = vi.hoisted(() => ({
  getCourse: vi.fn(),
  listCourseLevels: vi.fn(),
  listLevels: vi.fn(),
  getWorksheetTemplate: vi.fn(),
  upsertWorksheetTemplate: vi.fn(),
  listQuestionBank: vi.fn(),
  addWorksheetQuestion: vi.fn(),
  addWorksheetQuestionsBulk: vi.fn(),
  createWorksheet: vi.fn(),
  deleteWorksheet: vi.fn(),
  deleteWorksheetQuestion: vi.fn(),
  duplicateWorksheet: vi.fn(),
  getWorksheet: vi.fn(),
  listWorksheets: vi.fn(),
  updateWorksheet: vi.fn(),
  reorderWorksheetQuestions: vi.fn()
}));

vi.mock("../../../services/coursesService", () => ({
  getCourse: serviceMocks.getCourse
}));

vi.mock("../../../services/levelsService", () => ({
  listLevels: serviceMocks.listLevels
}));

vi.mock("../../../services/courseLevelsService", () => ({
  listCourseLevels: serviceMocks.listCourseLevels
}));

vi.mock("../../../services/worksheetTemplatesService", () => ({
  getWorksheetTemplate: serviceMocks.getWorksheetTemplate,
  upsertWorksheetTemplate: serviceMocks.upsertWorksheetTemplate
}));

vi.mock("../../../services/questionBankService", () => ({
  listQuestionBank: serviceMocks.listQuestionBank
}));

vi.mock("../../../services/worksheetsService", () => ({
  addWorksheetQuestion: serviceMocks.addWorksheetQuestion,
  addWorksheetQuestionsBulk: serviceMocks.addWorksheetQuestionsBulk,
  createWorksheet: serviceMocks.createWorksheet,
  deleteWorksheet: serviceMocks.deleteWorksheet,
  deleteWorksheetQuestion: serviceMocks.deleteWorksheetQuestion,
  duplicateWorksheet: serviceMocks.duplicateWorksheet,
  getWorksheet: serviceMocks.getWorksheet,
  listWorksheets: serviceMocks.listWorksheets,
  updateWorksheet: serviceMocks.updateWorksheet,
  reorderWorksheetQuestions: serviceMocks.reorderWorksheetQuestions
}));

describe("SuperadminCourseLevelWorksheetsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    serviceMocks.getCourse.mockResolvedValue({
      data: {
        id: "course-1",
        name: "Abacus Mastery"
      }
    });

    serviceMocks.listLevels.mockResolvedValue({
      data: [
        {
          id: "level-1",
          rank: 1,
          name: "Level 1"
        }
      ]
    });

    serviceMocks.listCourseLevels.mockResolvedValue({
      data: {
        items: [
          {
            id: "course-level-1",
            levelNumber: 1,
            title: "Level 1",
            levelName: "Level 1",
            isActive: true,
            level: {
              id: "level-1",
              rank: 1,
              name: "Level 1"
            }
          }
        ]
      }
    });

    serviceMocks.getWorksheetTemplate.mockResolvedValue({ data: null });
    serviceMocks.listQuestionBank.mockResolvedValue({ data: { items: [] } });
    serviceMocks.listWorksheets.mockResolvedValue({
      data: [
        {
          id: "worksheet-1",
          title: "Worksheet Alpha",
          difficulty: "MEDIUM",
          isPublished: false
        }
      ]
    });
    serviceMocks.getWorksheet.mockResolvedValue({
      data: {
        id: "worksheet-1",
        title: "Worksheet Alpha",
        description: "Uses left/right operands",
        difficulty: "MEDIUM",
        isPublished: false,
        questions: [
          {
            id: "question-1",
            questionNumber: 1,
            operation: "ADD",
            operands: { left: 7, right: 5 },
            correctAnswer: 12
          },
          {
            id: "question-2",
            questionNumber: 2,
            operation: "ADD",
            operands: { terms: [8, -3, 4] },
            correctAnswer: 9
          },
          {
            id: "question-3",
            questionNumber: 3,
            operation: "COLUMN_SUM",
            operands: { nums: [11, 11, -3] },
            correctAnswer: 19
          },
          {
            id: "question-4",
            questionNumber: 4,
            operation: "MIX",
            operands: { expr: "42 ÷ 6 × 2" },
            correctAnswer: 14
          }
        ]
      }
    });
  });

  it("renders complete worksheet prompts in the preview", async () => {
    render(
      <MemoryRouter initialEntries={["/superadmin/courses/course-1/levels/1/worksheets"]}>
        <Routes>
          <Route path="/superadmin/courses/:courseId/levels/:levelNumber/worksheets" element={<SuperadminCourseLevelWorksheetsPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Worksheet Alpha" }));

    expect(await screen.findByText("Preview")).toBeInTheDocument();
    expect(await screen.findAllByText("7 + 5")).toHaveLength(2);
    expect(await screen.findAllByText("8 - 3 + 4")).toHaveLength(2);
    expect(await screen.findAllByText("11 + 11 - 3")).toHaveLength(2);
    expect(await screen.findAllByText("42 ÷ 6 × 2")).toHaveLength(2);
    expect(screen.queryByText("? + ?")).not.toBeInTheDocument();
  });
});