# Automated Testing (Jest + Supertest)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure a dedicated test database in `.env`:

```dotenv
DATABASE_URL_TEST="mysql://root:password@localhost:3306/abacusweb_test"
```

> Tests will fail fast if `DATABASE_URL_TEST` is missing.

## How it works

- Jest uses `tests/setup/env.setup.js` to force Prisma to use `DATABASE_URL_TEST`.
- Before the suite, `tests/setup/global-setup.js` runs:
  - `prisma migrate deploy`
  - `prisma db seed`
- Tests run in-band (`--runInBand`) to avoid shared DB race conditions.

## Run tests

```bash
npm test
```

Run focused mock-test API suites:

```bash
npm test -- tests/center/center.mock-tests.test.js tests/teacher/teacher.mock-tests.test.js
```

Watch mode:

```bash
npm run test:watch
```

# E2E (Playwright)

Playwright E2E uses Prisma to create fixture data.

- By default it uses `E2E_DATABASE_URL`, else `DATABASE_URL_TEST`, else `DATABASE_URL`.
- If you need to load a specific env file, set `DOTENV_CONFIG_PATH` (backend + E2E fixtures respect it).

You can run E2E without manually exporting env vars; `npm run e2e` loads `.env` (or `DOTENV_CONFIG_PATH`) and sets safe JWT defaults for local runs.

Example (PowerShell override):

```powershell
$env:E2E_DATABASE_URL = "mysql://root:password@localhost:3306/abacusweb_test"
npm run e2e -- e2e/results-publish-and-student-view.spec.ts
```

## Test folder structure

```text
tests/
  auth/
  rbac/
  scope/
  competition/
  promotion/
  worksheet/
  abuse/
  notifications/
  analytics/
  helpers/
  setup/
```

## Notes

- Tests call real HTTP endpoints via Supertest.
- Middleware is never bypassed.
- Assertions include both API response checks and Prisma DB-state checks.
