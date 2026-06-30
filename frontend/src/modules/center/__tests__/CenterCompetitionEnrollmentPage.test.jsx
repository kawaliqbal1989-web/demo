import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CenterCompetitionEnrollmentPage } from "../CenterCompetitionEnrollmentPage";

const listCompetitionsMock = vi.fn();
const listStudentsMock = vi.fn();

vi.mock("../../services/competitionsService", () => ({
  listCompetitions: listCompetitionsMock,
  enrollCompetitionStudent: vi.fn()
}));

vi.mock("../../services/studentsService", () => ({
  listStudents: listStudentsMock
}));

describe("CenterCompetitionEnrollmentPage", () => {
  beforeEach(() => {
    listCompetitionsMock.mockReset();
    listStudentsMock.mockReset();
  });

  it("shows a helpful empty state when no competitions are visible", async () => {
    listCompetitionsMock.mockResolvedValue({ data: { items: [] } });
    listStudentsMock.mockResolvedValue({ data: { items: [] } });

    render(<CenterCompetitionEnrollmentPage />);

    expect(await screen.findByText(/No competitions are currently available/i)).toBeInTheDocument();
  });
});
