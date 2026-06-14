import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { TeacherWorksheetsPage } from "../TeacherWorksheetsPage";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

const mocks = vi.hoisted(() => ({
  listCatalogCoursesMock: vi.fn(),
  listCatalogCourseLevelsMock: vi.fn(),
  listWorksheetsMock: vi.fn(),
  getWorksheetMock: vi.fn()
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
    navigateMock.mockReset();

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

  it("renders preview and batch CTA, removes direct assignment sections", async () => {
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
    const openBatchButtons = await screen.findAllByRole("button", { name: "Open Batch Assignment" });

    expect(screen.queryByText("Assign Worksheet to Batch")).not.toBeInTheDocument();
    expect(screen.queryByText("Assign Worksheet to Multiple Students")).not.toBeInTheDocument();

    await user.click(previewButton);

    expect(await screen.findByRole("heading", { name: "Worksheet Preview" })).toBeInTheDocument();
    expect(await screen.findByText("Worksheet title")).toBeInTheDocument();
    expect(await screen.findByText("Course")).toBeInTheDocument();
    expect(await screen.findByText("Question count")).toBeInTheDocument();
    expect(await screen.findByText("Time limit")).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.getWorksheetMock).toHaveBeenCalledWith("ws_1");
    });

    await user.click(openBatchButtons[openBatchButtons.length - 1]);
    expect(navigateMock).toHaveBeenCalledWith("/teacher/batches?worksheetId=ws_1");
  });
});
