# REST API Endpoints

Base path: `/api`

## Auth
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

## Superadmin
- `GET /superadmins`

## Business Partners (SUPERADMIN)
- `GET /business-partners?q=&status=&subscriptionStatus=&limit=&offset=&tenantId=`
- `POST /business-partners` (auto-generates partner `code`)
- `GET /business-partners/:id`
- `PATCH /business-partners/:id`
- `PATCH /business-partners/:id/renew`
- `PATCH /business-partners/:id/revenue-split`
- `PATCH /business-partners/:id/status` (ACTIVE / INACTIVE / SUSPENDED; cascades)
- `POST /business-partners/:id/reset-password` (forces `mustChangePassword`)

## Business Partner (self)
- `GET /business-partners/me`

## Hierarchy
- `GET /hierarchy?limit=&offset=&includeInactive=`
- `POST /hierarchy` (create node)

## Centers
- `GET /centers`

## Teachers
- `GET /teachers`

## Center Portal (CENTER)
- `GET /center/students/:studentId/assign-worksheets`
- `POST /center/students/:studentId/assign-worksheets` body: `{ "worksheetIds": ["..."] }`
- `GET /center/mock-tests?limit=&offset=&batchId=`
- `POST /center/mock-tests` body: `{ "batchId": "...", "worksheetId": "... (optional)", "title": "...", "date": "YYYY-MM-DD", "maxMarks": 100 }`
- `GET /center/mock-tests/:id`
- `PATCH /center/mock-tests/:id/status` body: `{ "status": "DRAFT|PUBLISHED|ARCHIVED" }`
- `PUT /center/mock-tests/:id/results` body: `{ "results": [{ "studentId": "...", "marks": 88 }] }`
	- Notes:
		- `marks` are clamped to `0..maxMarks`.
		- Students outside active roster are ignored.
		- Returns `409 MOCK_TEST_ARCHIVED` when test status is `ARCHIVED`.
		- `worksheetId` links a published worksheet for student online attempts.

## Teacher Portal (TEACHER)
- `GET /teacher/students/:studentId/assign-worksheets`
- `POST /teacher/students/:studentId/assign-worksheets` body: `{ "worksheetIds": ["..."] }`
- `GET /teacher/batches`
- `GET /teacher/batches/:batchId/roster`
- `GET /teacher/batches/:batchId/worksheets/context`
- `POST /teacher/batches/:batchId/worksheets/assign` body: `{ "worksheetId": "...", "dueDate": "YYYY-MM-DD" }`
- `GET /teacher/batches/:batchId/mock-tests?limit=&offset=`
- `GET /teacher/mock-tests/:mockTestId`
- `PUT /teacher/mock-tests/:mockTestId/results` body: `{ "results": [{ "studentId": "...", "marks": 91 }] }`
	- Notes:
		- Restricted to teacher-assigned batches and active assigned-teacher enrollments.
		- `marks` are clamped to `0..maxMarks`.
		- Returns `409 MOCK_TEST_ARCHIVED` when test status is `ARCHIVED`.

## Students
- `GET /students?limit=&offset=`
- `POST /students`
- `PATCH /students/:id/assign-level`
- `GET /students/:id/promotion-status`
- `GET /students/:id/performance-summary`
- `POST /students/:id/confirm-promotion`
- `GET /students/export.csv`

## Student Portal (STUDENT)
- `GET /student/mock-tests`
- `GET /student/mock-tests/:mockTestId`
- `POST /student/mock-tests/:mockTestId/attempt/start`
- `POST /student/mock-tests/:mockTestId/attempt/submit` body: `{ "answersByQuestionId": { "<questionId>": { "value": "123" } } }`
	- Notes:
		- Only tests from student's active enrollments are visible.
		- `DRAFT` mock tests are not exposed to student role.
		- `attempt/*` endpoints require mock test `worksheetId` to be configured and published.

## Worksheets
- `GET /worksheets`
- `POST /worksheets`
- `POST /worksheets/:id/submit`

## Competitions
- `GET /competitions`
- `POST /competitions`
- `POST /competitions/:id/enrollments`
- `POST /competitions/:id/forward-request`
- `POST /competitions/:id/reject`
- `GET /competitions/:id/leaderboard`
- `GET /competitions/:id/results.csv`

## Reports
- `GET /reports/dashboard-summary`
- `GET /reports/revenue/summary`
- `GET /reports/revenue/by-type`
- `GET /reports/revenue/monthly`
- `GET /reports/revenue/by-business-partner` (SUPERADMIN)
- `GET /reports/revenue/by-center` (BP)
- `GET /reports/health-metrics` (SUPERADMIN)

## Ledger (transactions)
- `GET /ledger?type=&limit=&offset=&tenantId=`
- `GET /ledger/export.csv?type=&tenantId=`

## Margins (SUPERADMIN)
- `GET /margins?businessPartnerId=`
- `PUT /margins/:businessPartnerId` (sets active margin percent)

## Settlements
- `GET /settlements` (SUPERADMIN or BP)
- `POST /settlements/generate` (SUPERADMIN)
- `POST /settlements/:id/mark-paid` (SUPERADMIN)

## Audit Logs (SUPERADMIN)
- `GET /audit-logs?from=&to=&action=&entityType=&entityId=&userId=&role=&q=&limit=&offset=&tenantId=`

## System
- `GET /health`
- `GET /api/health`
