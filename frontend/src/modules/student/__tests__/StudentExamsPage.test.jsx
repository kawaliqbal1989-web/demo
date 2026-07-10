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
    expect(resumeLink.getAttribute("href")).toBe("/student/worksheets/worksheet-1?startSecondAttempt=1");
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

    expect(await screen.findByRole("link", { name: /start 2nd attempt/i })).toBeInTheDocument();
  });

  it("keeps submitted exams on View Submission when no second attempt is granted", async () => {
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

    expect(await screen.findByRole("link", { name: /view submission/i })).toBeInTheDocument();
  });
});
