import ExcelJS from "exceljs";
import {
  authHeader,
  ensureAuthUser,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";
import { runReportExportWorkerPass } from "../../src/services/report-export-runner.service.js";

function binaryParser(res, callback) {
  res.setEncoding("binary");
  let body = "";
  res.on("data", (chunk) => {
    body += chunk;
  });
  res.on("end", () => {
    callback(null, Buffer.from(body, "binary"));
  });
}

async function loadWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

function readSheetRows(sheet) {
  const headers = sheet.getRow(1).values.slice(1).map((value) => String(value || ""));
  const rows = [];

  for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    const values = row.values.slice(1);
    if (!values.some((value) => value !== null && value !== undefined && value !== "")) {
      continue;
    }

    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = values[index] ?? null;
    });
    rows.push(entry);
  }

  return rows;
}

async function completeExportJob({ jobId, token }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await runReportExportWorkerPass({ limit: 2 });
    const statusResponse = await http
      .get(`/api/reports/exports/jobs/${jobId}`)
      .set(authHeader(token));

    if (statusResponse.body?.data?.job?.status === "COMPLETED") {
      return statusResponse.body.data.job;
    }
  }

  throw new Error(`Export job ${jobId} did not complete in time`);
}

describe("REPORT EXPORT RELIABILITY", () => {
  let superadminToken;
  let bpToken;
  let studentToken;
  let tenantDefault;

  beforeAll(async () => {
    const [superadminLogin, bpLogin] = await Promise.all([
      loginAs({ email: "superadmin@abacusweb.local" }),
      loginAs({ email: "bp.manager@abacusweb.local" })
    ]);

    superadminToken = superadminLogin.body.data.access_token;
    bpToken = bpLogin.body.data.access_token;

    tenantDefault = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });

    const defaultSchool = await prisma.hierarchyNode.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: tenantDefault.id,
          code: "SCH-001"
        }
      }
    });

    const level = await prisma.level.findFirstOrThrow({
      where: {
        tenantId: tenantDefault.id,
        rank: 1
      }
    });

    const student = await prisma.student.create({
      data: {
        tenantId: tenantDefault.id,
        admissionNo: `REL-${randomId("student")}`,
        firstName: "Reliable",
        lastName: "Student",
        hierarchyNodeId: defaultSchool.id,
        levelId: level.id,
        guardianName: "Reliable Parent"
      }
    });

    const studentUser = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `${randomId("relstudent")}@abacusweb.local`,
      username: randomId("relstu"),
      role: "STUDENT",
      hierarchyNodeCode: "SCH-001",
      studentId: student.id,
      password: "Pass@123",
      mustChangePassword: false
    });

    await prisma.studentEngagementSnapshot.createMany({
      data: Array.from({ length: 3 }).map((_, index) => ({
        tenantId: tenantDefault.id,
        studentId: student.id,
        hierarchyNodeId: defaultSchool.id,
        snapshotDate: new Date(Date.UTC(2026, 4, 1 + index, 0, 0, 0)),
        sourceWindowKey: `window-${index}`,
        engagementScore: 80 + index,
        consistencyScore: 70 + index,
        streakScore: 60 + index,
        attendanceRate: 90 + index,
        currentPracticeStreak: 3 + index,
        currentAttendanceStreak: 4 + index,
        completedWorksheetCount: 5 + index,
        pendingWorksheetCount: index,
        weakTopicCount: index,
        achievementsCount: 1 + index
      }))
    });

    const studentLogin = await loginAs({ email: studentUser.email, password: "Pass@123" });
    studentToken = studentLogin.body.data.access_token;
  }, 30000);

  test("governance exports are reproducible, append-only, and tenant-isolated under large audit volume", async () => {
    const foreignTenant = await prisma.tenant.create({
      data: {
        name: `Export Foreign ${randomId("tenant")}`,
        code: `RF${Date.now().toString().slice(-6)}`
      }
    });

    const baseTime = Date.UTC(2026, 4, 10, 8, 0, 0);
    await prisma.auditLog.createMany({
      data: Array.from({ length: 650 }).map((_, index) => ({
        tenantId: tenantDefault.id,
        userId: null,
        role: "SUPERADMIN",
        action: `EXPORT_RELIABILITY_${String(index).padStart(4, "0")}`,
        entityType: "REPORT",
        entityId: `entity-${index}`,
        createdAt: new Date(baseTime + index * 1000),
        metadata: { batch: "reliability" }
      }))
    });

    await prisma.auditLog.create({
      data: {
        tenantId: foreignTenant.id,
        userId: null,
        role: "SUPERADMIN",
        action: "FOREIGN_TENANT_EXPORT_PROBE",
        entityType: "REPORT",
        entityId: "foreign-entity",
        metadata: { tenant: "foreign" }
      }
    });

    const firstResponse = await http
      .get("/api/reports/exports/excel/governance-audit")
      .set(authHeader(superadminToken));

    const secondResponse = await http
      .get("/api/reports/exports/excel/governance-audit")
      .set(authHeader(superadminToken));

    expect([200, 202]).toContain(firstResponse.status);
    expect([200, 202]).toContain(secondResponse.status);
    expect(firstResponse.body.data.job.snapshotReferenceId).toBeTruthy();
    expect(firstResponse.body.data.job.id).toBeTruthy();
    expect(firstResponse.body.data.job.integrityDigest).toBeTruthy();
    expect(firstResponse.body.data.job.snapshotReferenceId).toBe(secondResponse.body.data.job.snapshotReferenceId);
    expect(firstResponse.body.data.job.integrityDigest).toBe(secondResponse.body.data.job.integrityDigest);

    const completedJob = await completeExportJob({
      jobId: firstResponse.body.data.job.id,
      token: superadminToken
    });

    const downloadResponse = await http
      .get(`/api/reports/exports/jobs/${completedJob.id}/download`)
      .set(authHeader(superadminToken))
      .buffer(true)
      .parse(binaryParser);

    expect(downloadResponse.status).toBe(200);

    const workbook = await loadWorkbook(downloadResponse.body);
    const auditSheet = workbook.getWorksheet("Audit Append Only Chain");
    expect(auditSheet).toBeTruthy();

    const auditRows = readSheetRows(auditSheet);
    expect(auditRows.length).toBeGreaterThan(600);
    expect(auditRows.some((row) => String(row.Action || "").includes("FOREIGN_TENANT_EXPORT_PROBE"))).toBe(false);

    const createdAtValues = auditRows
      .map((row) => String(row["Created At"] || ""))
      .filter(Boolean);

    const sortedCreatedAtValues = [...createdAtValues].sort((left, right) => left.localeCompare(right));
    expect(createdAtValues).toEqual(sortedCreatedAtValues);
  }, 60000);

  test("concurrent governance exports coalesce to a single job", async () => {
    const [firstResponse, secondResponse] = await Promise.all([
      http
        .get("/api/reports/exports/excel/governance-audit")
        .set(authHeader(superadminToken)),
      http
        .get("/api/reports/exports/excel/governance-audit")
        .set(authHeader(superadminToken))
    ]);

    expect([200, 202]).toContain(firstResponse.status);
    expect([200, 202]).toContain(secondResponse.status);
    expect(firstResponse.body.data.job.id).toBe(secondResponse.body.data.job.id);
    expect(firstResponse.body.data.job.snapshotReferenceId).toBe(secondResponse.body.data.job.snapshotReferenceId);
    expect([firstResponse.headers["x-export-coalesced"], secondResponse.headers["x-export-coalesced"]]).toContain("true");
  }, 60000);

  test("BP cannot export governance audit reports", async () => {
    const response = await http
      .get("/api/reports/exports/excel/governance-audit")
      .set(authHeader(bpToken));

    expect(response.status).toBe(403);
  });

  test("student engagement export includes pinned audit history sheets", async () => {
    const response = await http
      .get("/api/reports/exports/excel/student-engagement")
      .set(authHeader(studentToken));

    expect([200, 202]).toContain(response.status);
    expect(response.body.data.job.snapshotReferenceId).toBeTruthy();
    expect(response.body.data.job.integrityDigest).toBeTruthy();

    const completedJob = await completeExportJob({
      jobId: response.body.data.job.id,
      token: studentToken
    });

    const downloadResponse = await http
      .get(`/api/reports/exports/jobs/${completedJob.id}/download`)
      .set(authHeader(studentToken))
      .buffer(true)
      .parse(binaryParser);

    expect(downloadResponse.status).toBe(200);

    const workbook = await loadWorkbook(downloadResponse.body);
    const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
    expect(sheetNames.some((name) => name.startsWith("Student Engagement Snapshot"))).toBe(true);
    expect(sheetNames.some((name) => name.startsWith("Student Worksheet Submission"))).toBe(true);
  }, 60000);

  test("superadmin operations dashboard tracks downloads and recovers stale processing jobs", async () => {
    const downloadSourceResponse = await http
      .get(`/api/reports/exports/excel/governance-audit?auditProbe=${Date.now()}`)
      .set(authHeader(superadminToken));

    expect([200, 202]).toContain(downloadSourceResponse.status);

    const completedJob = await completeExportJob({
      jobId: downloadSourceResponse.body.data.job.id,
      token: superadminToken
    });

    const downloadResponse = await http
      .get(`/api/reports/exports/jobs/${completedJob.id}/download`)
      .set(authHeader(superadminToken))
      .buffer(true)
      .parse(binaryParser);

    expect(downloadResponse.status).toBe(200);

    const staleCandidateResponse = await http
      .get(`/api/reports/exports/pdf/workflow-lifecycle?staleProbe=${Date.now()}`)
      .set(authHeader(superadminToken));

    expect([200, 202]).toContain(staleCandidateResponse.status);

    const staleJobId = staleCandidateResponse.body.data.job.id;
    await prisma.reportExportJob.update({
      where: { id: staleJobId },
      data: {
        status: "PROCESSING",
        startedAt: new Date(Date.now() - 20 * 60 * 1000),
        leaseOwner: "stale-test-worker",
        leaseExpiresAt: new Date(Date.now() - 60 * 1000),
        lastHeartbeatAt: new Date(Date.now() - 10 * 60 * 1000),
        progressPhase: "GENERATING_ARTIFACT",
        progressPercent: 45
      }
    });

    const dashboardResponse = await http
      .get("/api/reports/exports/operations/dashboard?windowHours=24&limit=10")
      .set(authHeader(superadminToken));

    expect(dashboardResponse.status).toBe(200);
    expect(dashboardResponse.body.data.recent.downloads.some((entry) => entry.action === "REPORT_EXPORT_ARTIFACT_DOWNLOADED")).toBe(true);
    expect(Number(dashboardResponse.body.data.workers.counts.staleProcessingJobs || 0)).toBeGreaterThan(0);

    const recoveryResponse = await http
      .post("/api/reports/exports/operations/recovery/stale-processing")
      .set(authHeader(superadminToken))
      .send({ reason: "jest_stale_recovery", limit: 5 });

    expect(recoveryResponse.status).toBe(200);
    expect(Number(recoveryResponse.body.data.recoveredCount || 0)).toBeGreaterThan(0);

    const recoveredStatusResponse = await http
      .get(`/api/reports/exports/jobs/${staleJobId}`)
      .set(authHeader(superadminToken));

    expect(recoveredStatusResponse.status).toBe(200);
    expect(recoveredStatusResponse.body.data.job.status).toBe("QUEUED");
  }, 60000);

  test("superadmin can queue controlled export simulations", async () => {
    const response = await http
      .post("/api/reports/exports/operations/simulations/XLSX/governance-audit")
      .set(authHeader(superadminToken))
      .send({ count: 2, executeNow: false, queueName: "simulation", priority: 25 });

    expect(response.status).toBe(202);
    expect(response.body.data.simulation.count).toBe(2);
    expect(Array.isArray(response.body.data.simulation.items)).toBe(true);
    expect(response.body.data.simulation.items).toHaveLength(2);
    expect(response.body.data.simulation.items.every((job) => job.queueName === "simulation")).toBe(true);
  }, 60000);
});