import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SuperadminCentersPage } from "../SuperadminCentersPage";

const userServiceMocks = vi.hoisted(() => ({
  listUsersByRole: vi.fn()
}));

const capacityServiceMocks = vi.hoisted(() => ({
  getBpCenterCapacitySummary: vi.fn(),
  updateBpCenterCapacity: vi.fn()
}));

const superadminServiceMocks = vi.hoisted(() => ({
  saGetCenterDetail: vi.fn(),
  saUpdateCenterBranding: vi.fn(),
  saUploadCenterLogo: vi.fn(),
  saDeleteCenterLogo: vi.fn()
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn()
}));

vi.mock("../../../services/usersService", () => ({
  listUsersByRole: userServiceMocks.listUsersByRole
}));

vi.mock("../../../services/capacityService", () => ({
  getBpCenterCapacitySummary: capacityServiceMocks.getBpCenterCapacitySummary,
  updateBpCenterCapacity: capacityServiceMocks.updateBpCenterCapacity
}));

vi.mock("../../../services/superadminService", () => ({
  saGetCenterDetail: superadminServiceMocks.saGetCenterDetail,
  saUpdateCenterBranding: superadminServiceMocks.saUpdateCenterBranding,
  saUploadCenterLogo: superadminServiceMocks.saUploadCenterLogo,
  saDeleteCenterLogo: superadminServiceMocks.saDeleteCenterLogo
}));

vi.mock("react-hot-toast", () => ({
  default: toastMocks
}));

function buildCenterDetail(overrides = {}) {
  return {
    id: "center-profile-1",
    authUserId: "center-user-1",
    displayName: "North Center",
    name: "North Center",
    brandingMode: "INHERIT_FRANCHISE",
    customBrandName: "",
    customLogoUrl: null,
    logoUrl: null,
    logoFilePath: null,
    commercializationTier: "STANDARD_CENTER",
    brandingActive: true,
    brandingLocked: false,
    brandingNotes: "",
    metrics: {
      studentsCount: 191,
      teachersCount: 9,
      batchesCount: 4
    },
    effectiveBranding: {
      displayName: "North Franchise",
      brandingSource: "FRANCHISE",
      logoUrl: "/uploads/logos/inherited-center-logo.png"
    },
    ...overrides
  };
}

function buildCapacitySummary(overrides = {}) {
  return {
    centerId: "center-profile-1",
    centerName: "North Center",
    studentLimit: 200,
    teacherLimit: 10,
    studentsUsed: 191,
    teachersUsed: 9,
    usage: {
      students: {
        configured: true,
        used: 191,
        limit: 200,
        remaining: 9,
        utilizationPercent: 95.5,
        state: "critical"
      },
      teachers: {
        configured: true,
        used: 9,
        limit: 10,
        remaining: 1,
        utilizationPercent: 90,
        state: "warning"
      }
    },
    summary: {
      overallState: "critical",
      recommendedAction: "Raise student capacity"
    },
    ...overrides
  };
}

function renderPage() {
  render(
    <MemoryRouter>
      <SuperadminCentersPage />
    </MemoryRouter>
  );
}

describe("SuperadminCentersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn(() => "blob:center-logo-preview");
    } else {
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:center-logo-preview");
    }

    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    }

    userServiceMocks.listUsersByRole.mockImplementation((role) => {
      if (role === "FRANCHISE") {
        return Promise.resolve({
          data: {
            items: [
              {
                id: "fr-user-1",
                username: "franchise01",
                hierarchyNodeId: "fr-node-1",
                hierarchyNode: {
                  code: "FR001",
                  name: "North Franchise"
                }
              }
            ],
            limit: 200,
            offset: 0
          }
        });
      }

      return Promise.resolve({
        data: {
          items: [
            {
              id: "center-user-1",
              username: "center01",
              hierarchyNode: {
                code: "CTR001",
                name: "North Center",
                isActive: true,
                parent: {
                  code: "FR001",
                  name: "North Franchise",
                  parent: {
                    code: "BP001",
                    name: "Partner One",
                    businessPartner: {
                      id: "bp-1"
                    }
                  }
                }
              }
            }
          ],
          limit: 20,
          offset: 0
        }
      });
    });

    superadminServiceMocks.saUploadCenterLogo.mockResolvedValue({ data: { ok: true } });
    superadminServiceMocks.saDeleteCenterLogo.mockResolvedValue({ data: { ok: true } });
    superadminServiceMocks.saUpdateCenterBranding.mockResolvedValue({ data: {} });

    capacityServiceMocks.getBpCenterCapacitySummary.mockResolvedValue({
      data: {
        items: [buildCapacitySummary()]
      }
    });
    capacityServiceMocks.updateBpCenterCapacity.mockResolvedValue({
      data: {
        center: {
          id: "center-profile-1"
        }
      }
    });
  });

  it("uploads and removes a local center logo from the branding panel", async () => {
    const user = userEvent.setup();

    superadminServiceMocks.saGetCenterDetail
      .mockResolvedValueOnce({ data: buildCenterDetail() })
      .mockResolvedValueOnce({
        data: buildCenterDetail({
          brandingMode: "CUSTOM_CENTER",
          customLogoUrl: "/uploads/logos/local-center-logo.png",
          logoUrl: "/uploads/logos/local-center-logo.png",
          logoFilePath: "logos/local-center-logo.png",
          effectiveBranding: {
            displayName: "North Center",
            brandingSource: "CENTER",
            logoUrl: "/uploads/logos/local-center-logo.png"
          }
        })
      })
      .mockResolvedValueOnce({ data: buildCenterDetail() });

    renderPage();

    expect(await screen.findByText("North Center")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Branding" }));

    expect(await screen.findByText("Center Branding")).toBeInTheDocument();
    expect(screen.getByAltText("Center Logo preview")).toBeInTheDocument();

    const fileInput = screen.getByLabelText("Center Logo file input");
    const file = new File(["png-bits"], "center-logo.png", { type: "image/png" });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(superadminServiceMocks.saUploadCenterLogo).toHaveBeenCalledTimes(1);
      expect(superadminServiceMocks.saUploadCenterLogo).toHaveBeenCalledWith("center-user-1", file, expect.any(Object));
    });

    expect(await screen.findByText("Center logo updated.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Logo" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Logo" }));

    await waitFor(() => {
      expect(superadminServiceMocks.saDeleteCenterLogo).toHaveBeenCalledTimes(1);
      expect(superadminServiceMocks.saDeleteCenterLogo).toHaveBeenCalledWith("center-user-1");
    });

    expect(await screen.findByText("Center logo removed.")).toBeInTheDocument();
    expect(superadminServiceMocks.saGetCenterDetail).toHaveBeenCalledTimes(3);
  });

  it("opens the capacity modal and shows current usage", async () => {
    const user = userEvent.setup();

    superadminServiceMocks.saGetCenterDetail.mockResolvedValueOnce({ data: buildCenterDetail() });

    renderPage();

    expect(await screen.findByText("North Center")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Manage Capacity" }));

    expect(await screen.findByRole("heading", { name: "Manage Capacity" })).toBeInTheDocument();
    expect(await screen.findByText("191 / 200")).toBeInTheDocument();
    expect(await screen.findByText("9 / 10")).toBeInTheDocument();
    expect(screen.getByLabelText("Max Students")).toHaveValue(200);
    expect(screen.getByLabelText("Max Teachers")).toHaveValue(10);
  });

  it("saves updated capacity limits", async () => {
    const user = userEvent.setup();

    superadminServiceMocks.saGetCenterDetail.mockResolvedValueOnce({ data: buildCenterDetail() });

    renderPage();

    expect(await screen.findByText("North Center")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Manage Capacity" }));

    const maxStudentsInput = await screen.findByLabelText("Max Students");
    const maxTeachersInput = screen.getByLabelText("Max Teachers");

    await user.clear(maxStudentsInput);
    await user.type(maxStudentsInput, "240");
    await user.clear(maxTeachersInput);
    await user.type(maxTeachersInput, "12");

    await user.click(screen.getByRole("button", { name: "Save Capacity" }));

    await waitFor(() => {
      expect(capacityServiceMocks.updateBpCenterCapacity).toHaveBeenCalledWith("center-profile-1", {
        maxStudents: 240,
        maxTeachers: 12
      });
    });

    expect(toastMocks.success).toHaveBeenCalledWith("Center capacity updated.");
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Manage Capacity" })).not.toBeInTheDocument();
    });
  });

  it("shows validation errors when values fall below current usage", async () => {
    const user = userEvent.setup();

    superadminServiceMocks.saGetCenterDetail.mockResolvedValueOnce({ data: buildCenterDetail() });

    renderPage();

    expect(await screen.findByText("North Center")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Manage Capacity" }));

    const maxStudentsInput = await screen.findByLabelText("Max Students");
    await user.clear(maxStudentsInput);
    await user.type(maxStudentsInput, "190");

    expect(await screen.findByText("Max Students cannot be below current usage (191)."))
      .toBeInTheDocument();
  });

  it("disables save when the form contains invalid capacity values", async () => {
    const user = userEvent.setup();

    superadminServiceMocks.saGetCenterDetail.mockResolvedValueOnce({ data: buildCenterDetail() });

    renderPage();

    expect(await screen.findByText("North Center")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Manage Capacity" }));

    const maxTeachersInput = await screen.findByLabelText("Max Teachers");
    fireEvent.change(maxTeachersInput, { target: { value: "-1" } });

    expect(await screen.findByText("Max Teachers must be a non-negative integer.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Capacity" })).toBeDisabled();
    expect(capacityServiceMocks.updateBpCenterCapacity).not.toHaveBeenCalled();
  });
});
