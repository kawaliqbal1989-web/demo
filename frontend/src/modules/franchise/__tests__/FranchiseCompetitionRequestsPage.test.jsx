import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FranchiseCompetitionRequestsPage } from "../FranchiseCompetitionRequestsPage";

const {
  getMyFranchiseMock,
  listFranchiseCompetitionRequestsMock,
  forwardFranchiseCompetitionRequestMock,
  rejectFranchiseCompetitionRequestMock
} = vi.hoisted(() => ({
  getMyFranchiseMock: vi.fn(),
  listFranchiseCompetitionRequestsMock: vi.fn(),
  forwardFranchiseCompetitionRequestMock: vi.fn(),
  rejectFranchiseCompetitionRequestMock: vi.fn()
}));

vi.mock("../../../services/franchiseService", () => ({
  getMyFranchise: getMyFranchiseMock,
  listFranchiseCompetitionRequests: listFranchiseCompetitionRequestsMock,
  forwardFranchiseCompetitionRequest: forwardFranchiseCompetitionRequestMock,
  rejectFranchiseCompetitionRequest: rejectFranchiseCompetitionRequestMock
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn()
  }
}));

describe("FranchiseCompetitionRequestsPage", () => {
  beforeEach(() => {
    getMyFranchiseMock.mockReset();
    listFranchiseCompetitionRequestsMock.mockReset();
    forwardFranchiseCompetitionRequestMock.mockReset();
    rejectFranchiseCompetitionRequestMock.mockReset();
    getMyFranchiseMock.mockResolvedValue({ data: { profile: { name: "North Franchise 1", code: "FR001" } } });
  });

  it.each([
    [
      "wrapped array",
      { data: [{ id: "req-1", title: "Abacus Challenge", level: { name: "Level 1" }, hierarchyNode: { name: "North Center" }, workflowStage: "FRANCHISE_REVIEW" }] },
      "Abacus Challenge",
      "North Center"
    ],
    [
      "items payload",
      { data: { items: [{ id: "req-2", title: "Mental Math Cup", level: { name: "Level 2" }, hierarchyNode: { name: "East Center" }, workflowStage: "FRANCHISE_REVIEW" }], total: 1 } },
      "Mental Math Cup",
      "East Center"
    ]
  ])("renders requests when API returns a %s", async (_label, payload, title, center) => {
    listFranchiseCompetitionRequestsMock.mockResolvedValueOnce(payload);

    render(
      <MemoryRouter>
        <FranchiseCompetitionRequestsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/competition requests/i)).toBeInTheDocument();
    expect(await screen.findByText(/north franchise 1/i)).toBeInTheDocument();
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(await screen.findByText(center)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Return/i })).toBeInTheDocument();
  });
});
