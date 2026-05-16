import {
  authHeader,
  ensureAuthUser,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";
import { runReportExportWorkerPass } from "../../src/services/report-export-runner.service.js";

async function completeExportJob({ jobId, token }) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
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

describe("REPORTING FOUNDATION", () => {
  let superadminToken;
  let bpToken;
  let studentToken;
  let parentToken;
  let tenantDefault;
  let superadminUser;

  beforeAll(async () => {
    const [superadminLogin, bpLogin] = await Promise.all([
      loginAs({ email: "superadmin@abacusweb.local" }),
      loginAs({ email: "bp.manager@abacusweb.local" })
    ]);

    superadminToken = superadminLogin.body.data.access_token;
    bpToken = bpLogin.body.data.access_token;

    tenantDefault = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    superadminUser = await prisma.authUser.findFirstOrThrow({
      where: {
        tenantId: tenantDefault.id,
        email: "superadmin@abacusweb.local"
      },
      select: {
        id: true
      }
    });

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
        admissionNo: `RPT-${randomId("student")}`,
        firstName: "Reporting",
        lastName: "Student",
        hierarchyNodeId: defaultSchool.id,
        levelId: level.id,
        guardianName: "Reporting Parent"
      }
    });

    const studentUser = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `${randomId("student") }@abacusweb.local`,
      username: randomId("stuuser"),
      role: "STUDENT",
      hierarchyNodeCode: "SCH-001",
      studentId: student.id,
      password: "Pass@123",
      mustChangePassword: false
    });

    const parentUser = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `${randomId("parent") }@abacusweb.local`,
      username: randomId("paruser"),
      role: "PARENT",
      password: "Pass@123",
      mustChangePassword: false
    });

    await prisma.parentStudentLink.create({
      data: {
        tenantId: tenantDefault.id,
        parentUserId: parentUser.id,
        studentId: student.id,
        relationship: "Mother",
        isPrimary: true,
        isActive: true,
        visibilityKey: "FULL"
      }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: tenantDefault.id,
        userId: superadminUser.id,
        role: "SUPERADMIN",
        action: "REPORTING_FOUNDATION_TEST_EVENT",
        entityType: "REPORT",
        entityId: student.id,
        metadata: { source: "reporting-foundation-test" }
      }
    });

    const [studentLogin, parentLogin] = await Promise.all([
      loginAs({ email: studentUser.email, password: "Pass@123" }),
      loginAs({ email: parentUser.email, password: "Pass@123" })
    ]);

    studentToken = studentLogin.body.data.access_token;
    parentToken = parentLogin.body.data.access_token;
  }, 30000);

  test("BP foundation report returns normalized report payload", async () => {
    const response = await http
      .get("/api/reports/bp/foundation")
      .set(authHeader(bpToken));

    expect(response.status).toBe(200);
    expect(response.body.data.reportKey).toBe("bp-operational");
    expect(Array.isArray(response.body.data.highlights)).toBe(true);
    expect(Array.isArray(response.body.data.sections)).toBe(true);
    expect(Array.isArray(response.body.data.tables)).toBe(true);
  });

  test("BP foundation report exports PDF and Excel", async () => {
    const pdfResponse = await http
      .get("/api/reports/exports/pdf/bp-operational")
      .set(authHeader(bpToken));

    expect([200, 202]).toContain(pdfResponse.status);
    expect(pdfResponse.body.data.job.id).toBeTruthy();

    const completedPdfJob = await completeExportJob({
      jobId: pdfResponse.body.data.job.id,
      token: bpToken
    });

    const pdfDownload = await http
      .get(`/api/reports/exports/jobs/${completedPdfJob.id}/download`)
      .set(authHeader(bpToken));

    expect(pdfDownload.status).toBe(200);
    expect(pdfDownload.headers["content-type"]).toContain("application/pdf");
    expect(Number(pdfDownload.headers["content-length"] || 0)).toBeGreaterThan(0);

    const excelResponse = await http
      .get("/api/reports/exports/excel/bp-operational")
      .set(authHeader(bpToken));

    expect([200, 202]).toContain(excelResponse.status);
    expect(excelResponse.body.data.job.id).toBeTruthy();

    const completedExcelJob = await completeExportJob({
      jobId: excelResponse.body.data.job.id,
      token: bpToken
    });

    const excelDownload = await http
      .get(`/api/reports/exports/jobs/${completedExcelJob.id}/download`)
      .set(authHeader(bpToken));

    expect(excelDownload.status).toBe(200);
    expect(excelDownload.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(Number(excelDownload.headers["content-length"] || 0)).toBeGreaterThan(0);
  });

  test("student and parent scoped foundation reports resolve", async () => {
    const studentResponse = await http
      .get("/api/reports/student/foundation")
      .set(authHeader(studentToken));

    expect(studentResponse.status).toBe(200);
    expect(studentResponse.body.data.reportKey).toBe("student-engagement");
    expect(studentResponse.body.data.scope.role).toBe("STUDENT");

    const parentResponse = await http
      .get("/api/reports/parent/foundation")
      .set(authHeader(parentToken));

    expect(parentResponse.status).toBe(200);
    expect(parentResponse.body.data.reportKey).toBe("parent-visibility");
    expect(parentResponse.body.data.scope.role).toBe("PARENT");
  });

  test("superadmin governance and workflow reports are printable", async () => {
    const governanceResponse = await http
      .get("/api/reports/audit/governance-summary")
      .set(authHeader(superadminToken));

    expect(governanceResponse.status).toBe(200);
    expect(governanceResponse.body.data.reportKey).toBe("governance-audit");

    const workflowResponse = await http
      .get("/api/reports/printable/workflow-lifecycle")
      .set(authHeader(superadminToken));

    expect(workflowResponse.status).toBe(200);
    expect(workflowResponse.body.data.reportKey).toBe("workflow-lifecycle");
    expect(workflowResponse.body.data.printable.mode).toBe("printable");
  });
});