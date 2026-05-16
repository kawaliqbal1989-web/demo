import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CenterStudentsPage } from "../CenterStudentsPage";

const studentsServiceMocks = vi.hoisted(() => ({
  assignStudentCourse: vi.fn(),
  assignStudentLevel: vi.fn(),
  bulkImportStudentsCsv: vi.fn(),
  createStudent: vi.fn(),
  createStudentLogin: vi.fn(),
  exportStudentsCsv: vi.fn(),
  exportStudentsExcel: vi.fn(),
  getNextStudentCode: vi.fn(),
  listStudents: vi.fn(),
  recordStudentPayment: vi.fn(),
  resetStudentPassword: vi.fn(),
  updateStudent: vi.fn(),
  uploadStudentPhoto: vi.fn()
}));

const teacherServiceMocks = vi.hoisted(() => ({
  listTeachers: vi.fn()
}));

const batchServiceMocks = vi.hoisted(() => ({
  listBatches: vi.fn()
}));

const levelServiceMocks = vi.hoisted(() => ({
  listLevels: vi.fn()
}));

const courseServiceMocks = vi.hoisted(() => ({
  listCatalogCourses: vi.fn()
}));

const ledgerServiceMocks = vi.hoisted(() => ({
  listLedger: vi.fn()
}));

const enrollmentServiceMocks = vi.hoisted(() => ({
  createEnrollment: vi.fn(),
  updateEnrollment: vi.fn()
}));

const bulkOperationsMocks = vi.hoisted(() => ({
  bulkTransfer: vi.fn()
}));

const capacityHookMocks = vi.hoisted(() => ({
  useCenterCapacitySnapshot: vi.fn()
}));

vi.mock("../../../components/DataTable", () => ({
  DataTable: () => <div data-testid="students-table" />,
  PaginationBar: () => null,
  SavedViewBar: () => null,
  useSavedViews: () => ({
    activeViewId: null,
    applyView: vi.fn(),
    deleteView: vi.fn(),
    saveView: vi.fn(),
    views: []
  })
}));

vi.mock("../../../services/studentsService", () => studentsServiceMocks);
vi.mock("../../../services/teachersService", () => teacherServiceMocks);
vi.mock("../../../services/batchesService", () => batchServiceMocks);
vi.mock("../../../services/levelsService", () => levelServiceMocks);
vi.mock("../../../services/catalogService", () => courseServiceMocks);
vi.mock("../../../services/ledgerService", () => ledgerServiceMocks);
vi.mock("../../../services/enrollmentsService", () => enrollmentServiceMocks);
vi.mock("../../../services/bulkOperationsService", () => bulkOperationsMocks);
vi.mock("../../../hooks/useCenterCapacitySnapshot", () => capacityHookMocks);

describe("CenterStudentsPage", () => {
  beforeEach(() => {
    studentsServiceMocks.getNextStudentCode.mockResolvedValue({ data: { admissionNo: "ST001" } });
    studentsServiceMocks.listStudents.mockResolvedValue({ data: { items: [] } });
    teacherServiceMocks.listTeachers.mockResolvedValue({ data: { items: [] } });
    batchServiceMocks.listBatches.mockResolvedValue({ data: { items: [] } });
    levelServiceMocks.listLevels.mockResolvedValue({ data: { items: [] } });
    courseServiceMocks.listCatalogCourses.mockResolvedValue({ data: { items: [] } });
    ledgerServiceMocks.listLedger.mockResolvedValue({ data: { items: [] } });
    capacityHookMocks.useCenterCapacitySnapshot.mockReturnValue({
      data: {
        center: { name: "North Center" },
        summary: { recommendedAction: "Raise student capacity" },
        usage: {
          students: { configured: true, used: 100, limit: 100, utilizationPercent: 100, remaining: 0 },
          teachers: { configured: true, used: 4, limit: 10, utilizationPercent: 40, remaining: 6 }
        }
      },
      error: null,
      loading: false,
      retry: vi.fn()
    });
  });

  it("disables add-student and bulk-import actions when student capacity is locked", async () => {
    render(
      <MemoryRouter>
        <CenterStudentsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Student Admission", {}, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Admit Student" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Import CSV" })).toBeDisabled();
    expect(screen.getByText(/request more seats/i)).toBeInTheDocument();
  }, 15000);
});