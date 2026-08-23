# Hostinger Deployment Guide

AbacusWeb is a **unified** Node.js app: the Express backend serves both the API (`/api/*`) and the React frontend (everything else) from a single process.

This guide covers two Hostinger plans:
- **VPS** (recommended) — full root SSH access, PM2 process manager
- **Business / Cloud Shared Hosting** — SSH access via hPanel terminal

---

## Quick-Start (5 minutes)

```
1. Build locally:   node scripts/prepare-deploy.mjs
2. Upload:          scp / SFTP the deploy/ folder to your Hostinger server
3. Configure:       cp .env.production .env  (fill in real values)
4. Install:         npm ci --omit=dev
5. Database:        npx prisma generate && npx prisma migrate deploy
6. First time:      npx prisma db seed
7. Start (VPS):     pm2 start src/server.js --name abacusweb
   Start (Shared):  configure Node.js app startup file in hPanel
```

---

## 1) Prerequisites

| Requirement | Notes |
|---|---|
| Node.js ≥ 18 | VPS: install via NodeSource; Shared: select in hPanel |
| MySQL 8.0 database | Create in hPanel → Databases → MySQL Databases |
| SSH access | VPS: enabled by default; Shared: enable in hPanel → Advanced → SSH Access |
| PM2 (VPS only) | `npm install -g pm2` |

---

## 2) Connect via SSH

```bash
# Replace with your Hostinger server IP and SSH user
ssh username@your-server-ip

# Hostinger VPS default user is usually 'root' or a custom user you created
# For shared hosting, find your SSH credentials in hPanel → Advanced → SSH Access
```

---

## 3) Prepare the Deploy Package (on your local machine)

```bash
node scripts/prepare-deploy.mjs
```

This will:
- Build the React frontend (`VITE_API_BASE_URL=/api`)
- Copy backend source, Prisma files, built frontend, and configs into `deploy/`
- Produce a `deploy.zip` archive ready for upload

---

## 4) Upload Files to Hostinger

### Option A — SCP (recommended, from your local machine)

```bash
# Upload the entire deploy/ folder
scp -r deploy/ username@your-server-ip:/home/username/abacusweb/

# Or upload as a zip and extract on the server
scp deploy.zip username@your-server-ip:/home/username/abacusweb/
```

### Option B — SFTP (FileZilla or any SFTP client)

Connect with:
- Host: `sftp://your-server-ip`
- Username / Password: your SSH credentials
- Port: `22`

Upload the contents of `deploy/` to your app directory (e.g., `/home/username/abacusweb/`).

### Option C — Git (if repository is accessible from the server)

```bash
# On the server
cd /home/username/abacusweb
git pull origin main

# Then rebuild frontend on server (requires Node.js + npm on server)
cd frontend && npm ci && npm run build && cd ..
```

---

## 5) Configure Environment Variables

```bash
# On the server, inside your app directory
cd /home/username/abacusweb

cp .env.production .env
nano .env        # or: vi .env
```

**Required variables:**

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `mysql://user:pass@localhost:3306/abacusweb` | Your Hostinger MySQL credentials |
| `JWT_ACCESS_SECRET` | (random 48-byte base64) | `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `JWT_REFRESH_SECRET` | (different random string) | Same command, different value |
| `JWT_ISSUER` | `abacusweb` | Any consistent string |
| `JWT_AUDIENCE` | `abacusweb-users` | Any consistent string |
| `CORS_ALLOWED_ORIGINS` | `https://yourdomain.com` | Your domain(s), comma-separated |
| `PORT` | `4000` | Port the app listens on |
| `NODE_ENV` | `production` | Must be `production` |

---

## 6) Install Dependencies

```bash
cd /home/username/abacusweb
npm ci --omit=dev
```

---

## 7) Database Setup (Prisma)

```bash
# Generate Prisma client
npx prisma generate

# Apply all pending migrations
npx prisma migrate deploy
```

> **If `migrate deploy` fails** because the database was created manually without migrations, use:
> ```bash
> npx prisma db push --schema prisma/schema.prisma
> npx prisma generate
> ```

### First-time seed (creates the default superadmin account)

```bash
npx prisma db seed
```

Default login: `superadmin@abacusweb.local` / `Pass@123`  
**Change this password immediately after first login.**

---

## 8) Start the Application

### VPS — PM2 (recommended)

```bash
# Install PM2 globally if not already installed
npm install -g pm2

# Start the app
cd /home/username/abacusweb
pm2 start src/server.js --name abacusweb --env production

# Save PM2 config so it restarts on server reboot
pm2 save
pm2 startup   # follow the printed command to enable auto-start
```

Useful PM2 commands:

```bash
pm2 status              # check app status
pm2 logs abacusweb      # tail live logs
pm2 restart abacusweb   # restart after config change
pm2 stop abacusweb      # stop the app
```

### Shared Hosting — hPanel Node.js App

In hPanel → **Website** → **Node.js**:
- **Application root**: your upload directory (e.g., `abacusweb/`)
- **Application startup file**: `src/server.js`
- **Application mode**: `production`

Click **Restart** after any file change.

---

## 9) Verify the Deployment

```bash
# Health check (replace with your actual domain or server IP)
curl https://yourdomain.com/health
# Expected: {"status":"ok"}

curl https://yourdomain.com/health/db
# Expected: {"status":"ok"}
```

Or open `https://yourdomain.com/` in a browser — the React app should load.

---

## 10) Updating — Backend, Frontend, and Database

Run these commands each time you deploy new code.

### Step 1 — Build locally

```bash
# On your local machine
node scripts/prepare-deploy.mjs
```

### Step 2 — Upload new files to the server

```bash
# Upload updated deploy/ contents (overwrites existing files)
scp -r deploy/* username@your-server-ip:/home/username/abacusweb/

# Or via zip
scp deploy.zip username@your-server-ip:/home/username/abacusweb/
ssh username@your-server-ip "cd /home/username/abacusweb && unzip -o deploy.zip"
```

### Step 3 — On the server: install, migrate, restart

```bash
ssh username@your-server-ip

cd /home/username/abacusweb

# Update backend dependencies
npm ci --omit=dev

# Regenerate Prisma client (always safe to run)
npx prisma generate

# Apply any new database migrations
npx prisma migrate deploy

# Restart the app
pm2 restart abacusweb        # VPS with PM2
# OR click Restart in hPanel Node.js panel for shared hosting
```

### What each command updates

| Command | What it updates |
|---|---|
| `scp -r deploy/* …` | Backend source (`src/`), built frontend (`frontend/dist/`), Prisma schema, scripts |
| `npm ci --omit=dev` | Node.js dependencies (only needed when `package.json` changed) |
| `npx prisma generate` | Regenerates the Prisma database client from the schema |
| `npx prisma migrate deploy` | Applies new SQL migrations to the database |
| `pm2 restart abacusweb` | Loads the new backend code into the running process |

---

## 11) Backend-Only Update

If only backend code (`src/`) changed (no frontend rebuild needed):

```bash
# On your local machine — copy only the src/ directory
scp -r src/ username@your-server-ip:/home/username/abacusweb/src/

# On the server
ssh username@your-server-ip
cd /home/username/abacusweb
pm2 restart abacusweb
```

---

## 12) Frontend-Only Update

If only frontend code changed:

```bash
# On your local machine — build frontend
cd frontend && npm run build && cd ..

# Upload only the built frontend assets
scp -r frontend/dist/ username@your-server-ip:/home/username/abacusweb/frontend/dist/

# No server restart needed — Express serves these as static files
```

---

## 13) Database-Only Update (migrations)

If only the Prisma schema / migrations changed:

```bash
# Upload updated prisma/ folder
scp -r prisma/ username@your-server-ip:/home/username/abacusweb/prisma/

# On the server
ssh username@your-server-ip
cd /home/username/abacusweb
npx prisma generate
npx prisma migrate deploy
pm2 restart abacusweb
```

---

## 14) Cron Job — Monthly Settlements (VPS)

Add to crontab (`crontab -e`) — runs on the 1st of each month at 01:10 UTC:

```cron
10 1 1 * * /usr/bin/node /home/username/abacusweb/scripts/run-monthly-settlements.js --tenantId tenant_default >> /home/username/abacusweb/cron.log 2>&1
```

Or trigger manually via API: `POST /api/settlements/generate` (SUPERADMIN role required)

---

## Architecture

```
                   Hostinger VPS / Shared Hosting
                  ┌─────────────────────────────────┐
                  │  Node.js App (port 4000)         │
  Browser ──────► │                                  │
                  │  GET /api/*  → Express API       │
                  │  GET /*      → React SPA         │
                  │  /uploads/*  → Static files      │
                  │                                  │
                  │  MySQL 8.0 (localhost:3306)      │
                  └─────────────────────────────────┘
```

## Notes

- The frontend is served by Express — no separate web server (Nginx/Apache) needed.
- `CORS_ALLOWED_ORIGINS` must include your domain (e.g., `https://yourdomain.com`).
- Keep `.env` out of version control — it contains secrets.
- The `uploads/` directory stores user-uploaded files; **do not overwrite it** during deploys.
- For VPS, configure a reverse proxy (Nginx) if you need SSL termination or to serve on port 80/443.
