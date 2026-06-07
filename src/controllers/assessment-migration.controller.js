import { asyncHandler } from "../utils/async-handler.js";
import { runAssessmentBackfill } from "../services/assessment-backfill.service.js";
import { runAssessmentParity } from "../services/assessment-parity.service.js";
import { listAssessmentMigrationLogs } from "../repositories/assessment-migration-log.repository.js";

function resolveTenantId(req) {
  return req.body?.tenantId || req.query?.tenantId || req.auth?.tenantId || null;
}

function resolveRequestInput(req) {
  return req.method === "GET" ? req.query || {} : req.body || {};
}

const handleRunAssessmentBackfill = asyncHandler(async (req, res) => {
  const input = resolveRequestInput(req);
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return res.apiError(400, "tenantId is required", "ASSESSMENT_MIGRATION_TENANT_REQUIRED");
  }

  const result = await runAssessmentBackfill({
    tenantId,
    sourceSystem: input.sourceSystem || null,
    sourceEntityId: input.sourceEntityId || null,
    limit: Number(input.limit || 100),
    actorUserId: req.auth?.userId || null
  });

  return res.apiSuccess("Assessment backfill completed", result);
});

const handleRunAssessmentParity = asyncHandler(async (req, res) => {
  const input = resolveRequestInput(req);
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return res.apiError(400, "tenantId is required", "ASSESSMENT_MIGRATION_TENANT_REQUIRED");
  }

  const result = await runAssessmentParity({
    tenantId,
    sourceSystem: input.sourceSystem || null,
    sourceEntityId: input.sourceEntityId || null,
    limit: Number(input.limit || 100),
    actorUserId: req.auth?.userId || null
  });

  return res.apiSuccess("Assessment parity completed", result);
});

const handleGetAssessmentMigrationStatus = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return res.apiError(400, "tenantId is required", "ASSESSMENT_MIGRATION_TENANT_REQUIRED");
  }

  const logs = await listAssessmentMigrationLogs(
    {
      tenantId,
      logType: req.query?.logType || undefined,
      status: req.query?.status || undefined,
      sourceSystem: req.query?.sourceSystem || undefined,
      sourceEntityId: req.query?.sourceEntityId || undefined,
      take: Number(req.query?.take || 50)
    }
  );

  return res.apiSuccess("Assessment migration status fetched", {
    tenantId,
    total: logs.length,
    logs
  });
});

export {
  handleRunAssessmentBackfill,
  handleRunAssessmentParity,
  handleGetAssessmentMigrationStatus
};
