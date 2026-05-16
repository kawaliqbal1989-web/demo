# BP Phase 1 Production Readiness

This document defines the Phase 1 production hardening pass for the Business Partner analytics dashboard.

Scope is intentionally limited to:

- production stabilization
- browser smoke validation
- edge-case handling
- lightweight observability
- deployment hardening
- performance verification
- final QA and security validation

Out of scope for this pass:

- architecture redesign
- new product features
- frontend/backend rewrites
- new frameworks or observability platforms
- AI functionality

Repo runtime note:

- The current application runtime is Prisma with MySQL/MariaDB semantics, not PostgreSQL.
- BP analytics endpoints are mounted under `/partner/dashboard/*` in the backend route layer.
- The browser page under validation is `/bp/dashboard`.

---

## 1. Browser Smoke Validation Plan

### Preconditions

- deploy the current Phase 1 backend and frontend build to staging
- ensure at least one BP user has a non-empty scope and one BP user has an empty scope
- ensure at least one recent snapshot date exists and one stale or missing snapshot scenario can be simulated
- open browser devtools with Network and Console visible
- test in desktop and mobile-width layouts

### Smoke Checklist For `/bp/dashboard`

| Area | Validation Step | Expected Result | Failure Indicator | Debugging Guidance |
| --- | --- | --- | --- | --- |
| KPI cards | Load `/bp/dashboard` with a BP user in scope | KPI grid appears, values render, source badge is present | blank card area, spinner never clears, `NaN`, `undefined`, or raw JSON-looking values | inspect the overview request payload and response; confirm scoped BP user, snapshot availability, and response envelope shape |
| Revenue chart | Confirm line chart renders after first page load | chart axes, labels, and dataset line render without console errors | canvas area blank, legend missing, chart error in console | inspect chart dataset length, response points, and whether chart data is empty vs malformed |
| Student growth chart | Confirm dual-axis chart renders | active-student and growth lines both appear | only one series appears, scale labels overlap, or chart fails silently | verify trend endpoint payload and numeric casting for percent values |
| Ranking table | Change page in franchise ranking table | page changes quickly and rows update correctly | paginator changes but rows do not, duplicate rows, or page resets unexpectedly | inspect query params sent for page and sort; confirm widget state is local and not overwritten by sibling widgets |
| Center health table | Change page and sort order | results update with stable sort and pagination | wrong sort direction, stale rows, or row count mismatch | inspect network request params and server response metadata |
| Filters | Change date range, franchise, and center selectors | URL updates, widgets refresh, and dependent center options narrow correctly | filters visually change but URL does not, or URL changes but widgets do not | inspect `from`, `to`, `franchiseId`, and `centerId` query params and confirm debounced sync |
| URL persistence | Refresh the page with active filters in URL | page restores same filter state after reload | filters reset unexpectedly or invalid values crash rendering | inspect malformed-param normalization and confirm invalid filter IDs are discarded safely |
| Loading states | Throttle network to Slow 3G and reload | skeletons/spinners appear per widget; page remains usable | blank layout, layout jump, or full-page freeze | confirm widget-level loading boundaries and no blocking synchronous errors |
| Retry states | Force one widget request to fail, then retry | widget shows retry affordance and recovers without reloading the whole page | full page crashes, retry missing, or retry duplicates requests excessively | inspect widget error boundary behavior and client-side request dedupe |
| Stale-data warnings | Simulate stale snapshot or degraded refresh | widget shows stale-warning or source badge without hiding last good data | stale data appears as fresh, or stale warning blocks usable content | inspect `meta` fields from API and confirm stale-state rendering logic |
| Empty states | Use BP user with no scope or empty datasets | empty message is explicit, non-breaking, and scoped | widget errors instead of emptying, or shows unrelated tenant data | inspect server response status and payload shape; confirm empty scope is treated as valid but empty |
| Responsive layout | Test at 1440px, 1024px, 768px, 390px | filters wrap cleanly, cards stack, tables degrade to mobile cards where designed | horizontal overflow, clipped chart, unreadable filters, or inaccessible paginator | inspect CSS breakpoints and verify no fixed-width child breaks the layout |

### Browser Failure Triage Order

1. Check Console for React rendering errors, chart warnings, and failed imports.
2. Check Network for `/partner/dashboard/overview`, `/revenue-trend`, `/student-growth-trend`, `/franchise-ranking`, and `/center-health` responses.
3. Confirm filter query params are normalized and do not contain malformed dates or unknown IDs.
4. Confirm the authenticated user is a BP user and that the scope middleware resolved a valid scope.
5. Confirm stale or missing snapshots are producing expected fallback metadata rather than hard failures.

---

## 2. Frontend Edge-Case Checklist

| Edge Case | UX Expectation | Fallback Handling | Graceful Degradation Strategy |
| --- | --- | --- | --- |
| Empty API response | Widget shows empty state, not an exception | render `emptyTitle` and `emptyMessage`; keep page chrome visible | do not collapse sibling widgets or clear active filters |
| Partially missing snapshot data | only affected metric or chart degrades; rest of page remains usable | prefer stale last-known-good data when available; otherwise show scoped empty state | never fabricate values; label snapshot source clearly |
| Slow network | widgets load independently and page remains interactive | show widget skeletons and keep filter controls available | avoid full-page blocking spinners |
| Offline browser state | offline banner appears and retries pause until user reconnects | preserve last rendered data if already loaded; otherwise show explicit offline message | do not spam retries while offline |
| Cache-expired response | widget refetches transparently and updates in place | keep existing content while refresh is pending when possible | only show inline refresh warning if refresh fails over stale data |
| Malformed query params | invalid values are sanitized on load | reset only invalid values, keep valid ones | never throw on unknown `franchiseId`, `centerId`, or malformed dates |
| Invalid filter IDs | filter UI clears unsupported IDs and narrows back to allowed options | drop invalid selection and rewrite URL safely | never forward invalid filter IDs to widen scope |
| Stale widget refresh | stale content remains visible with warning and retry | show inline widget warning instead of replacing content with fatal error | prefer last good data over blank widget if source is stale but usable |
| Partial widget failure | one widget can fail while others continue rendering | widget shell isolates loading/error/empty states per widget | no page-level crash for single-endpoint failure |

### Frontend QA Notes

- Empty scope is a valid business state, not an application error.
- A malformed URL must degrade to a safe default filter set.
- A stale refresh must never hide previously rendered scoped data unless the user explicitly resets or navigates away.

---

## 3. Backend Edge-Case Checklist

| Edge Case | Expected API Behavior | Logging Recommendation | Monitoring Alert |
| --- | --- | --- | --- |
| Empty BP scope | return `200` with empty arrays/zero-value summary and explicit metadata | log `bp_scope_empty_served` with `tenantId`, `businessPartnerId`, and endpoint | alert only if empty-scope rate spikes unexpectedly after deployment |
| Expired scope entries | resolved scope excludes expired records; response remains within current valid scope | log `bp_scope_expired_entries_ignored` with counts only | alert if expired-entry ignores suddenly spike, which suggests stale assignment cleanup issues |
| Missing snapshots | respond with defined fallback mode or empty result, never 500 for expected no-data conditions | log `bp_snapshot_missing` with endpoint, date window, and BP identifiers | alert if missing snapshots occur for recent dates beyond the accepted lag window |
| Stale snapshots | return data with stale metadata instead of pretending freshness | log `bp_snapshot_stale_served` with snapshot date and freshness delta | alert if stale responses exceed threshold for active BP traffic |
| Snapshot job overlap | second run should skip via local and DB lock behavior | log `analytics_job_lock_skipped` or equivalent structured event | alert if lock skips happen repeatedly across several scheduler windows |
| Cache invalidation timing race | stale cache must never leak foreign or broadened data; at worst it serves older in-scope data | log cache invalidation path and affected scope identifiers | alert on repeated stale-after-invalidation incidents reported during smoke or staging |
| Partial aggregation failure | pipeline logs partner-specific failure and continues other partners; failed partner stays visible in summary | log `analytics_snapshot_pipeline_partner_failed` with BP and tenant identifiers | alert if any pipeline run has non-zero failures for recent dates |
| Invalid tenant filtering | response must stay tenant-scoped and ideally reject impossible cross-tenant combinations | log `bp_scope_tenant_mismatch_attempt` or equivalent warning | page immediately if cross-tenant mismatch appears more than once |
| Unauthorized access attempt | return `401` or `403` without body data leakage | log access denial with route, actor id, tenant id, and reason | alert on repeated denial bursts per IP or user |

### Backend Behavior Rules

- No authorized BP request should receive foreign tenant or foreign BP data even under stale cache or malformed params.
- Expected empty-data situations should return safe `200` responses, not operational `500`s.
- Unexpected errors should be structured, categorized, and correlated to the specific endpoint and BP scope.

---

## 4. Observability Strategy

### Structured Logging Strategy

Keep the existing lightweight logger and standardize event payloads rather than adding a new platform.

Minimum log fields for all BP dashboard and analytics-job events:

- `event`
- `level`
- `timestamp`
- `requestId`
- `route`
- `method`
- `statusCode`
- `durationMs`
- `tenantId`
- `businessPartnerId`
- `userId`
- `scopeFranchiseCount`
- `scopeCenterCount`
- `cacheStatus`
- `snapshotDate` when relevant
- `errorCategory` for failures

### Dashboard API Timing Logs

Add or standardize one timing log per dashboard endpoint:

- `bp_dashboard_overview_served`
- `bp_dashboard_revenue_trend_served`
- `bp_dashboard_student_growth_served`
- `bp_dashboard_franchise_ranking_served`
- `bp_dashboard_center_health_served`

Each event should include:

- `durationMs`
- `cacheStatus`: `hit`, `miss`, `bypass`, `stale-hit`
- `resultCount` for tables and chart points
- `dataSource`: `snapshot`, `live-fallback`, `empty`, `stale-snapshot`
- `filterWindow`: normalized `from` and `to`

### Snapshot-Job Logging

The analytics job runner already emits scheduler and pipeline events. Standardize the runbook around these existing event families and make sure they are present in production logs:

- `analytics_scheduler_started`
- `analytics_scheduler_completed`
- `analytics_scheduler_tick_failed`
- `analytics_snapshot_pipeline_completed`
- `analytics_snapshot_pipeline_partner_failed`
- `analytics_job_lock_skipped`
- `snapshot_backfill_started`
- `snapshot_backfill_progress`
- `snapshot_backfill_completed`
- `snapshot_backfill_failed`

For each run, capture:

- `runId` or derived correlation id
- `snapshotDate`
- `tenantId` if scoped
- `processedBusinessPartners`
- `centerSnapshots`
- `franchiseSnapshots`
- `bpSnapshots`
- `failures`
- `durationMs`

### Cache Hit/Miss Logging

Log cache behavior only at the service boundary, not inside low-level loops.

Recommended events:

- `bp_dashboard_cache_hit`
- `bp_dashboard_cache_miss`
- `bp_dashboard_cache_invalidated`
- `bp_dashboard_cache_stale_served`

Required fields:

- `cacheKeyGroup`
- `tenantId`
- `businessPartnerId`
- `endpoint`
- `ttlMs`
- `ageMs` when stale data is served

### Error Categorization

Use stable categories to reduce noisy log searches:

- `auth_error`
- `scope_resolution_error`
- `validation_error`
- `snapshot_missing`
- `snapshot_stale`
- `cache_error`
- `query_error`
- `aggregation_error`
- `render_contract_error`
- `unexpected_error`

### Request Correlation Suggestions

- accept inbound `x-request-id` from the reverse proxy when present
- generate one if missing at the request logger layer
- echo it back in the response headers
- include the same `requestId` in downstream service logs, job-trigger logs, and error logs
- for scheduler and backfill runs, generate a `jobRunId` and include it in every related event

### Lightweight Monitoring Without A New Stack

- enable JSON log capture in the process manager or container runtime
- create grep-based or log-query-based alerts for `5xx`, `analytics_scheduler_tick_failed`, `analytics_snapshot_pipeline_partner_failed`, and repeated `analytics_job_lock_skipped`
- review daily counts for stale snapshot events and unauthorized access spikes

---

## 5. Performance Verification Plan

### Performance Checklist

| Area | Validation | Acceptable Threshold | Optimization Trigger |
| --- | --- | --- | --- |
| Dashboard initial load | first usable render of `/bp/dashboard` on staging data | warm load p95 under 1.5s; cold snapshot-backed load p95 under 3s | repeated p95 above threshold or user-visible spinner beyond 3s |
| Widget rerender frequency | filter change updates only dependent widgets | no duplicate rerenders caused by unstable filter sync or cache churn | repeated rerender spikes observed in React profiler or visible input lag |
| Chart rendering | revenue and student-growth charts mount on real data | chart mount under 400ms on typical staging payloads | visible stutter, long main-thread blocks, or canvas redraw loops |
| Pagination responsiveness | ranking and health table page changes | page change result under 800ms perceived latency | paginator click feels blocked or multiple clicks queue up |
| Snapshot query latency | snapshot-backed API endpoints | p95 under 500ms for overview/trend endpoints on staging-sized data | p95 exceeds 750ms or DB slow-query log confirms hotspot |
| Cache effectiveness | repeated requests from same BP/filter window | hit rate above 70% during manual smoke loops | hit rate remains low despite repeated identical requests |
| Background job duration | scheduled analytics window completes predictably | daily scheduled run completes within configured polling cadence and before next expected traffic peak | run duration approaches scheduler interval or overlaps next run |

### Verification Method

1. Measure browser page load with devtools and staging data.
2. Measure API endpoint durations in logs for overview, trend, and table endpoints.
3. Review React profiler once for filter changes and once for pagination changes.
4. Review job logs for duration and lock-skip frequency after one scheduled cycle.

### Performance Guardrails

- If overview or trend endpoints regularly miss the threshold, inspect snapshot query shape before touching frontend behavior.
- If pagination feels slow but API duration is acceptable, inspect table rerender and row-key stability.
- If cache hit rate is low on repeated identical requests, inspect cache key normalization and TTL settings before broader optimization.

---

## 6. Deployment Hardening Checklist

### Environment Validation Checklist

Validate these before deployment:

- `NODE_ENV=production`
- `DATABASE_URL`
- `PORT`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `REQUEST_BODY_LIMIT`
- `AUTH_RATE_LIMIT_WINDOW_MS`
- `AUTH_RATE_LIMIT_MAX`
- `KPI_RATE_LIMIT_WINDOW_MS`
- `KPI_RATE_LIMIT_MAX`
- `ANALYTICS_SCHEDULER_ENABLED`
- `ANALYTICS_SCHEDULER_RUN_ON_STARTUP`
- `ANALYTICS_SCHEDULER_POLL_MS`
- `ANALYTICS_SCHEDULER_RUN_HOUR_UTC`
- `ANALYTICS_SCHEDULER_RUN_MINUTE_UTC`
- `ANALYTICS_SCHEDULER_LOOKBACK_DAYS`

Validate these safety properties as well:

- reverse proxy forwards client IP and protocol
- production log sink persists JSON logs
- database credentials match intended production tenant database
- backups exist and restore procedure is verified before migration

### DB Migration Safety Checklist

1. take a verified backup immediately before migration
2. run the migration in staging on a production-like snapshot first
3. review destructive DDL risk and rollback path before production execution
4. run `prisma migrate deploy` only after env validation passes
5. verify migration completion and application boot before enabling live traffic

### Snapshot Scheduler Startup Validation

After deploy, verify:

- app boots without env validation errors
- scheduler logs `analytics_scheduler_started` when enabled
- `ANALYTICS_SCHEDULER_RUN_ON_STARTUP` behavior matches the planned rollout
- no repeated `analytics_scheduler_tick_failed` or lock-skip storm appears after boot

### Cache Warmup Strategy

Keep this lightweight and safe:

- do not mass-prime every BP scope
- after deployment, perform a smoke pass with one known-good BP account to populate the most common dashboard caches
- if traffic is low-risk, allow normal user traffic to warm caches naturally
- warm only the main dashboard slices: overview, revenue trend, student growth, franchise ranking, center health

### Production Rollout Order

1. verify backup and env values
2. deploy application build without routing production users yet if your platform allows it
3. run database migrations
4. boot app and confirm health and startup logs
5. validate scheduler configuration and first-cycle behavior
6. run browser smoke on `/bp/dashboard` with a scoped BP user
7. run security spot-checks for unauthorized and foreign-scope access
8. expose production traffic fully
9. monitor logs and timings for the first scheduler window and first active user cohort

### Rollback Considerations

- keep the previous application build ready for immediate redeploy
- if migrations are backward-compatible, rollback app first and leave schema forward until stable
- if a migration is not backward-compatible, do not deploy without an explicit tested rollback script or restore plan
- disable scheduler temporarily during rollback if it can continue mutating snapshot state against a partially reverted app

---

## 7. Final QA Matrix

### Frontend QA Matrix

| Area | Scenario | Pass Criteria |
| --- | --- | --- |
| KPI grid | standard scoped BP load | all KPI cards render with labels, values, and source badge |
| Charts | normal data load | both charts render without console errors |
| Filters | date and scope selectors | URL sync is stable and widgets refresh once per change |
| Retry | one endpoint failure then retry | only failed widget retries and recovers |
| Empty state | empty scope BP | empty-state messaging is explicit and non-breaking |
| Offline | browser offline after initial load | offline banner appears and last good data remains visible |
| Responsive | tablet and mobile widths | no horizontal overflow or clipped controls |

### Backend QA Matrix

| Area | Scenario | Pass Criteria |
| --- | --- | --- |
| Scope resolution | BP with normal scope | allowed franchise and center ids match expected assignments |
| Empty scope | BP with no assignments | endpoints return safe empty `200` payloads |
| Snapshot fallback | missing or stale snapshots | API returns explicit source metadata and no unhandled errors |
| Scheduler | one scheduled run | logs show completion with expected counts and no repeated lock skips |
| Cache invalidation | snapshot update then dashboard read | fresh reads eventually reflect new state without scope leakage |
| Unauthorized | missing or wrong role | endpoint returns `401` or `403` with no data body leakage |

### Security Validation Checklist

| Area | Scenario | Pass Criteria |
| --- | --- | --- |
| Foreign BP data | BP A tries BP B filter ids | response contains only BP A scoped data or safe empty result |
| Param tampering | malformed or widened query params | params are sanitized and do not broaden scope |
| Stale cache | cached response after scope changes | cached payload does not leak foreign tenant or foreign BP data |
| API auth | direct endpoint without valid auth | request is blocked with `401` or `403` |

### Responsive Testing Checklist

- desktop 1440px
- laptop 1024px
- tablet 768px
- mobile 390px
- verify filter wrapping, chart sizing, table-to-mobile-card behavior, and paginator usability

### Analytics Accuracy Validation

- compare dashboard totals against seeded or known staging truth for at least one BP user
- compare one snapshot date against raw DB counts for students, active centers, and collections
- validate trend data ordering and month bucketing
- confirm health score outputs are consistent with the current weighting rules

### Scope-Isolation Validation

- use two BP users with disjoint scopes
- replay identical dashboard URLs under both accounts
- confirm values, table rows, and available filter options differ exactly as expected
- confirm invalid foreign ids do not widen, merge, or cross-pollinate state

---

## 8. Security Validation Checklist

### Penetration-Style Checks

1. Authenticate as BP A and manually inject BP B `franchiseId` and `centerId` into the URL.
2. Replay dashboard API requests with tampered query params directly from devtools or Postman.
3. Remove or alter auth headers and confirm direct API denial.
4. Attempt malformed date ranges, duplicate params, and unexpected param types.
5. Force stale cache conditions, then repeat scope-tampering requests.
6. Validate stale snapshot fallback does not bypass BP scope enforcement.

### Manual Validation Steps

1. Login as a BP with known scope.
2. Capture valid dashboard requests in Network.
3. Reissue the request with a foreign `franchiseId`.
4. Reissue the request with a foreign `centerId`.
5. Reissue the request with impossible date windows and malformed dates.
6. Reissue the request after changing scope assignments or expiring scope rows in staging.
7. Confirm all responses stay within authorized scope or degrade to empty/denied responses.

### Expected Failure Responses

- unauthenticated request: `401`
- authenticated but unauthorized role or access: `403`
- malformed params: `400` only if validation rejects; otherwise sanitized safe request with scoped result
- foreign-scope filter ids: safe empty result or scoped result excluding foreign ids, never foreign data
- stale snapshot fallback: same scope guarantees as fresh data path

### Security Red Flags That Block Deployment

- any foreign-tenant or foreign-BP row appears in table payloads
- invalid filter ids widen visible data
- stale cache can return previously authorized but now unauthorized scope data after assignment changes
- unauthorized direct API access returns data or differentiates sensitive existence details

---

## 9. Stabilization Priority Matrix

### Critical Fixes

- browser smoke pass on `/bp/dashboard` is clean on desktop and mobile widths
- foreign-scope and unauthorized access checks pass consistently
- scheduler starts correctly and completes one controlled run without repeated failures
- stale snapshot and missing snapshot behavior is explicit and non-breaking
- minimum structured logging exists for endpoint timing, job failures, and access denials

### Recommended Fixes

- cache hit/miss visibility is available in logs
- one staging cycle validates cache invalidation after fresh snapshot generation
- performance baselines are recorded for dashboard load and endpoint p95 latency
- empty-state and partial-widget-failure UX is manually verified under throttled network

### Optional Polish

- lightweight warm-cache smoke routine for the most common BP dashboard slices
- simple ops dashboard or saved log queries for key analytics events
- additional widget-level tests for tables and filter controls

### Deployment-Ready Rule

Do not hold the release for optional polish. Block only on scope safety, browser smoke correctness, scheduler stability, and observability minimums.

---

## 10. Final Production Readiness Assessment

Phase 1 is conditionally deployment-ready.

What is already strong:

- scoped BP analytics architecture exists
- snapshot-first APIs exist
- background jobs and locking exist
- frontend dashboard is modular and responsive
- focused tests already cover key frontend contracts

What must still be confirmed before production rollout:

- browser smoke on `/bp/dashboard`
- staging validation of stale, empty, offline, and partial-failure UX
- unauthorized and foreign-scope security spot checks
- scheduler startup and one recent scheduled processing cycle in staging
- minimal log-based monitoring for endpoint latency, snapshot freshness, and job failures

Release verdict:

- deploy after the critical items in Section 9 are green
- do not widen scope into redesign work during this pass
- treat this as a stabilization gate, not a feature phase

Operational recommendation:

- complete one final staging smoke cycle with a known BP account, an empty-scope BP account, and one unauthorized account
- if all critical checks pass and logs remain clean through one scheduler window, production rollout is justified