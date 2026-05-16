import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BusinessPartnerProfilePage } from "../BusinessPartnerProfilePage";

const serviceMocks = vi.hoisted(() => ({
  getMyBusinessPartner: vi.fn(),
  updatePartnerProfile: vi.fn()
}));

vi.mock("../../../services/businessPartnersService", () => ({
  getMyBusinessPartner: serviceMocks.getMyBusinessPartner
}));

vi.mock("../../../services/partnerService", () => ({
  updatePartnerProfile: serviceMocks.updatePartnerProfile
}));

describe("BusinessPartnerProfilePage branding governance", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    serviceMocks.getMyBusinessPartner.mockResolvedValue({
      data: {
        id: "bp-1",
        code: "BP001",
        name: "North Growth Partner",
        displayName: "North Growth Partner",
        status: "ACTIVE",
        logoUrl: "/uploads/logos/sample.png",
        brandingUpdatedAt: "2026-05-10T10:00:00.000Z",
        brandingUpdatedBy: {
          id: "sa-1",
          email: "superadmin@abacusweb.local"
        }
      }
    });
  });

  it("renders branding as read-only superadmin-managed information", async () => {
    render(
      <MemoryRouter>
        <BusinessPartnerProfilePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Partner Branding")).toBeInTheDocument();
    });

    expect(screen.getByText(/SuperAdmin only/i)).toBeInTheDocument();
    expect(screen.getByText(/Propagation Scope:/i)).toBeInTheDocument();
    expect(screen.queryByText("Upload Logo")).not.toBeInTheDocument();
    expect(screen.queryByText("Remove Logo")).not.toBeInTheDocument();
  });
});
