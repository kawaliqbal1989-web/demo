import { jest } from "@jest/globals";
import { listSnapshotDatesInRange, runSnapshotBackfill } from "../../src/services/snapshot-backfill.service.js";

describe("snapshot-backfill.service", () => {
  test("listSnapshotDatesInRange includes all dates inclusively", () => {
    const dates = listSnapshotDatesInRange("2026-05-01", "2026-05-03");
    expect(dates).toHaveLength(3);
    expect(dates[0].toISOString().slice(0, 10)).toBe("2026-05-01");
    expect(dates[2].toISOString().slice(0, 10)).toBe("2026-05-03");
  });

  test("runSnapshotBackfill supports resumeFromDate and progress through failures", async () => {
    const runner = jest
      .fn()
      .mockResolvedValueOnce({ snapshotDate: "2026-05-02T00:00:00.000Z" })
      .mockRejectedValueOnce(new Error("boom"));

    const result = await runSnapshotBackfill({
      fromDate: "2026-05-01",
      toDate: "2026-05-03",
      resumeFromDate: "2026-05-02",
      runner,
      loggerOverride: { info: jest.fn(), error: jest.fn() }
    });

    expect(runner).toHaveBeenCalledTimes(2);
    expect(result.processedDates).toBe(1);
    expect(result.failedDates).toBe(1);
    expect(result.failures[0].snapshotDate.startsWith("2026-05-03")).toBe(true);
  });
});