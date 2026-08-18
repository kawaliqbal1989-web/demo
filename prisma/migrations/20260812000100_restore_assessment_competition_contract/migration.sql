-- migration_assessment_unified_sprint1.sql
-- Sprint 1 additive schema for unified assessment entities.
-- Idempotent, MySQL/MariaDB compatible.

SET @db := DATABASE();

-- Restore fields required by the current Competition controller and workflow.
ALTER TABLE `competition`
  ADD COLUMN `attemptLimit` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `resultStatus` ENUM('DRAFT','LOCKED','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN `resultPublishedAt` DATETIME(3) NULL;

CREATE INDEX `Competition_tenantId_resultStatus_idx`
  ON `competition`(`tenantId`, `resultStatus`);

CREATE TABLE IF NOT EXISTS `assessment` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `assessmentType` ENUM('EXAM','COMPETITION') NOT NULL,
  `sourceSystem` ENUM('EXAM_CYCLE','COMPETITION') NOT NULL,
  `sourceEntityId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `levelId` VARCHAR(191) NULL,
  `hierarchyNodeId` VARCHAR(191) NULL,
  `businessPartnerId` VARCHAR(191) NULL,
  `courseId` VARCHAR(191) NULL,
  `status` ENUM('DRAFT','ACTIVE','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `activeVersionId` VARCHAR(191) NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `ass_t_src_uq`(`tenantId`, `sourceSystem`, `sourceEntityId`),
  INDEX `ass_t_type_ct_i`(`tenantId`, `assessmentType`, `createdAt`),
  INDEX `ass_t_lvl_i`(`tenantId`, `levelId`),
  INDEX `ass_t_hn_i`(`tenantId`, `hierarchyNodeId`),
  INDEX `ass_t_bp_i`(`tenantId`, `businessPartnerId`),
  INDEX `ass_t_av_i`(`tenantId`, `activeVersionId`),
  INDEX `ass_t_ct_id_i`(`tenantId`, `createdAt`, `id`),

  CONSTRAINT `Assessment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Assessment_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `level`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Assessment_hierarchyNodeId_fkey` FOREIGN KEY (`hierarchyNodeId`) REFERENCES `hierarchynode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Assessment_businessPartnerId_fkey` FOREIGN KEY (`businessPartnerId`) REFERENCES `businesspartner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Assessment_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `course`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Assessment_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `authuser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `assessmentversion` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `assessmentId` VARCHAR(191) NOT NULL,
  `versionNumber` INTEGER NOT NULL,
  `parentVersionId` VARCHAR(191) NULL,
  `sourceEntityId` VARCHAR(191) NOT NULL,
  `sourceRevisionHash` VARCHAR(191) NOT NULL,
  `versionStatus` ENUM('DRAFT','CURRENT','SUPERSEDED') NOT NULL DEFAULT 'DRAFT',
  `enrollmentStartAt` DATETIME(3) NULL,
  `enrollmentEndAt` DATETIME(3) NULL,
  `practiceStartAt` DATETIME(3) NULL,
  `startsAt` DATETIME(3) NULL,
  `endsAt` DATETIME(3) NULL,
  `durationMinutes` INTEGER NULL,
  `attemptLimit` INTEGER NULL,
  `slotCode` VARCHAR(191) NULL,
  `slotStartAt` DATETIME(3) NULL,
  `slotEndAt` DATETIME(3) NULL,
  `resultStatusMirror` VARCHAR(191) NULL,
  `resultPublishedAtMirror` DATETIME(3) NULL,
  `legacyWorkflowStage` VARCHAR(191) NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `asv_t_ass_ver_uq`(`tenantId`, `assessmentId`, `versionNumber`),
  INDEX `asv_t_src_i`(`tenantId`, `sourceEntityId`),
  INDEX `asv_t_vst_i`(`tenantId`, `versionStatus`),
  INDEX `asv_t_sta_i`(`tenantId`, `startsAt`),
  INDEX `asv_t_end_i`(`tenantId`, `endsAt`),
  INDEX `asv_t_rsm_i`(`tenantId`, `resultStatusMirror`),
  INDEX `asv_t_ass_vst_i`(`tenantId`, `assessmentId`, `versionStatus`),
  INDEX `asv_t_slot_i`(`tenantId`, `slotCode`, `slotStartAt`),

  CONSTRAINT `AssessmentVersion_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `AssessmentVersion_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `assessment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AssessmentVersion_parentVersionId_fkey` FOREIGN KEY (`parentVersionId`) REFERENCES `assessmentversion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `AssessmentVersion_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `authuser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `assessmentpaper` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `assessmentVersionId` VARCHAR(191) NOT NULL,
  `worksheetId` VARCHAR(191) NOT NULL,
  `paperType` ENUM('COMMON','INDIVIDUAL') NOT NULL DEFAULT 'COMMON',
  `sourceMode` ENUM('EXAM_SELECTED_BASE','EXAM_GENERATED','COMPETITION_ASSIGNED','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  `levelId` VARCHAR(191) NULL,
  `sourceListId` VARCHAR(191) NULL,
  `sourceLevelId` VARCHAR(191) NULL,
  `sourceStudentId` VARCHAR(191) NULL,
  `sourceWorksheetId` VARCHAR(191) NULL,
  `generationSeedMirror` VARCHAR(191) NULL,
  `isPrimaryPaper` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `asp_t_ver_ws_uq`(`tenantId`, `assessmentVersionId`, `worksheetId`),
  INDEX `asp_t_ver_i`(`tenantId`, `assessmentVersionId`),
  INDEX `asp_t_ws_i`(`tenantId`, `worksheetId`),
  INDEX `asp_t_list_i`(`tenantId`, `sourceListId`),
  INDEX `asp_t_std_i`(`tenantId`, `sourceStudentId`),
  INDEX `asp_t_lvl_i`(`tenantId`, `levelId`),
  INDEX `asp_t_prim_i`(`tenantId`, `isPrimaryPaper`),
  INDEX `asp_t_sws_i`(`tenantId`, `sourceWorksheetId`),

  CONSTRAINT `AssessmentPaper_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `AssessmentPaper_assessmentVersionId_fkey` FOREIGN KEY (`assessmentVersionId`) REFERENCES `assessmentversion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AssessmentPaper_worksheetId_fkey` FOREIGN KEY (`worksheetId`) REFERENCES `worksheet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `AssessmentPaper_sourceWorksheetId_fkey` FOREIGN KEY (`sourceWorksheetId`) REFERENCES `worksheet`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `AssessmentPaper_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `level`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `AssessmentPaper_sourceStudentId_fkey` FOREIGN KEY (`sourceStudentId`) REFERENCES `student`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `assessmentparticipant` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `assessmentVersionId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `participantType` ENUM('STUDENT') NOT NULL DEFAULT 'STUDENT',
  `sourceEntityType` VARCHAR(32) NOT NULL,
  `sourceEntityId` VARCHAR(128) NOT NULL,
  `sourceContainerType` VARCHAR(191) NULL,
  `sourceContainerId` VARCHAR(191) NULL,
  `levelId` VARCHAR(191) NULL,
  `hierarchyNodeId` VARCHAR(191) NULL,
  `teacherUserId` VARCHAR(191) NULL,
  `includedInAssessment` BOOLEAN NOT NULL DEFAULT TRUE,
  `participantStatus` ENUM('ACTIVE','EXCLUDED','REJECTED','LEGACY_ONLY') NOT NULL DEFAULT 'ACTIVE',
  `legacyStatusMirror` VARCHAR(191) NULL,
  `enrolledAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `aspt_t_ver_std_src_entity_uq`(`tenantId`, `assessmentVersionId`, `studentId`, `sourceEntityType`, `sourceEntityId`),
  INDEX `aspt_t_ver_std_i`(`tenantId`, `assessmentVersionId`, `studentId`),
  INDEX `aspt_t_std_i`(`tenantId`, `studentId`),
  INDEX `aspt_t_src_i`(`tenantId`, `sourceEntityType`, `sourceEntityId`),
  INDEX `aspt_t_cont_i`(`tenantId`, `sourceContainerType`, `sourceContainerId`),
  INDEX `aspt_t_inc_st_i`(`tenantId`, `includedInAssessment`, `participantStatus`),
  INDEX `aspt_t_hn_i`(`tenantId`, `hierarchyNodeId`),
  INDEX `aspt_t_lvl_i`(`tenantId`, `levelId`),
  INDEX `aspt_t_tu_i`(`tenantId`, `teacherUserId`),

  CONSTRAINT `AssessmentParticipant_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `AssessmentParticipant_assessmentVersionId_fkey` FOREIGN KEY (`assessmentVersionId`) REFERENCES `assessmentversion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AssessmentParticipant_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AssessmentParticipant_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `level`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `AssessmentParticipant_hierarchyNodeId_fkey` FOREIGN KEY (`hierarchyNodeId`) REFERENCES `hierarchynode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `AssessmentParticipant_teacherUserId_fkey` FOREIGN KEY (`teacherUserId`) REFERENCES `authuser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `assessmentmigrationlog` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `logType` ENUM('BACKFILL','PARITY') NOT NULL,
  `status` ENUM('STARTED','RUNNING','COMPLETED','FAILED','SKIPPED') NOT NULL DEFAULT 'STARTED',
  `sourceSystem` ENUM('EXAM_CYCLE','COMPETITION') NOT NULL,
  `sourceEntityId` VARCHAR(191) NOT NULL,
  `assessmentId` VARCHAR(191) NULL,
  `assessmentVersionId` VARCHAR(191) NULL,
  `actorUserId` VARCHAR(191) NULL,
  `jobKey` VARCHAR(191) NULL,
  `message` VARCHAR(191) NULL,
  `details` JSON NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `asml_t_lt_st_sta_i`(`tenantId`, `logType`, `status`, `startedAt`),
  INDEX `asml_t_src_i`(`tenantId`, `sourceSystem`, `sourceEntityId`),
  INDEX `asml_t_ass_i`(`tenantId`, `assessmentId`),
  INDEX `asml_t_asv_i`(`tenantId`, `assessmentVersionId`),
  INDEX `asml_t_act_sta_i`(`tenantId`, `actorUserId`, `startedAt`),
  INDEX `asml_t_job_i`(`tenantId`, `jobKey`),

  CONSTRAINT `AssessmentMigrationLog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `AssessmentMigrationLog_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `assessment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `AssessmentMigrationLog_assessmentVersionId_fkey` FOREIGN KEY (`assessmentVersionId`) REFERENCES `assessmentversion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `AssessmentMigrationLog_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `authuser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add Assessment.activeVersionId FK after both tables exist to break cycle safely.
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = @db
    AND table_name = 'assessment'
    AND constraint_name = 'Assessment_activeVersionId_fkey'
    AND constraint_type = 'FOREIGN KEY'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE `assessment` ADD CONSTRAINT `Assessment_activeVersionId_fkey` FOREIGN KEY (`activeVersionId`) REFERENCES `assessmentversion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  "SELECT 'Assessment_activeVersionId_fkey exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
