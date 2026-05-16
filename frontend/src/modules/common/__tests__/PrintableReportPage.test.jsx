import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PrintableReportPage } from "../PrintableReportPage";

const { getPrintableReport, exportReportPdf, exportReportExcel } = vi.hoisted(() => ({
  getPrintableReport: vi.fn(),
  exportReportPdf: vi.fn(),
  exportReportExcel: vi.fn()
}));

vi.mock("../../../services/reportingFoundationService", async () => {
  const actual = await vi.importActual("../../../services/reportingFoundationService");
  return {
    ...actual,
    getPrintableReport,
    exportReportPdf,
    exportReportExcel
  };
});

describe("PrintableReportPage", () => {
  beforeEach(() => {
    getPrintableReport.mockReset();
  });

  it("renders highlights, sections, and tables for the printable report view", async () => {
    getPrintableReport.mockResolvedValue({
      data: {
        title: "Student Engagement Summary",
        subtitle: "Printable summary",
        documentTitle: "Student Engagement Summary - Printable",
        generatedAt: "2026-05-11T12:00:00.000Z",
        scope: {
          label: "Test Student",
          role: "STUDENT"
        },
        highlights: [
          { id: "engagement", label: "Engagement Score", displayValue: "91" },
          { id: "band", label: "Engagement Band", displayValue: "Thriving" }
        ],
        sections: [
          {
            id: "overview",
            title: "Overview",
            summaryItems: [{ label: "Practice Active Days", displayValue: "12" }],
            tableIds: ["overview-table"]
          }
        ],
        tables: [
          {
            id: "overview-table",
            title: "Recent Activity",
            columns: [
              { key: "label", label: "Label" },
              { key: "value", label: "Value" }
            ],
            rows: [{ label: "Weak Topic", value: "Division" }]
          }
        ]
      }
    });

    render(
      <MemoryRouter initialEntries={["/reports/printable/student-engagement?studentId=stu-1"]}>
        <Routes>
          <Route path="/reports/printable/:reportKey" element={<PrintableReportPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Student Engagement Summary" })).toBeInTheDocument();
    expect(await screen.findByText("Engagement Score")).toBeInTheDocument();
    expect(await screen.findByText("Thriving")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Recent Activity" })).toBeInTheDocument();
    expect(await screen.findByText("Division")).toBeInTheDocument();
    expect(getPrintableReport).toHaveBeenCalledWith("student-engagement", { studentId: "stu-1" });
  });
});