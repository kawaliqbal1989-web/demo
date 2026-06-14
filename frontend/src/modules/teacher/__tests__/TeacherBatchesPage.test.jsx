import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { TeacherBatchesPage } from "../TeacherBatchesPage";

const mocks = vi.hoisted(() => ({
  listMyBatchesMock: vi.fn(),
  getBatchRosterMock: vi.fn(),
  getTeacherBatchWorksheetsContextMock: vi.fn(),
  assignWorksheetToBatchMock: vi.fn(),
  assignWorksheetToSelectedStudentsInBatchMock: vi.fn(),
  listTeacherBatchMockTestsMock: vi.fn(),
  getTeacherMockTestMock: vi.fn(),
  saveTeacherMockTestResultsMock: vi.fn(),
  getWorksheetMock: vi.fn()
}));

vi.mock("../../../services/teacherPortalService", () => ({
  listMyBatches: mocks.listMyBatchesMock,
  getBatchRoster: mocks.getBatchRosterMock,
  getTeacherBatchWorksheetsContext: mocks.getTeacherBatchWorksheetsContextMock,
  assignWorksheetToBatch: mocks.assignWorksheetToBatchMock,
  assignWorksheetToSelectedStudentsInBatch: mocks.assignWorksheetToSelectedStudentsInBatchMock,
  listTeacherBatchMockTests: mocks.listTeacherBatchMockTestsMock,
  getTeacherMockTest: mocks.getTeacherMockTestMock,
  saveTeacherMockTestResults: mocks.saveTeacherMockTestResultsMock
}));

vi.mock("../../../services/worksheetsService", () => ({
  getWorksheet: mocks.getWorksheetMock
}));

describe("TeacherBatchesPage worksheet workspace", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mockFn) => mockFn.mockReset());

    mocks.listMyBatchesMock.mockResolvedValue({
      data: [{ batchId: "batch_1", name: "Batch A", status: "ACTIVE", activeStudentCount: 2 }]
    });

    mocks.getBatchRosterMock.mockResolvedValue({
      data: [
        { studentId: "stu_1", fullName: "Student One", enrollmentId: "en_1", status: "ACTIVE" },
        { studentId: "stu_2", fullName: "Student Two", enrollmentId: "en_2", status: "ACTIVE" }
      ]
    });

    mocks.getTeacherBatchWorksheetsContextMock.mockResolvedValue({
      data: {
        worksheets: [{ worksheetId: "ws_1", number: 1, title: "Worksheet Alpha", levelLabel: "Level One / 1" }]
      }
    });

    mocks.listTeacherBatchMockTestsMock.mockResolvedValue({ data: { items: [] } });

    mocks.assignWorksheetToBatchMock.mockResolvedValue({ data: { assignedCount: 2 } });
    mocks.assignWorksheetToSelectedStudentsInBatchMock.mockResolvedValue({
      data: {
        results: [
          { studentId: "stu_1", success: true },
          { studentId: "stu_2", success: true }
        ]
      }
    });

    mocks.getWorksheetMock.mockResolvedValue({
      data: {
        id: "ws_1",
        title: "Worksheet Alpha",
        isPublished: true,
        difficulty: "MEDIUM",
        description: "Worksheet description",
        timeLimitSeconds: 600,
        questions: [
          {
            id: "q_1",
            questionNumber: 1,
            questionBank: { prompt: "2 + 3", difficulty: "EASY" }
          }
        ]
      }
    });
  });

  it("supports preview, batch assignment, student assignment, and denied assignment error", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/teacher/batches?worksheetId=ws_1"]}>
        <TeacherBatchesPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "My Batches" })).toBeInTheDocument();

    const previewButtons = await screen.findAllByRole("button", { name: "👁 Preview Selected Worksheet" });
    expect(previewButtons.length).toBeGreaterThan(1);

    await user.click(previewButtons[0]);
    expect(await screen.findByRole("heading", { name: "Worksheet Preview" })).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.getWorksheetMock).toHaveBeenCalledWith("ws_1");
    });

    await user.clear(screen.getAllByLabelText("Due Date")[0]);
    await user.type(screen.getAllByLabelText("Due Date")[0], "2026-06-25");
    await user.click(screen.getByRole("button", { name: "Assign Worksheet" }));

    await waitFor(() => {
      expect(mocks.assignWorksheetToBatchMock).toHaveBeenCalledWith("batch_1", {
        worksheetId: "ws_1",
        dueDate: "2026-06-25"
      });
    });

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);

    await user.clear(screen.getAllByLabelText("Due Date")[1]);
    await user.type(screen.getAllByLabelText("Due Date")[1], "2026-06-26");
    await user.click(screen.getByRole("button", { name: "Assign to 2 Students" }));

    await waitFor(() => {
      expect(mocks.assignWorksheetToSelectedStudentsInBatchMock).toHaveBeenCalledWith("batch_1", {
        worksheetId: "ws_1",
        studentIds: ["stu_1", "stu_2"],
        dueDate: "2026-06-26"
      });
    });

    mocks.assignWorksheetToBatchMock.mockRejectedValueOnce({
      response: { data: { error_code: "TEACHER_BATCH_FORBIDDEN", message: "Teacher not assigned to batch" } }
    });

    await user.click(screen.getByRole("button", { name: "Assign Worksheet" }));
    expect(await screen.findByText("You are not assigned to this batch.")).toBeInTheDocument();
  });
});
