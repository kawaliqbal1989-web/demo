import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CenterCompetitionRegistrationPage } from "../CenterCompetitionRegistrationPage";

const competitionsServiceMocks = vi.hoisted(() => ({
  getCompetitionDetail: vi.fn(),
  getCompetitionRegistrations: vi.fn(),
  updateCompetitionRegistrationLevel: vi.fn(),
  removeCompetitionRegistration: vi.fn(),
  createCompetitionTemporaryStudent: vi.fn(),
  lockCompetitionCenterRegistration: vi.fn()
}));

const levelServiceMocks = vi.hoisted(() => ({
  listLevels: vi.fn()
}));

vi.mock("../../../services/competitionsService", () => competitionsServiceMocks);
vi.mock("../../../services/levelsService", () => levelServiceMocks);
vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/center/competitions/cmp-1"]}>
      <Routes>
        <Route path="/center/competitions/:competitionId" element={<CenterCompetitionRegistrationPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("CenterCompetitionRegistrationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    competitionsServiceMocks.getCompetitionDetail.mockResolvedValue({
      data: {
        id: "cmp-1",
        title: "Spring Challenge",
        code: "SP24",
        registrationStartsAt: "2026-06-01T09:00:00.000Z",
        registrationEndsAt: "2026-12-31T09:00:00.000Z",
        startsAt: "2026-12-15T09:00:00.000Z",
        endsAt: "2026-12-20T09:00:00.000Z",
        status: "ACTIVE",
        workflowStage: "APPROVED"
      }
    });

    competitionsServiceMocks.getCompetitionRegistrations.mockResolvedValue({
      data: {
        registrations: [
          {
            id: "reg-1",
            studentId: "stu-1",
            student: {
              id: "stu-1",
              admissionNo: "A100",
              firstName: "Ava",
              lastName: "Stone",
              currentTeacher: { username: "teacher-1", teacherProfile: { fullName: "Ms. Ada" } }
            },
            level: { id: "lvl-1", name: "Level 1", rank: 1 },
            competitionLevel: { id: "lvl-1", name: "Level 1", rank: 1 },
            registrationStatus: "ACTIVE"
          }
        ],
        summary: {
          totalTeachers: 1,
          totalStudents: 1,
          levelSummary: [{ levelId: "lvl-1", levelName: "Level 1", studentCount: 1 }]
        }
      }
    });

    levelServiceMocks.listLevels.mockResolvedValue({
      data: {
        items: [{ id: "lvl-1", name: "Level 1", rank: 1 }, { id: "lvl-2", name: "Level 2", rank: 2 }]
      }
    });
  });

  it("renders the center registration workspace and summary cards", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Center Competition Registration Workspace" })).toBeInTheDocument();
    expect(screen.getAllByText("Spring Challenge").length).toBeGreaterThan(0);
    expect(screen.getByText("Total Teachers")).toBeInTheDocument();
    expect(screen.getByText("Total Registered Students")).toBeInTheDocument();
    expect(screen.getByText("Ava Stone")).toBeInTheDocument();
  });
});
