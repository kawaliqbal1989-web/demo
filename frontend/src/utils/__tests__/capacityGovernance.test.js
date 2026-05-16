import { describe, expect, it } from "vitest";
import {
  buildCapacityLimitMessage,
  deriveCapacityMetricStatus,
  deriveCenterCapacityStatus,
  formatCapacityUsage,
  shouldDisableCapacityAction
} from "../capacityGovernance";

describe("capacityGovernance", () => {
  it("maps thresholds into healthy, warning, critical, and locked statuses", () => {
    expect(deriveCapacityMetricStatus({ configured: true, used: 7, limit: 10, utilizationPercent: 70 }).key).toBe("healthy");
    expect(deriveCapacityMetricStatus({ configured: true, used: 8, limit: 10, utilizationPercent: 80 }).key).toBe("warning");
    expect(deriveCapacityMetricStatus({ configured: true, used: 9.5, limit: 10, utilizationPercent: 95 }).key).toBe("critical");
    expect(deriveCapacityMetricStatus({ configured: true, used: 10, limit: 10, utilizationPercent: 100 }).key).toBe("locked");
  });

  it("chooses the highest severity across student and teacher usage", () => {
    const snapshot = {
      usage: {
        students: { configured: true, used: 19, limit: 20, utilizationPercent: 95, remaining: 1 },
        teachers: { configured: true, used: 4, limit: 8, utilizationPercent: 50, remaining: 4 }
      }
    };

    expect(deriveCenterCapacityStatus(snapshot).key).toBe("critical");
  });

  it("disables center actions only when a configured limit is reached", () => {
    const snapshot = {
      usage: {
        students: { configured: true, used: 12, limit: 12, utilizationPercent: 100, remaining: 0 },
        teachers: { configured: true, used: 2, limit: 6, utilizationPercent: 33.3, remaining: 4 }
      }
    };

    expect(shouldDisableCapacityAction(snapshot, "students")).toBe(true);
    expect(shouldDisableCapacityAction(snapshot, "teachers")).toBe(false);
  });

  it("formats usage and governance-safe messages from API-backed metrics", () => {
    const metric = {
      configured: true,
      used: 15,
      limit: 15,
      utilizationPercent: 100,
      remaining: 0
    };

    expect(formatCapacityUsage(metric)).toBe("15 / 15");
    expect(buildCapacityLimitMessage(metric, "Student")).toContain("request more seats");
  });
});