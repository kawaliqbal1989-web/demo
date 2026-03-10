import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    listStudentMaterials: vi.fn()
  };
});

vi.mock("../../../services/studentPortalService", () => {
  return {
    listStudentMaterials: mocks.listStudentMaterials
  };
});

import { StudentMaterialsPage } from "../StudentMaterialsPage";

describe("StudentMaterialsPage", () => {
  it("shows empty state when no materials", async () => {
    mocks.listStudentMaterials.mockResolvedValueOnce({ data: { data: [] } });

    render(
      <MemoryRouter>
        <StudentMaterialsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Materials")).toBeInTheDocument();
    expect(await screen.findByText("No materials available yet.")).toBeInTheDocument();
  });

  it("renders materials and open links", async () => {
    mocks.listStudentMaterials.mockResolvedValueOnce({
      data: {
        data: [
          {
            materialId: "mat_1",
            title: "Guide",
            description: "Read this",
            type: "LINK",
            url: "https://example.com"
          }
        ]
      }
    });

    render(
      <MemoryRouter>
        <StudentMaterialsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Guide")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Open" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });
});
