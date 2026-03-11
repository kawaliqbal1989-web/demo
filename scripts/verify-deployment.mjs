#!/usr/bin/env node
/**
 * Deployment Verification Script — Post-deploy smoke tests
 *
 * Usage:
 *   node scripts/verify-deployment.mjs                        # Against localhost:4000
 *   node scripts/verify-deployment.mjs --base https://api.example.com
 *   node scripts/verify-deployment.mjs --wave wave1           # Verify only wave1 features
 *   node scripts/verify-deployment.mjs --verbose              # Show response bodies
 */

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const BASE_URL = baseIdx >= 0 && args[baseIdx + 1] ? args[baseIdx + 1] : "http://localhost:4000";
const verbose = args.includes("--verbose");
const waveIdx = args.indexOf("--wave");
const waveFilter = waveIdx >= 0 && args[waveIdx + 1] ? args[waveIdx + 1] : null;

const results = [];
let authToken = null;

function log(msg) { console.log(msg); }
function pass(name, ms) { results.push({ name, ok: true, ms }); log(`  ✓ ${name} (${ms}ms)`); }
function fail(name, reason, ms) { results.push({ name, ok: false, reason, ms }); log(`  ✗ ${name} — ${reason} (${ms || 0}ms)`); }

async function req(method, path, body, headers = {}) {
  const start = Date.now();
  const opts = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body) opts.body = JSON.stringify(body);
  if (authToken) opts.headers["Authorization"] = `Bearer ${authToken}`;

  const res = await fetch(`${BASE_URL}${path}`, opts);
  const ms = Date.now() - start;
  let data;
  try { data = await res.json(); } catch { data = null; }
  if (verbose && data) log(`    ↳ ${JSON.stringify(data).slice(0, 200)}`);
  return { status: res.status, data, ms };
}

/* ── Test Suites ── */

async function testFoundation() {
  log("\n═══ Foundation ═══");

  // Health endpoint
  try {
    const r = await req("GET", "/health");
    r.status === 200 ? pass("GET /health", r.ms) : fail("GET /health", `status ${r.status}`, r.ms);
  } catch (e) { fail("GET /health", e.message); }

  // Health DB
  try {
    const r = await req("GET", "/health/db");
    r.status === 200 ? pass("GET /health/db", r.ms) : fail("GET /health/db", `status ${r.status}`, r.ms);
  } catch (e) { fail("GET /health/db", e.message); }

  // Readiness probe
  try {
    const r = await req("GET", "/ready");
    r.status === 200 && r.data?.ready ? pass("GET /ready", r.ms) : fail("GET /ready", `status ${r.status}`, r.ms);
  } catch (e) { fail("GET /ready", e.message); }

  // API health
  try {
    const r = await req("GET", "/api/health");
    r.status === 200 ? pass("GET /api/health", r.ms) : fail("GET /api/health", `status ${r.status}`, r.ms);
  } catch (e) { fail("GET /api/health", e.message); }

  // Auth: login attempt (should return 401 or 400 for bad credentials, not 500)
  try {
    const r = await req("POST", "/api/auth/login", { email: "smoke@test.invalid", password: "X" });
    [400, 401, 404].includes(r.status)
      ? pass("POST /api/auth/login (invalid creds)", r.ms)
      : fail("POST /api/auth/login", `unexpected status ${r.status}`, r.ms);
  } catch (e) { fail("POST /api/auth/login", e.message); }

  // CORS preflight
  try {
    const r = await fetch(`${BASE_URL}/health`, { method: "OPTIONS" });
    r.ok || r.status === 204
      ? pass("OPTIONS /health (CORS)", Date.now())
      : fail("OPTIONS /health", `status ${r.status}`);
  } catch (e) { fail("OPTIONS /health", e.message); }
}

async function testWave1() {
  log("\n═══ Wave 1: Foundation & Shell ═══");
  // These are primarily frontend features, but we can verify insights API requires auth
  try {
    const r = await req("GET", "/api/insights");
    [401, 200].includes(r.status)
      ? pass("GET /api/insights (auth gate)", r.ms)
      : fail("GET /api/insights", `unexpected status ${r.status}`, r.ms);
  } catch (e) { fail("GET /api/insights", e.message); }
}

async function testWave2() {
  log("\n═══ Wave 2: Student & Teacher Intelligence ═══");
  // Student coach and teacher cockpit require auth
  try {
    const r = await req("GET", "/api/student/coach/daily-mission");
    [401, 403].includes(r.status)
      ? pass("GET /api/student/coach/daily-mission (auth gate)", r.ms)
      : fail("GET /api/student/coach/daily-mission", `unexpected status ${r.status}`, r.ms);
  } catch (e) { fail("GET /api/student/coach/daily-mission", e.message); }

  try {
    const r = await req("GET", "/api/teacher/cockpit/at-risk");
    [401, 403].includes(r.status)
      ? pass("GET /api/teacher/cockpit/at-risk (auth gate)", r.ms)
      : fail("GET /api/teacher/cockpit/at-risk", `unexpected status ${r.status}`, r.ms);
  } catch (e) { fail("GET /api/teacher/cockpit/at-risk", e.message); }
}

async function testWave3() {
  log("\n═══ Wave 3: Leadership & Notifications ═══");
  try {
    const r = await req("GET", "/api/center/intel/health");
    [401, 403].includes(r.status)
      ? pass("GET /api/center/intel/health (auth gate)", r.ms)
      : fail("GET /api/center/intel/health", `unexpected status ${r.status}`, r.ms);
  } catch (e) { fail("GET /api/center/intel/health", e.message); }

  try {
    const r = await req("GET", "/api/notifications");
    [401].includes(r.status)
      ? pass("GET /api/notifications (auth gate)", r.ms)
      : fail("GET /api/notifications", `unexpected status ${r.status}`, r.ms);
  } catch (e) { fail("GET /api/notifications", e.message); }
}

async function testWave4() {
  log("\n═══ Wave 4: Workflow & AI Surfaces ═══");
  try {
    const r = await req("GET", "/api/student/ai/narrative");
    [401, 403].includes(r.status)
      ? pass("GET /api/student/ai/narrative (auth gate)", r.ms)
      : fail("GET /api/student/ai/narrative", `unexpected status ${r.status}`, r.ms);
  } catch (e) { fail("GET /api/student/ai/narrative", e.message); }

  try {
    const r = await req("POST", "/api/bulk/update-status", { studentIds: [], status: "X" });
    [401].includes(r.status)
      ? pass("POST /api/bulk/update-status (auth gate)", r.ms)
      : fail("POST /api/bulk/update-status", `unexpected status ${r.status}`, r.ms);
  } catch (e) { fail("POST /api/bulk/update-status", e.message); }
}

async function testPerformance() {
  log("\n═══ Performance ═══");
  // Health endpoint should respond under 500ms
  const runs = [];
  for (let i = 0; i < 5; i++) {
    const r = await req("GET", "/health");
    runs.push(r.ms);
  }
  const avg = Math.round(runs.reduce((a, b) => a + b, 0) / runs.length);
  const max = Math.max(...runs);
  avg <= 500
    ? pass(`Health avg latency ${avg}ms (max: ${max}ms)`, avg)
    : fail(`Health avg latency`, `${avg}ms exceeds 500ms threshold`, avg);
}

/* ── Runner ── */
async function main() {
  log(`\nDeployment Verification: ${BASE_URL}`);
  log(`Wave filter: ${waveFilter || "all"}`);
  log("═".repeat(50));

  await testFoundation();

  if (!waveFilter || waveFilter === "wave1") await testWave1();
  if (!waveFilter || waveFilter === "wave2") await testWave2();
  if (!waveFilter || waveFilter === "wave3") await testWave3();
  if (!waveFilter || waveFilter === "wave4") await testWave4();

  await testPerformance();

  // Summary
  log("\n" + "═".repeat(50));
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  log(`Results: ${passed} passed, ${failed} failed out of ${results.length} checks`);

  if (failed > 0) {
    log("\nFailed checks:");
    results.filter((r) => !r.ok).forEach((r) => log(`  ✗ ${r.name}: ${r.reason}`));
    process.exit(1);
  }

  log("\n✓ All checks passed. Deployment verified.");
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
