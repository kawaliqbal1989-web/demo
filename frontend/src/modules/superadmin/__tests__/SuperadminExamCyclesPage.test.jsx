// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SuperadminExamCyclesPage } from "../SuperadminExamCyclesPage";

const searchParamsState = vi.hoisted(() => ({
  value: new URLSearchParams("tab=exam-cycles")
}));

const serviceMocks = vi.hoisted(() => ({
  listExamCycles: vi.fn(),
  listExamCourses: vi.fn(),
  getExamCycleAssessmentConfig: vi.fn(),
  saveExamCycleAssessmentConfig: vi.fn(),
  generateExamCycleQuestionSet: vi.fn()
}));

vi.mock("../../../services/examCyclesService", () => ({
  listExamCycles: serviceMocks.listExamCycles,
  listExamCourses: serviceMocks.listExamCourses,
  getExamCycleAssessmentConfig: serviceMocks.getExamCycleAssessmentConfig,
  saveExamCycleAssessmentConfig: serviceMocks.saveExamCycleAssessmentConfig,
  generateExamCycleQuestionSet: serviceMocks.generateExamCycleQuestionSet
}));

describe("SuperadminExamCyclesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.saveExamCycleAssessmentConfig.mockResolvedValue({ data: { saved: [] } });
    serviceMocks.generateExamCycleQuestionSet.mockResolvedValue({ data: null });
    serviceMocks.listExamCourses.mockResolvedValue({
      data: {
        items: [
          {
            id: "course-1",
            code: "C1",
            name: "Course One",
            levels: [{ id: "level-1", levelNumber: 1, title: "Level 1" }]
          }
        ]
      }
    });
    serviceMocks.getExamCycleAssessmentConfig.mockResolvedValue({
      data: {
        levels: [],
        configs: [],
        worksheetsByLevelId: {},
        questionBanksByLevelId: {}
      }
    });
    serviceMocks.listExamCycles.mockResolvedValue({
      data: {
        items: [
          {
            id: "cycle-2",
            code: "EX-002",
            name: "Draft Cycle",
            resultStatus: "DRAFT",
            isArchived: false,
            examDurationMinutes: 5,
            examStartsAt: null,
            examEndsAt: null
          }
        ],
        total: 1,
        limit: 100,
        offset: 0
      }
    });
  });

  function mockPaperBuilderWorksheetConfig({ worksheetQuestionCount = 250 } = {}) {
    serviceMocks.getExamCycleAssessmentConfig.mockResolvedValue({
      data: {
        levels: [
          {
            levelId: "level-1",
            levelName: "Level 1",
            levelRank: 1,
            studentCount: 2
          }
        ],
        configs: [],
        worksheetsByLevelId: {
          "level-1": [
            {
              id: "worksheet-1",
              title: "Level 1 Worksheet",
              questionCount: worksheetQuestionCount,
              isPublished: true,
              isSelectable: true,
              disabled: false
            }
          ]
        },
        questionBanksByLevelId: {
          "level-1": []
        }
      }
    });
  }

  async function selectPaperBuilderContext() {
    const courseSelect = await screen.findByLabelText("Exam Course");
    await userEvent.selectOptions(courseSelect, "course-1");

    const levelSelect = await screen.findByLabelText("Exam Level");
    await userEvent.selectOptions(levelSelect, "1");
  }

  it("renders explicit fallbacks for missing linked data", async () => {
    serviceMocks.listExamCycles.mockResolvedValue({
      data: {
        items: [
          {
            id: "cycle-1",
            code: "EX-001",
            name: "April Final",
            businessPartner: null,
            enrollmentStartAt: null,
            enrollmentEndAt: null,
            examStartsAt: null,
            examEndsAt: null,
            examDurationMinutes: 45,
            resultStatus: "DRAFT"
          }
        ],
        total: 1,
        limit: 20,
        offset: 0
      }
    });

    render(
      <MemoryRouter>
        <SuperadminExamCyclesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("EX-001")).toBeTruthy();
    expect(screen.getByText("Unassigned")).toBeTruthy();
    expect(screen.getByText("No business partner linked")).toBeTruthy();
  });

  it("shows a clear empty state", async () => {
    serviceMocks.listExamCycles.mockResolvedValue({
      data: {
        items: [],
        total: 0,
        limit: 20,
        offset: 0
      }
    });

    render(
      <MemoryRouter>
        <SuperadminExamCyclesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("No exam cycles found.")).toBeTruthy();
  });

  it("renders locked paper builder cycles as read-only options", async () => {
    serviceMocks.listExamCycles.mockResolvedValue({
      data: {
        items: [
          {
            id: "cycle-1",
            code: "EX-001",
            name: "Draft Cycle",
            resultStatus: "DRAFT",
            isArchived: false,
            examStartsAt: null,
            examEndsAt: null
          },
          {
            id: "cycle-2",
            code: "EX-002",
            name: "Approved Cycle",
            resultStatus: "PUBLISHED",
            isArchived: false,
            examStartsAt: null,
            examEndsAt: null
          }
        ],
        total: 2,
        limit: 100,
        offset: 0
      }
    });

    const initialEntries = ["/superadmin/exam-cycles?tab=paper-builder&examCourseId=course-1&examLevelNumber=1&examCycleId=cycle-2"];
    render(
      <MemoryRouter initialEntries={initialEntries}>
        <SuperadminExamCyclesPage />
      </MemoryRouter>
    );

    const cycleSelect = await screen.findByLabelText(/Exam Cycle/i);
    expect(cycleSelect).toBeTruthy();
    const draftOption = await screen.findByText(/Draft Cycle/i);
    expect(draftOption).toBeTruthy();
    const lockedOption = await screen.findByText(/Approved Cycle/i);
    expect(lockedOption).toBeTruthy();
    expect(screen.getByText(/Read-only preview for this locked exam cycle/i)).toBeTruthy();
  });

  it("worksheet mode shows worksheet, question count, and time limit; selecting worksheet defaults values", async () => {
    mockPaperBuilderWorksheetConfig({ worksheetQuestionCount: 250 });

    const initialEntries = ["/superadmin/exam-cycles?tab=paper-builder&examCourseId=course-1&examLevelNumber=1&examCycleId=cycle-2"];
    render(
      <MemoryRouter initialEntries={initialEntries}>
        <SuperadminExamCyclesPage />
      </MemoryRouter>
    );

    await selectPaperBuilderContext();

    const worksheetSelect = await screen.findByLabelText("Worksheet");
    expect(worksheetSelect).toBeTruthy();

    await userEvent.selectOptions(worksheetSelect, "worksheet-1");

    const questionCountInput = await screen.findByLabelText("Question Count");
    const timeLimitInput = await screen.findByLabelText("Time Limit (Minutes)");

    await waitFor(() => {
      expect(questionCountInput.value).toBe("250");
      expect(timeLimitInput.value).toBe("5");
    });

    expect(screen.getByText("Available in selected worksheet: 250")).toBeTruthy();
  });

  it("saving worksheet mode sends worksheetId, questionCount, and timeLimitMinutes", async () => {
    mockPaperBuilderWorksheetConfig({ worksheetQuestionCount: 250 });

    const initialEntries = ["/superadmin/exam-cycles?tab=paper-builder&examCourseId=course-1&examLevelNumber=1&examCycleId=cycle-2"];
    render(
      <MemoryRouter initialEntries={initialEntries}>
        <SuperadminExamCyclesPage />
      </MemoryRouter>
    );

    const worksheetSelect = await screen.findByLabelText("Worksheet");
    await userEvent.selectOptions(worksheetSelect, "worksheet-1");

    const questionCountInput = await screen.findByLabelText("Question Count");
    fireEvent.change(questionCountInput, { target: { value: "100" } });

    const timeLimitInput = await screen.findByLabelText("Time Limit (Minutes)");
    fireEvent.change(timeLimitInput, { target: { value: "5" } });

    const saveButton = await screen.findByRole("button", { name: /Save Configuration/i });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(serviceMocks.saveExamCycleAssessmentConfig).toHaveBeenCalledTimes(1);
    });

    const payload = serviceMocks.saveExamCycleAssessmentConfig.mock.calls[0][1];
    expect(payload.configs[0]).toMatchObject({
      levelId: "level-1",
      assessmentType: "WORKSHEET",
      worksheetId: "worksheet-1",
      questionBankId: null,
      questionCount: 100,
      timeLimitMinutes: 5
    });
  });

  it("blocks save when worksheet question count exceeds available", async () => {
    mockPaperBuilderWorksheetConfig({ worksheetQuestionCount: 250 });

    const initialEntries = ["/superadmin/exam-cycles?tab=paper-builder&examCourseId=course-1&examLevelNumber=1&examCycleId=cycle-2"];
    render(
      <MemoryRouter initialEntries={initialEntries}>
        <SuperadminExamCyclesPage />
      </MemoryRouter>
    );

    await selectPaperBuilderContext();

    const worksheetSelect = await screen.findByLabelText("Worksheet");
    await userEvent.selectOptions(worksheetSelect, "worksheet-1");

    const questionCountInput = await screen.findByLabelText("Question Count");
    await userEvent.clear(questionCountInput);
    await userEvent.type(questionCountInput, "300");

    const saveButton = await screen.findByRole("button", { name: /Save Configuration/i });
    await userEvent.click(saveButton);

    expect(screen.getByText("Question count cannot exceed 250")).toBeTruthy();
    expect(serviceMocks.saveExamCycleAssessmentConfig).not.toHaveBeenCalled();
  });

  it("blocks worksheet save when worksheet question/time values are invalid or required fields are blank", async () => {
    mockPaperBuilderWorksheetConfig({ worksheetQuestionCount: 250 });

    const initialEntries = ["/superadmin/exam-cycles?tab=paper-builder&examCourseId=course-1&examLevelNumber=1&examCycleId=cycle-2"];
    render(
      <MemoryRouter initialEntries={initialEntries}>
        <SuperadminExamCyclesPage />
      </MemoryRouter>
    );

    const worksheetSelect = await screen.findByLabelText("Worksheet");
    await userEvent.selectOptions(worksheetSelect, "worksheet-1");

    const questionCountInput = await screen.findByLabelText("Question Count");
    const timeLimitInput = await screen.findByLabelText("Time Limit (Minutes)");
    const saveButton = await screen.findByRole("button", { name: /Save Configuration/i });

    const setInputs = async ({ questionCount, timeLimit }) => {
      fireEvent.change(questionCountInput, { target: { value: questionCount === "" ? "" : String(questionCount) } });
      fireEvent.change(timeLimitInput, { target: { value: timeLimit === "" ? "" : String(timeLimit) } });
    };

    const invalidCases = [
      { questionCount: "300", timeLimit: "5" },
      { questionCount: "0", timeLimit: "5" },
      { questionCount: "-3", timeLimit: "5" },
      { questionCount: "2.5", timeLimit: "5" },
      { questionCount: "100", timeLimit: "0" },
      { questionCount: "100", timeLimit: "-2" },
      { questionCount: "100", timeLimit: "1.5" },
      { questionCount: "", timeLimit: "5" },
      { questionCount: "100", timeLimit: "" }
    ];

    for (const invalidCase of invalidCases) {
      await setInputs(invalidCase);
      await userEvent.click(saveButton);
      expect(serviceMocks.saveExamCycleAssessmentConfig).not.toHaveBeenCalled();
    }

    expect(serviceMocks.saveExamCycleAssessmentConfig).not.toHaveBeenCalled();
  });
});