import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import {
  aggregateFranchiseSnapshotRows,
  listBusinessPartnerFranchises,
  normalizeSnapshotDate,
  upsertFranchiseSnapshots
} from "../services/analytics-snapshot.service.js";

async function runFranchiseSnapshotJob({
  tenantId,
  businessPartnerId,
  snapshotDate,
  franchiseIds,
  tx = prisma,
  dependencies = {}
} = {}) {
  const normalizedDate = normalizeSnapshotDate(snapshotDate);
  const loadFranchises = dependencies.listBusinessPartnerFranchises || listBusinessPartnerFranchises;
  const aggregateFranchises = dependencies.aggregateFranchiseSnapshotRows || aggregateFranchiseSnapshotRows;
  const persistSnapshots = dependencies.upsertFranchiseSnapshots || upsertFranchiseSnapshots;
  const log = dependencies.logger || logger;

  if (Array.isArray(franchiseIds) && franchiseIds.length === 0) {
    return {
      snapshotDate: normalizedDate.toISOString(),
      businessPartnerId,
      processedFranchises: 0,
      upsertedCount: 0,
      skipped: true,
      reason: "no_franchises_selected"
    };
  }

  const franchises = await loadFranchises({ tenantId, businessPartnerId, franchiseIds, tx });
  if (!franchises.length) {
    return {
      snapshotDate: normalizedDate.toISOString(),
      businessPartnerId,
      processedFranchises: 0,
      upsertedCount: 0,
      skipped: true,
      reason: "no_franchises"
    };
  }

  const rows = await aggregateFranchises({
    tenantId,
    businessPartnerId,
    franchiseIds: franchises.map((franchise) => franchise.id),
    snapshotDate: normalizedDate,
    tx
  });
  const persisted = await persistSnapshots({ snapshotDate: normalizedDate, rows, tx });

  const result = {
    snapshotDate: normalizedDate.toISOString(),
    businessPartnerId,
    processedFranchises: rows.length,
    upsertedCount: persisted.upsertedCount,
    affectedFranchiseIds: rows.map((row) => row.franchiseId),
    skipped: false
  };

  log.info("franchise_snapshot_job_completed", result);
  return result;
}

export { runFranchiseSnapshotJob };