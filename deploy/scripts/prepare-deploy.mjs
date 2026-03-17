#!/usr/bin/env node
/**
 * scripts/prepare-deploy.mjs
 *
 * Builds the frontend, copies required files into a `deploy/` folder,
 * and prepares a deployable folder for VPS hosting such as Hostinger.
 *
 * Usage:
 *   node scripts/prepare-deploy.mjs
 *
 * What it does:
 *   1. Builds the frontend with VITE_API_BASE_URL=/api
 *   2. Copies backend source, prisma, frontend/dist, and config files into deploy/
 *   3. Creates deploy.zip for easy upload
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEPLOY_DIR = path.join(ROOT, "deploy");

// ── Helpers ──────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  console.log(`  → ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// ── Clean ────────────────────────────────────────────────────────────────────

console.log("\n🧹  Cleaning previous deploy folder...");
if (fs.existsSync(DEPLOY_DIR)) {
  fs.rmSync(DEPLOY_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DEPLOY_DIR, { recursive: true });

// ── 1. Build frontend ────────────────────────────────────────────────────────

console.log("\n📦  Building frontend...");
run("npm run build", {
  cwd: path.join(ROOT, "frontend"),
  env: { ...process.env, VITE_API_BASE_URL: "/api" },
});

// ── 2. Copy backend source ──────────────────────────────────────────────────

console.log("\n📁  Copying backend files...");
copyDir(path.join(ROOT, "src"), path.join(DEPLOY_DIR, "src"));
copyDir(path.join(ROOT, "prisma"), path.join(DEPLOY_DIR, "prisma"));
copyDir(path.join(ROOT, "scripts"), path.join(DEPLOY_DIR, "scripts"));

// Copy built frontend into deploy
copyDir(path.join(ROOT, "frontend", "dist"), path.join(DEPLOY_DIR, "frontend", "dist"));

// Copy root config files
const rootFiles = [
  "package.json",
  "package-lock.json",
  "prisma.config.ts",
  ".env.production",
  "jest.config.js",
];
for (const f of rootFiles) {
  copyFile(path.join(ROOT, f), path.join(DEPLOY_DIR, f));
}

// Create uploads directory placeholder
fs.mkdirSync(path.join(DEPLOY_DIR, "uploads"), { recursive: true });
fs.writeFileSync(path.join(DEPLOY_DIR, "uploads", ".gitkeep"), "");

// ── 3. Create a quick README for the server ──────────────────────────────────

fs.writeFileSync(
  path.join(DEPLOY_DIR, "README.md"),
  `# AbacusWeb – Production Deploy

## Quick Setup (VPS / Hostinger)

1. Upload this folder to your VPS app directory.
2. Copy \`.env.production\` to \`.env\` and fill in real values:
  - DATABASE_URL (your production MySQL connection string)
   - JWT_ACCESS_SECRET, JWT_REFRESH_SECRET (generate with: node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")
  - CORS_ALLOWED_ORIGINS (your frontend domain)
3. On the VPS:
   \`\`\`bash
   npm ci --omit=dev
   npx prisma generate
   npx prisma migrate deploy
  npm run reassignment:repair
   \`\`\`
4. Start or restart the backend process with PM2/systemd using \`src/server.js\`.
5. Configure Nginx or Apache to serve \`frontend/dist\` and proxy the API app.
6. Visit: https://your-api-domain/health

## Health Check
- GET /health       → Service status
- GET /health/db    → Database connectivity

## Cron (monthly settlements)
Add to your VPS cron (1st of each month at 01:10):
\`\`\`
/usr/bin/node /var/www/<app>/scripts/run-monthly-settlements.js --tenantId tenant_default
\`\`\`
`
);

console.log("\n✅  Deploy folder ready at: deploy/");
console.log("    Contents:");
for (const entry of fs.readdirSync(DEPLOY_DIR)) {
  const stat = fs.statSync(path.join(DEPLOY_DIR, entry));
  console.log(`      ${stat.isDirectory() ? "📁" : "📄"} ${entry}`);
}
console.log("\n📌  Next: Upload the 'deploy/' folder to your VPS, run migrations, then restart the app process.\n");
