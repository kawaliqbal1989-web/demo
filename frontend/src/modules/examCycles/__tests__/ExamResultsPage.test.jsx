import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ExamResultsPage } from "../ExamResultsPage";

const serviceMocks = vi.hoisted(() => ({
  getExamResults: vi.fn(),
  exportExamResultsCsv: vi.fn()
}));

vi.mock("../../../services/examCyclesService", () => ({
  getExamResults: serviceMocks.getExamResults,
  exportExamResultsCsv: serviceMocks.exportExamResultsCsv
}));

describe("ExamResultsPage", () => {
  it("shows ranked result states and late-enrollment rows without pass/fail labels", async () => {
    serviceMocks.getExamResults.mockResolvedValue({
      data: {
        status: "PUBLISHED",
        resultRules: {
          rankingOrder: ["Higher score", "Higher accuracy", "Shorter completion time"],
          passFailDisplayed: false
        },
        results: [
          {
            studentId: "student-1",
            admissionNo: "ADM-1",
            studentName: "Anaya Rao",
            centerName: "Main Center",
            teacherName: "Teacher One",
            levelName: "Level 1",
            isLateEnrollment: true,
            rank: 1,
            correctCount: 20,
            wrongCount: 0,
            unansweredCount: 0,
            totalQuestions: 20,
            percentage: 100,
            resultOutcome: "SCORED",
            candidateStatus: "SUBMITTED",
            completionTimeSeconds: 90,
            submittedAt: "2026-07-01T10:00:00.000Z"
          }
        ]
      }
    });

    render(
      <MemoryRouter initialEntries={["/bp/exam-cycles/cycle-1/results"]}>
        <Routes>
          <Route path="/bp/exam-cycles/:examCycleId/results" element={<ExamResultsPage title="BP Exam Results" />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Anaya Rao")).toBeInTheDocument();
    expect(screen.getAllByText("#1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Late Enrollment").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SCORED").length).toBeGreaterThan(0);
    expect(screen.getByText(/Ranking rule:/)).toHaveTextContent("Higher score");
    expect(screen.queryByText("Passed")).not.toBeInTheDocument();
    expect(screen.queryByText("Failed")).not.toBeInTheDocument();
  });
});
