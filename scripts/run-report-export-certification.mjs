import { prisma } from "../src/lib/prisma.js";
import { getReportDocument } from "../src/services/reporting.service.js";
import {
  getReportExportCertificationReport,
  queueReportExportCertificationScenario,
  resolveCertificationScenarioWorkload
} from "../src/services/report-export-certification.service.js";
import { runReportExportWorkerPass } from "../src/services/report-export-runner.service.js";

function parseArgs(argv = []) {
  const options = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue;
    }

    const [key, rawValue] = arg.slice(2).split("=");
    options[key] = rawValue === undefined ? true : rawValue;
  }
  return options;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scenarioKey = String(args.scenario || "large-dataset").trim().toLowerCase();
  const tenantCodes = String(args.tenants || "DEFAULT")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const executeNow = Boolean(args["execute-now"] || args.executeNow);

  const tenants = await prisma.tenant.findMany({
    where: {
      code: {
        in: tenantCodes
      }
    },
    orderBy: [{ code: "asc" }]
  });

  const results = [];

  for (const tenant of tenants) {
    const viewer = {
      tenantId: tenant.id,
      userId: null,
      role: "SUPERADMIN",
      hierarchyNodeId: null,
      studentId: null
    };

    const workload = resolveCertificationScenarioWorkload({
      scenarioKey,
      viewer,
      resolveReportContext: (reportKey, query = {}) => getReportDocument({
        reportKey,
        auth: viewer,
        query,
        bpScope: null,
        franchiseScope: null,
        student: null,
        parent: null
      }),
      resolveExecutionContext: (reportKey, query = {}) => ({
        reportKey,
        auth: viewer,
        query,
        bpScope: null,
        franchiseScope: null,
        student: null,
        parent: null
      })
    });

    const queued = await queueReportExportCertificationScenario({
      viewer,
      scenarioKey,
      workload,
      executeNow: false
    });

    results.push({
      tenantCode: tenant.code,
      tenantId: tenant.id,
      queued
    });
  }

  if (executeNow) {
    const totalQueued = results.reduce((total, entry) => total + (entry.queued?.queuedCount || 0), 0);
    for (let index = 0; index < totalQueued + 2; index += 1) {
      const summary = await runReportExportWorkerPass({ limit: 4 });
      if (!summary.leased) {
        break;
      }
    }
  }

  const reports = [];
  for (const result of results) {
    const report = await getReportExportCertificationReport({
      viewer: {
        tenantId: result.tenantId,
        userId: null,
        role: "SUPERADMIN"
      },
      runId: result.queued.runId,
      windowHours: 24
    });
    reports.push({
      tenantCode: result.tenantCode,
      report
    });
  }

  process.stdout.write(`${JSON.stringify({ scenarioKey, executeNow, results, reports }, null, 2)}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });