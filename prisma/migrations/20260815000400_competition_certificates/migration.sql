ALTER TABLE `certificate`
  ADD COLUMN `courseId` VARCHAR(191) NULL,
  ADD COLUMN `competitionId` VARCHAR(191) NULL,
  ADD COLUMN `competitionEnrollmentId` VARCHAR(191) NULL,
  ADD COLUMN `courseSnapshot` JSON NULL,
  ADD COLUMN `levelSnapshot` JSON NULL,
  ADD COLUMN `brandingSnapshot` JSON NULL,
  ADD COLUMN `competitionSnapshot` JSON NULL,
  ADD COLUMN `resultSnapshot` JSON NULL,
  ADD COLUMN `verificationToken` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Certificate_competitionEnrollmentId_key`
  ON `certificate` (`competitionEnrollmentId`);
CREATE UNIQUE INDEX `Certificate_verificationToken_key`
  ON `certificate` (`verificationToken`);
CREATE INDEX `Certificate_tenantId_competitionId_issuedAt_idx`
  ON `certificate` (`tenantId`, `competitionId`, `issuedAt`);
CREATE INDEX `Certificate_tenant_comp_level_status_idx`
  ON `certificate` (`tenantId`, `competitionId`, `levelId`, `status`);

CREATE TABLE `certificatetemplate` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL DEFAULT 'Certificate of Achievement',
  `signatoryName` VARCHAR(191) NULL,
  `signatoryDesignation` VARCHAR(191) NULL,
  `signatureImagePath` VARCHAR(191) NULL,
  `signatureImageUrl` TEXT NULL,
  `affiliationLogoPath` VARCHAR(191) NULL,
  `affiliationLogoUrl` TEXT NULL,
  `stampImagePath` VARCHAR(191) NULL,
  `stampImageUrl` TEXT NULL,
  `backgroundImagePath` VARCHAR(191) NULL,
  `backgroundImageUrl` TEXT NULL,
  `layout` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `certificatetemplate_businessPartnerId_key` (`businessPartnerId`),
  INDEX `certificatetemplate_tenantId_idx` (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
