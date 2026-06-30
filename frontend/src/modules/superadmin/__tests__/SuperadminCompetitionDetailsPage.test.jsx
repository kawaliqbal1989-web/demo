import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SuperadminCompetitionDetailsPage } from "../SuperadminCompetitionDetailsPage";

const serviceMocks = vi.hoisted(() => ({
  getCompetitionDetail: vi.fn(),
  listCompetitionBusinessPartners: vi.fn(),
  assignCompetitionBusinessPartners: vi.fn(),
  removeCompetitionBusinessPartner: vi.fn(),
  listBusinessPartners: vi.fn(),
  listLevels: vi.fn(),
  createLevel: vi.fn(),
  updateLevel: vi.fn(),
  listCompetitionQuestionBank: vi.fn(),
  createCompetitionQuestionBankEntry: vi.fn(),
  updateCompetitionQuestionBankEntry: vi.fn(),
  deleteCompetitionQuestionBankEntry: vi.fn(),
  exportCompetitionQuestionBankCsv: vi.fn(),
  importCompetitionQuestionBank: vi.fn()
}));

vi.mock("../../../services/competitionsService", () => ({
  getCompetitionDetail: serviceMocks.getCompetitionDetail,
  listCompetitionBusinessPartners: serviceMocks.listCompetitionBusinessPartners,
  assignCompetitionBusinessPartners: serviceMocks.assignCompetitionBusinessPartners,
  removeCompetitionBusinessPartner: serviceMocks.removeCompetitionBusinessPartner
}));

vi.mock("../../../services/businessPartnersService", () => ({
  listBusinessPartners: serviceMocks.listBusinessPartners
}));

vi.mock("../../../services/levelsService", () => ({
  listLevels: serviceMocks.listLevels,
  createLevel: serviceMocks.createLevel,
  updateLevel: serviceMocks.updateLevel
}));

vi.mock("../../../services/competitionQuestionBankService", () => ({
  listCompetitionQuestionBank: serviceMocks.listCompetitionQuestionBank,
  createCompetitionQuestionBankEntry: serviceMocks.createCompetitionQuestionBankEntry,
  updateCompetitionQuestionBankEntry: serviceMocks.updateCompetitionQuestionBankEntry,
  deleteCompetitionQuestionBankEntry: serviceMocks.deleteCompetitionQuestionBankEntry,
  exportCompetitionQuestionBankCsv: serviceMocks.exportCompetitionQuestionBankCsv,
  importCompetitionQuestionBank: serviceMocks.importCompetitionQuestionBank
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock("../CompetitionModuleNav", () => ({
  CompetitionModuleNav: () => <div>Competition Module Nav</div>
}));

vi.mock("../../../components/CompetitionWorkflowTimeline", () => ({
  CompetitionWorkflowTimeline: () => <div>Workflow Timeline</div>
}));

describe("SuperadminCompetitionDetailsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    serviceMocks.getCompetitionDetail.mockResolvedValue({
      data: {
        id: "comp-1",
        title: "Sample Competition",
        code: "SC-1",
        registrationStartsAt: "2025-01-01T00:00:00.000Z",
        registrationEndsAt: "2025-01-10T00:00:00.000Z",
        startsAt: "2025-01-20T00:00:00.000Z",
        endsAt: "2025-01-25T00:00:00.000Z",
        competitionCourse: {
          id: "competition-course-1",
          code: "CC-1",
          name: "Competition Course 1",
          isActive: true,
          levels: [
            {
              id: "competition-course-level-1",
              levelNumber: 1,
              title: "Level 1 Sprint",
              sortOrder: 1,
              isActive: true
            }
          ]
        }
      }
    });

    serviceMocks.listCompetitionBusinessPartners.mockResolvedValue({ data: [] });
    serviceMocks.listBusinessPartners.mockResolvedValue({ data: { items: [] } });
    serviceMocks.listLevels.mockResolvedValue({ data: { items: [{ id: "level-1", name: "Level 1", rank: 1 }] } });
    serviceMocks.listCompetitionQuestionBank.mockResolvedValue({ data: { items: [] } });
  });

  it("shows assigned competition course levels without opening the course question bank", async () => {
    render(
      <MemoryRouter initialEntries={["/superadmin/competition/comp-1"]}>
        <Routes>
          <Route path="/superadmin/competition/:competitionId/question-bank" element={<SuperadminCompetitionDetailsPage />} />
          <Route path="/superadmin/competition/:competitionId" element={<SuperadminCompetitionDetailsPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("button", { name: "Competition Course Levels" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Question Bank" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Competition Course Levels" }));

    expect(await screen.findByText("Assigned Competition Course")).toBeInTheDocument();
    expect(screen.getByText("Competition Course 1")).toBeInTheDocument();
    expect(screen.getByText("Level 1 Sprint")).toBeInTheDocument();
    expect(serviceMocks.listLevels).not.toHaveBeenCalled();
  });
});
