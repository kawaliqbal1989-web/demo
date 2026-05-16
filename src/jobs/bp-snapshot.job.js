import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import {
  aggregateBusinessPartnerSnapshot,
  normalizeSnapshotDate,
  upsertBusinessPartnerSnapshot
} from "../services/analytics-snapshot.service.js";
import { invalidateBpDashboardCache } from "../services/snapshot-cache.service.js";

async function runBusinessPartnerSnapshotJob({
  tenantId,
  businessPartnerId,
  snapshotDate,
  tx = prisma,
  dependencies = {}
} = {}) {
  const normalizedDate = normalizeSnapshotDate(snapshotDate);
  const aggregateBusinessPartner = dependencies.aggregateBusinessPartnerSnapshot || aggregateBusinessPartnerSnapshot;
  const persistSnapshot = dependencies.upsertBusinessPartnerSnapshot || upsertBusinessPartnerSnapshot;
  const invalidateCache = dependencies.invalidateBpDashboardCache || invalidateBpDashboardCache;
  const log = dependencies.logger || logger;

  const row = await aggregateBusinessPartner({
    tenantId,
    businessPartnerId,
    snapshotDate: normalizedDate,
    tx
  });
  const persisted = await persistSnapshot({ snapshotDate: normalizedDate, row, tx });
  const invalidation = invalidateCache({ tenantId, businessPartnerId });

  const result = {
    snapshotDate: normalizedDate.toISOString(),
    businessPartnerId,
    upsertedCount: persisted.upsertedCount,
    cacheInvalidation: invalidation,
    skipped: false
  };

  log.info("bp_snapshot_job_completed", result);
  return result;
}

export { runBusinessPartnerSnapshotJob };