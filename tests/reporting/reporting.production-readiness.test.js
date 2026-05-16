import {
  authHeader,
  ensureAuthUser,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";
import { getReportDocument } from "../../src/services/reporting.service.js";
import { prepareQueuedExportJob } from "../../src/services/report-export-job.service.js";

function buildSuperadminContext(tenantId, reportKey, query = {}) {
  return {
    reportKey,
    auth: {
      tenantId,
      userId: null,
      role: "SUPERADMIN",
      hierarchyNodeId: null,
      studentId: null
    },
    query,
    bpScope: null,
    franchiseScope: null,
    student: null,
    parent: null
  };
}

async function queueScopedExportJob({ tenantId, reportKey = "governance-audit", format = "XLSX", query = {} }) {
  const context = buildSuperadminContext(tenantId, reportKey, query);
  return prepareQueuedExportJob({
    tenantId,
    reportKey,
    format,
    requestFingerprint: `${tenantId}:${reportKey}:${format}:${randomId("fp")}`,
    lockKey: `prod:${tenantId}:${reportKey}:${format}:${randomId("lock")}`,
    auth: context.auth,
    executionContext: context,
    filters: query,
    reportFactory: () => getReportDocument(context)
  });
}

async function completeDeploymentRelease(token, versionTag) {
  const stageResponse = await http
    .post("/api/reports/exports/operations/production/deployments/stage")
    .set(authHeader(token))
    .send({
      environment: "production",
      versionTag,
      buildId: `build-${randomId("prod")}`,
      commitSha: `sha-${randomId("commit")}`,
      rollbackVersionTag: `${versionTag}-rollback`
    });

  expect(stageResponse.status).toBe(201);
  const releaseId = stageResponse.body.data.releaseId;

  for (const checkpoint of ["PRECHECKS_PASSED", "ROLLOUT_STARTED", "ROLLOUT_VERIFIED", "COMPLETED"]) {
    const response = await http
      .post(`/api/reports/exports/operations/production/deployments/${releaseId}/advance`)
      .set(authHeader(token))
      .send({ checkpoint });

    expect(response.status).toBe(200);
  }

  return releaseId;
}

describe("REPORT EXPORT PRODUCTION READINESS", () => {
  let superadminToken;
  let defaultTenant;

  beforeAll(async () => {
    const superadminLogin = await loginAs({ email: "superadmin@abacusweb.local" });
    superadminToken = superadminLogin.body.data.access_token;
    defaultTenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
  }, 30000);

  test("deployment governance tracks stage, advance, rollback, and readiness metadata deterministically", async () => {
    const versionTag = `v10-${Date.now()}`;
    const releaseId = await completeDeploymentRelease(superadminToken, versionTag);

    const rollbackResponse = await http
      .post(`/api/reports/exports/operations/production/deployments/${releaseId}/rollback`)
      .set(authHeader(superadminToken))
      .send({
        rollbackVersionTag: `${versionTag}-rollback`,
        rollbackReason: "test_rollback"
      });

    expect(rollbackResponse.status).toBe(200);
    expect(rollbackResponse.body.data.currentCheckpoint).toBe("ROLLED_BACK");
    expect(Array.isArray(rollbackResponse.body.data.history)).toBe(true);
    expect(rollbackResponse.body.data.history.some((entry) => entry.action === "DEPLOYMENT_RELEASE_COMPLETED")).toBe(true);
    expect(rollbackResponse.body.data.history.some((entry) => entry.action === "DEPLOYMENT_RELEASE_ROLLED_BACK")).toBe(true);

    const dashboardResponse = await http
      .get("/api/reports/exports/operations/production/dashboard?windowHours=72")
      .set(authHeader(superadminToken));

    expect(dashboardResponse.status).toBe(200);
    expect(dashboardResponse.body.data.deployments.recent.some((item) => item.releaseId === releaseId)).toBe(true);
  }, 60000);

  test("backup metadata and restore validation remain deterministic and integrity-aware", async () => {
    const snapshotLabel = `nightly-${randomId("snapshot")}`;
    const recordResponse = await http
      .post("/api/reports/exports/operations/production/backups/record")
      .set(authHeader(superadminToken))
      .send({
        environment: "production",
        snapshotLabel,
        retentionDays: 14,
        database: {
          snapshotReference: `db-${randomId("ref")}`,
          checksum: `sha256-${randomId("sum")}`
        },
        includeArtifacts: true
      });

    expect(recordResponse.status).toBe(201);
    expect(recordResponse.body.data.integrity.passed).toBe(true);

    const validateResponse = await http
      .post("/api/reports/exports/operations/production/backups/restore/validate")
      .set(authHeader(superadminToken))
      .send({
        backupId: recordResponse.body.data.backupId,
        dryRun: true
      });

    expect(validateResponse.status).toBe(200);
    expect(validateResponse.body.data.restoreValidation.passed).toBe(true);
    expect(validateResponse.body.data.restoreValidation.score).toBeGreaterThan(0);
  }, 60000);

  test("recovery drill and failover certification surface deterministic continuity posture", async () => {
    await completeDeploymentRelease(superadminToken, `v10-failover-${Date.now()}`);

    const prepared = await queueScopedExportJob({
      tenantId: defaultTenant.id,
      reportKey: "governance-audit",
      query: { failoverProbe: Date.now() }
    });

    await prisma.reportExportJob.update({
      where: { id: prepared.job.id },
      data: {
        status: "PROCESSING",
        startedAt: new Date(Date.now() - 5 * 60 * 1000),
        leaseOwner: "production-readiness-test-worker",
        leaseExpiresAt: new Date(Date.now() - 60 * 1000),
        lastHeartbeatAt: new Date(Date.now() - 5 * 60 * 1000),
        checkpointState: {
          ...(prepared.job.checkpointState || {}),
          lastPhase: "GENERATING_ARTIFACT"
        }
      }
    });

    const drillResponse = await http
      .post("/api/reports/exports/operations/production/recovery/drill")
      .set(authHeader(superadminToken))
      .send({ dryRun: false, executeWorkerPass: false, executeCleanup: false });

    expect(drillResponse.status).toBe(202);
    expect(drillResponse.body.data.staleJobsDetected).toBeGreaterThan(0);
    expect(drillResponse.body.data.staleJobsRecovered).toBeGreaterThan(0);
    expect(drillResponse.body.data.continuityScore).toBeGreaterThanOrEqual(0);

    const failoverResponse = await http
      .post("/api/reports/exports/operations/production/failover/certify")
      .set(authHeader(superadminToken))
      .send({ dryRun: true });

    expect(failoverResponse.status).toBe(200);
    expect(typeof failoverResponse.body.data.rollbackReady).toBe("boolean");
    expect(failoverResponse.body.data.continuityScore).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(failoverResponse.body.data.recommendations)).toBe(true);
  }, 60000);

  test("production governance endpoints remain superadmin-scoped", async () => {
    const email = `${randomId("bp") }@abacusweb.local`;
    await ensureAuthUser({
      tenantCode: "DEFAULT",
      email,
      username: randomId("bpuser"),
      role: "BP"
    });

    const bpLogin = await loginAs({ email });
    const bpToken = bpLogin.body.data.access_token;

    const response = await http
      .get("/api/reports/exports/operations/production/dashboard")
      .set(authHeader(bpToken));

    expect(response.status).toBe(403);
  }, 60000);
});