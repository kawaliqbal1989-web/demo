# AbacusWeb Backend (Security-Enforced Skeleton)

Node.js + Express + Prisma + MySQL backend with:
- JWT access + refresh token rotation
- bcrypt password hashing
- RBAC (`SUPERADMIN`, `BP`, `FRANCHISE`, `CENTER`, `TEACHER`, `STUDENT`)
- Tenant + hierarchy scope enforcement
- Audit logging
- Standard API response format

## Updated Folder Structure

```text
.
├─ prisma/
│  ├─ schema.prisma
│  ├─ seed.js
│  └─ migrations/
│     ├─ migration_lock.toml
│     ├─ 20260216000000_init/
│     │  └─ migration.sql
│     └─ ... (additional migrations)
├─ src/
│  ├─ app.js
│  ├─ server.js
│  ├─ config/
│  │  └─ env.js
│  ├─ lib/
│  │  └─ prisma.js
│  ├─ controllers/
│  │  ├─ auth.controller.js
│  │  ├─ business-partners.controller.js
│  │  ├─ superadmin.controller.js
│  │  ├─ hierarchy.controller.js
│  │  ├─ levels.controller.js
│  │  ├─ students.controller.js
│  │  ├─ worksheets.controller.js
│  │  └─ competitions.controller.js
│  ├─ routes/
│  │  ├─ index.js
│  │  ├─ auth.routes.js
│  │  ├─ business-partners.routes.js
│  │  ├─ superadmin.routes.js
│  │  ├─ hierarchy.routes.js
│  │  ├─ levels.routes.js
│  │  ├─ students.routes.js
│  │  ├─ worksheets.routes.js
│  │  └─ competitions.routes.js
│  ├─ middleware/
│  │  ├─ authenticate.js
│  │  ├─ rbac.js
│  │  ├─ scope-access.js
│  │  ├─ audit-logger.js
│  │  ├─ response-format.js
│  │  ├─ error-handler.js
│  │  └─ not-found.js
│  └─ utils/
│     ├─ api-response.js
│     ├─ async-handler.js
│     ├─ audit.js
│     ├─ password.js
│     └─ token.js
├─ prisma.config.ts
├─ .env.example
├─ .gitignore
└─ package.json
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env` from `.env.example`.
3. Run migrations:
   ```bash
   npm run prisma:migrate
   ```
4. Seed data:
   ```bash
   npm run prisma:seed
   ```
5. Start server:
   ```bash
   npm run dev
   ```

## Standard Response Shape

All API responses follow:

```json
{
  "success": true,
  "message": "...",
  "data": {},
  "error_code": null
}
```

## Security Endpoints

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout` (authenticated)

## Protected Route Examples

- `POST /api/business-partners` → `SUPERADMIN` only
- `PATCH /api/students/:id/assign-level` → `CENTER` only + scope check
- `POST /api/competitions/:id/forward-request` → role-stage controlled + scope check

## Seed Login Accounts

All use password: `Pass@123`, tenant code: `DEFAULT`
- `superadmin@abacusweb.local` (`SUPERADMIN`)
- `bp.manager@abacusweb.local` (`BP`)
- `franchise.manager@abacusweb.local` (`FRANCHISE`)
- `center.manager@abacusweb.local` (`CENTER`)

## Deployment

| Guide | Description |
|---|---|
| [`DEPLOY_HOSTINGER.md`](./DEPLOY_HOSTINGER.md) | Hostinger VPS & shared hosting — terminal commands to upload/update backend, frontend, and database |
| [`DEPLOY_GODADDY.md`](./DEPLOY_GODADDY.md) | GoDaddy cPanel deployment guide |

## Notes

- Existing domain routes are globally protected after `/api/auth/*`.
- Tenant filter is applied in DB queries (`tenantId`) to prevent cross-network access.
- Audit logs are captured for login attempts, workflow transitions, and course assignment.
