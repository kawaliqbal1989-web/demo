import {
  batchStatusToIsActive,
  calculateOccupancy,
  parseBatchCatalogQuery
} from "../../src/utils/batch-catalog-query.js";
import {
  hasScheduleOverlap,
  summarizeScheduleSlots
} from "../../src/services/batch-schedule.service.js";

describe("BATCH PHASE 1 utilities", () => {
  test("parseBatchCatalogQuery supports legacy and new pagination inputs", () => {
    const parsed = parseBatchCatalogQuery({
      page: "3",
      pageSize: "25",
      q: "online",
      status: "INACTIVE"
    });

    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(25);
    expect(parsed.offset).toBe(50);
    expect(parsed.q).toBe("online");
    expect(parsed.statuses).toEqual(["PAUSED"]);
  });

  test("parseBatchCatalogQuery supports filters and caps page size", () => {
    const parsed = parseBatchCatalogQuery({
      limit: "999",
      statuses: ["ACTIVE", "ARCHIVED"],
      modality: "online",
      teacherId: "teacher_1",
      levelId: "level_1",
      sortBy: "teacherName",
      sortDir: "asc",
      weekendOnly: "true",
      fullOnly: "1"
    });

    expect(parsed.limit).toBe(100);
    expect(parsed.pageSize).toBe(100);
    expect(parsed.includeArchived).toBe(true);
    expect(parsed.modality).toBe("ONLINE");
    expect(parsed.teacherId).toBe("teacher_1");
    expect(parsed.levelId).toBe("level_1");
    expect(parsed.sortBy).toBe("teacherName");
    expect(parsed.sortDir).toBe("asc");
    expect(parsed.dayType).toBe("WEEKEND");
    expect(parsed.fullOnly).toBe(true);
  });

  test("summarizeScheduleSlots returns a stable human-readable schedule", () => {
    const summary = summarizeScheduleSlots([
      { dayOfWeek: 2, startTime: "19:00", endTime: "20:00" },
      { dayOfWeek: 5, startTime: 600, endTime: 720 }
    ]);

    expect(summary).toBe("Tue 7:00 PM-8:00 PM | Fri 10:00 AM-12:00 PM");
  });

  test("hasScheduleOverlap detects conflicting slots", () => {
    expect(hasScheduleOverlap(
      { dayOfWeek: 2, startTime: 1140, endTime: 1200 },
      { dayOfWeek: 2, startTime: 1170, endTime: 1230 }
    )).toBe(true);

    expect(hasScheduleOverlap(
      { dayOfWeek: 2, startTime: 1140, endTime: 1200 },
      { dayOfWeek: 3, startTime: 1170, endTime: 1230 }
    )).toBe(false);
  });

  test("occupancy and active-status helpers are deterministic", () => {
    expect(calculateOccupancy(20, 18)).toBe(90);
    expect(calculateOccupancy(null, 18)).toBeNull();
    expect(batchStatusToIsActive("ACTIVE")).toBe(true);
    expect(batchStatusToIsActive("TRIAL")).toBe(true);
    expect(batchStatusToIsActive("PAUSED")).toBe(false);
    expect(batchStatusToIsActive("ARCHIVED")).toBe(false);
  });
});