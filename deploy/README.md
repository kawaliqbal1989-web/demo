# AbacusWeb – Production Deploy

## Quick Setup (VPS / Hostinger)

1. Upload this folder to your VPS app directory.
2. Copy `.env.production` to `.env` and fill in real values:
  - DATABASE_URL (your production MySQL connection string)
   - JWT_ACCESS_SECRET, JWT_REFRESH_SECRET (generate with: node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")
  - CORS_ALLOWED_ORIGINS (your frontend domain)
3. On the VPS:
   ```bash
   npm ci --omit=dev
   npx prisma generate
   npx prisma migrate deploy
  npm run reassignment:repair
   ```
4. Start or restart the backend process with PM2/systemd using `src/server.js`.
5. Configure Nginx or Apache to serve `frontend/dist` and proxy the API app.
6. Visit: https://your-api-domain/health

## Health Check
- GET /health       → Service status
- GET /health/db    → Database connectivity

## Cron (monthly settlements)
Add to your VPS cron (1st of each month at 01:10):
```
/usr/bin/node /var/www/<app>/scripts/run-monthly-settlements.js --tenantId tenant_default
```
