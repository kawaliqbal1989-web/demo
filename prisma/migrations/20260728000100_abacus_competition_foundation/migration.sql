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
-- Temporary Competition students
-- ---------------------------------------------------------------------------

ALTER TABLE `student`
  ADD COLUMN `isTemporaryCompetition` BOOLEAN NOT NULL DEFAULT false;

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

-- ---------------------------------------------------------------------------
-- Competition dates, timezone, attempts, and legacy nullable mirrors
-- ---------------------------------------------------------------------------

ALTER TABLE `competition`
  DROP FOREIGN KEY `competition_hierarchyNodeId_fkey`,
  DROP FOREIGN KEY `competition_levelId_fkey`;

ALTER TABLE `competition`
  ADD COLUMN `attemptLimit` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `code` VARCHAR(191) NULL,
  ADD COLUMN `enrollmentEndAt` DATETIME(3) NULL,
  ADD COLUMN `enrollmentStartAt` DATETIME(3) NULL,
  MODIFY `hierarchyNodeId` VARCHAR(191) NULL,
  MODIFY `levelId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `competition_tenantId_code_key`
  ON `competition`(`tenantId`, `code`);

ALTER TABLE `competition`
  ADD CONSTRAINT `competition_hierarchyNodeId_fkey`
    FOREIGN KEY (`hierarchyNodeId`) REFERENCES `hierarchynode`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `competition_levelId_fkey`
    FOREIGN KEY (`levelId`) REFERENCES `level`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Competition courses and levels
-- ---------------------------------------------------------------------------

CREATE TABLE `competitioncourse` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `competitionId` VARCHAR(191) NOT NULL,
  `courseId` VARCHAR(191) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `competitioncourse_tenantId_competitionId_isActive_idx`
    (`tenantId`, `competitionId`, `isActive`),
  INDEX `competitioncourse_tenantId_courseId_idx`
    (`tenantId`, `courseId`),
  UNIQUE INDEX `competitioncourse_competitionId_courseId_key`
    (`competitionId`, `courseId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `competitioncourselevel` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `competitionId` VARCHAR(191) NOT NULL,
  `competitionCourseId` VARCHAR(191) NOT NULL,
  `courseLevelId` VARCHAR(191) NOT NULL,
  `levelId` VARCHAR(191) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `competitioncourselevel_tenantId_competitionId_isActive_idx`
    (`tenantId`, `competitionId`, `isActive`),
  INDEX `competitioncourselevel_tenantId_competitionCourseId_sortOrde_idx`
    (`tenantId`, `competitionCourseId`, `sortOrder`),
  INDEX `competitioncourselevel_tenantId_levelId_idx`
    (`tenantId`, `levelId`),
  UNIQUE INDEX `competitioncourselevel_competitionId_courseLevelId_levelId_key`
    (`competitionId`, `courseLevelId`, `levelId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `competitioncourse`
  ADD CONSTRAINT `competitioncourse_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `competitioncourse_competitionId_fkey`
    FOREIGN KEY (`competitionId`) REFERENCES `competition`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `competitioncourse_courseId_fkey`
    FOREIGN KEY (`courseId`) REFERENCES `course`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `competitioncourselevel`
  ADD CONSTRAINT `competitioncourselevel_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `competitioncourselevel_competitionId_fkey`
    FOREIGN KEY (`competitionId`) REFERENCES `competition`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `competitioncourselevel_competitionCourseId_fkey`
    FOREIGN KEY (`competitionCourseId`) REFERENCES `competitioncourse`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `competitioncourselevel_courseLevelId_fkey`
    FOREIGN KEY (`courseLevelId`) REFERENCES `courselevel`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `competitioncourselevel_levelId_fkey`
    FOREIGN KEY (`levelId`) REFERENCES `level`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill only course metadata that can be proven from existing linked worksheets.
INSERT INTO `competitioncourse` (
  `id`,
  `tenantId`,
  `competitionId`,
  `courseId`,
  `sortOrder`,
  `isActive`,
  `createdAt`,
  `updatedAt`
)
SELECT
  CONCAT(
    'legacy_cc_',
    LEFT(SHA2(CONCAT(cw.`tenantId`, ':', cw.`competitionId`, ':', w.`courseId`), 256), 32)
  ),
  cw.`tenantId`,
  cw.`competitionId`,
  w.`courseId`,
  0,
  true,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `competitionworksheet` cw
INNER JOIN `worksheet` w
  ON w.`id` = cw.`worksheetId`
  AND w.`tenantId` = cw.`tenantId`
INNER JOIN `competition` c
  ON c.`id` = cw.`competitionId`
  AND c.`tenantId` = cw.`tenantId`
WHERE w.`courseId` IS NOT NULL
GROUP BY cw.`tenantId`, cw.`competitionId`, w.`courseId`;

INSERT INTO `competitioncourselevel` (
  `id`,
  `tenantId`,
  `competitionId`,
  `competitionCourseId`,
  `courseLevelId`,
  `levelId`,
  `sortOrder`,
  `isActive`,
  `createdAt`,
  `updatedAt`
)
SELECT
  CONCAT(
    'legacy_ccl_',
    LEFT(
      SHA2(
        CONCAT(
          cw.`tenantId`,
          ':',
          cw.`competitionId`,
          ':',
          w.`courseLevelId`,
          ':',
          w.`levelId`
        ),
        256
      ),
      32
    )
  ),
  cw.`tenantId`,
  cw.`competitionId`,
  cc.`id`,
  w.`courseLevelId`,
  w.`levelId`,
  MIN(cl.`sortOrder`),
  true,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `competitionworksheet` cw
INNER JOIN `worksheet` w
  ON w.`id` = cw.`worksheetId`
  AND w.`tenantId` = cw.`tenantId`
INNER JOIN `courselevel` cl
  ON cl.`id` = w.`courseLevelId`
  AND cl.`courseId` = w.`courseId`
  AND cl.`tenantId` = w.`tenantId`
INNER JOIN `competitioncourse` cc
  ON cc.`competitionId` = cw.`competitionId`
  AND cc.`courseId` = w.`courseId`
  AND cc.`tenantId` = cw.`tenantId`
WHERE w.`courseId` IS NOT NULL
  AND w.`courseLevelId` IS NOT NULL
GROUP BY
  cw.`tenantId`,
  cw.`competitionId`,
  cc.`id`,
  w.`courseLevelId`,
  w.`levelId`;

-- ---------------------------------------------------------------------------
-- Multi-level Competition enrollments
-- ---------------------------------------------------------------------------

ALTER TABLE `competitionenrollment`
  ADD COLUMN `approvedAt` DATETIME(3) NULL,
  ADD COLUMN `competitionCourseLevelId` VARCHAR(191) NULL,
  ADD COLUMN `createdByUserId` VARCHAR(191) NULL,
  ADD COLUMN `enrolledLevelId` VARCHAR(191) NULL,
  ADD COLUMN `hierarchyNodeId` VARCHAR(191) NULL,
  ADD COLUMN `id` VARCHAR(191) NULL,
  ADD COLUMN `isTemporary` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `sourceTeacherUserId` VARCHAR(191) NULL;

UPDATE `competitionenrollment` ce
INNER JOIN `competition` c
  ON c.`id` = ce.`competitionId`
  AND c.`tenantId` = ce.`tenantId`
INNER JOIN `student` s
  ON s.`id` = ce.`studentId`
  AND s.`tenantId` = ce.`tenantId`
SET
  ce.`id` = CONCAT(
    'legacy_ce_',
    LEFT(SHA2(CONCAT(ce.`tenantId`, ':', ce.`competitionId`, ':', ce.`studentId`), 256), 32)
  ),
  ce.`enrolledLevelId` = COALESCE(c.`levelId`, s.`levelId`),
  ce.`hierarchyNodeId` = s.`hierarchyNodeId`,
  ce.`sourceTeacherUserId` = s.`currentTeacherUserId`,
  ce.`createdByUserId` = c.`createdByUserId`,
  ce.`approvedAt` = CASE
    WHEN c.`workflowStage` = 'APPROVED' THEN ce.`enrolledAt`
    ELSE NULL
  END,
  ce.`competitionCourseLevelId` = (
    SELECT ccl.`id`
    FROM `competitioncourselevel` ccl
    INNER JOIN `competitioncourse` cc
      ON cc.`id` = ccl.`competitionCourseId`
    WHERE ccl.`competitionId` = ce.`competitionId`
      AND ccl.`tenantId` = ce.`tenantId`
      AND ccl.`levelId` = COALESCE(c.`levelId`, s.`levelId`)
    ORDER BY
      CASE
        WHEN s.`courseId` IS NOT NULL AND cc.`courseId` = s.`courseId` THEN 0
        ELSE 1
      END,
      ccl.`sortOrder`,
      ccl.`id`
    LIMIT 1
  );

-- The legacy primary key supplies the Competition FK index. Recreate that FK
-- after replacing the composite primary key with the new enrollment ID.
ALTER TABLE `competitionenrollment`
  DROP FOREIGN KEY `competitionenrollment_competitionId_fkey`;

ALTER TABLE `competitionenrollment`
  DROP PRIMARY KEY,
  MODIFY `id` VARCHAR(191) NOT NULL,
  MODIFY `createdByUserId` VARCHAR(191) NOT NULL,
  MODIFY `enrolledLevelId` VARCHAR(191) NOT NULL,
  MODIFY `hierarchyNodeId` VARCHAR(191) NOT NULL,
  ADD PRIMARY KEY (`id`);

DROP INDEX `competitionenrollment_tenantId_studentId_idx`
  ON `competitionenrollment`;

CREATE INDEX `competitionenrollment_tenantId_competitionId_isActive_idx`
  ON `competitionenrollment`(`tenantId`, `competitionId`, `isActive`);

CREATE INDEX `competitionenrollment_tenantId_hierarchyNodeId_isActive_idx`
  ON `competitionenrollment`(`tenantId`, `hierarchyNodeId`, `isActive`);

CREATE INDEX `competitionenrollment_tenantId_enrolledLevelId_isActive_idx`
  ON `competitionenrollment`(`tenantId`, `enrolledLevelId`, `isActive`);

CREATE INDEX `competitionenrollment_tenantId_sourceTeacherUserId_idx`
  ON `competitionenrollment`(`tenantId`, `sourceTeacherUserId`);

CREATE UNIQUE INDEX `ce_t_comp_student_level_uq`
  ON `competitionenrollment`
  (`tenantId`, `competitionId`, `studentId`, `competitionCourseLevelId`);

ALTER TABLE `competitionenrollment`
  ADD CONSTRAINT `competitionenrollment_competitionId_fkey`
    FOREIGN KEY (`competitionId`) REFERENCES `competition`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionenrollment_competitionCourseLevelId_fkey`
    FOREIGN KEY (`competitionCourseLevelId`) REFERENCES `competitioncourselevel`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionenrollment_enrolledLevelId_fkey`
    FOREIGN KEY (`enrolledLevelId`) REFERENCES `level`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionenrollment_hierarchyNodeId_fkey`
    FOREIGN KEY (`hierarchyNodeId`) REFERENCES `hierarchynode`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionenrollment_sourceTeacherUserId_fkey`
    FOREIGN KEY (`sourceTeacherUserId`) REFERENCES `authuser`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionenrollment_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `authuser`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- One worksheet per Business Partner per Competition course level
-- ---------------------------------------------------------------------------

CREATE TABLE `competitionworksheetallocation` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `competitionId` VARCHAR(191) NOT NULL,
  `competitionCourseLevelId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NOT NULL,
  `worksheetId` VARCHAR(191) NOT NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lockedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `competitionworksheetallocation_tenantId_competitionId_idx`
    (`tenantId`, `competitionId`),
  INDEX `competitionworksheetallocation_tenantId_businessPartnerId_idx`
    (`tenantId`, `businessPartnerId`),
  INDEX `competitionworksheetallocation_tenantId_worksheetId_idx`
    (`tenantId`, `worksheetId`),
  UNIQUE INDEX `cwa_comp_level_bp_uq`
    (`competitionId`, `competitionCourseLevelId`, `businessPartnerId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `competitionworksheetallocation`
  ADD CONSTRAINT `competitionworksheetallocation_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionworksheetallocation_competitionId_fkey`
    FOREIGN KEY (`competitionId`) REFERENCES `competition`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionworksheetallocation_competitionCourseLevelId_fkey`
    FOREIGN KEY (`competitionCourseLevelId`) REFERENCES `competitioncourselevel`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionworksheetallocation_businessPartnerId_fkey`
    FOREIGN KEY (`businessPartnerId`) REFERENCES `businesspartner`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionworksheetallocation_worksheetId_fkey`
    FOREIGN KEY (`worksheetId`) REFERENCES `worksheet`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionworksheetallocation_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `authuser`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

SET @has_comp_bp := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'competitionbusinesspartner'
);

SET @has_cwa_comp_bp_fk := (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'competitionworksheetallocation'
    AND constraint_name = 'competitionworksheetallocation_competitionId_businessPartne_fkey'
    AND constraint_type = 'FOREIGN KEY'
);

SET @sql := IF(
  @has_comp_bp > 0 AND @has_cwa_comp_bp_fk = 0,
  'ALTER TABLE `competitionworksheetallocation` ADD CONSTRAINT `competitionworksheetallocation_competitionId_businessPartne_fkey` FOREIGN KEY (`competitionId`, `businessPartnerId`) REFERENCES `competitionbusinesspartner`(`competitionId`, `businessPartnerId`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Existing worksheets are not auto-allocated to Business Partners because the
-- old schema cannot prove which worksheet belongs to which partner.

-- ---------------------------------------------------------------------------
-- Teacher and Center enrollment lists
-- ---------------------------------------------------------------------------

CREATE TABLE `competitionenrollmentlist` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `competitionId` VARCHAR(191) NOT NULL,
  `type` ENUM('TEACHER', 'CENTER_COMBINED') NOT NULL,
  `scopeKey` VARCHAR(191) NOT NULL,
  `hierarchyNodeId` VARCHAR(191) NOT NULL,
  `teacherUserId` VARCHAR(191) NULL,
  `status` ENUM(
    'DRAFT',
    'SUBMITTED_TO_CENTER',
    'SUBMITTED_TO_FRANCHISE',
    'SUBMITTED_TO_BUSINESS_PARTNER',
    'SUBMITTED_TO_SUPERADMIN',
    'APPROVED',
    'REJECTED'
  ) NOT NULL DEFAULT 'DRAFT',
  `locked` BOOLEAN NOT NULL DEFAULT false,
  `submittedAt` DATETIME(3) NULL,
  `forwardedAt` DATETIME(3) NULL,
  `approvedAt` DATETIME(3) NULL,
  `rejectedAt` DATETIME(3) NULL,
  `rejectedByUserId` VARCHAR(191) NULL,
  `rejectedRemark` VARCHAR(191) NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `competitionenrollmentlist_tenantId_competitionId_status_idx`
    (`tenantId`, `competitionId`, `status`),
  INDEX `competitionenrollmentlist_tenantId_hierarchyNodeId_status_idx`
    (`tenantId`, `hierarchyNodeId`, `status`),
  INDEX `competitionenrollmentlist_teacherUserId_idx`
    (`teacherUserId`),
  UNIQUE INDEX `competitionenrollmentlist_tenantId_competitionId_scopeKey_key`
    (`tenantId`, `competitionId`, `scopeKey`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `competitionenrollmentlistitem` (
  `tenantId` VARCHAR(191) NOT NULL,
  `listId` VARCHAR(191) NOT NULL,
  `enrollmentId` VARCHAR(191) NOT NULL,
  `included` BOOLEAN NOT NULL DEFAULT true,
  `exclusionReason` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `competitionenrollmentlistitem_tenantId_createdAt_idx`
    (`tenantId`, `createdAt`),
  INDEX `competitionenrollmentlistitem_enrollmentId_idx`
    (`enrollmentId`),
  PRIMARY KEY (`listId`, `enrollmentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `competitionenrollmentlist`
  ADD CONSTRAINT `competitionenrollmentlist_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionenrollmentlist_competitionId_fkey`
    FOREIGN KEY (`competitionId`) REFERENCES `competition`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionenrollmentlist_hierarchyNodeId_fkey`
    FOREIGN KEY (`hierarchyNodeId`) REFERENCES `hierarchynode`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionenrollmentlist_teacherUserId_fkey`
    FOREIGN KEY (`teacherUserId`) REFERENCES `authuser`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionenrollmentlist_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `authuser`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionenrollmentlist_rejectedByUserId_fkey`
    FOREIGN KEY (`rejectedByUserId`) REFERENCES `authuser`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `competitionenrollmentlistitem`
  ADD CONSTRAINT `competitionenrollmentlistitem_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionenrollmentlistitem_listId_fkey`
    FOREIGN KEY (`listId`) REFERENCES `competitionenrollmentlist`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionenrollmentlistitem_enrollmentId_fkey`
    FOREIGN KEY (`enrollmentId`) REFERENCES `competitionenrollment`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Convert each legacy center's direct enrollments into one combined center list.
INSERT INTO `competitionenrollmentlist` (
  `id`,
  `tenantId`,
  `competitionId`,
  `type`,
  `scopeKey`,
  `hierarchyNodeId`,
  `teacherUserId`,
  `status`,
  `locked`,
  `submittedAt`,
  `forwardedAt`,
  `approvedAt`,
  `rejectedAt`,
  `rejectedByUserId`,
  `rejectedRemark`,
  `createdByUserId`,
  `createdAt`,
  `updatedAt`
)
SELECT
  CONCAT(
    'legacy_cel_',
    LEFT(
      SHA2(CONCAT(ce.`tenantId`, ':', ce.`competitionId`, ':', ce.`hierarchyNodeId`), 256),
      32
    )
  ),
  ce.`tenantId`,
  ce.`competitionId`,
  'CENTER_COMBINED',
  CONCAT('CENTER_COMBINED:', ce.`hierarchyNodeId`),
  ce.`hierarchyNodeId`,
  NULL,
  CASE c.`workflowStage`
    WHEN 'FRANCHISE_REVIEW' THEN 'SUBMITTED_TO_FRANCHISE'
    WHEN 'BP_REVIEW' THEN 'SUBMITTED_TO_BUSINESS_PARTNER'
    WHEN 'SUPERADMIN_APPROVAL' THEN 'SUBMITTED_TO_SUPERADMIN'
    WHEN 'APPROVED' THEN 'APPROVED'
    WHEN 'REJECTED' THEN 'REJECTED'
    ELSE 'DRAFT'
  END,
  CASE
    WHEN c.`workflowStage` IN (
      'FRANCHISE_REVIEW',
      'BP_REVIEW',
      'SUPERADMIN_APPROVAL',
      'APPROVED'
    ) THEN true
    ELSE false
  END,
  CASE
    WHEN c.`workflowStage` <> 'CENTER_REVIEW' THEN MIN(ce.`enrolledAt`)
    ELSE NULL
  END,
  CASE
    WHEN c.`workflowStage` IN (
      'FRANCHISE_REVIEW',
      'BP_REVIEW',
      'SUPERADMIN_APPROVAL',
      'APPROVED'
    ) THEN c.`updatedAt`
    ELSE NULL
  END,
  CASE
    WHEN c.`workflowStage` = 'APPROVED' THEN c.`updatedAt`
    ELSE NULL
  END,
  CASE
    WHEN c.`workflowStage` = 'REJECTED' THEN c.`rejectedAt`
    ELSE NULL
  END,
  CASE
    WHEN c.`workflowStage` = 'REJECTED' THEN c.`rejectedByUserId`
    ELSE NULL
  END,
  CASE
    WHEN c.`workflowStage` = 'REJECTED' THEN 'Legacy competition rejection'
    ELSE NULL
  END,
  c.`createdByUserId`,
  MIN(ce.`enrolledAt`),
  c.`updatedAt`
FROM `competitionenrollment` ce
INNER JOIN `competition` c
  ON c.`id` = ce.`competitionId`
  AND c.`tenantId` = ce.`tenantId`
GROUP BY
  ce.`tenantId`,
  ce.`competitionId`,
  ce.`hierarchyNodeId`,
  c.`workflowStage`,
  c.`updatedAt`,
  c.`rejectedAt`,
  c.`rejectedByUserId`,
  c.`createdByUserId`;

INSERT INTO `competitionenrollmentlistitem` (
  `tenantId`,
  `listId`,
  `enrollmentId`,
  `included`,
  `exclusionReason`,
  `createdAt`,
  `updatedAt`
)
SELECT
  ce.`tenantId`,
  cel.`id`,
  ce.`id`,
  ce.`isActive`,
  CASE
    WHEN ce.`isActive` = false THEN 'Inactive legacy enrollment'
    ELSE NULL
  END,
  ce.`enrolledAt`,
  CURRENT_TIMESTAMP(3)
FROM `competitionenrollment` ce
INNER JOIN `competitionenrollmentlist` cel
  ON cel.`tenantId` = ce.`tenantId`
  AND cel.`competitionId` = ce.`competitionId`
  AND cel.`hierarchyNodeId` = ce.`hierarchyNodeId`
  AND cel.`type` = 'CENTER_COMBINED';
