import { prisma } from "../src/lib/prisma.js";
import {
  advanceDeploymentRelease,
  getProductionReadinessDashboard,
  recordBackupSnapshot,
  runProductionFailoverCertification,
  runProductionRecoveryDrill,
  stageDeploymentRelease,
  validateBackupRestoreReadiness
} from "../src/services/report-export-production-governance.service.js";

function parseArgs(argv = process.argv.slice(2)) {
  return argv.reduce((accumulator, token) => {
    if (!token.startsWith("--")) {
      return accumulator;
    }

    const [rawKey, rawValue] = token.slice(2).split("=");
    const key = rawKey.trim();
    accumulator[key] = rawValue === undefined ? true : rawValue.trim();
    return accumulator;
  }, {});
}

async function main() {
  const args = parseArgs();
  const tenantCode = String(args.tenant || "DEFAULT").trim().toUpperCase();
  const tenant = await prisma.tenant.findUnique({ where: { code: tenantCode } });
  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantCode}`);
  }

  const viewer = {
    tenantId: tenant.id,
    userId: null,
    role: "SUPERADMIN"
  };

  let release = null;
  if (args.version) {
    release = await stageDeploymentRelease({
      viewer,
      input: {
        environment: args.environment || "production",
        versionTag: args.version,
        buildId: args.buildId || null,
        commitSha: args.commitSha || null,
        rollbackVersionTag: args.rollbackVersion || null
      }
    });

    if (args.completeRelease) {
      for (const checkpoint of ["PRECHECKS_PASSED", "ROLLOUT_STARTED", "ROLLOUT_VERIFIED", "COMPLETED"]) {
        release = await advanceDeploymentRelease({
          viewer,
          releaseId: release.releaseId,
          input: { checkpoint }
        });
      }
    }
  }

  let backup = null;
  if (args.snapshotLabel) {
    backup = await recordBackupSnapshot({
      viewer,
      input: {
        environment: args.environment || "production",
        snapshotLabel: args.snapshotLabel,
        retentionDays: args.retentionDays || null,
        includeArtifacts: true,
        database: {
          snapshotReference: args.snapshotReference || `snapshot-${Date.now().toString(36)}`,
          checksum: args.snapshotChecksum || `sha256-${Date.now().toString(36)}`
        }
      }
    });

    backup = await validateBackupRestoreReadiness({
      viewer,
      input: {
        backupId: backup.backupId,
        dryRun: args.executeRestore === "true" ? false : true
      }
    });
  }

  const recovery = await runProductionRecoveryDrill({
    viewer,
    input: {
      dryRun: args.executeRecovery === "true" ? false : true,
      executeWorkerPass: args.executeRecovery === "true",
      executeCleanup: args.executeRecovery === "true"
    }
  });

  const failover = await runProductionFailoverCertification({
    viewer,
    input: {
      dryRun: args.executeFailover === "true" ? false : true,
      executeRecovery: args.executeFailover === "true"
    }
  });

  const dashboard = await getProductionReadinessDashboard({
    viewer,
    windowHours: args.windowHours || null,
    recentLimit: args.limit || null
  });

  process.stdout.write(`${JSON.stringify({
    tenantCode,
    release,
    backup,
    recovery,
    failover,
    summary: dashboard.summary,
    generatedAt: dashboard.generatedAt
  }, null, 2)}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });