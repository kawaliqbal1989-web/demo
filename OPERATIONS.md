# OPERATIONS Runbook

Operational runbook for AbacusWeb backend.

## VPS Quick Deploy (Hostinger or Generic Debian)

Use one of these two paths based on what changed.

### A) Backend-Only Hotfix (No frontend changes)

Run on server app directory:

1. `git pull origin main`
2. `npm ci --omit=dev` (skip if dependencies unchanged)
3. `npm run prisma:deploy` (only if migrations were included)
4. `pm2 restart all --update-env`
5. `npm run verify:deploy -- --base https://abacuseducation.online`

Important:
- Root `package.json` intentionally has no `build` script.
- For backend-only updates, do not run `npm run build` at repo root.

### B) Full Release (Frontend and backend changes)

Local or CI prepare step:

1. `npm ci`
2. `npm run release:prepare`

Server apply step:

1. Upload prepared `deploy/` artifact (or equivalent)
2. `npm ci --omit=dev`
3. `npm run prisma:deploy`
4. `pm2 restart all --update-env`
5. `npm run verify:deploy -- --base https://abacuseducation.online`

Routing note:
- In production, Express serves `frontend/dist` and falls back to `index.html` for non-API routes.
- If Nginx is used, proxy app traffic to Node/PM2 so SPA deep links like `/teacher/exam-cycles/:id` resolve correctly.

## 1) Deployment Steps (Local -> Staging -> Production)

## Local

1. Pull latest code.
2. Install dependencies:
   - `npm install`
3. Generate Prisma client:
   - `npm run prisma:generate`
4. Apply local migrations:
   - `npm run prisma:migrate`
5. Seed test data if needed:
   - `npm run prisma:seed`
6. Start app:
   - `npm run dev`
7. Run smoke checks:
   - `GET /health`
   - auth/login sanity check

## Staging

1. Build and package release artifact/container.
2. Set staging env vars (never reuse local secrets).
3. Run migrations in staging before traffic switch:
   - `npm run prisma:deploy`
4. Deploy app (rolling/canary preferred).
5. Run post-deploy smoke + regression checks:
   - auth flow
   - RBAC restrictions
   - competition workflow transitions
6. Observe logs/metrics for 15 to 30 minutes.

## Production

1. Freeze deploy window and announce start.
2. Verify backups are current and restore is tested.
3. Deploy DB migrations using deploy job:
   - `npm run prisma:deploy`
4. Deploy app instances gradually (rolling/canary).
5. Perform production smoke verification.
6. Monitor critical dashboards/alerts for at least 30 minutes.
7. Mark release complete and record release notes.

---

## 2) Prisma Migration Rollout Process

1. Create migration in dev:
   - `npx prisma migrate dev --name <migration_name>`
2. Review generated SQL for safety and locking behavior.
3. Test migration on a production-like staging dataset.
4. Commit migration files and Prisma schema together.
5. In production, run only:
   - `npm run prisma:deploy`
6. Confirm migration history:
   - `npx prisma migrate status`

Rules:
- Never run `migrate dev` in production.
- Never edit applied migration files retroactively.
- Prefer additive and backward-compatible changes first.

---

## 3) Rollback Procedure (Schema + App)

## App Rollback

1. Re-deploy previous stable artifact/tag.
2. Confirm app startup and health endpoint.
3. Validate auth and core business routes.

## Schema Rollback

Prisma does not provide one-click automatic down migration for all cases. Use controlled approach:

1. If migration is backward compatible, keep schema and only roll back app.
2. If schema rollback is required:
   - Prepare explicit rollback SQL script beforehand.
   - Execute in maintenance window if destructive.
3. Validate DB integrity and app compatibility after rollback.
4. Restore from backup if rollback SQL is unsafe or failed.

Recommended rollback strategy:
- Expand/contract migration model:
  - Expand (add columns/tables)
  - App reads/writes both shapes
  - Contract old shape in later release

---

## 4) Zero-Downtime Deployment Approach

1. Use rolling or blue/green deployment.
2. Run backward-compatible migrations first.
3. Deploy new app version gradually (canary 5 to 10%).
4. Monitor error rate, latency, auth success, DB load.
5. Ramp traffic to 100% if stable.
6. Keep previous version warm for quick rollback.

Avoid:
- Breaking schema changes and app change in the same instant cutover.
- Long table locks during peak traffic.

---

## 5) Incident Response Steps

## A) Auth Failure Spike

Symptoms:
- Sudden increase in 401/403 on auth endpoints
- Login success ratio drops

Actions:
1. Check secret mismatch (JWT access/refresh secrets) across instances.
2. Validate rate-limit thresholds are not overly strict.
3. Inspect recent deploy/env changes.
4. Verify DB availability for auth queries and refresh token checks.
5. If active incident persists, rollback app to last stable tag.

Containment:
- Temporarily increase auth logs and keep alerting active.
- Do not disable auth protections globally.

## B) DB Connection Pool Exhaustion

Symptoms:
- Increased DB timeout errors
- Elevated p95 latency and 5xx

Actions:
1. Check active connections and long-running queries.
2. Review slow query logs.
3. Scale app replicas down/up appropriately to rebalance connection pressure.
4. Tune pool limits and DB max connections.
5. Restart unhealthy instances only if needed.

Containment:
- Apply temporary traffic shaping/rate limiting.
- Prioritize critical endpoints.

## C) Token Abuse Detection

Symptoms:
- Repeated refresh failures, suspicious token reuse, unusual geolocation/IP activity

Actions:
1. Revoke active refresh tokens for impacted users/tenant.
2. Force re-authentication for affected accounts.
3. Rotate JWT secrets if compromise suspected.
4. Investigate audit logs and IP/user-agent patterns.
5. Notify security stakeholders and document timeline.

Containment:
- Tighten auth rate limits temporarily.
- Block malicious IP ranges at edge/WAF.

## D) Competition Workflow Stuck

Symptoms:
- Competition remains in one stage unexpectedly
- Forward request conflicts or repeated denials

Actions:
1. Inspect competition `workflowStage` and related audit events.
2. Verify actor role permissions and scope constraints.
3. Identify invalid transition attempt vs data inconsistency.
4. If data fix required, apply controlled DB correction with peer review.
5. Add post-incident guardrails and regression checks.

Containment:
- Pause workflow actions for affected competition only.

---

## 6) Backup Restoration Procedure

1. Declare incident and freeze write traffic if needed.
2. Identify restore target (timestamp + environment).
3. Restore to isolated environment first.
4. Validate:
   - schema version
   - row counts for critical tables
   - auth + workflow integrity
5. Switch production traffic only after verification.
6. Run post-restore checks and communicate completion.

Minimum restore validation:
- `GET /health`
- auth/login test
- key tenant read path
- audit log write path

---

## 7) Log Investigation Checklist

1. Define exact time window (UTC).
2. Correlate by request_id/user_id/tenant_id if available.
3. Check sequence:
   - ingress proxy logs
   - app structured logs
   - DB logs
4. Identify first error and preceding warnings.
5. Separate symptom from root cause.
6. Capture impacted endpoints, tenants, and counts.
7. Preserve evidence and timeline for postmortem.

Queries to prioritize:
- 5xx by route
- auth failure rate
- rate-limit events (429)
- DB timeout/connection errors
- workflow transition failures

---

## 8) Version Tagging Strategy

Use semantic versioning:
- `vMAJOR.MINOR.PATCH`

Guidelines:
- `PATCH`: bug fixes, no API break
- `MINOR`: backward-compatible features
- `MAJOR`: breaking changes

Release tags:
- App release tag: `vX.Y.Z`
- Optional DB migration marker in release notes:
  - `db-migration: yes/no`
  - `migration-id: <name>`

Recommended git tags:
- Annotated tags with changelog summary
- Hotfix format: `vX.Y.Z-hotfix.N`

---

## 9) Production Health Verification Checklist

Run after each deployment:

- `GET /health` returns success
- Auth login works for known test account
- Refresh token rotation works
- One protected route succeeds with valid role
- One forbidden route returns expected 403
- DB connectivity stable (no spike in timeout errors)
- Error rate and latency within baseline
- Audit logs being written
- No abnormal rate-limit or token abuse alerts

---

## 10) Release Checklist Template

Copy/paste template:

```text
Release ID: 
Version Tag: 
Date/Time (UTC): 
Owner: 

Pre-Release
[ ] PR approved
[ ] CI green
[ ] Security checks reviewed
[ ] Migration SQL reviewed
[ ] Backup verified (fresh + restorable)
[ ] Rollback plan confirmed

Deployment
[ ] Deploy DB migration (prisma migrate deploy)
[ ] Deploy app (rolling/canary)
[ ] Health endpoint check passed
[ ] Smoke tests passed (auth, RBAC, workflow)

Post-Deployment
[ ] Error rate normal
[ ] Latency normal
[ ] DB connections healthy
[ ] Audit logs verified
[ ] Alerts quiet for 30 min

Sign-off
[ ] Product owner informed
[ ] Incident channel updated
[ ] Release notes published

Rollback (if needed)
[ ] Trigger app rollback
[ ] Execute schema rollback plan/restore
[ ] Re-verify health and critical flows
```

---

## Operational Notes

- Prefer reversible, additive changes.
- Keep secrets in secure vaults, not in repo.
- Maintain tested runbooks for migration failure and restore scenarios.
