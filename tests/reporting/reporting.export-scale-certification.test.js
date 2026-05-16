import {
  authHeader,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";
import { getReportDocument } from "../../src/services/reporting.service.js";
import {
  leaseNextExportJob,
  prepareQueuedExportJob
} from "../../src/services/report-export-job.service.js";
import { runReportExportWorkerPass } from "../../src/services/report-export-runner.service.js";
import { deleteReportArtifactFile } from "../../src/services/report-export.service.js";

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
    lockKey: `lease:${tenantId}:${reportKey}:${format}:${randomId("lock")}`,
    auth: context.auth,
    executionContext: context,
    filters: query,
    reportFactory: () => getReportDocument(context)
  });
}

async function drainJobs(jobIds = [], attempts = 16) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await runReportExportWorkerPass({ limit: 4 });
    const jobs = await prisma.reportExportJob.findMany({
      where: { id: { in: jobIds } },
      select: { id: true, status: true }
    });

    if (jobs.length === jobIds.length && jobs.every((job) => ["COMPLETED", "FAILED"].includes(job.status))) {
      return jobs;
    }

    await new Promise((resolve) => setTimeout(resolve, 75));
  }

  return prisma.reportExportJob.findMany({
    where: { id: { in: jobIds } },
    select: { id: true, status: true }
  });
}

describe("REPORT EXPORT SCALE CERTIFICATION", () => {
  let superadminToken;
  let defaultTenant;

  beforeAll(async () => {
    const superadminLogin = await loginAs({ email: "superadmin@abacusweb.local" });
    superadminToken = superadminLogin.body.data.access_token;
    defaultTenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
  }, 30000);

  test("lease selection prefers tenants without active processing to reduce starvation", async () => {
    const foreignTenant = await prisma.tenant.create({
      data: {
        name: `Lease Fairness ${randomId("tenant")}`,
        code: `LF${Date.now().toString().slice(-6)}`
      }
    });

    const primaryQueued = await queueScopedExportJob({ tenantId: defaultTenant.id, reportKey: "governance-audit" });
    const sameTenantQueued = await queueScopedExportJob({ tenantId: defaultTenant.id, reportKey: "workflow-lifecycle" });
    const foreignQueued = await queueScopedExportJob({ tenantId: foreignTenant.id, reportKey: "governance-audit" });

    await prisma.reportExportJob.update({
      where: { id: primaryQueued.job.id },
      data: {
        status: "PROCESSING",
        startedAt: new Date(),
        leaseOwner: "busy-default-worker",
        leaseExpiresAt: new Date(Date.now() + 60 * 1000),
        lastHeartbeatAt: new Date()
      }
    });

    const leased = await leaseNextExportJob({ workerId: "fairness-test-worker" });

    expect(leased).toBeTruthy();
    expect(leased.id).not.toBe(sameTenantQueued.job.id);
    expect(leased.tenantId).toBe(foreignQueued.job.tenantId);
  }, 60000);

  test("certification scenarios complete and produce deterministic certification reports", async () => {
    const runResponse = await http
      .post("/api/reports/exports/operations/certification/scenarios/retry-storm/run")
      .set(authHeader(superadminToken))
      .send({ executeNow: false });

    expect(runResponse.status).toBe(202);
    expect(runResponse.body.data.runId).toBeTruthy();
    expect(runResponse.body.data.queuedCount).toBeGreaterThan(0);

    const jobIds = runResponse.body.data.items.map((job) => job.id);
    const drainedJobs = await drainJobs(jobIds);
    expect(drainedJobs.every((job) => job.status === "COMPLETED")).toBe(true);

    const reportResponse = await http
      .get(`/api/reports/exports/operations/certification/report?runId=${runResponse.body.data.runId}&windowHours=24`)
      .set(authHeader(superadminToken));

    expect(reportResponse.status).toBe(200);
    expect(Array.isArray(reportResponse.body.data.runs)).toBe(true);
    expect(reportResponse.body.data.runs[0].evaluation.checks.recoverySafe).toBe(true);
    expect(Array.isArray(reportResponse.body.data.charts.throughput)).toBe(true);
  }, 60000);

  test("reconciliation dry run surfaces missing artifact files", async () => {
    const exportResponse = await http
      .get(`/api/reports/exports/excel/governance-audit?reconcileProbe=${Date.now()}`)
      .set(authHeader(superadminToken));

    expect([200, 202]).toContain(exportResponse.status);

    const jobId = exportResponse.body.data.job.id;
    const drainedJobs = await drainJobs([jobId], 10);
    expect(drainedJobs[0].status).toBe("COMPLETED");

    const artifact = await prisma.reportExportArtifact.findUniqueOrThrow({
      where: { jobId }
    });
    await deleteReportArtifactFile(artifact.filePath);

    const reconcileResponse = await http
      .post("/api/reports/exports/operations/recovery/reconcile")
      .set(authHeader(superadminToken))
      .send({ dryRun: true, limit: 10 });

    expect(reconcileResponse.status).toBe(200);
    expect(Array.isArray(reconcileResponse.body.data.missingArtifactFiles)).toBe(true);
    expect(reconcileResponse.body.data.missingArtifactFiles.some((entry) => entry.jobId === jobId)).toBe(true);
  }, 60000);
});