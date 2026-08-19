-- Competition certificate extension.
-- Existing generic certificate fields and CertificateTemplate are already
-- present in the deployed database. Add only Competition-specific fields.

ALTER TABLE `certificate`
  ADD COLUMN `competitionId` VARCHAR(191) NULL,
  ADD COLUMN `competitionEnrollmentId` VARCHAR(191) NULL,
  ADD COLUMN `competitionSnapshot` JSON NULL,
  ADD COLUMN `resultSnapshot` JSON NULL;

CREATE UNIQUE INDEX `Certificate_competitionEnrollmentId_key`
  ON `certificate` (`competitionEnrollmentId`);

CREATE INDEX `Certificate_tenantId_competitionId_issuedAt_idx`
  ON `certificate` (`tenantId`, `competitionId`, `issuedAt`);

CREATE INDEX `Certificate_tenant_comp_level_status_idx`
  ON `certificate` (`tenantId`, `competitionId`, `levelId`, `status`);
