import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeacherStudentsPage } from "../TeacherStudentsPage";

const mocks = vi.hoisted(() => ({
  listMyStudentsMock: vi.fn()
}));

vi.mock("../../../services/teacherPortalService", () => ({
  listMyStudents: mocks.listMyStudentsMock
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
      ]
    });
  });

  it("does not show Assign Worksheets entry points", async () => {
    render(
      <MemoryRouter>
        <TeacherStudentsPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Assigned Students" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Assign Worksheets" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Materials" })).toBeInTheDocument();
  });
});
