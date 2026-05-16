import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  clearOperationalNotificationClientCache: vi.fn(),
  getOperationalNotifications: vi.fn(),
  getOperationalUnreadCounts: vi.fn()
}));

function stableSerializeValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeValue(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}:${stableSerializeValue(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}

function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

vi.mock("../../services/operationalNotificationService", () => ({
  clearOperationalNotificationClientCache: apiMocks.clearOperationalNotificationClientCache,
  getOperationalNotifications: apiMocks.getOperationalNotifications,
  getOperationalUnreadCounts: apiMocks.getOperationalUnreadCounts,
  stableSerializeValue
}));

import { useOperationalNotifications } from "../useOperationalNotifications";
import { useOperationalUnreadCounts } from "../useOperationalUnreadCounts";

describe("operational notification hooks", () => {
  beforeEach(() => {
    apiMocks.clearOperationalNotificationClientCache.mockReset();
    apiMocks.getOperationalNotifications.mockReset();
    apiMocks.getOperationalUnreadCounts.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears stale operational list data when filters change", async () => {
    const secondRequest = createDeferred();
    apiMocks.getOperationalNotifications
      .mockResolvedValueOnce({ page: 1, limit: 20, offset: 0, total: 1, unreadCount: 1, items: [{ notificationId: "n-1", title: "First" }] })
      .mockReturnValueOnce(secondRequest.promise);

    const { result, rerender } = renderHook(
      ({ filters }) => useOperationalNotifications(filters),
      { initialProps: { filters: { severity: "CRITICAL" } } }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);

    rerender({ filters: { severity: "WARNING" } });

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    expect(result.current.items).toEqual([]);

    await act(async () => {
      secondRequest.resolve({ page: 1, limit: 20, offset: 0, total: 1, unreadCount: 1, items: [{ notificationId: "n-2", title: "Second" }] });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items[0].notificationId).toBe("n-2");
  });

  it("polls unread counts and supports manual refresh", async () => {
    vi.useFakeTimers();

    apiMocks.getOperationalUnreadCounts
      .mockResolvedValueOnce({ totalUnread: 1, criticalUnread: 0, highUnread: 1, grouped: { bySeverity: {}, byCategory: {} } })
      .mockResolvedValueOnce({ totalUnread: 2, criticalUnread: 1, highUnread: 1, grouped: { bySeverity: {}, byCategory: {} } })
      .mockResolvedValueOnce({ totalUnread: 3, criticalUnread: 1, highUnread: 2, grouped: { bySeverity: {}, byCategory: {} } });

    const { result } = renderHook(
      ({ filters }) => useOperationalUnreadCounts(filters, { pollIntervalMs: 5000 }),
      { initialProps: { filters: {} } }
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.counts.totalUnread).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      await Promise.resolve();
    });

    expect(result.current.counts.totalUnread).toBe(2);

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });

    expect(apiMocks.clearOperationalNotificationClientCache).toHaveBeenCalledTimes(1);

    expect(result.current.counts.totalUnread).toBe(3);
  });
});