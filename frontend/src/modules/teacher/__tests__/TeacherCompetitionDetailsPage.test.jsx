import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TeacherCompetitionDetailsPage } from "../TeacherCompetitionDetailsPage";

const competitionServiceMocks = vi.hoisted(() => ({
  getCompetitionDetail: vi.fn(),
  listCompetitions: vi.fn()
}));

const levelServiceMocks = vi.hoisted(() => ({
  listLevels: vi.fn()
}));

vi.mock("../../../services/competitionsService", () => competitionServiceMocks);
vi.mock("../../../services/levelsService", () => levelServiceMocks);
vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/teacher/competitions/cmp-1"]}>
      <Routes>
        <Route path="/teacher/competitions/:competitionId" element={<TeacherCompetitionDetailsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("TeacherCompetitionDetailsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    competitionServiceMocks.getCompetitionDetail.mockResolvedValue({
      data: {
        id: "cmp-1",
        title: "Spring Challenge",
        code: "SP24",
        description: "A preview competition for teachers.",
        registrationStartsAt: "2026-06-01T09:00:00.000Z",
        registrationEndsAt: "2026-06-10T09:00:00.000Z",
        startsAt: "2026-06-15T09:00:00.000Z",
        endsAt: "2026-06-20T09:00:00.000Z",
        attemptLimit: 2,
        status: "ACTIVE"
      }
    });

    levelServiceMocks.listLevels.mockResolvedValue({
      data: {
        items: [
          { id: "lvl-1", name: "Level 1", description: "Starter level", rank: 1 },
          { id: "lvl-2", name: "Level 2", description: "Intermediate level", rank: 2 }
        ]
      }
    });
  });

  it("renders the competition summary and read-only level list", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Spring Challenge" })).toBeInTheDocument();
    expect(screen.getAllByText("SP24").length).toBeGreaterThan(0);
    expect(screen.getByText("Competition Information")).toBeInTheDocument();
    expect(screen.getByText("Competition Levels")).toBeInTheDocument();
    expect(screen.getByText("Level 1")).toBeInTheDocument();
    expect(screen.getByText("Level 2")).toBeInTheDocument();
    expect(screen.getByText("Upcoming Features")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /register/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });
});
