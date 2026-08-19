CREATE TABLE `competitionseason` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `description` VARCHAR(191) NULL,
  `startDate` DATETIME(3) NOT NULL,
  `endDate` DATETIME(3) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CompetitionSeason_tenantId_code_key`(`tenantId`, `code`),
  UNIQUE INDEX `CompetitionSeason_tenantId_name_key`(`tenantId`, `name`),
  INDEX `CompetitionSeason_createdByUserId_idx`(`createdByUserId`),
  INDEX `CompetitionSeason_tenantId_isActive_idx`(`tenantId`, `isActive`),
  INDEX `CompetitionSeason_tenantId_startDate_endDate_idx`(`tenantId`, `startDate`, `endDate`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `competition`
  ADD COLUMN `seasonId` VARCHAR(191) NOT NULL;

CREATE INDEX `Competition_seasonId_status_idx` ON `competition`(`seasonId`, `status`);
CREATE INDEX `Competition_tenantId_seasonId_idx` ON `competition`(`tenantId`, `seasonId`);

CREATE TABLE `competitioncourse` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `competitionId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `description` VARCHAR(191) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CompetitionCourse_competitionId_code_key`(`competitionId`, `code`),
  UNIQUE INDEX `CompetitionCourse_competitionId_name_key`(`competitionId`, `name`),
  INDEX `CompetitionCourse_createdByUserId_idx`(`createdByUserId`),
  INDEX `CompetitionCourse_tenantId_competitionId_isActive_idx`(`tenantId`, `competitionId`, `isActive`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `competitioncourselevel` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `competitionCourseId` VARCHAR(191) NOT NULL,
  `levelId` VARCHAR(191) NOT NULL,
  `levelNumber` INTEGER NOT NULL,
  `sortOrder` INTEGER NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CompetitionCourseLevel_competitionCourseId_levelId_key`(`competitionCourseId`, `levelId`),
  UNIQUE INDEX `CompetitionCourseLevel_competitionCourseId_levelNumber_key`(`competitionCourseId`, `levelNumber`),
  INDEX `CompetitionCourseLevel_levelId_idx`(`levelId`),
  INDEX `CompetitionCourseLevel_competitionCourseId_sortOrder_idx`(`competitionCourseId`, `sortOrder`),
  INDEX `CompetitionCourseLevel_tenantId_competitionCourseId_isActive_idx`(`tenantId`, `competitionCourseId`, `isActive`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `competitionquestionbank` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `competitionCourseLevelId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `description` VARCHAR(191) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CompetitionQuestionBank_competitionCourseLevelId_code_key`(`competitionCourseLevelId`, `code`),
  INDEX `CompetitionQuestionBank_createdByUserId_idx`(`createdByUserId`),
  INDEX `CompetitionQuestionBank_tenant_level_active_idx`(`tenantId`, `competitionCourseLevelId`, `isActive`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `competitionworksheetentity` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `competitionQuestionBankId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `description` VARCHAR(191) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `version` INTEGER NOT NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CompetitionWorksheet_competitionQuestionBankId_code_key`(`competitionQuestionBankId`, `code`),
  INDEX `CompetitionWorksheet_createdByUserId_idx`(`createdByUserId`),
  INDEX `CompetitionWorksheet_tenant_bank_active_idx`(`tenantId`, `competitionQuestionBankId`, `isActive`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `competitionworksheetassignment` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `competitionWorksheetId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NOT NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `deactivatedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CompetitionWorksheetAssignment_worksheetId_businessPartnerId_key`(`competitionWorksheetId`, `businessPartnerId`),
  INDEX `CompetitionWorksheetAssignment_createdByUserId_idx`(`createdByUserId`),
  INDEX `CompetitionWorksheetAssignment_businessPartnerId_createdAt_idx`(`businessPartnerId`, `createdAt`),
  INDEX `CompetitionWorksheetAssignment_tenant_bp_active_idx`(`tenantId`, `businessPartnerId`, `isActive`),
  INDEX `CompetitionWorksheetAssignment_tenantId_worksheetId_isActive_idx`(`tenantId`, `competitionWorksheetId`, `isActive`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `competitionseason`
  ADD CONSTRAINT `CompetitionSeason_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `CompetitionSeason_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `authuser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `competition`
  ADD CONSTRAINT `Competition_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `competitionseason`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `competitioncourse`
  ADD CONSTRAINT `CompetitionCourse_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `CompetitionCourse_competitionId_fkey` FOREIGN KEY (`competitionId`) REFERENCES `competition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `CompetitionCourse_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `authuser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `competitioncourselevel`
  ADD CONSTRAINT `CompetitionCourseLevel_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `CompetitionCourseLevel_competitionCourseId_fkey` FOREIGN KEY (`competitionCourseId`) REFERENCES `competitioncourse`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `CompetitionCourseLevel_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `competitionquestionbank`
  ADD CONSTRAINT `CompetitionQuestionBank_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `CompetitionQuestionBank_competitionCourseLevelId_fkey` FOREIGN KEY (`competitionCourseLevelId`) REFERENCES `competitioncourselevel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `CompetitionQuestionBank_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `authuser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `competitionworksheetentity`
  ADD CONSTRAINT `CompetitionWorksheetEntity_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `CompetitionWorksheet_competitionQuestionBankId_fkey` FOREIGN KEY (`competitionQuestionBankId`) REFERENCES `competitionquestionbank`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `CompetitionWorksheet_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `authuser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `competitionworksheetassignment`
  ADD CONSTRAINT `CompetitionWorksheetAssignment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `CompetitionWorksheetAssignment_competitionWorksheetId_fkey` FOREIGN KEY (`competitionWorksheetId`) REFERENCES `competitionworksheetentity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `CompetitionWorksheetAssignment_businessPartnerId_fkey` FOREIGN KEY (`businessPartnerId`) REFERENCES `businesspartner`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `CompetitionWorksheetAssignment_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `authuser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;-- Abacus Competition foundation
-- Target schema: deliverables/phase-1/schema.prisma
-- Source checked against kawaliqbal1989-web/demo main on 2026-07-28.
--
-- This migration preserves legacy competitions and direct enrollments.
-- Existing COMPETITION financial transactions are intentionally untouched.

-- ---------------------------------------------------------------------------
-- Independent username sequences (DEFAULT keeps every existing sequence)
-- ---------------------------------------------------------------------------

ALTER TABLE `usersequence`
  ADD COLUMN `sequenceKey` VARCHAR(191) NOT NULL DEFAULT 'DEFAULT';

DROP INDEX `usersequence_tenantId_role_key` ON `usersequence`;

CREATE UNIQUE INDEX `usersequence_tenantId_role_sequenceKey_key`
  ON `usersequence`(`tenantId`, `role`, `sequenceKey`);

-- ---------------------------------------------------------------------------
-- Allow one Assessment participant per source enrollment/student-level record
-- ---------------------------------------------------------------------------

SET @has_assessmentparticipant := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'assessmentparticipant'
);

SET @has_aspt_old_idx := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'assessmentparticipant'
    AND index_name = 'aspt_t_ver_std_src_uq'
);

SET @sql := IF(
  @has_assessmentparticipant > 0 AND @has_aspt_old_idx > 0,
  'DROP INDEX `aspt_t_ver_std_src_uq` ON `assessmentparticipant`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_aspt_new_idx := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'assessmentparticipant'
    AND index_name = 'aspt_t_ver_std_src_entity_uq'
);

SET @sql := IF(
  @has_assessmentparticipant > 0 AND @has_aspt_new_idx = 0,
  'CREATE UNIQUE INDEX `aspt_t_ver_std_src_entity_uq` ON `assessmentparticipant` (`tenantId`, `assessmentVersionId`, `studentId`, `sourceEntityType`, `sourceEntityId`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

