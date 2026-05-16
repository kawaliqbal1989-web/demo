# BP Phase 1 Migration Recovery

This document defines the production-safe recovery plan for the BP Phase 1 schema drift that blocked runtime validation.

This is a database alignment problem, not an application architecture problem.

Scope is intentionally limited to:

- Prisma migration baseline recovery
- missing Phase 1 schema objects
- production-safe schema synchronization
- runtime recovery validation
- rollback-safe migration governance

Out of scope:

- frontend redesign
- backend redesign
- analytics feature rewrites
- API redesign
- scope engine redesign

Repo/runtime evidence gathered during validation:

- live runtime BP dashboard requests failed with `500 INTERNAL_ERROR`
- the shared root cause was `The table businesspartnerfranchise does not exist in the current database`
- `npm run prisma:deploy` against the active local runtime database failed with `P3005`
- the active local runtime database `abacusweb` is non-empty with `101` tables
- the active local runtime database has no `_prisma_migrations` or `prisma_migrations` table
- the active local runtime database is missing `businesspartnerfranchise`, `businesspartnercenterscope`, and `analyticsdailysnapshot`
- the active local runtime database does contain `batchscheduleslot`, so the batch Phase 1 migration boundary must be verified rather than assumed missing wholesale
- the repository migration chain contains both `20260509000100_batch_phase1_upgrade` and `20260509000200_bp_scope_phase1_foundation`

Implication:

- the runtime database is not merely missing one BP table
- it is an unmanaged legacy schema relative to the current Prisma migration chain
- the BP scope Phase 1 migration was never reconciled into the active runtime database
- the immediately previous batch migration remains a checkpoint decision that must be verified by comparison, not blindly replayed

---

## 1. Root Cause Analysis

### Why `P3005` Happens

`prisma migrate deploy` expects one of these states:

- an empty database, where it can apply the full migration history from the start
- a database that already has a Prisma migration ledger, usually `_prisma_migrations`, showing which migrations were applied

The active runtime database satisfies neither condition.

Observed state:

- database is non-empty
- Prisma migration ledger is absent

Because of that, Prisma correctly refuses to assume that the existing schema matches the migration history. That refusal is `P3005`.

### Why BP Tables Are Missing

The repo migration `20260509000200_bp_scope_phase1_foundation` creates the Phase 1 BP objects, including:

- `businesspartnerfranchise`
- `businesspartnercenterscope`
- `analyticsdailysnapshot`
- `franchiseanalyticssnapshot`
- `centeranalyticssnapshot`

The active runtime database does not contain these objects, so any shipped code path that resolves BP scope or snapshot reads against these tables fails immediately.

### How Runtime Drift Happened

The evidence points to a classic migration governance drift:

1. The application kept running against a long-lived database created outside Prisma migration management or before Prisma migration tracking was adopted.
2. New Prisma migration folders were added to the repo.
3. The active runtime database was never baselined into Prisma.
4. At least the last two migrations were never reconciled into the live schema.
5. The release deployed app code that expects those tables.

### Why `migrate deploy` Failed In Practice

It failed for the right reason.

Prisma saw:

- existing tables already present
- no migration history table

That means Prisma had no safe proof that applying its migration chain would be non-destructive or idempotent. So it refused to continue.

### Precise Deployment Lifecycle Failure

The release process validated generic health successfully, but the runtime-specific BP analytics surface was not validated against a schema-aligned database before approval.

This allowed a release state where:

- auth works
- frontend shell works
- protected routes work
- generic deploy verification passes
- BP analytics fails because schema expectations are ahead of the live database

That is not a logic regression. It is a schema lifecycle mismatch.

---

## 2. Baseline Recovery Strategy

### Goal

Adopt the existing non-empty production-like database into Prisma safely, without resetting it and without pretending that missing migrations are already applied.

### What Not To Do

- do not run `prisma migrate reset`
- do not drop production tables to force a clean replay
- do not mark the full migration chain as applied blindly
- do not manually insert rows into `_prisma_migrations` unless Prisma commands cannot express the required state and the change is reviewed as a last resort

### Correct Recovery Model

Use a reconciliation checkpoint, not a fake full baseline.

The safe mental model is:

- baseline the database only up to the schema state it actually matches
- then apply only the missing additive migrations afterward

In this incident, the database clearly does not match the latest repo state, because it is missing the BP Phase 1 objects from `bp_scope_phase1_foundation` and has no Prisma migration ledger. It also contains `batchscheduleslot`, so the previous migration must be evaluated as a checkpoint candidate rather than assumed absent.

### Safe Baseline Strategy

1. Clone production to a staging recovery database.
2. Introspect the clone and diff it against the repo migration chain.
3. Identify the highest migration that the clone actually matches.
4. Use `prisma migrate resolve --applied` only up to that verified checkpoint.
5. Leave later migrations unresolved.
6. Run `prisma migrate deploy` so Prisma applies only the remaining migrations.

### Prisma Migration Ledger Reconciliation

Expected Prisma ledger after reconciliation:

- earlier already-matched migrations are recorded as applied
- missing release migrations are then applied normally by `migrate deploy`

This is the key rule:

- do not record `20260509000100_batch_phase1_upgrade` or `20260509000200_bp_scope_phase1_foundation` as applied until their objects actually exist in the target database
- if `20260509000100_batch_phase1_upgrade` is partially or fully present outside Prisma tracking, prove that with comparison before resolving it as applied

### Deployment-Safe Reconciliation Principle

If you cannot prove the database matches a migration, do not resolve it as applied.

That rule prevents exactly the kind of permanent schema lie that would make later recoveries worse.

---

## 3. Missing Table Recovery Plan

### Tables To Recover

Minimum confirmed missing release objects:

- `businesspartnerfranchise`
- `businesspartnercenterscope`
- `analyticsdailysnapshot`
- `franchiseanalyticssnapshot`
- `centeranalyticssnapshot`

Potentially missing associated indexes and foreign keys from the BP Phase 1 migration must be treated as part of the recovery, not as optional follow-up.

Checkpoint note:

- because `batchscheduleslot` already exists in the live database, `20260509000100_batch_phase1_upgrade` may have been applied partially or manually outside Prisma tracking
- that migration must be proven matched before resolving it as applied or replaying any part of it

### Safest Creation Strategy

Use the existing repository migrations in order, on a staging clone first.

Why:

- the repo migrations already encode object definitions, foreign keys, indexes, and backfill logic
- replaying the intended migration artifacts is safer than re-creating the tables ad hoc by hand

### Migration Ordering

Apply in this order:

1. last verified matching migration checkpoint
2. any unresolved migration after that checkpoint, as proven by schema comparison
3. `20260509000200_bp_scope_phase1_foundation` if still unresolved after checkpoint analysis

This matters because the BP runtime drift is proven for BP Phase 1 tables, but the immediately previous migration is now a checkpoint question, not a blind replay target.

### Runtime Compatibility Handling

During rollout:

- do not point production traffic to app code that expects the new tables until the migrations have completed and verification passes
- if blue/green or rolling deployment is used, run schema reconciliation first and only then cut traffic to the new app version

### Partial-Schema Handling

If a recovery run creates some objects but fails before completion:

- stop the rollout
- inspect which migration statement failed
- validate that all created objects remain consistent
- either resume from the failure point after correction or restore from backup if consistency is uncertain

### Data Backfill For BP Scope

The migration already backfills `businesspartnerfranchise` from `franchiseprofile.businessPartnerId`.

The repo also provides a script for controlled follow-up backfill:

- [scripts/backfill-bp-franchise-scope.mjs](d:/demo-main/demo-main/scripts/backfill-bp-franchise-scope.mjs)

Use it only after the tables exist and only if reconciliation checks show missing scope rows after migration.

---

## 4. Prisma Deployment Recovery Flow

### Production-Safe Workflow

Perform recovery on a staging clone first.

#### Step A: Backup

1. take a full backup of the target database
2. verify backup integrity and restore target

#### Step B: Inspect Current State

Recommended commands:

```bash
npm run migrate:plan
```

Use Prisma diff commands against a staging clone:

```bash
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma
```

For SQL output during review:

```bash
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > drift-review.sql
```

#### Step C: Find The Reconciliation Checkpoint

Determine the latest migration folder that the live schema truly matches.

In this incident, evidence already shows the database does not include the BP Phase 1 objects from `20260509000200_bp_scope_phase1_foundation`.

However, because `batchscheduleslot` exists, `20260509000100_batch_phase1_upgrade` must be treated as one of these:

- fully matched
- partially matched
- manually applied outside Prisma

So the checkpoint may be before `20260509000100_batch_phase1_upgrade`, at it, or after it only if comparison proves equivalence.

#### Step D: Resolve Applied History Only Up To The Verified Checkpoint

Example pattern:

```bash
npx prisma migrate resolve --applied 20260216000000_init
npx prisma migrate resolve --applied 20260217000100_superadmin_authuser_link
...
npx prisma migrate resolve --applied <last_verified_matching_migration>
```

Do not resolve the missing release migrations as applied.

#### Step E: Apply Remaining Migrations Normally

```bash
npm run prisma:deploy
```

At that point Prisma should apply only the migrations after the resolved checkpoint.

### Staging-First Recovery Sequence

1. restore production backup into staging recovery DB
2. inspect schema drift
3. determine checkpoint
4. resolve applied migrations up to checkpoint
5. run `npm run prisma:deploy`
6. run BP runtime validation
7. verify scheduler and snapshot behavior
8. only then promote the same procedure to production

### Production Rollout Sequence

1. backup production
2. verify backup restore path
3. put release in controlled deployment mode
4. resolve historical migrations up to verified checkpoint
5. run `npm run prisma:deploy`
6. run runtime verification immediately
7. enable or confirm scheduler only after schema validation passes
8. run dashboard smoke validation
9. approve release only after BP APIs are healthy

---

## 5. Drift Detection & Verification

### Drift Detection Process

Run these checks before and after recovery.

#### A. Check Migration History Presence

Confirm whether `_prisma_migrations` exists.

#### B. Compare Live Schema To Prisma Schema

```bash
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma
```

#### C. Compare Live Schema To Migration History

```bash
npx prisma migrate status
```

After reconciliation, `migrate status` should no longer show an unmanaged non-empty database state.

#### D. Validate Prisma Client Alignment

```bash
npm run prisma:generate
```

Then restart the backend and verify the runtime can query the new objects without Prisma model mismatch.

### Verification Commands

```bash
npm run prisma:deploy
npm run verify:deploy -- --base https://<target-host>
```

For targeted runtime verification, call the BP endpoints directly after auth:

- `/api/partner/dashboard/overview`
- `/api/partner/dashboard/revenue-trend`
- `/api/partner/dashboard/student-growth-trend`
- `/api/partner/dashboard/franchise-ranking`
- `/api/partner/dashboard/center-health`

### Post-Migration Checks

Confirm:

- `_prisma_migrations` exists
- latest required migrations are marked applied
- Phase 1 BP tables exist
- foreign keys and indexes exist
- BP APIs return `200` instead of `500`
- scheduler can start without schema exceptions

---

## 6. Safe Migration Governance Rules

### Deployment Governance Rules

1. Never release code that depends on new tables before the target database is migration-aligned.
2. Never use a generic health pass as a substitute for release-surface validation.
3. Treat `_prisma_migrations` as a required production control plane object, not as optional tooling metadata.

### Migration Discipline Rules

1. Never use `migrate dev` in production.
2. Never edit already-applied migration SQL.
3. Never baseline a database to a migration you have not proven it matches.
4. Prefer additive migrations and expand/contract rollout patterns.

### CI/CD Recommendations

1. Run `prisma migrate status` as a deployment gate.
2. Run `prisma migrate diff` on staging before approving production.
3. Require a schema-alignment check for every release that includes Prisma schema changes.
4. Add a BP-specific smoke test after deploy, not only generic health checks.

### Release Sequencing Rule

Correct sequence:

1. backup
2. migrate database
3. verify schema state
4. deploy app
5. validate runtime
6. enable full traffic

Wrong sequence:

1. deploy app
2. discover missing tables under live traffic

---

## 7. Runtime Recovery Validation Plan

### Pass/Fail Validation Flow

After migration recovery, validate in this order:

1. `GET /health`
2. `GET /health/db`
3. BP auth login
4. `/api/partner/dashboard/overview`
5. `/api/partner/dashboard/revenue-trend`
6. `/api/partner/dashboard/student-growth-trend`
7. `/api/partner/dashboard/franchise-ranking`
8. `/api/partner/dashboard/center-health`
9. `/bp/dashboard` browser smoke
10. snapshot run and scheduler validation

### Expected Runtime Outcomes

Pass condition:

- all BP dashboard APIs return `200`
- KPI data renders
- charts render
- tables paginate
- filter catalog loads
- no Prisma missing-table errors appear

Additional runtime checks:

- unauthorized BP endpoint access still returns `401` or `403`
- foreign filter ids do not widen scope
- retry states recover from transient failures without revealing schema errors
- scheduler starts without runtime schema exceptions
- cache invalidation occurs after snapshot updates

### Scheduler Validation

Confirm:

- `analytics_scheduler_started`
- at least one successful pipeline completion event
- no schema-related job failures
- no repeated lock-skip storm

---

## 8. Rollback Safety Plan

### Rollback-Safe Migration Strategy

The safest boundary is:

- additive schema migration first
- keep old app artifact available
- only then cut traffic to the new release

### Backup Guidance

Before touching production:

1. full database backup
2. restore validation to isolated environment
3. named restore target and operator owner

### Partial Failure Handling

If reconciliation fails before completion:

- stop rollout
- do not advance app traffic
- inspect created objects and migration state
- either resume safely after correction or restore from backup

### Emergency Recovery Flow

1. disable scheduler if needed using `ANALYTICS_SCHEDULER_ENABLED=false`
2. keep or restore previous stable app artifact
3. restore DB from backup if migration state is uncertain or inconsistent
4. validate health, auth, and BP dashboard again before reattempting release

### Safe Rollback Boundaries

- if migration is additive and backward-compatible, app-only rollback is preferred
- if migration partially applied and integrity is uncertain, database restore is safer than ad hoc destructive cleanup
- never improvise destructive rollback SQL under active incident pressure without a tested plan

---

## 9. Recovery Observability Plan

### Migration Logging

Capture and retain:

- `prisma migrate status` output
- `prisma migrate resolve` actions
- `prisma migrate deploy` output
- exact operator, timestamp, environment, and database target

### Deployment Logging

Record:

- backup start and completion
- checkpoint selection decision
- resolved migrations list
- deploy start and completion
- runtime verification results

### Schema Verification Logs

Keep a recovery artifact bundle containing:

- pre-recovery schema diff
- post-recovery schema diff
- list of Phase 1 tables confirmed present
- BP endpoint verification results

### Recovery Audit Trail Minimum

For every environment touched, keep:

- environment name
- database name
- backup id or snapshot id
- migrations resolved as applied
- migrations actually deployed
- runtime validation owner and result

---

## 10. Final Production Recovery Execution Plan

Execute in this exact order.

### 1. DB Backup

1. take a full production backup
2. verify restore target and operator owner
3. restore the backup to staging recovery environment

### 2. Schema Inspection

1. run `npx prisma migrate status`
2. run `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma`
3. confirm missing release objects and identify the last schema checkpoint that actually matches the live DB

### 3. Migration Baseline

1. on staging recovery DB, resolve historical migrations as applied only up to the verified checkpoint
2. do not resolve `20260509000200_bp_scope_phase1_foundation` unless the database already contains its objects
3. resolve `20260509000100_batch_phase1_upgrade` only if schema comparison proves the clone already matches it closely enough to treat it as historically applied

### 4. Migration Reconciliation

1. run `npm run prisma:deploy`
2. let Prisma apply the missing release migrations in order
3. if BP scope rows need confirmation after creation, run the dry run of [backfill-bp-franchise-scope.mjs](d:/demo-main/demo-main/scripts/backfill-bp-franchise-scope.mjs), then apply only if needed

### 5. Deploy Sequence

1. keep previous stable app artifact ready
2. migrate schema first
3. deploy app build only after schema success
4. keep scheduler disabled during reconciliation if there is any risk of schema-race failures

### 6. Runtime Verification

1. verify health endpoints
2. verify BP login
3. verify all five BP dashboard APIs return `200`
4. verify there are no missing-table Prisma exceptions

### 7. Scheduler Validation

1. enable or confirm scheduler
2. verify startup log
3. verify one successful analytics pipeline run
4. confirm no schema-related job failure logs

### 8. Dashboard Smoke Validation

1. open `/bp/dashboard`
2. confirm KPI cards render
3. confirm charts render
4. confirm ranking and center-health tables render
5. confirm filters load and URL sync persists

### 9. Release Re-Approval

Approve only if all of the following are true:

- Prisma migration ledger is aligned
- missing Phase 1 tables now exist
- BP APIs return healthy responses
- scheduler validates cleanly
- dashboard smoke passes
- rollback readiness remains intact

### Recovery Verdict Rule

- if the staging recovery passes cleanly, repeat the same controlled sequence in production
- if any step leaves schema integrity uncertain, stop and restore rather than improvising destructive cleanup