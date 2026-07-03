import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StudentExamsPage } from "../StudentExamsPage";

const serviceMocks = vi.hoisted(() => ({
  listStudentExamsOverview: vi.fn()
}));

vi.mock("../../../services/studentPortalService", () => ({
  listStudentExamsOverview: serviceMocks.listStudentExamsOverview
}));

function buildRow(overrides = {}) {
  return {
    entryId: overrides.entryId || "entry-1",
    examCycleId: overrides.examCycleId || "cycle-1",
    enrollmentStatus: overrides.enrollmentStatus || "APPROVED",
    examCycle: {
      id: overrides.examCycleId || "cycle-1",
      name: overrides.name || "Live Exam",
      code: overrides.code || "LIVE-1",
      examStartsAt: overrides.examStartsAt || "2000-01-01T00:00:00.000Z",
      examEndsAt: overrides.examEndsAt || "2999-01-01T00:00:00.000Z",
      resultStatus: overrides.resultStatus || "DRAFT"
    },
    examWorksheet: overrides.examWorksheet === undefined
      ? {
          worksheetId: overrides.worksheetId || "ws-1",
          title: overrides.worksheetTitle || "Live Worksheet",
          status: overrides.worksheetStatus || "NOT_STARTED"
        }
      : overrides.examWorksheet
  };
}

describe("StudentExamsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.listStudentExamsOverview.mockResolvedValue({
      data: {
        data: [
          buildRow(),
          buildRow({
            entryId: "entry-2",
            examCycleId: "cycle-2",
            name: "Upcoming Exam",
            code: "UP-1",
            examStartsAt: "2999-07-10T09:00:00.000Z",
            examEndsAt: "2999-07-11T09:00:00.000Z",
            worksheetId: "ws-2",
            worksheetStatus: "IN_PROGRESS"
          }),
          buildRow({
            entryId: "entry-3",
            examCycleId: "cycle-3",
            name: "Completed Exam",
            code: "DONE-1",
            examStartsAt: "2000-06-01T09:00:00.000Z",
            examEndsAt: "2000-06-02T09:00:00.000Z",
            worksheetId: "ws-3",
            worksheetStatus: "SUBMITTED"
          }),
          buildRow({
            entryId: "entry-4",
            examCycleId: "cycle-4",
            name: "Published Result Exam",
            code: "RES-1",
            examStartsAt: "2000-06-01T09:00:00.000Z",
            examEndsAt: "2000-06-02T09:00:00.000Z",
            resultStatus: "PUBLISHED",
            worksheetId: "ws-4",
            worksheetStatus: "TIMED_OUT"
          })
        ]
      }
    });
  });

  it("groups exams by lifecycle and preserves attempt/result actions", async () => {
    render(
      <MemoryRouter>
        <StudentExamsPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "My Exams" })).toBeInTheDocument();
    expect(screen.getByText("Live Exam")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start" })).toHaveAttribute("href", "/student/worksheets/ws-1");
    expect(screen.getByRole("button", { name: "Submitted" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Time Up" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "View Result" })).toHaveAttribute("href", "/student/exams/cycle-4/result");
    expect(screen.getAllByText("Awaiting publication").length).toBeGreaterThan(0);

    const viewFilter = screen.getByLabelText("View");

    fireEvent.change(viewFilter, { target: { value: "RESULTS" } });
    expect(screen.getByText("Published Result Exam")).toBeInTheDocument();
    expect(screen.queryByText("Live Exam")).not.toBeInTheDocument();

    fireEvent.change(viewFilter, { target: { value: "IN_PROGRESS" } });
    expect(screen.getByText("Upcoming Exam")).toBeInTheDocument();
    expect(screen.queryByText("Published Result Exam")).not.toBeInTheDocument();
  });

  it("filters by exam or worksheet search text", async () => {
    render(
      <MemoryRouter>
        <StudentExamsPage />
      </MemoryRouter>
    );

    await screen.findByText("Live Exam");

    fireEvent.change(screen.getByPlaceholderText("Exam name, code, worksheet"), {
      target: { value: "RES-1" }
    });

    expect(screen.getByText("Published Result Exam")).toBeInTheDocument();
    expect(screen.queryByText("Upcoming Exam")).not.toBeInTheDocument();
  });
});
