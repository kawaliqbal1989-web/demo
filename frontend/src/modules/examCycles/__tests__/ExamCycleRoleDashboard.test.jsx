import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ExamCycleRoleDashboard, getAvailableActions, getCycleStage } from "../ExamCycleRoleDashboard";

const serviceMocks = vi.hoisted(() => ({
  listExamCycles: vi.fn()
}));

vi.mock("../../../services/examCyclesService", () => ({
  listExamCycles: serviceMocks.listExamCycles
}));

const baseCycle = {
  id: "cycle-1",
  code: "EX-001",
  name: "April Final",
  enrollmentStartAt: "2026-04-01T00:00:00.000Z",
  enrollmentEndAt: "2026-04-05T00:00:00.000Z",
  examStartsAt: "2026-04-10T00:00:00.000Z",
  examEndsAt: "2026-04-11T00:00:00.000Z",
  resultStatus: "DRAFT",
  businessPartner: { code: "BP-1", name: "North Partner" },
  enrollmentCounts: {
    normalEnrollmentCount: 8,
    lateEnrollmentCount: 0,
    totalEnrollmentCount: 8
  },
  enrollmentListSummary: {
    currentOwnerRole: "BP",
    hierarchy: {
      teacherDraft: 0,
      teacherSubmittedToCenter: 0,
      centerSubmittedToFranchise: 0,
      franchiseSubmittedToBusinessPartner: 1,
      businessPartnerSubmittedToSuperadmin: 0,
      approved: 0,
      rejected: 0
    }
  },
  availableActions: {
    manageEnrollment: false,
    pendingLists: true,
    lateEnrollment: true,
    results: false,
    resultsLockedReason: "Results are available after publishing."
  }
};

function mockExamCycles(items) {
  serviceMocks.listExamCycles.mockResolvedValue({
    data: {
      items,
      total: items.length,
      limit: 20,
      offset: 0
    }
  });
}

describe("ExamCycleRoleDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses API-provided actions when rendering the BP workflow dashboard", async () => {
    mockExamCycles([
      baseCycle,
      {
        ...baseCycle,
        id: "cycle-2",
        code: "EX-002",
        name: "May Final",
        resultStatus: "PUBLISHED",
        enrollmentCounts: {
          normalEnrollmentCount: 5,
          lateEnrollmentCount: 2,
          totalEnrollmentCount: 7
        },
        enrollmentListSummary: {
          currentOwnerRole: "SUPERADMIN",
          hierarchy: {
            businessPartnerSubmittedToSuperadmin: 1,
            approved: 1
          }
        },
        availableActions: {
          manageEnrollment: false,
          pendingLists: true,
          lateEnrollment: true,
          results: true,
          resultsLockedReason: null
        }
      }
    ]);

    render(
      <MemoryRouter initialEntries={["/bp/exam-cycles"]}>
        <ExamCycleRoleDashboard role="BP" />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Franchise -> Business Partner -> Superadmin/)).toBeInTheDocument();
    expect(screen.getAllByText("BP Review").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pending Lists").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Late Requests").length).toBeGreaterThan(0);
    expect(screen.getByText("Results Locked")).toBeDisabled();
    expect(screen.getByRole("link", { name: "Results" })).toHaveAttribute("href", "/bp/exam-cycles/cycle-2/results");
  });

  it("honors late-enrollment focused navigation", async () => {
    mockExamCycles([
      baseCycle,
      {
        ...baseCycle,
        id: "cycle-2",
        code: "EX-LATE",
        name: "Late Focus Cycle",
        enrollmentCounts: {
          normalEnrollmentCount: 4,
          lateEnrollmentCount: 3,
          totalEnrollmentCount: 7
        }
      }
    ]);

    render(
      <MemoryRouter initialEntries={["/franchise/exam-cycles?focus=late"]}>
        <ExamCycleRoleDashboard role="FRANCHISE" />
      </MemoryRouter>
    );

    expect(await screen.findByText("Late Focus Cycle")).toBeInTheDocument();
    expect(screen.queryByText("April Final")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Workflow")).toHaveValue("LATE_ONLY");
  });

  it("renders center management actions and locked result state", async () => {
    mockExamCycles([
      {
        ...baseCycle,
        availableActions: {
          manageEnrollment: true,
          pendingLists: false,
          lateEnrollment: true,
          results: false,
          resultsLockedReason: "Results wait for Superadmin publication."
        }
      }
    ]);

    render(
      <MemoryRouter initialEntries={["/center/exam-cycles"]}>
        <ExamCycleRoleDashboard role="CENTER" />
      </MemoryRouter>
    );

    expect(await screen.findByRole("link", { name: "Manage Enrollment" })).toHaveAttribute("href", "/center/exam-cycles/cycle-1");
    expect(screen.getByRole("link", { name: "Late Requests" })).toHaveAttribute("href", "/center/exam-cycles/cycle-1/late-enrollment");
    expect(screen.getByText("Results Locked")).toHaveAttribute("title", "Results wait for Superadmin publication.");
  });
});

describe("exam-cycle dashboard helpers", () => {
  it("derives workflow stage and fallback actions without API action payloads", () => {
    expect(getCycleStage(baseCycle)).toBe("BP_REVIEW");

    const teacherActions = getAvailableActions({ resultStatus: "DRAFT", isArchived: false }, "TEACHER");
    expect(teacherActions).toMatchObject({
      manageEnrollment: true,
      pendingLists: false,
      lateEnrollment: false,
      results: false
    });
    expect(teacherActions.resultsLockedReason).toBeTruthy();
  });
});
