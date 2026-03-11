# Staging Validation Checklist

Use this checklist to validate the staging deployment before promoting to production.

## Quick Automated Verification

```bash
# Run automated smoke tests against staging
npm run verify:deploy -- --base http://<staging-host>:4001

# Preview migration plan (no execution)
npm run migrate:plan

# Run migrations for a specific wave only
node scripts/run-migrations.mjs --wave wave1
```

## Manual Verification

### Infrastructure
- [ ] **Health endpoint**: `GET /health` returns `{"status":"ok"}`
- [ ] **DB health**: `GET /health/db` returns `{"status":"ok"}`
- [ ] **Readiness probe**: `GET /ready` returns `{"ready":true}`
- [ ] **API health**: `GET /api/health` returns `{"status":"ok","db":"ok"}`

### Authentication & Authorization
- [ ] **Auth test**: Login with seeded superadmin (`superadmin@abacusweb.local` / `Pass@123`), verify access + refresh token flow
- [ ] **Role restriction**: SUPERADMIN-only endpoint rejects CENTER/BP/TEACHER users
- [ ] **Token refresh**: Expired access token triggers refresh flow correctly

### Wave 1: Foundation & Shell
- [ ] **Design System**: Dashboard pages render with updated MetricCards, PageHeaders, Breadcrumbs
- [ ] **Insights**: `GET /api/insights` returns insight list (or empty array if no data)
- [ ] **Command Palette**: Ctrl+K opens command palette with role-specific actions

### Wave 2: Student & Teacher Intelligence
- [ ] **Student Coach**: Student dashboard shows Daily Mission, Weekly Plan, Streaks
- [ ] **AI Learning Lab**: Student AI Playground loads with coach tab
- [ ] **Teacher Cockpit**: Teacher dashboard shows At-Risk Queue, Batch Heatmap
- [ ] **Promotions**: Trigger promotion engine, verify progression history

### Wave 3: Leadership & Notifications
- [ ] **Center Health**: Center dashboard shows HealthScoreRing, TeacherWorkload, FeePulse
- [ ] **Network Pulse**: Franchise/BP/Superadmin dashboards show NetworkPulseCard
- [ ] **Notifications**: Priority notifications, notification preferences, automation panel
- [ ] **Notification automation**: Superadmin can trigger automation rules

### Wave 4: Workflow & AI Surfaces
- [ ] **DataTable V3**: Selectable rows, bulk actions, saved views, column visibility
- [ ] **Bulk Operations**: Center can bulk update student status
- [ ] **AI Narratives**: Each role dashboard shows AI narrative panel (or deterministic fallback)
- [ ] **Rate Limiting**: AI narratives respect 10/hour per user limit (429 after exceeded)
- [ ] **Approval Queue**: Exam/competition approval queue with SLA tracking

### Release Management
- [ ] **Wave Status**: `GET /api/superadmin/release/waves` returns 4 waves
- [ ] **Feature Flags**: All waves show as enabled (or per `FEATURE_FLAGS` env var)
- [ ] **Deploy Info**: `GET /api/superadmin/release/deploy-info` returns version and stats
- [ ] **Release UI**: Superadmin sidebar shows "Release Management" page

### Data Integrity
- [ ] **Migrations**: `prisma_migrations` table has all migrations applied
- [ ] **Secrets**: `JWT_*` secrets are staging-specific, NOT production values
- [ ] **Worksheet generation**: Generate worksheet, verify question count and difficulty match
- [ ] **Competition flow**: Create → enroll → submit result → verify leaderboard
- [ ] **Abuse flags**: Rapid submissions trigger abuse flag and notification

### Performance
- [ ] **Health latency**: `/health` responds under 500ms consistently
- [ ] **Dashboard load**: Dashboard pages render within 2s on staging hardware
- [ ] **AI narrative**: Gemini narrative returns within 10s (or falls back to deterministic)
