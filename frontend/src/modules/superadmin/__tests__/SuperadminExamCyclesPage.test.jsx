import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SuperadminExamCyclesPage } from "../SuperadminExamCyclesPage";

const serviceMocks = vi.hoisted(() => ({
  listExamCycles: vi.fn(),
  getExamCycleArchiveImpact: vi.fn(),
  archiveExamCycle: vi.fn(),
  restoreExamCycle: vi.fn(),
  getExamCycleDeleteImpact: vi.fn(),
  getExamCycleAuditCheck: vi.fn(),
  deleteExamCycle: vi.fn()
}));

vi.mock("../../../services/examCyclesService", () => ({
  listExamCycles: serviceMocks.listExamCycles,
  getExamCycleArchiveImpact: serviceMocks.getExamCycleArchiveImpact,
  archiveExamCycle: serviceMocks.archiveExamCycle,
  restoreExamCycle: serviceMocks.restoreExamCycle,
  getExamCycleDeleteImpact: serviceMocks.getExamCycleDeleteImpact,
  getExamCycleAuditCheck: serviceMocks.getExamCycleAuditCheck,
  deleteExamCycle: serviceMocks.deleteExamCycle
}));

describe("SuperadminExamCyclesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
            resultStatus: "DRAFT",
            enrollmentCounts: {
              normalEnrollmentCount: 0,
              lateEnrollmentCount: 0,
              totalEnrollmentCount: 0
            },
            enrollmentListSummary: {
              currentOwnerRole: null,
              hierarchy: {}
            }
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

    expect(await screen.findByText("EX-001")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByText("No business partner linked")).toBeInTheDocument();
  });

  it("renders hierarchy summary and filters loaded rows", async () => {
    serviceMocks.listExamCycles.mockResolvedValue({
      data: {
        items: [
          {
            id: "cycle-1",
            code: "EX-001",
            name: "April Final",
            businessPartner: { code: "BP-1", name: "North Partner" },
            enrollmentStartAt: "2026-04-01T00:00:00.000Z",
            enrollmentEndAt: "2026-04-05T00:00:00.000Z",
            examStartsAt: "2026-04-10T00:00:00.000Z",
            examEndsAt: "2026-04-11T00:00:00.000Z",
            examDurationMinutes: 45,
            resultStatus: "DRAFT",
            enrollmentCounts: {
              normalEnrollmentCount: 8,
              lateEnrollmentCount: 1,
              totalEnrollmentCount: 9
            },
            enrollmentListSummary: {
              currentOwnerRole: "SUPERADMIN",
              hierarchy: {
                businessPartnerSubmittedToSuperadmin: 2,
                approved: 0
              }
            }
          },
          {
            id: "cycle-2",
            code: "EX-002",
            name: "May Final",
            businessPartner: { code: "BP-2", name: "South Partner" },
            enrollmentStartAt: "2026-05-01T00:00:00.000Z",
            enrollmentEndAt: "2026-05-05T00:00:00.000Z",
            examStartsAt: "2026-05-10T00:00:00.000Z",
            examEndsAt: "2026-05-11T00:00:00.000Z",
            examDurationMinutes: 45,
            resultStatus: "PUBLISHED",
            enrollmentCounts: {
              normalEnrollmentCount: 4,
              lateEnrollmentCount: 0,
              totalEnrollmentCount: 4
            },
            enrollmentListSummary: {
              currentOwnerRole: "SUPERADMIN",
              hierarchy: {
                approved: 1
              }
            }
          }
        ],
        total: 2,
        limit: 20,
        offset: 0
      }
    });

    render(
      <MemoryRouter>
        <SuperadminExamCyclesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Hierarchy Queue")).toBeInTheDocument();
    expect(screen.getByText("BP submissions")).toBeInTheDocument();
    expect(screen.getAllByText("Superadmin Review").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText("Code, name, BP, owner"), {
      target: { value: "May" }
    });

    expect(screen.getByText("May Final")).toBeInTheDocument();
    expect(screen.queryByText("April Final")).not.toBeInTheDocument();
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

    expect(await screen.findByText("No exam cycles found.")).toBeInTheDocument();
  });
});
