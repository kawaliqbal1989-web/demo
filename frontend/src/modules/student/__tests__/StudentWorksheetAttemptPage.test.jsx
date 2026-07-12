// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StudentWorksheetAttemptPage } from "../StudentWorksheetAttemptPage";

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}

function buildAttemptResponse({
  attemptOverrides = {},
  worksheetOverrides = {},
  answersByQuestionId = {},
  result = null
} = {}) {
  return {
    data: {
      data: {
        attemptId: "a1",
        worksheetId: "w1",
        status: "IN_PROGRESS",
        startedAt: "2026-02-21T00:00:00.000Z",
        endsAt: "2026-02-21T00:10:00.000Z",
        serverNow: "2026-02-21T00:00:00.000Z",
        version: 0,
        savedAt: null,
        attemptTimerMode: "ELAPSED",
        worksheetKind: "WORKSHEET",
        answersByQuestionId,
        result,
        worksheet: {
          id: "w1",
          title: "Addition",
          timeLimitSeconds: 600,
          attemptTimerMode: "ELAPSED",
          worksheetKind: "WORKSHEET",
          questions: [
            { questionId: "q1", questionNumber: 1, operands: { nums: [11, 11, 11, 11] }, operation: "COLUMN_SUM", correctAnswer: 44 },
            { questionId: "q2", questionNumber: 2, operands: { nums: [22, 22, -11, -11] }, operation: "COLUMN_SUM", correctAnswer: 22 }
          ],
          ...worksheetOverrides
        },
        ...attemptOverrides
      }
    }
  };
}

const mocks = vi.hoisted(() => ({
  getStudentWorksheet: vi.fn(),
  getStudentMe: vi.fn(),
  getStudentMyCourse: vi.fn(),
  listStudentWorksheetAttempts: vi.fn(),
  saveStudentAttemptAnswers: vi.fn(),
  submitStudentAttempt: vi.fn()
}));

vi.mock("../../../services/studentPortalService", () => ({
  getStudentWorksheet: mocks.getStudentWorksheet,
  getStudentMe: mocks.getStudentMe,
  getStudentMyCourse: mocks.getStudentMyCourse,
  listStudentWorksheetAttempts: mocks.listStudentWorksheetAttempts,
  startOrResumeStudentWorksheetAttempt: vi.fn(async () => buildAttemptResponse()),
  saveStudentAttemptAnswers: mocks.saveStudentAttemptAnswers,
  submitStudentAttempt: mocks.submitStudentAttempt
}));

describe("StudentWorksheetAttemptPage", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-21T00:00:00.000Z"));
    localStorage.clear();

    const { startOrResumeStudentWorksheetAttempt } = await import("../../../services/studentPortalService");
    startOrResumeStudentWorksheetAttempt.mockResolvedValue(buildAttemptResponse());

    mocks.saveStudentAttemptAnswers.mockResolvedValue({
      data: {
        data: {
          status: "IN_PROGRESS",
          version: 1,
          savedAt: "2026-02-21T00:00:02.000Z",
          serverNow: "2026-02-21T00:00:02.000Z",
          endsAt: "2026-02-21T00:10:00.000Z"
        }
      }
    });
    mocks.getStudentWorksheet.mockResolvedValue({
      data: {
        data: {
          id: "w1",
          title: "Addition",
          description: "Practice worksheet",
          timeLimitSeconds: 600,
          questions: [
            { id: "q1", questionNumber: 1, operands: { nums: [11, 11, 11, 11] }, operation: "COLUMN_SUM" },
            { id: "q2", questionNumber: 2, operands: { nums: [22, 22, -11, -11] }, operation: "COLUMN_SUM" }
          ]
        }
      }
    });
    mocks.getStudentMe.mockResolvedValue({ data: { data: { id: "s1" } } });
    mocks.getStudentMyCourse.mockResolvedValue({ data: { data: { id: "c1" } } });
    mocks.listStudentWorksheetAttempts.mockResolvedValue({ data: { data: [] } });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("allows a second-attempt intent to open the worksheet start flow", async () => {
    const { startOrResumeStudentWorksheetAttempt } = await import("../../../services/studentPortalService");
    startOrResumeStudentWorksheetAttempt.mockResolvedValueOnce(buildAttemptResponse());

    render(
      <MemoryRouter initialEntries={["/student/worksheets/w1?startSecondAttempt=1"]}>
        <Routes>
          <Route path="/student/worksheets/:worksheetId" element={<StudentWorksheetAttemptPage />} />
        </Routes>
      </MemoryRouter>
    );

    await flushAsync();

    fireEvent.click(screen.getByText("I Understand, Start Worksheet"));
    await flushAsync();

    expect(startOrResumeStudentWorksheetAttempt).toHaveBeenCalledWith("w1");
    expect(screen.getByText("Addition")).toBeInTheDocument();
  });

  it("does not block when attempt 1 is timed out and attempt 2 is in progress", async () => {
    const { startOrResumeStudentWorksheetAttempt } = await import("../../../services/studentPortalService");

    mocks.listStudentWorksheetAttempts.mockResolvedValueOnce({
      data: {
        data: [
          {
            attemptId: "a1",
            attemptNo: 1,
            status: "TIMED_OUT",
            submittedAt: "2026-02-20T23:00:00.000Z"
          },
          {
            attemptId: "a2",
            attemptNo: 2,
            status: "IN_PROGRESS",
            submittedAt: "2026-02-21T00:00:00.000Z"
          }
        ]
      }
    });
    startOrResumeStudentWorksheetAttempt.mockResolvedValueOnce(buildAttemptResponse({
      attemptOverrides: {
        attemptId: "a2",
        attemptNo: 2,
        status: "IN_PROGRESS"
      }
    }));

    render(
      <MemoryRouter initialEntries={["/student/worksheets/w1?startSecondAttempt=1"]}>
        <Routes>
          <Route path="/student/worksheets/:worksheetId" element={<StudentWorksheetAttemptPage />} />
        </Routes>
      </MemoryRouter>
    );

    await flushAsync();

    expect(screen.queryByText(/already submitted\. starting a new attempt is not available\./i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("I Understand, Start Worksheet"));
    await flushAsync();

    expect(startOrResumeStudentWorksheetAttempt).toHaveBeenCalledWith("w1");
    expect(screen.getByText("Addition")).toBeInTheDocument();
  });

  it("opens timed-out second attempt in read-only submission mode", async () => {
    const { startOrResumeStudentWorksheetAttempt } = await import("../../../services/studentPortalService");

    mocks.listStudentWorksheetAttempts.mockResolvedValueOnce({
      data: {
        data: [
          {
            attemptId: "a1",
            attemptNo: 1,
            status: "SUBMITTED",
            submittedAt: "2026-02-20T22:00:00.000Z"
          },
          {
            attemptId: "a2",
            attemptNo: 2,
            status: "TIMED_OUT",
            submittedAt: "2026-02-21T00:00:00.000Z"
          }
        ]
      }
    });

    startOrResumeStudentWorksheetAttempt.mockResolvedValue(
      buildAttemptResponse({
        attemptOverrides: {
          attemptId: "a2",
          attemptNo: 2,
          status: "TIMED_OUT",
          attemptTimerMode: "COUNTDOWN"
        },
        answersByQuestionId: {
          q1: { value: "44" }
        },
        worksheetOverrides: {
          attemptTimerMode: "COUNTDOWN"
        },
        result: null
      })
    );

    render(
      <MemoryRouter initialEntries={["/student/worksheets/w1?viewSubmission=1"]}>
        <Routes>
          <Route path="/student/worksheets/:worksheetId" element={<StudentWorksheetAttemptPage />} />
        </Routes>
      </MemoryRouter>
    );

    await flushAsync();
    await flushAsync();

    expect(screen.queryByText(/already submitted\. starting a new attempt is not available\./i)).not.toBeInTheDocument();
    expect(screen.queryByText("I Understand, Start Worksheet")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Time Up" })).toBeInTheDocument();
    expect(screen.getByText(/Attempt ended due to time limit\./i)).toBeInTheDocument();
    expect(startOrResumeStudentWorksheetAttempt).not.toHaveBeenCalled();
  });

  it("shows countdown timer when worksheet has a hard time limit", async () => {
    render(
      <MemoryRouter initialEntries={["/student/worksheets/w1"]}>
        <Routes>
          <Route path="/student/worksheets/:worksheetId" element={<StudentWorksheetAttemptPage />} />
        </Routes>
      </MemoryRouter>
    );

    await flushAsync();

    fireEvent.click(screen.getByText("I Understand, Start Worksheet"));
    await flushAsync();

    expect(screen.getByText("Addition")).toBeInTheDocument();
    expect(screen.getByText(/Count Down:/)).toBeInTheDocument();
    expect(screen.queryByText(/Timer:/)).not.toBeInTheDocument();
    expect(screen.getAllByText("10:00").length).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText("9:55")).toBeInTheDocument();
  });

  it("shows countdown for practice worksheets", async () => {
    const { startOrResumeStudentWorksheetAttempt } = await import("../../../services/studentPortalService");

    startOrResumeStudentWorksheetAttempt.mockResolvedValueOnce(
      buildAttemptResponse({
        attemptOverrides: {
          attemptTimerMode: "COUNTDOWN",
          worksheetKind: "PRACTICE"
        },
        worksheetOverrides: {
          attemptTimerMode: "COUNTDOWN",
          worksheetKind: "PRACTICE"
        }
      })
    );

    render(
      <MemoryRouter initialEntries={["/student/worksheets/w1"]}>
        <Routes>
          <Route path="/student/worksheets/:worksheetId" element={<StudentWorksheetAttemptPage />} />
        </Routes>
      </MemoryRouter>
    );

    await flushAsync();

    fireEvent.click(screen.getByText("I Understand, Start Worksheet"));
    await flushAsync();

    expect(screen.getByText(/Count Down:/)).toBeInTheDocument();
    expect(screen.queryByText(/Timer:/)).not.toBeInTheDocument();
    expect(screen.getAllByText("10:00").length).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText("9:55")).toBeInTheDocument();
  });

  it("does not mark wrong answers red before submission", async () => {
    render(
      <MemoryRouter initialEntries={["/student/worksheets/w1"]}>
        <Routes>
          <Route path="/student/worksheets/:worksheetId" element={<StudentWorksheetAttemptPage />} />
        </Routes>
      </MemoryRouter>
    );

    await flushAsync();

    fireEvent.click(screen.getByText("I Understand, Start Worksheet"));
    await flushAsync();

    const input = screen.getByLabelText("Answer for question 1");
    fireEvent.change(input, { target: { value: "3" } });

    expect(input.style.borderColor).toBe("");
  });

  it("submits answers and shows score", async () => {
    mocks.submitStudentAttempt.mockResolvedValueOnce({
      data: {
        data: {
          status: "SUBMITTED",
          score: 100,
          total: 2,
          submittedAt: "2026-02-21T00:00:10.000Z",
          resultBreakdown: { correctCount: 2, completionTime: 10 }
        }
      }
    });

    render(
      <MemoryRouter initialEntries={["/student/worksheets/w1"]}>
        <Routes>
          <Route path="/student/worksheets/:worksheetId" element={<StudentWorksheetAttemptPage />} />
        </Routes>
      </MemoryRouter>
    );

    await flushAsync();

    fireEvent.click(screen.getByText("I Understand, Start Worksheet"));
    await flushAsync();

    fireEvent.change(screen.getByLabelText("Answer for question 1"), { target: { value: "44" } });
    fireEvent.change(screen.getByLabelText("Answer for question 2"), { target: { value: "22" } });

    fireEvent.click(screen.getAllByText("Submit")[0]);
    expect(screen.getByText("Submit worksheet?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Confirm submit"));

    await flushAsync();

    expect(mocks.submitStudentAttempt).toHaveBeenCalledWith("a1", {
      answersByQuestionId: {
        q1: { value: "44" },
        q2: { value: "22" }
      }
    });
    expect(screen.getByText(/Score:/)).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getAllByText(/Taken Time:/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Total Time:/)).toBeInTheDocument();
    expect(screen.getAllByText("0:10").length).toBeGreaterThan(0);
    expect(screen.getByText("Correct Answers")).toBeInTheDocument();
    expect(screen.getAllByText(/Correct Answer:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Right").length).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText("0:15")).not.toBeInTheDocument();
    expect(screen.getAllByText("0:10").length).toBeGreaterThan(0);
  });

  it("submits current local answers even when autosave debounce has not completed", async () => {
    mocks.submitStudentAttempt.mockResolvedValueOnce({
      data: {
        data: {
          status: "SUBMITTED",
          score: 100,
          total: 2,
          submittedAt: "2026-02-21T00:00:10.000Z",
          resultBreakdown: { correctCount: 2, completionTime: 10 }
        }
      }
    });

    render(
      <MemoryRouter initialEntries={["/student/worksheets/w1"]}>
        <Routes>
          <Route path="/student/worksheets/:worksheetId" element={<StudentWorksheetAttemptPage />} />
        </Routes>
      </MemoryRouter>
    );

    await flushAsync();

    fireEvent.click(screen.getByText("I Understand, Start Worksheet"));
    await flushAsync();

    fireEvent.change(screen.getByLabelText("Answer for question 1"), { target: { value: "44" } });

    // Do not advance timers, so the debounce autosave has not fired yet.
    fireEvent.click(screen.getAllByText("Submit")[0]);
    fireEvent.click(screen.getByText("Confirm submit"));
    await flushAsync();

    expect(mocks.submitStudentAttempt).toHaveBeenCalledWith("a1", {
      answersByQuestionId: {
        q1: { value: "44" }
      }
    });
  });

  it("allows submitting before all questions are attempted", async () => {
    mocks.submitStudentAttempt.mockResolvedValueOnce({
      data: {
        data: {
          status: "SUBMITTED",
          score: 50,
          total: 2,
          submittedAt: "2026-02-21T00:00:10.000Z",
          resultBreakdown: { correctCount: 1, completionTime: 10 }
        }
      }
    });

    render(
      <MemoryRouter initialEntries={["/student/worksheets/w1"]}>
        <Routes>
          <Route path="/student/worksheets/:worksheetId" element={<StudentWorksheetAttemptPage />} />
        </Routes>
      </MemoryRouter>
    );

    await flushAsync();

    fireEvent.click(screen.getByText("I Understand, Start Worksheet"));
    await flushAsync();

    fireEvent.change(screen.getByLabelText("Answer for question 1"), { target: { value: "44" } });
    fireEvent.click(screen.getAllByText("Submit")[0]);

    expect(screen.getByText("Submit worksheet?")).toBeInTheDocument();
    expect(screen.queryByText("Required")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Confirm submit"));
    await flushAsync();

    expect(mocks.submitStudentAttempt).toHaveBeenCalledWith("a1", {
      answersByQuestionId: {
        q1: { value: "44" }
      }
    });
    expect(screen.getByText("Not Attempted")).toBeInTheDocument();
  });

  it("auto-submits countdown worksheets once at zero and locks them", async () => {
    const { startOrResumeStudentWorksheetAttempt } = await import("../../../services/studentPortalService");

    startOrResumeStudentWorksheetAttempt.mockResolvedValueOnce(
      buildAttemptResponse({
        attemptOverrides: {
          attemptTimerMode: "COUNTDOWN",
          worksheetKind: "ABACUS_PRACTICE"
        },
        worksheetOverrides: {
          attemptTimerMode: "COUNTDOWN",
          worksheetKind: "ABACUS_PRACTICE"
        }
      })
    );
    mocks.submitStudentAttempt.mockResolvedValueOnce({
      data: {
        data: {
          status: "TIMED_OUT",
          score: 50,
          total: 2,
          submittedAt: "2026-02-21T00:10:00.000Z",
          resultBreakdown: { correctCount: 1, completionTime: 600 }
        }
      }
    });

    render(
      <MemoryRouter initialEntries={["/student/worksheets/w1"]}>
        <Routes>
          <Route path="/student/worksheets/:worksheetId" element={<StudentWorksheetAttemptPage />} />
        </Routes>
      </MemoryRouter>
    );

    await flushAsync();

    fireEvent.click(screen.getByText("I Understand, Start Worksheet"));
    await flushAsync();

    fireEvent.change(screen.getByLabelText("Answer for question 1"), { target: { value: "44" } });

    act(() => {
      vi.advanceTimersByTime(600000);
    });
    await flushAsync();

    expect(mocks.submitStudentAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.submitStudentAttempt).toHaveBeenCalledWith("a1", {
      answersByQuestionId: {
        q1: { value: "44" }
      }
    });
    expect(screen.getByRole("heading", { name: "Time Up" })).toBeInTheDocument();
    expect(screen.getAllByText(/Taken Time:/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Total Time:/)).toBeInTheDocument();
    expect(screen.getAllByText("10:00").length).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    await flushAsync();

    expect(mocks.submitStudentAttempt).toHaveBeenCalledTimes(1);
    expect(screen.queryByDisplayValue("44")).not.toBeEnabled();
  });

  it("auto-submits an already timed-out countdown worksheet on load", async () => {
    const { startOrResumeStudentWorksheetAttempt } = await import("../../../services/studentPortalService");

    startOrResumeStudentWorksheetAttempt.mockResolvedValueOnce(
      buildAttemptResponse({
        attemptOverrides: {
          status: "TIMED_OUT",
          attemptTimerMode: "COUNTDOWN",
          worksheetKind: "PRACTICE",
          answersByQuestionId: {
            q1: { value: "44" }
          }
        },
        answersByQuestionId: {
          q1: { value: "44" }
        },
        worksheetOverrides: {
          attemptTimerMode: "COUNTDOWN",
          worksheetKind: "PRACTICE"
        }
      })
    );
    mocks.submitStudentAttempt.mockResolvedValueOnce({
      data: {
        data: {
          status: "TIMED_OUT",
          score: 50,
          total: 2,
          submittedAt: "2026-02-21T00:10:00.000Z",
          resultBreakdown: { correctCount: 1, completionTime: 600 }
        }
      }
    });

    render(
      <MemoryRouter initialEntries={["/student/worksheets/w1"]}>
        <Routes>
          <Route path="/student/worksheets/:worksheetId" element={<StudentWorksheetAttemptPage />} />
        </Routes>
      </MemoryRouter>
    );

    await flushAsync();
    fireEvent.click(screen.getByText("I Understand, Start Worksheet"));
    await flushAsync();

    expect(mocks.submitStudentAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.submitStudentAttempt).toHaveBeenCalledWith("a1", {
      answersByQuestionId: {
        q1: { value: "44" }
      }
    });
    expect(screen.getByRole("heading", { name: "Time Up" })).toBeInTheDocument();
  });

  it("keeps the timer frozen when reopening a submitted worksheet", async () => {
    const { startOrResumeStudentWorksheetAttempt } = await import("../../../services/studentPortalService");

    startOrResumeStudentWorksheetAttempt.mockResolvedValueOnce(
      buildAttemptResponse({
        attemptOverrides: {
          status: "SUBMITTED",
          serverNow: "2026-02-21T00:00:30.000Z",
          version: 1,
          savedAt: "2026-02-21T00:00:10.000Z"
        },
        answersByQuestionId: {
          q1: { value: "44" },
          q2: { value: "22" }
        },
        result: {
          status: "SUBMITTED",
          score: 100,
          total: 2,
          submittedAt: "2026-02-21T00:00:10.000Z",
          resultBreakdown: { correctCount: 2, completionTime: 10 }
        }
      })
    );

    render(
      <MemoryRouter initialEntries={["/student/worksheets/w1"]}>
        <Routes>
          <Route path="/student/worksheets/:worksheetId" element={<StudentWorksheetAttemptPage />} />
        </Routes>
      </MemoryRouter>
    );

    await flushAsync();

    fireEvent.click(screen.getByText("I Understand, Start Worksheet"));
    await flushAsync();

    expect(screen.getByRole("heading", { name: "Submitted" })).toBeInTheDocument();
    expect(screen.getAllByText("0:10").length).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(20000);
    });

    expect(screen.queryByText("0:30")).not.toBeInTheDocument();
    expect(screen.getAllByText("0:10").length).toBeGreaterThan(0);
  });

  it("shows not attempted for unanswered result rows", async () => {
    const { startOrResumeStudentWorksheetAttempt } = await import("../../../services/studentPortalService");

    startOrResumeStudentWorksheetAttempt.mockResolvedValueOnce(
      buildAttemptResponse({
        attemptOverrides: {
          status: "SUBMITTED",
          serverNow: "2026-02-21T00:00:30.000Z",
          version: 1,
          savedAt: "2026-02-21T00:00:10.000Z"
        },
        answersByQuestionId: {
          q1: { value: "44" }
        },
        result: {
          status: "SUBMITTED",
          score: 50,
          total: 2,
          submittedAt: "2026-02-21T00:00:10.000Z",
          resultBreakdown: { correctCount: 1, completionTime: 10 }
        }
      })
    );

    render(
      <MemoryRouter initialEntries={["/student/worksheets/w1"]}>
        <Routes>
          <Route path="/student/worksheets/:worksheetId" element={<StudentWorksheetAttemptPage />} />
        </Routes>
      </MemoryRouter>
    );

    await flushAsync();

    fireEvent.click(screen.getByText("I Understand, Start Worksheet"));
    await flushAsync();

    expect(screen.getByText("Not Attempted")).toBeInTheDocument();
    expect(screen.getAllByText("Right").length).toBeGreaterThan(0);
  });
});
