import { logger } from "../lib/logger.js";
import { addUtcDays, normalizeSnapshotDate } from "./analytics-snapshot.service.js";
import { runAnalyticsSnapshotPipeline } from "./analytics-job-runner.service.js";

function listSnapshotDatesInRange(fromDate, toDate) {
  const normalizedFrom = normalizeSnapshotDate(fromDate);
  const normalizedTo = normalizeSnapshotDate(toDate);
  const dates = [];

  for (let cursor = normalizedFrom; cursor <= normalizedTo; cursor = addUtcDays(cursor, 1)) {
    dates.push(cursor);
  }

  return dates;
}

async function runSnapshotBackfill({
  fromDate,
  toDate,
  tenantId,
  businessPartnerId,
  resumeFromDate,
  forceFullRebuild = true,
  runner = runAnalyticsSnapshotPipeline,
  loggerOverride = logger
} = {}) {
  const dates = listSnapshotDatesInRange(fromDate, toDate).filter(
    (date) => !resumeFromDate || date >= normalizeSnapshotDate(resumeFromDate)
  );

  const results = [];
  const failures = [];

  loggerOverride.info("snapshot_backfill_started", {
    fromDate: normalizeSnapshotDate(fromDate).toISOString(),
    toDate: normalizeSnapshotDate(toDate).toISOString(),
    resumeFromDate: resumeFromDate ? normalizeSnapshotDate(resumeFromDate).toISOString() : null,
    datesScheduled: dates.length,
    tenantId: tenantId || null,
    businessPartnerId: businessPartnerId || null
  });

  for (const date of dates) {
    try {
      const result = await runner({
        snapshotDate: date,
        tenantId,
        businessPartnerId,
        forceFullRebuild,
        incremental: !forceFullRebuild
      });
      results.push(result);
      loggerOverride.info("snapshot_backfill_progress", {
        snapshotDate: date.toISOString(),
        completed: results.length,
        remaining: dates.length - results.length,
        failures: failures.length
      });
    } catch (error) {
      const failure = {
        snapshotDate: date.toISOString(),
        error: error.message
      };
      failures.push(failure);
      loggerOverride.error("snapshot_backfill_failed", failure);
    }
  }

  const summary = {
    fromDate: normalizeSnapshotDate(fromDate).toISOString(),
    toDate: normalizeSnapshotDate(toDate).toISOString(),
    processedDates: results.length,
    failedDates: failures.length,
    failures,
    results
  };

  loggerOverride.info("snapshot_backfill_completed", {
    processedDates: summary.processedDates,
    failedDates: summary.failedDates
  });
  return summary;
}

export { listSnapshotDatesInRange, runSnapshotBackfill };