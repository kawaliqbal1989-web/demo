import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { FranchiseProfilePage } from "../FranchiseProfilePage";

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn()
}));

const franchiseServiceMocks = vi.hoisted(() => ({
  getMyFranchise: vi.fn(),
  updateFranchiseProfile: vi.fn()
}));

const uploadServiceMocks = vi.hoisted(() => ({
  uploadMyLogo: vi.fn(),
  deleteMyLogo: vi.fn()
}));

vi.mock("../../../hooks/useAuth", () => authMocks);
vi.mock("../../../services/franchiseService", () => franchiseServiceMocks);
vi.mock("../../../services/uploadsService", () => uploadServiceMocks);

describe("FranchiseProfilePage", () => {
  let refreshBranding;

  beforeEach(() => {
    refreshBranding = vi.fn().mockResolvedValue(null);

    authMocks.useAuth.mockReturnValue({
      refreshBranding
    });

    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn(() => "blob:logo-preview");
    } else {
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:logo-preview");
    }

    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    }

    franchiseServiceMocks.getMyFranchise.mockResolvedValue({
      data: {
        profile: {
          id: "fr_1",
          code: "FR001",
          name: "North Franchise",
          displayName: "North Franchise",
          status: "ACTIVE",
          phonePrimary: "9999999999",
          emailOfficial: "north@example.com",
          whatsappEnabled: true,
          logoUrl: null
        }
      }
    });

    franchiseServiceMocks.updateFranchiseProfile.mockResolvedValue({ data: {} });
    uploadServiceMocks.uploadMyLogo.mockResolvedValue({
      data: {
        logoUrl: "/uploads/logos/logo_franchise_1_123.png",
        logoPath: "logo_franchise_1_123.png",
        logoFilePath: "logos/logo_franchise_1_123.png"
      }
    });
    uploadServiceMocks.deleteMyLogo.mockResolvedValue({
      data: {
        logoUrl: null,
        logoPath: null,
        logoFilePath: null
      }
    });
  });

  it("uploads and removes a local logo", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <FranchiseProfilePage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Franchise Profile")).toBeInTheDocument();

    const fileInput = screen.getByLabelText("Franchise Logo file input");
    const file = new File(["png-bits"], "brand.png", { type: "image/png" });

    await user.upload(fileInput, file);

    await waitFor(() => expect(uploadServiceMocks.uploadMyLogo).toHaveBeenCalledTimes(1));
    expect(refreshBranding).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Logo updated successfully.")).toBeInTheDocument();
    expect(screen.getByAltText("Franchise Logo preview")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Logo" }));

    await waitFor(() => expect(uploadServiceMocks.deleteMyLogo).toHaveBeenCalledTimes(1));
    expect(refreshBranding).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Logo removed successfully.")).toBeInTheDocument();
  });
});