# Staging Validation Checklist

Use this checklist to validate the staging deployment before promoting to production.

- **Basic health**: Navigate to `http://<staging-host>:<port>/health` and confirm service returns status ok.

- **Auth test**: Login with seeded account (e.g., `superadmin@abacusweb.local` / `Pass@123`) and verify access token + refresh token flows work.

- **Role restriction test**: Verify an endpoint restricted to `SUPERADMIN` rejects a `CENTER` or `BP` user and allows `SUPERADMIN`.

- **Promotion test**: Trigger promotion engine (or relevant endpoint) for a student and verify promotion records/audit logs are created.

- **Worksheet generation test**: Request worksheet generation, verify generated worksheet contents, question count and difficulty match expected.

- **Competition flow test**: Create a competition, enroll a student, submit a result, and verify leaderboard updates.

- **Abuse flag trigger test**: Simulate rapid submissions / perfect streak to ensure an abuse flag is created and notifications are sent.

- **Notification test**: Ensure user receives notification entries in `Notification` table and (if integrated) push delivery works.

- **Leaderboard test**: Create sample submissions and confirm leaderboard endpoint orders students correctly.

- **Migrations check**: Confirm `prisma_migrations` table has all migrations applied.

- **Secrets check**: Ensure `JWT_*_STAGING` are set and not equal to production secrets.
