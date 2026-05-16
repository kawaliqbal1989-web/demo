import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn()
}));

const serviceMocks = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  getOperationalNotifications: vi.fn(),
  getOperationalUnreadCounts: vi.fn(),
  markOperationalNotificationRead: vi.fn(),
  markAllOperationalNotificationsRead: vi.fn()
}));

vi.mock("../../hooks/useAuth", () => authMocks);
vi.mock("../../services/notificationService", () => ({
  listNotifications: serviceMocks.listNotifications,
  markNotificationRead: serviceMocks.markNotificationRead,
  markAllNotificationsRead: serviceMocks.markAllNotificationsRead
}));
vi.mock("../../modules/common/services/operationalNotificationService", () => ({
  getOperationalNotifications: serviceMocks.getOperationalNotifications,
  getOperationalUnreadCounts: serviceMocks.getOperationalUnreadCounts,
  markOperationalNotificationRead: serviceMocks.markOperationalNotificationRead,
  markAllOperationalNotificationsRead: serviceMocks.markAllOperationalNotificationsRead
}));
vi.mock("../../utils/jwt", () => ({
  isTokenExpiringSoon: vi.fn(() => false)
}));

import { NotificationBell } from "../NotificationBell";

describe("NotificationBell", () => {
  beforeEach(() => {
    serviceMocks.listNotifications.mockReset();
    serviceMocks.markNotificationRead.mockReset();
    serviceMocks.markAllNotificationsRead.mockReset();
    serviceMocks.getOperationalNotifications.mockReset();
    serviceMocks.getOperationalUnreadCounts.mockReset();
    serviceMocks.markOperationalNotificationRead.mockReset();
    serviceMocks.markAllOperationalNotificationsRead.mockReset();

    authMocks.useAuth.mockReturnValue({
      accessToken: "token",
      isAuthenticated: true,
      mustChangePassword: false,
      refreshSession: vi.fn().mockResolvedValue(undefined),
      authBootstrapPending: false,
      role: "BP"
    });

    serviceMocks.listNotifications.mockResolvedValue({
      data: {
        data: {
          unreadCount: 2,
          items: [{ id: "g-1", title: "Generic notice", message: "generic", category: "SYSTEM", createdAt: "2026-05-10T10:00:00.000Z", isRead: false }]
        }
      }
    });
    serviceMocks.getOperationalUnreadCounts.mockResolvedValue({ totalUnread: 3, criticalUnread: 1, highUnread: 1, grouped: { bySeverity: {}, byCategory: {} } });
    serviceMocks.getOperationalNotifications.mockResolvedValue({
      items: [{ notificationId: "o-1", notificationKind: "operational", title: "Critical ops", message: "ops", category: "OPERATIONS", severity: "CRITICAL", timestamp: "2026-05-10T12:00:00.000Z", isUnread: true, franchiseId: "fr-1", deepLinkPath: "/bp/franchises/fr-1" }]
    });
    serviceMocks.markOperationalNotificationRead.mockResolvedValue({});
    serviceMocks.markAllNotificationsRead.mockResolvedValue({});
    serviceMocks.markAllOperationalNotificationsRead.mockResolvedValue({});
  });

  it("merges generic and operational unread counts and navigates deep links", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<NotificationBell />} />
          <Route path="/bp/franchises/:id" element={<div>Franchise destination</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Notifications (5 unread)")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Notifications (5 unread)"));
    expect(await screen.findByText("Critical ops")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Critical ops"));

    await waitFor(() => {
      expect(serviceMocks.markOperationalNotificationRead).toHaveBeenCalledWith("o-1");
    });

    expect(await screen.findByText("Franchise destination")).toBeInTheDocument();
  });

  it("skips operational notification requests for non-BP roles", async () => {
    authMocks.useAuth.mockReturnValue({
      accessToken: "token",
      isAuthenticated: true,
      mustChangePassword: false,
      refreshSession: vi.fn().mockResolvedValue(undefined),
      authBootstrapPending: false,
      role: "CENTER"
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<NotificationBell />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Notifications (2 unread)")).toBeInTheDocument();
    });

    expect(serviceMocks.getOperationalUnreadCounts).not.toHaveBeenCalled();
    expect(serviceMocks.getOperationalNotifications).not.toHaveBeenCalled();
  });
});