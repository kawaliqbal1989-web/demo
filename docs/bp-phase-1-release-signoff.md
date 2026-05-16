# BP Phase 1 Release Sign-Off

This document defines the final release execution runbook for the Business Partner Phase 1 analytics platform.

It assumes the following are already complete:

- secure BP scope system
- snapshot analytics pipeline
- dashboard KPI APIs
- incremental analytics jobs
- modular BP dashboard
- cache-aware API behavior
- production-readiness documentation
- deployment hardening guidance
- QA and security checklists

This document covers only:

- live staging smoke validation
- runtime verification
- deployment sign-off
- operational validation
- final release gating

Repo reality note:

- The current runtime behaves with MySQL/MariaDB semantics through Prisma.
- Backend analytics routes are mounted at `/partner/dashboard/*`.
- The browser route under release validation is `/bp/dashboard`.
- Existing verification commands already available in this repo include `npm run verify:deploy`, `npm run migrate:plan`, `npm run analytics:snapshots`, and `npm run analytics:backfill`.

---

## 1. Staging Smoke Execution Plan

### Entry Conditions

- staging backend is deployed and healthy
- staging frontend build is deployed and points to the intended staging API
- one BP user with valid non-empty scope is available
- one BP user with empty scope is available
- one unauthorized non-BP account is available
- recent snapshots exist for at least one BP account
- browser devtools are open with Network and Console tabs visible

### Exact Execution Order

1. Run backend baseline verification:

```bash
npm run verify:deploy -- --base https://<staging-api-host>
```

2. Verify infra probes manually:

- `GET /health`
- `GET /health/db`
- `GET /ready`
- `GET /api/health`

3. Login as the known-good BP user and open `/bp/dashboard`.
4. Wait for initial widget load to settle with no active network retries.
5. Validate KPI cards.
6. Validate revenue chart.
7. Validate student growth chart.
8. Validate franchise ranking table pagination.
9. Validate center health table pagination and sort.
10. Change date filters and confirm URL sync.
11. Change franchise filter and confirm dependent center narrowing.
12. Refresh the page and verify filter persistence from the URL.
13. Throttle network to Slow 3G and reload to inspect loading states.
14. Force one widget request failure and verify retry behavior.
15. Validate stale-state rendering using a stale or degraded snapshot scenario.
16. Log in as the empty-scope BP user and verify empty-state behavior.
17. Resize to 1440px, 1024px, 768px, and 390px and validate responsive layout.
18. Log in as an unauthorized account and verify protected route behavior.

### Live Smoke Checklist

| Area | Expected Outcome | Failure Criteria | Rollback Trigger |
| --- | --- | --- | --- |
| KPI cards | all KPI cards render with labels, numeric values, and source badge | blank card shell, persistent spinner, `NaN`, or broken formatting | yes if reproducible across refresh |
| Revenue chart | chart line, axes, and labels render without console errors | blank canvas, chart exception, or missing dataset | yes if endpoint data is present but UI fails |
| Student growth chart | both series render and remain legible | missing series, broken axis, or render crash | yes if reproducible |
| Franchise ranking table | page changes update rows and metadata correctly | stuck pagination, duplicate rows, or reset loop | yes if table state is unreliable |
| Center health table | sort and pagination behave consistently | stale rows, wrong sort, or inconsistent counts | yes if data integrity is unclear |
| Filters | controls update state and refresh relevant widgets | filters stop updating, cause full crash, or desync from URL | yes if filters cannot be trusted |
| URL synchronization | refresh restores valid filter state from URL | filter loss, crash, or invalid state on reload | recommended hold if common; blocker if it crashes |
| Loading states | widgets show skeletons or explicit pending state | blank viewport or frozen page | yes if initial load becomes non-deterministic |
| Retry behavior | failed widget exposes retry and recovers | no retry, whole-page crash, or duplicate request storm | yes if error recovery is broken |
| Stale-state warnings | stale data is visibly labeled but still usable when appropriate | stale data looks fresh or warning hides all content | yes if freshness cannot be trusted |
| Empty states | empty-scope user sees safe empty views, not errors | 500s, broken widgets, or foreign data | yes immediately |
| Responsive layout | no horizontal overflow or unusable controls at target widths | layout break, hidden actions, or clipped chart/table content | recommended hold unless severe |

### Immediate Rollback Trigger Conditions During Smoke

- foreign or cross-tenant data appears for any BP user
- `/bp/dashboard` fails to render for a valid scoped BP user after refresh
- repeated 5xx responses occur on dashboard endpoints
- stale or empty state causes unhandled frontend crash
- pagination or filter actions return mismatched or clearly incorrect data

---

## 2. API Runtime Validation Plan

### Endpoints Under Validation

- `/partner/dashboard/overview`
- `/partner/dashboard/revenue-trend`
- `/partner/dashboard/student-growth-trend`
- `/partner/dashboard/franchise-ranking`
- `/partner/dashboard/center-health`

### Runtime Validation Sequence

1. Capture the real requests generated by `/bp/dashboard` in browser Network.
2. Replay each request once with a valid BP token.
3. Replay each request a second time with identical params to observe cache behavior.
4. Replay each request with malformed params.
5. Replay each request with foreign `franchiseId` and `centerId` values.
6. Replay each request without auth and with a non-BP token.

### Expected Response Patterns

| Endpoint | Expected Response Pattern | Acceptable Latency | Failure Indicator |
| --- | --- | --- | --- |
| overview | `200` with KPI payload and metadata; empty scope should still be safe `200` | p95 under 500ms, hard ceiling 800ms in staging | 5xx, missing metadata, or response shape drift |
| revenue-trend | `200` with ordered trend points and metadata | p95 under 500ms, hard ceiling 800ms | unordered labels, empty data with no explanation, or 5xx |
| student-growth-trend | `200` with active-student and growth series | p95 under 500ms, hard ceiling 800ms | partial shape mismatch, invalid numeric values, or 5xx |
| franchise-ranking | `200` with paginated rows and total metadata | p95 under 650ms, hard ceiling 1000ms | row/page metadata mismatch, unstable sort, or 5xx |
| center-health | `200` with paginated rows and health fields | p95 under 650ms, hard ceiling 1000ms | stale counts, malformed health fields, or 5xx |

### Validation Rules

- Scope verification: only in-scope data must appear, even when invalid filter ids are supplied.
- Cache-hit behavior: second identical request should be no slower than the first and should emit a cache-hit or equivalent log if implemented.
- Fallback aggregation behavior: if snapshots are missing or stale, the response must return explicit metadata or safe empty data, not silent inconsistency.
- Malformed params: invalid dates, invalid page values, and unknown ids must sanitize safely or return controlled validation failures.
- Unauthorized behavior: missing token should return `401`; wrong role or denied access should return `403` without leaking payload data.

### Operational Failure Indicators

- any dashboard endpoint returns repeated 5xx under valid scoped usage
- response shape differs across identical requests without data changes
- repeated identical requests show no cache effectiveness and no clear reason
- malformed params cause unhandled server errors
- foreign ids widen access or alter scope boundaries

---

## 3. Snapshot Job Runtime Validation

### Validation Sequence

1. Boot staging and confirm app startup logs.
2. Confirm scheduler enablement values in staging env.
3. Verify `analytics_scheduler_started` appears after app boot when scheduler is enabled.
4. Trigger or wait for one scheduler cycle.
5. Review logs for pipeline completion, lock behavior, and partner failure isolation.
6. Optionally run a controlled manual snapshot command:

```bash
npm run analytics:snapshots
```

7. Reissue dashboard reads for the known-good BP account and verify fresh or invalidated cache behavior.
8. If needed, run a controlled backfill only in staging:

```bash
npm run analytics:backfill
```

### Expected Logs

- `server_started`
- `analytics_scheduler_started`
- `analytics_scheduler_completed`
- `analytics_snapshot_pipeline_completed`
- `analytics_snapshot_pipeline_partner_failed` only when isolated failures occur
- `analytics_job_lock_skipped` only when overlap protection is working
- `shutdown_initiated` and `shutdown_completed` on controlled stop

### Runtime Checks

| Area | Expected Behavior | Alert Condition |
| --- | --- | --- |
| scheduler startup | scheduler starts once and does not repeatedly reinitialize | missing startup log or repeated startup logs |
| job locking | concurrent run attempts skip safely | repeated lock skips across normal cadence |
| incremental processing | only relevant recent snapshot windows process | unexpectedly large reprocessing volume |
| cache invalidation | dashboard reads reflect updated snapshot state after refresh window | stale data persists beyond expected cache TTL |
| rerun safety | manual rerun does not duplicate or corrupt snapshot outputs | duplicate snapshot rows, wrong totals, or repeated partner failures |
| stale snapshot handling | stale data is labeled, not silently fresh | stale state is invisible in API/UI metadata |
| partial failure isolation | one partner failure does not abort all partners | entire pipeline aborts on single partner fault |

### Release-Blocking Alert Conditions

- scheduler fails to start in staging when enabled
- pipeline completes with recurring partner failures for current dates
- overlap handling causes repeated lock contention under a single normal scheduler window
- dashboard never reflects fresh snapshot results after expected invalidation interval

---

## 4. Security Release Checklist

### Penetration-Style Validation Steps

1. Log in as BP A and capture dashboard requests from devtools.
2. Replay the requests with BP B or foreign `franchiseId` values.
3. Replay the requests with foreign `centerId` values.
4. Replay the requests with malformed dates, duplicate params, negative page values, and unknown ids.
5. Replay the same requests after forcing or simulating stale cache conditions.
6. Replay requests after expiring a scope assignment in staging.
7. Replay requests with no token and with a non-BP token.

### Expected Secure Outcomes

- cross-tenant or cross-BP data never appears
- foreign `franchiseId` is ignored, rejected, or safely narrowed without data leak
- foreign `centerId` is ignored, rejected, or safely narrowed without data leak
- malformed filters do not widen scope and do not trigger unhandled errors
- stale cache still respects current tenant and BP boundaries
- expired scope assignments no longer contribute rows to results
- unauthenticated access returns `401`
- wrong-role or unauthorized access returns `403`

### Release-Blocking Conditions

- any foreign tenant, franchise, center, or BP data appears
- stale cache returns data outside current authorized scope
- malformed filters can broaden access
- expired scope entries still authorize data after scope refresh
- unauthorized direct API access returns payload data

---

## 5. Performance Release Checklist

### Thresholds

| Area | Target | Acceptable Range | Escalation Trigger |
| --- | --- | --- | --- |
| initial dashboard load | under 1.5s warm | under 3s cold snapshot-backed load | repeated load above 3s |
| chart render timing | under 400ms chart mount | under 700ms on staging hardware | visible render stutter or blocked interaction |
| pagination responsiveness | under 500ms perceived update | under 800ms max | repeated multi-click lag or stale rows |
| widget refresh speed | under 800ms for scoped refresh | under 1200ms max | retry or refresh feels blocked |
| cache efficiency | over 70% hit rate during repeated identical reads | over 50% acceptable for first-hour traffic | hit rate stays low after repeated identical requests |
| snapshot query latency | p95 under 500ms for overview/trend | p95 under 750ms acceptable | repeated p95 above 750ms |
| scheduler duration | completes well before next poll interval | under 50% of scheduler interval preferred | run duration approaches next scheduler tick |

### Measurement Method

1. Measure page load and widget timing in browser devtools.
2. Measure endpoint latency from runtime logs and Network timings.
3. Measure pagination and refresh responsiveness by interaction timing.
4. Measure scheduler duration from start/completion logs.

### Escalation Triggers

- dashboard load repeatedly exceeds 3s for valid scoped users
- chart rendering causes noticeable main-thread stutter
- repeated identical requests show poor cache efficiency without explanation
- scheduler runtime approaches or overlaps the next scheduled window

---

## 6. Observability Validation Plan

### Runtime Validation Checklist

Verify these minimum signals exist in staging logs during smoke and one scheduler cycle:

- request completion logs for dashboard API requests
- dashboard latency values per request
- unauthorized access denial logs
- scheduler startup log
- scheduler completion log
- partner failure log when a partial failure is induced
- cache hit/miss or equivalent cache-path visibility if implemented

### Minimum Release Observability Requirements

| Signal | Minimum Requirement | Release Position |
| --- | --- | --- |
| requestId logging | each request should be traceable through a stable request identifier or proxy correlation id | must-pass if already enabled by runtime or proxy; otherwise verify equivalent correlation path |
| jobRunId logging | each scheduler or backfill run should be identifiable as one run | recommended, but must-pass if multiple concurrent job sources exist |
| dashboard latency logging | duration must be visible per dashboard request | must-pass |
| cache hit/miss logging | some service-level cache visibility for repeated reads | recommended |
| snapshot failure logging | partner-level or run-level failures must be explicit | must-pass |
| unauthorized access logging | denied access attempts must be visible | must-pass |

### Current Repo Note

The current server startup and deploy request logger confirm baseline startup and request-completion logging, but requestId propagation must be verified in the actual staging runtime or reverse proxy path before sign-off.

### Failure Criteria

- no way to correlate a failed dashboard request to a specific log entry
- scheduler failures are silent or only visible as generic errors
- unauthorized access attempts leave no trace
- latency cannot be measured from logs or request traces

---

## 7. Rollback Validation Checklist

### Rollback Readiness Checklist

- previous backend build artifact is available
- previous frontend build artifact is available
- database backup exists and restore path is known
- migration rollback strategy is documented for the current release set
- scheduler can be disabled via env change if rollback must stop analytics mutations
- cache reset method is known and safe

### Emergency Rollback Flow

1. Stop traffic promotion or remove the instance from rotation.
2. Disable scheduler if the release introduced runtime instability:

- set `ANALYTICS_SCHEDULER_ENABLED=false`

3. Redeploy the previous backend build.
4. Redeploy the previous frontend build.
5. If schema is backward-compatible, keep the migrated schema and validate app recovery.
6. If schema is not backward-compatible, execute the tested migration rollback or database restore path.
7. Clear or reset dashboard cache state if stale release-era cache objects can mask rollback validation.
8. Re-run `npm run verify:deploy -- --base https://<target-host>`.
9. Re-run a focused `/bp/dashboard` smoke pass.

### Safe Rollback Sequence

| Step | Purpose | Failure If Skipped |
| --- | --- | --- |
| disable scheduler | prevent continued snapshot mutations during unstable period | rollback competes with active jobs |
| backend rollback | restore stable API behavior | frontend may call unstable endpoints |
| frontend rollback | restore stable browser route behavior | users still hit incompatible UI |
| cache reset | avoid stale release-era state masking true recovery | false positives or stale data confusion |
| verify deploy | confirm app health and auth gates | rollback may appear complete but remain broken |

### Migration Rollback Validation

- if the release depends on non-backward-compatible schema changes, rollback is not approved until a tested restore or rollback script is available
- if rollback relies on restore, validate backup timestamp, restore duration, and operator ownership before production approval

---

## 8. Final Release Gate Matrix

### Must-Pass Release Checks

- `npm run verify:deploy -- --base https://<staging-api-host>` passes
- `/bp/dashboard` smoke pass is clean for a valid scoped BP account
- empty-scope BP account returns safe empty states
- unauthorized access checks return correct denial behavior
- foreign `franchiseId` and `centerId` checks do not leak data
- dashboard endpoints meet latency thresholds or stay within acceptable range without instability
- scheduler starts and completes one clean cycle, or is intentionally disabled for the release with explicit approval
- rollback path is verified and previous artifacts are ready

### Recommended Checks

- cache-hit behavior is observed on repeated requests
- stale snapshot scenario is validated end-to-end in UI and API metadata
- request correlation fields are confirmed in staging logs
- one controlled manual snapshot rerun proves rerun safety

### Optional Post-Release Monitoring Enhancements

- saved log queries for BP dashboard events
- additional post-release analytics accuracy comparisons against raw DB values
- extra mobile smoke on real physical devices

### Go/No-Go Framework

- `GO`: all must-pass checks are green, no security blockers, no repeated 5xx, rollback is ready
- `GO WITH WATCH`: must-pass checks are green, only recommended observability or cache-visibility gaps remain, and monitoring coverage is strong
- `NO-GO`: any scope leak, repeated 5xx, broken `/bp/dashboard` render path, scheduler instability without mitigation, or untested rollback path

---

## 9. Post-Deployment Monitoring Plan

### First-Hour Monitoring Plan

Check every 10 to 15 minutes:

- 5xx rate on dashboard endpoints
- request latency for overview, trend, and table endpoints
- unauthorized access spikes
- scheduler startup or immediate failure logs
- user-reported rendering failures or blank widgets
- cache-hit or cache-miss patterns if available

### First-Day Monitoring Plan

Review at least three times:

- one full scheduler window or day-boundary run
- stale snapshot event frequency
- repeated partner-level snapshot failures
- dashboard latency percentiles
- browser error reports and support tickets

### Analytics Accuracy Spot Checks

- compare one BP dashboard overview against known staging truth
- compare one franchise ranking page against raw scoped data
- compare one center health page against current snapshot rows

### Scheduler Health Checks

- scheduler started once
- no repeated tick failures
- no abnormal lock contention
- recent run completion exists for expected snapshot windows

### Cache Monitoring

- repeated identical dashboard reads should not all behave as cold misses
- cache invalidation after new snapshot data should eventually surface fresh results
- no stale cache should outlive safe TTL expectations in normal traffic

### Frontend Runtime Checks

- `/bp/dashboard` continues rendering after real-user refreshes
- filters and pagination continue working after traffic ramps up
- no sustained console or client-reported render failures appear

### Escalation Conditions

- any scope leak or unauthorized data exposure
- repeated 5xx on dashboard endpoints
- scheduler failures on current production dates
- dashboard latency sustained above acceptable range
- blank page, broken chart, or unusable table behavior reported by real users

---

## 10. Final Production Readiness Assessment

BP Phase 1 is ready for release execution if the must-pass items in Section 8 are completed in staging and remain green through the first controlled scheduler window.

Current confidence level:

- backend and frontend implementation appear production-capable
- verification and hardening guidance already exist
- release risk is now primarily operational rather than architectural

Remaining operational risks:

- live staging may reveal browser-specific render regressions not visible in static validation
- request correlation may still depend on runtime or proxy configuration rather than application code alone
- scheduler and cache behavior must be confirmed in the deployed environment, not inferred from source alone

Acceptable release confidence:

- high confidence if smoke, security, latency, scheduler, and rollback checks are green
- medium confidence if observability correlation is partial but operationally sufficient and all security and runtime checks pass
- low confidence if staging validation cannot be executed with real BP accounts and scheduler conditions

Stabilization outlook:

- this is not a feature-completion problem anymore
- remaining work is narrow and operational
- if staging passes cleanly, the release should move forward without reopening architecture or feature scope

Recommended rollout strategy:

- perform a controlled production rollout after a clean staging pass
- keep scheduler behavior under close watch during the first release window
- retain immediate rollback readiness until first-hour and first-day checks are complete