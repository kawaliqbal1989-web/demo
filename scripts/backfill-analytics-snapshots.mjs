import { runSnapshotBackfill } from "../src/services/snapshot-backfill.service.js";

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const fromDate = readArg("from");
const toDate = readArg("to");

if (!fromDate || !toDate) {
  throw new Error("--from and --to are required for analytics snapshot backfill");
}

const result = await runSnapshotBackfill({
  fromDate,
  toDate,
  tenantId: readArg("tenantId"),
  businessPartnerId: readArg("businessPartnerId"),
  resumeFromDate: readArg("resumeFrom"),
  forceFullRebuild: !hasFlag("incremental")
});

console.log(JSON.stringify(result, null, 2));