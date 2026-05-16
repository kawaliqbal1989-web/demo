import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { runBusinessPartnerSnapshotJob } from "../jobs/bp-snapshot.job.js";
import { runCenterSnapshotJob } from "../jobs/center-snapshot.job.js";
import { runFranchiseSnapshotJob } from "../jobs/franchise-snapshot.job.js";
import { addUtcDays, listActiveBusinessPartners, normalizeSnapshotDate, startOfUtcDay } from "./analytics-snapshot.service.js";

const localJobLocks = new Set();
let schedulerState = null;

function buildAnalyticsLockName({ scope, snapshotDate, tenantId, businessPartnerId }) {
  return [scope, normalizeSnapshotDate(snapshotDate).toISOString().slice(0, 10), tenantId || "all-tenants", businessPartnerId || "all-bps"]
    .join(":")
    .slice(0, 64);
}

async function acquireAnalyticsDbLock({ tx = prisma, lockName, timeoutSeconds = 0 }) {
  const rows = await tx.$queryRawUnsafe("SELECT GET_LOCK(?, ?) AS lockState", lockName, timeoutSeconds);
  const row = Array.isArray(rows) ? rows[0] : rows;
  const value = row?.lockState ?? row?.LOCKSTATE ?? Object.values(row || {})[0];
  return Number(value) === 1;
}

async function releaseAnalyticsDbLock({ tx = prisma, lockName }) {
  try {
    await tx.$queryRawUnsafe("SELECT RELEASE_LOCK(?) AS released", lockName);
  } catch {
    return false;
  }
  return true;
}

async function withAnalyticsJobLock({ lockName, tx = prisma, loggerOverride = logger }, work) {
  if (localJobLocks.has(lockName)) {
    return {
      skipped: true,
      reason: "local_lock_active",
      lockName
    };
  }

  localJobLocks.add(lockName);
  const acquired = await acquireAnalyticsDbLock({ tx, lockName, timeoutSeconds: 0 });
  if (!acquired) {
    localJobLocks.delete(lockName);
    loggerOverride.warn("analytics_job_lock_skipped", { lockName });
    return {
      skipped: true,
      reason: "db_lock_not_acquired",
      lockName
    };
  }

  try {
    return await work();
  } finally {
    await releaseAnalyticsDbLock({ tx, lockName });
    localJobLocks.delete(lockName);
  }
}

async function runAnalyticsSnapshotPipeline({
  snapshotDate,
  tenantId,
  businessPartnerId,
  incremental = true,
  forceFullRebuild = false,
  tx = prisma,
  dependencies = {}
} = {}) {
  const normalizedDate = normalizeSnapshotDate(snapshotDate);
  const loadBusinessPartners = dependencies.listActiveBusinessPartners || listActiveBusinessPartners;
  const runCenterJob = dependencies.runCenterSnapshotJob || runCenterSnapshotJob;
  const runFranchiseJob = dependencies.runFranchiseSnapshotJob || runFranchiseSnapshotJob;
  const runBpJob = dependencies.runBusinessPartnerSnapshotJob || runBusinessPartnerSnapshotJob;
  const log = dependencies.logger || logger;

  return withAnalyticsJobLock(
    {
      lockName: buildAnalyticsLockName({
        scope: "analytics_snapshot_pipeline",
        snapshotDate: normalizedDate,
        tenantId,
        businessPartnerId
      }),
      tx,
      loggerOverride: log
    },
    async () => {
      const businessPartners = await loadBusinessPartners({ tenantId, businessPartnerId, tx });
      const summary = {
        snapshotDate: normalizedDate.toISOString(),
        tenantId: tenantId || null,
        businessPartnerId: businessPartnerId || null,
        incremental: !forceFullRebuild && incremental,
        processedBusinessPartners: 0,
        centerSnapshots: 0,
        franchiseSnapshots: 0,
        bpSnapshots: 0,
        failures: []
      };

      for (const partner of businessPartners) {
        try {
          const centerResult = await runCenterJob({
            tenantId: partner.tenantId,
            businessPartnerId: partner.id,
            snapshotDate: normalizedDate,
            incremental,
            forceFullRebuild,
            tx
          });

          if (centerResult?.skipped && !forceFullRebuild) {
            continue;
          }

          const franchiseResult = await runFranchiseJob({
            tenantId: partner.tenantId,
            businessPartnerId: partner.id,
            snapshotDate: normalizedDate,
            franchiseIds: centerResult.affectedFranchiseIds,
            tx
          });
          const bpResult = await runBpJob({
            tenantId: partner.tenantId,
            businessPartnerId: partner.id,
            snapshotDate: normalizedDate,
            tx
          });

          summary.processedBusinessPartners += 1;
          summary.centerSnapshots += centerResult.upsertedCount || 0;
          summary.franchiseSnapshots += franchiseResult.upsertedCount || 0;
          summary.bpSnapshots += bpResult.upsertedCount || 0;
        } catch (error) {
          const failure = {
            businessPartnerId: partner.id,
            tenantId: partner.tenantId,
            error: error.message
          };
          summary.failures.push(failure);
          log.error("analytics_snapshot_pipeline_partner_failed", failure);
        }
      }

      log.info("analytics_snapshot_pipeline_completed", {
        snapshotDate: summary.snapshotDate,
        processedBusinessPartners: summary.processedBusinessPartners,
        centerSnapshots: summary.centerSnapshots,
        franchiseSnapshots: summary.franchiseSnapshots,
        bpSnapshots: summary.bpSnapshots,
        failures: summary.failures.length
      });
      return summary;
    }
  );
}

function getScheduledSnapshotDates(asOf = new Date(), lookbackDays = env.analyticsSchedulerLookbackDays) {
  const normalizedToday = startOfUtcDay(asOf);
  const dates = [];
  for (let offset = Math.max(1, lookbackDays); offset >= 1; offset -= 1) {
    dates.push(addUtcDays(normalizedToday, -offset));
  }
  return dates;
}

function isSchedulerDue(asOf = new Date()) {
  const runHourUtc = env.analyticsSchedulerRunHourUtc;
  const runMinuteUtc = env.analyticsSchedulerRunMinuteUtc;
  const currentHourUtc = asOf.getUTCHours();
  const currentMinuteUtc = asOf.getUTCMinutes();
  return currentHourUtc > runHourUtc || (currentHourUtc === runHourUtc && currentMinuteUtc >= runMinuteUtc);
}

function buildSchedulerWindowKey(asOf = new Date()) {
  return `${startOfUtcDay(asOf).toISOString().slice(0, 10)}:${env.analyticsSchedulerRunHourUtc}:${env.analyticsSchedulerRunMinuteUtc}`;
}

async function runScheduledAnalyticsProcessing({
  asOf = new Date(),
  tenantId,
  businessPartnerId,
  runner = runAnalyticsSnapshotPipeline,
  loggerOverride = logger
} = {}) {
  if (!isSchedulerDue(asOf)) {
    return {
      skipped: true,
      reason: "scheduler_not_due",
      asOf: asOf.toISOString()
    };
  }

  const dates = getScheduledSnapshotDates(asOf, env.analyticsSchedulerLookbackDays);
  const results = [];

  for (const date of dates) {
    results.push(
      await runner({
        snapshotDate: date,
        tenantId,
        businessPartnerId,
        incremental: true,
        forceFullRebuild: false
      })
    );
  }

  loggerOverride.info("analytics_scheduler_completed", {
    asOf: asOf.toISOString(),
    runs: results.length
  });

  return {
    skipped: false,
    asOf: asOf.toISOString(),
    runs: results
  };
}

function startAnalyticsJobScheduler({
  runner = runScheduledAnalyticsProcessing,
  loggerOverride = logger,
  nowProvider = () => new Date()
} = {}) {
  if (!env.analyticsSchedulerEnabled) {
    loggerOverride.info("analytics_scheduler_disabled", {});
    return null;
  }

  if (schedulerState) {
    return schedulerState;
  }

  let running = false;
  let lastWindowKey = null;

  const tick = async () => {
    if (running) {
      return;
    }

    const now = nowProvider();
    const windowKey = buildSchedulerWindowKey(now);
    if (!isSchedulerDue(now) || lastWindowKey === windowKey) {
      return;
    }

    running = true;
    try {
      const result = await runner({ asOf: now, loggerOverride });
      if (!result?.skipped) {
        lastWindowKey = windowKey;
      }
    } catch (error) {
      loggerOverride.error("analytics_scheduler_tick_failed", {
        error: error.message,
        windowKey
      });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, env.analyticsSchedulerPollMs);
  timer.unref?.();

  if (env.analyticsSchedulerRunOnStartup) {
    void tick();
  }

  schedulerState = {
    stop() {
      clearInterval(timer);
      schedulerState = null;
    }
  };

  loggerOverride.info("analytics_scheduler_started", {
    pollMs: env.analyticsSchedulerPollMs,
    runHourUtc: env.analyticsSchedulerRunHourUtc,
    runMinuteUtc: env.analyticsSchedulerRunMinuteUtc,
    lookbackDays: env.analyticsSchedulerLookbackDays
  });

  return schedulerState;
}

export {
  acquireAnalyticsDbLock,
  buildAnalyticsLockName,
  buildSchedulerWindowKey,
  getScheduledSnapshotDates,
  isSchedulerDue,
  releaseAnalyticsDbLock,
  runAnalyticsSnapshotPipeline,
  runScheduledAnalyticsProcessing,
  startAnalyticsJobScheduler,
  withAnalyticsJobLock
};