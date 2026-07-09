// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
  });

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
});