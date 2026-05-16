import { runAnalyticsSnapshotPipeline } from "../src/services/analytics-job-runner.service.js";

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const snapshotDate = readArg("date");
const tenantId = readArg("tenantId");
const businessPartnerId = readArg("businessPartnerId");
const forceFullRebuild = hasFlag("full");

const result = await runAnalyticsSnapshotPipeline({
  snapshotDate,
  tenantId,
  businessPartnerId,
  incremental: !forceFullRebuild,
  forceFullRebuild
});

console.log(JSON.stringify(result, null, 2));