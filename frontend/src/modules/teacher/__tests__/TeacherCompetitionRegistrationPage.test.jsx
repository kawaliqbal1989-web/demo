import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TeacherCompetitionRegistrationPage } from "../TeacherCompetitionRegistrationPage";

const competitionServiceMocks = vi.hoisted(() => ({
  getCompetitionDetail: vi.fn(),
  enrollCompetitionStudent: vi.fn()
}));

const levelServiceMocks = vi.hoisted(() => ({
  listLevels: vi.fn()
}));

const teacherPortalServiceMocks = vi.hoisted(() => ({
  listMyStudents: vi.fn()
}));

vi.mock("../../../services/competitionsService", () => competitionServiceMocks);
vi.mock("../../../services/levelsService", () => levelServiceMocks);
vi.mock("../../../services/teacherPortalService", () => teacherPortalServiceMocks);
vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/teacher/competitions/cmp-1/register"]}>
      <Routes>
        <Route path="/teacher/competitions/:competitionId/register" element={<TeacherCompetitionRegistrationPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("TeacherCompetitionRegistrationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    competitionServiceMocks.getCompetitionDetail.mockResolvedValue({
      data: {
        id: "cmp-1",
        title: "Spring Challenge",
        code: "SP24",
        registrationStartsAt: "2026-06-01T09:00:00.000Z",
        registrationEndsAt: "2026-12-31T09:00:00.000Z",
        status: "ACTIVE",
        workflowStage: "APPROVED",
        enrollments: []
      }
    });

    competitionServiceMocks.enrollCompetitionStudent.mockResolvedValue({ data: { id: "en-1" } });

    levelServiceMocks.listLevels.mockResolvedValue({
      data: {
        items: [
          { id: "lvl-1", name: "Level 1", description: "Starter", rank: 1 },
          { id: "lvl-2", name: "Level 2", description: "Intermediate", rank: 2 }
        ]
      }
    });

    teacherPortalServiceMocks.listMyStudents.mockResolvedValue({
      data: [
        { studentId: "stu-1", admissionNo: "A100", fullName: "Ava Stone", level: { id: "lvl-1", name: "Level 1", rank: 1 } },
        { studentId: "stu-2", admissionNo: "A101", fullName: "Ben Cole", level: { id: "lvl-2", name: "Level 2", rank: 2 } }
      ]
    });
  });

  it("renders the registration workspace with draft and sync actions", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Register Students" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save draft/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit \/ sync/i })).toBeInTheDocument();
    expect(screen.getByText("Ava Stone")).toBeInTheDocument();
    expect(screen.getByText("Ben Cole")).toBeInTheDocument();
  });
});
