import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SuperadminCompetitionFoundationTemplatesPage } from "../SuperadminCompetitionFoundationTemplatesPage";

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn()
}));

const serviceMocks = vi.hoisted(() => ({
  listCompetitionFoundationTemplates: vi.fn(),
  createCompetitionFoundationTemplate: vi.fn(),
  updateCompetitionFoundationTemplate: vi.fn(),
  archiveCompetitionFoundationTemplate: vi.fn(),
  deleteCompetitionFoundationTemplate: vi.fn()
}));

vi.mock("../../../hooks/useAuth", () => authMocks);
vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));
vi.mock("../../../services/competitionFoundationService", () => serviceMocks);

function renderPage(initialPath = "/superadmin/competition/foundation/templates") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/superadmin/competition" element={<div>Legacy Competition</div>} />
        <Route path="/superadmin/competition/foundation/templates" element={<SuperadminCompetitionFoundationTemplatesPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("SuperadminCompetitionFoundationTemplatesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMocks.useAuth.mockReturnValue({
      role: "SUPERADMIN",
      capabilities: null
    });

    serviceMocks.listCompetitionFoundationTemplates.mockResolvedValue({
      data: [
        {
          id: "tmpl-1",
          name: "Alpha Template",
          slug: "alpha-template",
          description: "Primary competition template",
          isActive: true,
          createdAt: "2026-06-26T10:00:00.000Z",
          updatedAt: "2026-06-26T10:00:00.000Z"
        }
      ]
    });

    serviceMocks.createCompetitionFoundationTemplate.mockResolvedValue({ data: { id: "tmpl-2" } });
    serviceMocks.updateCompetitionFoundationTemplate.mockResolvedValue({ data: { id: "tmpl-1" } });
    serviceMocks.archiveCompetitionFoundationTemplate.mockResolvedValue({ data: { id: "tmpl-1" } });
    serviceMocks.deleteCompetitionFoundationTemplate.mockResolvedValue({ data: { id: "tmpl-1" } });
  });

  it("loads and displays templates", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Foundation Templates" })).toBeInTheDocument();
    expect(await screen.findByText("Alpha Template")).toBeInTheDocument();
    expect(serviceMocks.listCompetitionFoundationTemplates).toHaveBeenCalled();
  });

  it("creates a template", async () => {
    renderPage();

    await screen.findByRole("heading", { name: "Foundation Templates" });

    fireEvent.change(screen.getByPlaceholderText("Level 1 Sprint Template"), { target: { value: "Beta Template" } });
    fireEvent.change(screen.getByPlaceholderText("level-1-sprint-template"), { target: { value: "beta-template" } });
    fireEvent.change(screen.getByPlaceholderText("Reusable blueprint for foundation competition creation"), { target: { value: "Template details" } });

    fireEvent.click(screen.getByRole("button", { name: "Create Template" }));

    await waitFor(() => {
      expect(serviceMocks.createCompetitionFoundationTemplate).toHaveBeenCalledWith({
        name: "Beta Template",
        slug: "beta-template",
        description: "Template details",
        isActive: true
      });
    });
  });

  it("filters results by search", async () => {
    renderPage();

    await screen.findByText("Alpha Template");

    fireEvent.change(screen.getByPlaceholderText("Search by name, slug, or description"), { target: { value: "does-not-match" } });

    expect(await screen.findByText("No templates match this search")).toBeInTheDocument();
  });

  it("shows permission error when role cannot view templates", async () => {
    authMocks.useAuth.mockReturnValue({
      role: "SUPERADMIN",
      capabilities: { canManageCompetitionFoundation: false }
    });

    renderPage();

    expect(await screen.findByText("Access restricted")).toBeInTheDocument();
  });
});
