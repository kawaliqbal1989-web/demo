import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { TeacherWorksheetsPage } from "../TeacherWorksheetsPage";

const mocks = vi.hoisted(() => ({
  listMyBatchesMock: vi.fn(),
  listMyStudentsMock: vi.fn(),
  getTeacherBatchWorksheetsContextMock: vi.fn(),
  assignWorksheetToBatchMock: vi.fn(),
  bulkAssignWorksheetToStudentsMock: vi.fn(),
  listCatalogCoursesMock: vi.fn(),
  listCatalogCourseLevelsMock: vi.fn(),
  listWorksheetsMock: vi.fn(),
  getWorksheetMock: vi.fn()
}));

vi.mock("../../../services/teacherPortalService", () => ({
  listMyBatches: mocks.listMyBatchesMock,
  listMyStudents: mocks.listMyStudentsMock,
  getTeacherBatchWorksheetsContext: mocks.getTeacherBatchWorksheetsContextMock,
  assignWorksheetToBatch: mocks.assignWorksheetToBatchMock,
  bulkAssignWorksheetToStudents: mocks.bulkAssignWorksheetToStudentsMock
}));

vi.mock("../../../services/catalogService", () => ({
  listCatalogCourses: mocks.listCatalogCoursesMock,
  listCatalogCourseLevels: mocks.listCatalogCourseLevelsMock
}));

vi.mock("../../../services/worksheetsService", () => ({
  listWorksheets: mocks.listWorksheetsMock,
  getWorksheet: mocks.getWorksheetMock
}));

describe("TeacherWorksheetsPage preview", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mockFn) => mockFn.mockReset());

    mocks.listMyBatchesMock.mockResolvedValue({
      data: {
        items: [{ batchId: "batch_1", name: "Batch A", status: "ACTIVE", activeStudentCount: 10 }]
      }
    });
    mocks.listMyStudentsMock.mockResolvedValue({ data: { items: [] } });
    mocks.getTeacherBatchWorksheetsContextMock.mockResolvedValue({ data: { worksheets: [] } });

    mocks.listCatalogCoursesMock.mockResolvedValue({
      data: {
        items: [{ id: "course_1", code: "L1", name: "Abacus L1", status: "ACTIVE" }]
      }
    });

    mocks.listCatalogCourseLevelsMock.mockResolvedValue({
      data: {
        items: [
          {
            id: "course_level_1",
            levelNumber: 1,
            title: "Level 1",
            status: "ACTIVE",
            level: { id: "level_1", name: "Level One" }
          }
        ]
      }
    });

    mocks.listWorksheetsMock.mockResolvedValue({
      data: [
        {
          id: "ws_1",
          title: "Worksheet Alpha",
          questionCount: 2,
          isPublished: false
        }
      ]
    });

    mocks.getWorksheetMock.mockResolvedValue({
      data: {
        id: "ws_1",
        title: "Worksheet Alpha",
        isPublished: false,
        difficulty: "MEDIUM",
        timeLimitSeconds: 600,
        description: "Worksheet description",
        level: { id: "level_1", name: "Level One" },
        questions: [
          {
            id: "q1",
            questionNumber: 1,
            questionBank: {
              prompt: "3 + 4",
              difficulty: "EASY"
            }
          }
        ]
      }
    });
  });

  it("renders preview button, opens modal, loads worksheet data, and does not assign", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <TeacherWorksheetsPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Worksheets" })).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Levels" }));
    await user.click(await screen.findByRole("button", { name: "Worksheets" }));

    const previewButton = await screen.findByRole("button", { name: /^👁 Preview$/ });
    expect(await screen.findByRole("button", { name: "Use" })).toBeInTheDocument();

    await user.click(previewButton);

    expect(await screen.findByRole("heading", { name: "Worksheet Preview" })).toBeInTheDocument();
    expect(await screen.findByText("Worksheet title")).toBeInTheDocument();
    expect(await screen.findByText("Course")).toBeInTheDocument();
    expect(await screen.findByText("Question count")).toBeInTheDocument();
    expect(await screen.findByText("Time limit")).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.getWorksheetMock).toHaveBeenCalledWith("ws_1");
    });

    expect(mocks.assignWorksheetToBatchMock).not.toHaveBeenCalled();
    expect(mocks.bulkAssignWorksheetToStudentsMock).not.toHaveBeenCalled();
  });
});
