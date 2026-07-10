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
      hasStartedSecondAttempt: false
    },
    createdAt: "2026-07-09T08:00:00.000Z",
    ...overrides
  };
}

describe("StudentExamsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
              hasStartedSecondAttempt: false
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
              hasStartedSecondAttempt: false
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
