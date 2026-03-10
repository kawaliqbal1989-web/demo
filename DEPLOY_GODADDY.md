# GoDaddy (Shared Hosting) Deployment

AbacusWeb is a **unified** Node.js app: the Express backend serves both the API (`/api/*`) and the React frontend (everything else) from a single process. No separate frontend hosting is needed.

---

## Quick-Start (5 minutes)

```
1. Run locally:    node scripts/prepare-deploy.mjs
2. Upload:         deploy/ folder → cPanel
3. Configure:      .env.production → .env (fill in real values)
4. Install:        npm ci --omit=dev
5. Database:       npx prisma generate && npx prisma migrate deploy
6. First time:     npx prisma db seed
7. Start app       via cPanel Node.js App UI
```

---

## Detailed Steps

### 1) Prerequisites
- GoDaddy plan with **cPanel Node.js Apps** (or "Node.js Application" manager)
- A MySQL database + user created in cPanel → **MySQL Databases**
- Node.js ≥ 18 (use the highest version available in cPanel)

### 2) Prepare the Deploy Package (on your local machine)

```bash
node scripts/prepare-deploy.mjs
```

This will:
- Build the React frontend with `VITE_API_BASE_URL=/api`
- Copy backend source, Prisma files, built frontend, and configs into `deploy/`

### 3) Upload to GoDaddy
Upload the **contents** of `deploy/` to your cPanel app root via:
- **File Manager** → zip `deploy/` and upload + extract, or
- **SFTP / SSH** → rsync or scp

### 4) Configure Environment Variables
Copy `.env.production` to `.env` on the server and fill in real values:

```bash
cp .env.production .env
```

**Required variables:**

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `mysql://user:pass@localhost:3306/abacusweb` | Your cPanel MySQL credentials |
| `JWT_ACCESS_SECRET` | (random 48-byte base64) | `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `JWT_REFRESH_SECRET` | (different random string) | Same command, different value |
| `JWT_ISSUER` | `abacusweb` | Any consistent string |
| `JWT_AUDIENCE` | `abacusweb-users` | Any consistent string |
| `CORS_ALLOWED_ORIGINS` | `https://yourdomain.com` | Your domain(s), comma-separated |

### 5) Set Up the Node.js App in cPanel
In cPanel → **Setup Node.js App**:
- **Application root**: your upload folder
- **Application startup file**: `src/server.js`
- **Application mode**: `production`

### 6) Install Dependencies
In cPanel terminal (or SSH):

```bash
npm ci --omit=dev
```

### 7) Database Setup (Prisma)

```bash
npx prisma generate
npx prisma migrate deploy
```

> If `migrate deploy` fails because the database was created manually, use:
> ```bash
> npx prisma db push --schema prisma/schema.prisma
> npx prisma generate
> ```

### 8) Seed (first-time only)

```bash
npx prisma db seed
```

Default login: `superadmin@abacusweb.local` / `Pass@123`
**Change this password immediately after first login.**

### 9) Start / Restart
Use the cPanel Node.js App UI to start or restart the application.

Verify it's running:
- `GET https://yourdomain.com/health` → `{"status":"ok"}`
- `GET https://yourdomain.com/health/db` → `{"status":"ok"}`
- `GET https://yourdomain.com/` → React app loads

### 10) Cron: Monthly Settlements
In cPanel → **Cron Jobs**, add (1st of each month at 01:10 UTC):

```bash
/usr/local/bin/node /home/<cpanel-user>/<app-root>/scripts/run-monthly-settlements.js --tenantId tenant_default
```

Or trigger manually via API: `POST /api/settlements/generate` (SUPERADMIN)

---

## Updating (Re-deploy)

```bash
# On your local machine:
node scripts/prepare-deploy.mjs

# Upload deploy/ folder to cPanel (overwrite existing files)
# On the server:
npm ci --omit=dev
npx prisma generate
npx prisma migrate deploy

# Restart the app in cPanel UI
```

---

## Architecture

```
                     GoDaddy cPanel
                    ┌─────────────────────────────┐
                    │  Node.js App (port 4000)     │
  Browser ────────► │                              │
                    │  GET /api/*  → Express API   │
                    │  GET /*      → React SPA     │
                    │  /uploads/*  → Static files  │
                    │                              │
                    │  MySQL 8.0 (localhost:3306)   │
                    └─────────────────────────────┘
```

## Notes
- The frontend is served by Express in production — no separate web server needed.
- `CORS_ALLOWED_ORIGINS` should include your domain as a safety measure.
- Keep `.env` out of version control — it contains secrets.
- The `uploads/` directory stores user-uploaded files; ensure it persists across deploys.
