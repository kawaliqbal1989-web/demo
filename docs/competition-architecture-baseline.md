# Competition Architecture Baseline

Status: read-only baseline for the current Competition module in this repository.

## 1. Purpose

This document captures the current-state architecture of the Competition module as implemented in the repository. It is intended to be the reference baseline for a future Competition 2.0 redesign and should not be treated as a place for new implementation work.

## 2. Scope of the Baseline

The baseline covers:

- the persisted domain model in Prisma
- the API entry points for competitions, workflow, enrollment, and results
- the role-based visibility and scope rules
- the workflow and notification behavior
- the current role-specific frontend experience

It does not introduce new schema changes, new services, or new UI behavior.

## 3. Current-State Architecture Summary

The current Competition module is implemented as a workflow-driven submodule inside the broader ERP domain rather than as a first-class, standalone competition platform.

### 3.1 Core domain entities

The current persistence model is centered on the following Prisma models in [prisma/schema.prisma](prisma/schema.prisma):

- Competition
  - primary competition record
  - contains lifecycle fields, workflow stage, hierarchy scope, level, and result status
- CompetitionBusinessPartner
  - maps a competition to one or more business partners for visibility and approval scope
- CompetitionStageTransition
  - immutable audit log of workflow transitions
- CompetitionWorksheet
  - links competitions to worksheets
- CompetitionEnrollment
  - records student participation in a competition

### 3.2 Runtime responsibilities

The current module currently mixes several concerns in one place:

- competition CRUD and listing
- workflow progression and rejection
- visibility filtering by role and business partner
- enrollment and financial ledger recording
- results publishing and export
- notifications and audit logging

These responsibilities are handled across the controller, workflow service, scope service, financial service, and notification service.

## 4. Verified Implementation Surface

### 4.1 Backend routes

The current API surface is defined in [src/routes/competitions.routes.js](src/routes/competitions.routes.js):

- GET /api/competitions
- GET /api/competitions/:id
- POST /api/competitions
- POST /api/competitions/:id/enrollments
- POST /api/competitions/:id/forward-request
- POST /api/competitions/:id/reject
- GET /api/competitions/:id/leaderboard
- GET /api/competitions/:id/results
- POST /api/competitions/:id/results/publish
- POST /api/competitions/:id/results/unpublish
- GET /api/competitions/:id/results.csv

### 4.2 Backend controller

The main orchestration logic is in [src/controllers/competitions.controller.js](src/controllers/competitions.controller.js):

- listCompetitions
- getCompetitionDetail
- createCompetition
- forwardCompetitionRequest
- rejectCompetitionRequest
- getLeaderboard
- getCompetitionResults
- publishCompetitionResults
- unpublishCompetitionResults
- exportCompetitionResultsCsv
- enrollStudent

### 4.3 Workflow engine

The current workflow logic is implemented in [src/services/competition-workflow.service.js](src/services/competition-workflow.service.js):

- forward transitions through the role chain
- reject transitions with a required reason
- prevent transitions from rejected competitions
- log every transition immutably in CompetitionStageTransition

### 4.4 Scope and access control

Visibility and access are currently enforced by:

- [src/middleware/rbac.js](src/middleware/rbac.js) for role-based access
- [src/middleware/scope-access.js](src/middleware/scope-access.js) for hierarchy scope checks
- [src/services/bp-scope.service.js](src/services/bp-scope.service.js) for business-partner identity and scope resolution

Competition visibility rules are implemented in the competition controller through business-partner-aware filters.

### 4.5 Cross-cutting services

Competition behavior is also coupled to shared enterprise services:

- [src/services/financial-ledger.service.js](src/services/financial-ledger.service.js) for competition-related financial ledger entries
- [src/services/notification.service.js](src/services/notification.service.js) for workflow notifications
- [src/utils/audit.js](src/utils/audit.js) for audit logging
- [src/services/competition-leaderboard.service.js](src/services/competition-leaderboard.service.js) for leaderboard ranking logic

## 5. Role-Based UX Surface

The current frontend exposes role-specific competition pages:

- [frontend/src/modules/superadmin/SuperadminCompetitionPage.jsx](frontend/src/modules/superadmin/SuperadminCompetitionPage.jsx)
  - superadmin competition management, approval, rejection, CSV export
- [frontend/src/modules/businessPartner/BusinessPartnerCompetitionRequestsPage.jsx](frontend/src/modules/businessPartner/BusinessPartnerCompetitionRequestsPage.jsx)
  - BP request submission and forward action
- [frontend/src/modules/franchise/FranchiseCompetitionRequestsPage.jsx](frontend/src/modules/franchise/FranchiseCompetitionRequestsPage.jsx)
  - franchise review and rejection workflow
- [frontend/src/modules/center/CenterCompetitionEnrollmentPage.jsx](frontend/src/modules/center/CenterCompetitionEnrollmentPage.jsx)
  - center-side enrollment to available competitions
- [frontend/src/modules/teacher/TeacherResultsPage.jsx](frontend/src/modules/teacher/TeacherResultsPage.jsx)
  - teacher-facing results and related readiness experience

## 6. Existing Strengths

The current implementation already provides several useful foundations:

- a clear role-aware workflow from center submission to superadmin approval
- immutable transition history for governance and auditability
- role-based visibility and business-partner scoping
- competition enrollments tied to the existing student and financial subsystems
- results export and leaderboard support
- integration with shared ERP concerns such as audit, hierarchy, and notifications

## 7. Current Gaps for a Future Competition 2.0 Redesign

The current module is functional, but it is still narrow relative to a true enterprise competition platform. The main gaps are:

- it is not a first-class domain model; it is a workflow layer bolted onto the ERP
- it lacks richer concepts such as seasons, templates, formats, rounds, registration windows, awards, and recognition workflows
- workflow and visibility logic are tightly coupled to the controller layer
- results handling is still partly tied to legacy status fields and fallback behavior
- analytics and teacher insights are partially decoupled rather than modeled as part of the competition domain
- the surface area spans CRUD, approval, enrollment, finance, analytics, and export, which makes the module harder to evolve independently

## 8. Reusable Primitives to Preserve in a Redesign

The redesign should preserve the following reusable enterprise building blocks:

- RBAC and operational role handling
- hierarchy-based scope enforcement
- business-partner mapping and partner-aware visibility
- immutable workflow transition logs
- shared audit and notification mechanisms
- existing student, worksheet, level, and financial integrations
- current role-specific UX patterns where they align with business intent

## 9. Future-State Architecture Direction

For Competition 2.0, the competition domain should be modeled as a first-class business module with clearly separated components:

- Competition Domain Service
  - owns competition lifecycle, metadata, status, and governance
- Competition Workflow Engine
  - owns stage transitions, approvals, rejections, and policy evaluation
- Competition Participation Service
  - owns registration, enrollment, waitlists, eligibility, and capacity rules
- Competition Scoring and Results Service
  - owns ranking, result publication, and result visibility rules
- Competition Recognition Service
  - owns awards, certificates, badges, and recognition triggers
- Competition Governance and Visibility Service
  - owns partner scope, tenant scope, and role-based policy enforcement
- Competition Analytics and Reporting Service
  - owns insights, exports, and stakeholder reporting

This future-state architecture should replace the current “one controller with many responsibilities” model with domain services that are easier to evolve, test, and extend independently.

## 10. Baseline Conclusion

The current Competition module is a working, role-aware, workflow-driven submodule that is already integrated into the broader ERP. It is a good operational baseline, but it should be treated as a narrow first-generation implementation rather than the target architecture for a full competition platform.
