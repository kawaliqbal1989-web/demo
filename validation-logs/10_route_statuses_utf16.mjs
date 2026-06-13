import fs from "fs";
const raw = fs.readFileSync("validation-logs/09_workflow_execution.log", "utf16le").replace(/^\uFEFF+/, "").trim();
const j = JSON.parse(raw);
const out = {};
for (const [k, v] of Object.entries(j.apiResponses || {})) {
  out[k] = { status: v.status, ok: v.ok, path: v.path, method: v.method };
}
console.log(JSON.stringify(out, null, 2));
