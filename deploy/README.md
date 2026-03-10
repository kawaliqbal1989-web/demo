# AbacusWeb – Production Deploy

## Quick Setup (GoDaddy cPanel)

1. Upload this folder to your cPanel app root.
2. Copy `.env.production` to `.env` and fill in real values:
   - DATABASE_URL (your cPanel MySQL connection string)
   - JWT_ACCESS_SECRET, JWT_REFRESH_SECRET (generate with: node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")
   - CORS_ALLOWED_ORIGINS (your domain)
3. In cPanel terminal:
   ```bash
   npm ci --omit=dev
   npx prisma generate
   npx prisma migrate deploy
   # First time only:
   npx prisma db seed
   ```
4. Set Node.js App startup file to: `src/server.js`
5. Set Application mode to: `production`
6. Restart the app.
7. Visit: https://yourdomain.com/health

## Health Check
- GET /health       → Service status
- GET /health/db    → Database connectivity

## Cron (monthly settlements)
Add to cPanel Cron Jobs (1st of each month at 01:10):
```
/usr/local/bin/node /home/<user>/<app-root>/scripts/run-monthly-settlements.js --tenantId tenant_default
```
