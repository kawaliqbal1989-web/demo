import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeacherStudentsPage } from "../TeacherStudentsPage";

const mocks = vi.hoisted(() => ({
  listMyStudentsMock: vi.fn(),
  listMyBatchesMock: vi.fn(),
  getStudent360Mock: vi.fn(),
  getTeacherStudentPracticeReportMock: vi.fn()
}));

vi.mock("../../../services/teacherPortalService", () => ({
  listMyStudents: mocks.listMyStudentsMock,
  listMyBatches: mocks.listMyBatchesMock,
  getStudent360: mocks.getStudent360Mock,
  getTeacherStudentPracticeReport: mocks.getTeacherStudentPracticeReportMock
}));

describe("TeacherStudentsPage assignment entry points", () => {
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
          hasPractice: true,
          hasAbacusPractice: false,
          status: "ACTIVE",
          assignedWorksheetCount: 2,
          latestAttemptAt: null
        }
      ],
      batchSummary: {
        totalStudents: 1,
        averageScorePercent: 80,
        attendancePercent: 90,
        worksheetCompletionPercent: 85,
        atRiskCount: 0,
        inactiveCount: 0
      }
    });
    mocks.listMyBatchesMock.mockResolvedValue({ data: [] });
    mocks.getStudent360Mock.mockResolvedValue({ data: null });
    mocks.getTeacherStudentPracticeReportMock.mockResolvedValue({ data: null });
  });

  it("does not show Assign Worksheets entry points", async () => {
    render(
      <MemoryRouter>
        <TeacherStudentsPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Assigned Students" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Assign Worksheets" })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Expand/i })).toBeInTheDocument();
  });

  it("renders students from the normalized service payload", async () => {
    render(
      <MemoryRouter>
        <TeacherStudentsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Student One")).toBeInTheDocument();
  });
});
