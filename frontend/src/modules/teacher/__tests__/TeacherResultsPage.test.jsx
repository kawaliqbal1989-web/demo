import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeacherResultsPage } from "../TeacherResultsPage";

const mocks = vi.hoisted(() => ({
  listMyStudentsMock: vi.fn(),
  getStudent360Mock: vi.fn(),
  listStudentNotesMock: vi.fn(),
  createStudentNoteMock: vi.fn(),
  updateNoteMock: vi.fn()
}));

vi.mock("../../../services/teacherPortalService", () => ({
  listMyStudents: mocks.listMyStudentsMock,
  getStudent360: mocks.getStudent360Mock,
  listStudentNotes: mocks.listStudentNotesMock,
  createStudentNote: mocks.createStudentNoteMock,
  updateNote: mocks.updateNoteMock
}));

describe("TeacherResultsPage", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((fn) => fn.mockReset());

    mocks.listMyStudentsMock.mockResolvedValue({
      data: [
        {
          studentId: "stu_1",
          admissionNo: "ST-001",
          fullName: "Student One",
          course: { code: "L1" },
          level: { rank: 1 },
          averageScore: 80,
          attendancePercent: 90,
          worksheetCompletionPercent: 85,
          latestAttemptAt: new Date().toISOString()
        }
      ]
    });
    mocks.getStudent360Mock.mockResolvedValue({ data: { student: { batch: { name: "Batch A" }, level: { name: "L1" } }, promotion: { eligible: true, reasons: [] } } });
    mocks.listStudentNotesMock.mockResolvedValue({ data: { items: [] } });
  });

  it("renders the teacher results view without crashing", async () => {
    render(
      <MemoryRouter>
        <TeacherResultsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Promotion Readiness Dashboard")).toBeInTheDocument();
    expect(await screen.findByText("Student One")).toBeInTheDocument();
  });
});
