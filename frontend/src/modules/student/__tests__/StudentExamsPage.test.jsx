// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StudentExamsPage } from "../StudentExamsPage";
import { listStudentExamsOverview } from "../../../services/studentPortalService";

vi.mock("../../../services/studentPortalService", () => ({
  listStudentExamsOverview: vi.fn()
}));

function buildExamRow(overrides = {}) {
  return {
    entryId: "entry-1",
    examCycleId: "cycle-1",
    examCycle: {
      id: "cycle-1",
      code: "EX-001",
      name: "demo 09/07/2026",
      examStartsAt: "2026-07-09T10:00:00.000Z",
      examEndsAt: "2026-07-09T13:00:00.000Z",
      resultStatus: "NOT_PUBLISHED"
    },
    enrollmentStatus: "INCLUDED",
    included: true,
    locked: false,
    examWorksheet: {
      worksheetId: "worksheet-1",
      title: "Exam Worksheet",
      generationMode: "EXAM",
      durationSeconds: 1800,
      status: "SUBMITTED",
      secondAttemptGranted: false,
      canStartSecondAttempt: false,
      canResumeSecondAttempt: false,
      hasActiveSecondAttempt: false,
      hasStartedSecondAttempt: false,
      latestAttemptNo: 1
    },
    createdAt: "2026-07-09T08:00:00.000Z",
    ...overrides
  };
}

function expectDedicatedExamLink(link, { secondAttempt = false } = {}) {
  const url = new URL(link.getAttribute("href"), "http://localhost");
  expect(url.pathname).toBe("/student/worksheets/worksheet-1");
  expect(url.searchParams.get("examMode")).toBe("1");
  expect(url.searchParams.get("startSecondAttempt")).toBe(secondAttempt ? "1" : null);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
}

describe("StudentExamsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Resume 2nd Attempt when attempt 1 is timed out and attempt 2 is in progress", async () => {
    vi.mocked(listStudentExamsOverview).mockResolvedValue({
      data: {
        data: [
          buildExamRow({
            examWorksheet: {
              worksheetId: "worksheet-1",
              title: "Exam Worksheet",
              generationMode: "EXAM",
              durationSeconds: 1800,
              status: "IN_PROGRESS",
              secondAttemptGranted: true,
              canStartSecondAttempt: false,
              canResumeSecondAttempt: true,
              hasActiveSecondAttempt: true,
              hasStartedSecondAttempt: true,
              latestAttemptNo: 2
            }
          })
        ]
      }
    });

    render(
      <MemoryRouter>
        <StudentExamsPage />
      </MemoryRouter>
    );

    const resumeLink = await screen.findByRole("link", { name: /resume 2nd attempt/i });
    expect(resumeLink).toBeInTheDocument();
    expectDedicatedExamLink(resumeLink, { secondAttempt: true });
    expect(screen.queryByRole("link", { name: /view submission/i })).not.toBeInTheDocument();
  });

  it("shows Start 2nd Attempt when a second-attempt grant is available and attempt 2 has not started", async () => {
    vi.mocked(listStudentExamsOverview).mockResolvedValue({
      data: {
        data: [
          buildExamRow({
            examWorksheet: {
              worksheetId: "worksheet-1",
              title: "Exam Worksheet",
              generationMode: "EXAM",
              durationSeconds: 1800,
              status: "SUBMITTED",
              secondAttemptGranted: true,
              canStartSecondAttempt: true,
              canResumeSecondAttempt: false,
              hasActiveSecondAttempt: false,
              hasStartedSecondAttempt: false,
              latestAttemptNo: 1
            }
          })
        ]
      }
    });

    render(
      <MemoryRouter>
        <StudentExamsPage />
      </MemoryRouter>
    );

    const startLink = await screen.findByRole("link", { name: /start 2nd attempt/i });
    expectDedicatedExamLink(startLink, { secondAttempt: true });
  });

  it.each([
    ["Start Exam", "NOT_STARTED"],
    ["Resume Exam", "IN_PROGRESS"]
  ])("opens %s directly in dedicated exam mode", async (label, status) => {
    vi.mocked(listStudentExamsOverview).mockResolvedValue({
      data: {
        data: [
          buildExamRow({
            examCycle: {
              id: "cycle-1",
              code: "EX-001",
              name: "Open Exam",
              examStartsAt: "2020-01-01T00:00:00.000Z",
              examEndsAt: "2099-01-01T00:00:00.000Z",
              resultStatus: "NOT_PUBLISHED"
            },
            examWorksheet: {
              ...buildExamRow().examWorksheet,
              status
            }
          })
        ]
      }
    });

    render(
      <MemoryRouter>
        <StudentExamsPage />
      </MemoryRouter>
    );

    expectDedicatedExamLink(await screen.findByRole("link", { name: label }));
  });

  it("keeps published result links unchanged", async () => {
    vi.mocked(listStudentExamsOverview).mockResolvedValue({
      data: {
        data: [buildExamRow({ examCycle: { ...buildExamRow().examCycle, resultStatus: "PUBLISHED" } })]
      }
    });

    render(
      <MemoryRouter>
        <StudentExamsPage />
      </MemoryRouter>
    );

    const resultLink = await screen.findByRole("link", { name: /view result/i });
    expect(resultLink).toHaveAttribute("href", "/student/exams/cycle-1/result");
    expect(resultLink).not.toHaveAttribute("target");
  });

  it("keeps non-EXAM worksheet start behavior unchanged", async () => {
    vi.mocked(listStudentExamsOverview).mockResolvedValue({
      data: {
        data: [
          buildExamRow({
            examCycle: {
              ...buildExamRow().examCycle,
              examStartsAt: "2020-01-01T00:00:00.000Z",
              examEndsAt: "2099-01-01T00:00:00.000Z"
            },
            examWorksheet: {
              ...buildExamRow().examWorksheet,
              generationMode: "PRACTICE",
              status: "NOT_STARTED"
            }
          })
        ]
      }
    });

    render(
      <MemoryRouter>
        <StudentExamsPage />
      </MemoryRouter>
    );

    const startLink = await screen.findByRole("link", { name: /start exam/i });
    expect(startLink).toHaveAttribute("href", "/student/worksheets/worksheet-1");
    expect(startLink).not.toHaveAttribute("target");
    expect(startLink).not.toHaveAttribute("rel");
  });

  it("shows disabled Submitted status when no second attempt is granted", async () => {
    vi.mocked(listStudentExamsOverview).mockResolvedValue({
      data: {
        data: [
          buildExamRow({
            examWorksheet: {
              worksheetId: "worksheet-2",
              title: "Exam Worksheet",
              generationMode: "EXAM",
              durationSeconds: 1800,
              status: "SUBMITTED",
              secondAttemptGranted: false,
              canStartSecondAttempt: false,
              canResumeSecondAttempt: false,
              hasActiveSecondAttempt: false,
              hasStartedSecondAttempt: false,
              latestAttemptNo: 1
            }
          })
        ]
      }
    });

    render(
      <MemoryRouter>
        <StudentExamsPage />
      </MemoryRouter>
    );

    const submittedButton = await screen.findByRole("button", { name: /submitted/i });
    expect(submittedButton).toBeInTheDocument();
    expect(submittedButton).toBeDisabled();
    expect(screen.queryByRole("link", { name: /view submission/i })).not.toBeInTheDocument();
  });

  it("shows disabled Timed Out status when second attempt exists and is timed out", async () => {
    vi.mocked(listStudentExamsOverview).mockResolvedValue({
      data: {
        data: [
          buildExamRow({
            examWorksheet: {
              worksheetId: "worksheet-3",
              title: "Exam Worksheet",
              generationMode: "EXAM",
              durationSeconds: 1800,
              status: "TIMED_OUT",
              secondAttemptGranted: true,
              canStartSecondAttempt: false,
              canResumeSecondAttempt: false,
              hasActiveSecondAttempt: false,
              hasStartedSecondAttempt: true,
              latestAttemptNo: 2
            }
          })
        ]
      }
    });

    render(
      <MemoryRouter>
        <StudentExamsPage />
      </MemoryRouter>
    );

    const timedOutButton = await screen.findByRole("button", { name: /timed out/i });
    expect(timedOutButton).toBeInTheDocument();
    expect(timedOutButton).toBeDisabled();
    expect(screen.queryByRole("link", { name: /view 2nd submission/i })).not.toBeInTheDocument();
  });
});
