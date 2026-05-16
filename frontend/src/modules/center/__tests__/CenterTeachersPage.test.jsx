import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CenterTeachersPage } from "../CenterTeachersPage";

const teacherServiceMocks = vi.hoisted(() => ({
  createTeacher: vi.fn(),
  listTeachers: vi.fn(),
  resetTeacherPassword: vi.fn(),
  shiftTeacherStudents: vi.fn(),
  updateTeacher: vi.fn(),
  uploadTeacherPhoto: vi.fn()
}));

const studentServiceMocks = vi.hoisted(() => ({
  listStudents: vi.fn()
}));

const capacityHookMocks = vi.hoisted(() => ({
  useCenterCapacitySnapshot: vi.fn()
}));

vi.mock("../../../components/DataTable", () => ({
  DataTable: () => <div data-testid="teachers-table" />
}));

vi.mock("../../../services/teachersService", () => teacherServiceMocks);
vi.mock("../../../services/studentsService", () => studentServiceMocks);
vi.mock("../../../hooks/useCenterCapacitySnapshot", () => capacityHookMocks);

describe("CenterTeachersPage", () => {
  beforeEach(() => {
    teacherServiceMocks.listTeachers.mockResolvedValue({ data: { items: [] } });
    studentServiceMocks.listStudents.mockResolvedValue({ data: { items: [] } });
    capacityHookMocks.useCenterCapacitySnapshot.mockReturnValue({
      data: {
        center: { name: "North Center" },
        summary: { recommendedAction: "Review teacher seats" },
        usage: {
          students: { configured: true, used: 80, limit: 100, utilizationPercent: 80, remaining: 20 },
          teachers: { configured: true, used: 10, limit: 10, utilizationPercent: 100, remaining: 0 }
        }
      },
      error: null,
      loading: false,
      retry: vi.fn()
    });
  });

  it("disables teacher creation when teacher capacity is locked", async () => {
    render(
      <MemoryRouter>
        <CenterTeachersPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("button", { name: "Create Teacher" }, { timeout: 15000 })).toBeDisabled();
    expect(screen.getByText(/request more seats/i)).toBeInTheDocument();
  }, 15000);
});