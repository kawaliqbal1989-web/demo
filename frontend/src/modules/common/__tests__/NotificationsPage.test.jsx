import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ useAuth: vi.fn() }));
const notificationServiceMocks = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn()
}));
const operationalServiceMocks = vi.hoisted(() => ({
  markOperationalNotificationRead: vi.fn(),
  markAllOperationalNotificationsRead: vi.fn()
}));
const hookMocks = vi.hoisted(() => ({
  useOperationalNotifications: vi.fn(),
  useOperationalUnreadCounts: vi.fn()
}));

vi.mock("../../../hooks/useAuth", () => authMocks);
vi.mock("../../../services/notificationService", () => notificationServiceMocks);
vi.mock("../services/operationalNotificationService", () => operationalServiceMocks);
vi.mock("../hooks/useOperationalNotifications", () => ({ useOperationalNotifications: hookMocks.useOperationalNotifications }));
vi.mock("../hooks/useOperationalUnreadCounts", () => ({ useOperationalUnreadCounts: hookMocks.useOperationalUnreadCounts }));

import { NotificationsPage } from "../NotificationsPage";

describe("NotificationsPage", () => {
  beforeEach(() => {
    authMocks.useAuth.mockReturnValue({ role: "BP" });
    notificationServiceMocks.listNotifications.mockResolvedValue({ data: { data: { items: [], total: 0 } } });
    notificationServiceMocks.markNotificationRead.mockResolvedValue({});
    notificationServiceMocks.markAllNotificationsRead.mockResolvedValue({});
    operationalServiceMocks.markOperationalNotificationRead.mockResolvedValue({});
    operationalServiceMocks.markAllOperationalNotificationsRead.mockResolvedValue({});
    hookMocks.useOperationalUnreadCounts.mockReturnValue({
      counts: { totalUnread: 2, criticalUnread: 1, highUnread: 1 },
      refresh: vi.fn()
    });
    hookMocks.useOperationalNotifications.mockReturnValue({
      items: [
        {
          notificationId: "op-1",
          title: "Critical attendance",
          message: "Attendance is critical",
          category: "ACADEMIC",
          severity: "CRITICAL",
          timestamp: "2026-05-10T09:00:00.000Z",
          isUnread: true,
          franchiseId: "fr-1",
          franchiseLabel: "Franchise One",
          centerId: "center-1",
          centerLabel: "Center One",
          metricKey: "attendancePercent",
          observedValue: 52,
          thresholdValue: 75,
          occurrenceCount: 2,
          deepLinkPath: "/bp/franchises/fr-1"
        }
      ],
      hasMore: false,
      loading: false,
      error: null,
      retry: vi.fn()
    });
  });

  it("renders operational notifications with severity metadata and deep-link actions", async () => {
    render(
      <MemoryRouter initialEntries={["/notifications"]}>
        <Routes>
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/bp/franchises/:id" element={<div>Franchise page</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /Operational/i }));

    expect(await screen.findByText("Critical attendance")).toBeInTheDocument();
    expect(screen.getByText("Escalated ×2")).toBeInTheDocument();
    expect(screen.getByText(/attendancePercent 52 \/ 75/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Open alert/i }));

    await waitFor(() => {
      expect(operationalServiceMocks.markOperationalNotificationRead).toHaveBeenCalledWith("op-1");
    });
    expect(await screen.findByText("Franchise page")).toBeInTheDocument();
  });

  it("surfaces retry handling for operational notification errors", async () => {
    const retry = vi.fn();
    hookMocks.useOperationalNotifications.mockImplementation(() => ({
      items: [],
      hasMore: false,
      loading: false,
      error: new Error("temporary failure"),
      retry
    }));

    render(
      <MemoryRouter initialEntries={["/notifications"]}>
        <Routes>
          <Route path="/notifications" element={<NotificationsPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /Operational/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Retry/i }));

    expect(retry).toHaveBeenCalledTimes(1);

    hookMocks.useOperationalNotifications.mockReset();
  });
});