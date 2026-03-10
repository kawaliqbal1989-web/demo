import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StudentWorksheetsPage } from "../StudentWorksheetsPage";

vi.mock("../../../services/studentPortalService", () => {
  return {
    listStudentWorksheets: vi.fn(async () => ({
      data: {
        data: {
          total: 0,
          page: 1,
          pageSize: 100,
          items: []
        }
      }
    }))
  };
});

describe("StudentWorksheetsPage", () => {
  it("renders grouped empty states and zero metrics", async () => {
    render(
      <MemoryRouter>
        <StudentWorksheetsPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "My Worksheets" })).toBeInTheDocument();
    expect(await screen.findByText("Your tasks grouped by status.")).toBeInTheDocument();

    expect(await screen.findByText("Total")).toBeInTheDocument();
    expect(await screen.findByText("Attempted")).toBeInTheDocument();
    expect((await screen.findAllByText("In Progress")).length).toBeGreaterThanOrEqual(2);
    expect((await screen.findAllByText("Completed")).length).toBeGreaterThanOrEqual(2);

    // four KPI values should all be 0
    const zeros = await screen.findAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(4);

    expect(await screen.findByText("Pending")).toBeInTheDocument();
    expect(await screen.findByText("No pending worksheets.")).toBeInTheDocument();

    expect(await screen.findByText("No worksheets in progress.")).toBeInTheDocument();
    expect(await screen.findByText("No completed worksheets yet.")).toBeInTheDocument();
  });
});
