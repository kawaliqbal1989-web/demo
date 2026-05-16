import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import {
  aggregateCenterSnapshotRows,
  detectChangedCenterIds,
  listBusinessPartnerCenters,
  normalizeSnapshotDate,
  upsertCenterSnapshots
} from "../services/analytics-snapshot.service.js";

async function runCenterSnapshotJob({
  tenantId,
  businessPartnerId,
  snapshotDate,
  centerIds,
  incremental = true,
  forceFullRebuild = false,
  tx = prisma,
  dependencies = {}
} = {}) {
  const normalizedDate = normalizeSnapshotDate(snapshotDate);
  const loadCenters = dependencies.listBusinessPartnerCenters || listBusinessPartnerCenters;
  const detectChanges = dependencies.detectChangedCenterIds || detectChangedCenterIds;
  const aggregateCenters = dependencies.aggregateCenterSnapshotRows || aggregateCenterSnapshotRows;
  const persistSnapshots = dependencies.upsertCenterSnapshots || upsertCenterSnapshots;
  const log = dependencies.logger || logger;

  const centers = await loadCenters({ tenantId, businessPartnerId, centerIds, tx });
  if (!centers.length) {
    return {
      snapshotDate: normalizedDate.toISOString(),
      businessPartnerId,
      processedCenters: 0,
      upsertedCount: 0,
      affectedCenterIds: [],
      affectedFranchiseIds: [],
      skipped: true,
      reason: "no_centers"
    };
  }

  const changedCenterIds = forceFullRebuild || !incremental
    ? centers.map((center) => center.id)
    : await detectChanges({ tenantId, businessPartnerId, snapshotDate: normalizedDate, centers, tx });

  const selectedCenterIds = new Set(changedCenterIds);
  const targetCenters = centers.filter((center) => selectedCenterIds.has(center.id));

  if (!targetCenters.length) {
    return {
      snapshotDate: normalizedDate.toISOString(),
      businessPartnerId,
      processedCenters: 0,
      upsertedCount: 0,
      affectedCenterIds: [],
      affectedFranchiseIds: [],
      skipped: true,
      reason: "no_incremental_changes"
    };
  }

  const rows = await aggregateCenters({
    tenantId,
    businessPartnerId,
    centers: targetCenters,
    snapshotDate: normalizedDate,
    tx
  });
  const persisted = await persistSnapshots({ snapshotDate: normalizedDate, rows, tx });

  const result = {
    snapshotDate: normalizedDate.toISOString(),
    businessPartnerId,
    processedCenters: rows.length,
    upsertedCount: persisted.upsertedCount,
    affectedCenterIds: rows.map((row) => row.centerId),
    affectedFranchiseIds: Array.from(new Set(rows.map((row) => row.franchiseId))),
    skipped: false,
    incremental: !forceFullRebuild && incremental
  };

  log.info("center_snapshot_job_completed", result);
  return result;
}

export { runCenterSnapshotJob };