import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TeacherStudentViewPage } from "../TeacherStudentViewPage";

const mocks = vi.hoisted(() => ({
  getStudentMock: vi.fn(),
  getTeacherStudentAttemptsMock: vi.fn(),
  getTeacherStudentMaterialsMock: vi.fn(),
  getTeacherStudentPracticeReportMock: vi.fn()
}));

vi.mock("../../../services/teacherPortalService", () => ({
  getStudent: mocks.getStudentMock,
  getTeacherStudentAttempts: mocks.getTeacherStudentAttemptsMock,
  getTeacherStudentMaterials: mocks.getTeacherStudentMaterialsMock,
  getTeacherStudentPracticeReport: mocks.getTeacherStudentPracticeReportMock
}));

describe("TeacherStudentViewPage assignment entry points", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((fn) => fn.mockReset());

    mocks.getStudentMock.mockResolvedValue({
      data: {
        student: {
          id: "stu_1",
          admissionNo: "ST-001",
          firstName: "Student",
          lastName: "One",
          guardianName: "Parent One",
          guardianPhone: "9000000000",
          level: { id: "lv1", name: "Level One", rank: 1 },
          practiceFeatures: {}
        },
        enrollments: [],
        attendanceSummary: {},
        recentNotes: []
      }
    });
    mocks.getTeacherStudentAttemptsMock.mockResolvedValue({ data: { items: [], total: 0 } });
    mocks.getTeacherStudentMaterialsMock.mockResolvedValue({ data: { worksheets: [] } });
    mocks.getTeacherStudentPracticeReportMock.mockResolvedValue({ data: { totalAttempts: 0, avgScore: null } });
  });

  it("replaces assignment actions with read-only assignment view links", async () => {
    render(
      <MemoryRouter initialEntries={["/teacher/students/stu_1"]}>
        <Routes>
          <Route path="/teacher/students/:studentId" element={<TeacherStudentViewPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Student One" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Assign Worksheets" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View Assignments" }).length).toBeGreaterThan(0);
  });
});
