import { beforeEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.fn();
const apiPatch = vi.fn();

vi.mock("../../../../services/apiClient", () => ({
  apiClient: {
    get: apiGet,
    patch: apiPatch
  }
}));

describe("operational notification api client", () => {
  beforeEach(async () => {
    apiGet.mockReset();
    apiPatch.mockReset();
    const module = await import("../operationalNotificationService");
    module.clearOperationalNotificationClientCache();
  });

  it("normalizes list params and empty payloads", async () => {
    apiGet.mockResolvedValue({ data: { data: null } });

    const { getOperationalNotifications } = await import("../operationalNotificationService");
    const response = await getOperationalNotifications({
      limit: "bad",
      offset: -10,
      severity: " warning ",
      category: " operations ",
      unread: true,
      sortBy: "sideways",
      sortOrder: "sideways"
    });

    expect(apiGet).toHaveBeenCalledWith(
      "/partner/notifications/operational",
      expect.objectContaining({
        params: {
          limit: 20,
          offset: 0,
          unread: "true",
          severity: "WARNING",
          category: "OPERATIONS",
          sortBy: "lastTriggeredAt",
          sortOrder: "desc"
        }
      })
    );
    expect(response.items).toEqual([]);
    expect(response.total).toBe(0);
    expect(response.unreadCount).toBe(0);
  });

  it("normalizes unread count payloads and clears cache after read operations", async () => {
    apiGet.mockResolvedValueOnce({
      data: {
        data: {
          totalUnread: 3,
          criticalUnread: 1,
          highUnread: 1,
          grouped: {
            bySeverity: { CRITICAL: 1 },
            byCategory: { OPERATIONS: 3 }
          }
        }
      }
    });
    apiGet.mockResolvedValueOnce({
      data: {
        data: {
          totalUnread: 1,
          criticalUnread: 0,
          highUnread: 1,
          grouped: {
            bySeverity: { HIGH: 1 },
            byCategory: { OPERATIONS: 1 }
          }
        }
      }
    });
    apiPatch.mockResolvedValue({ data: { data: { updatedCount: 2 } } });

    const {
      getOperationalUnreadCounts,
      markAllOperationalNotificationsRead
    } = await import("../operationalNotificationService");

    const counts = await getOperationalUnreadCounts();
    expect(counts.totalUnread).toBe(3);
    expect(counts.grouped.byCategory.OPERATIONS).toBe(3);

    await markAllOperationalNotificationsRead({ severity: "HIGH" });
    expect(apiPatch).toHaveBeenCalledWith(
      "/partner/notifications/operational/read-all",
      null,
      expect.objectContaining({
        params: expect.objectContaining({ severity: "HIGH" })
      })
    );

    const refreshedCounts = await getOperationalUnreadCounts();
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(refreshedCounts.totalUnread).toBe(1);
  });
});