-- migration_exam_result_publication_governance.sql
-- Exam Result Publication Governance and Control Center schema updates.
-- Idempotent and MySQL 5.7+ compatible.

SET @db := DATABASE();

-- Ensure examcycle.resultStatus contains READY_FOR_REVIEW.
SET @status_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'examcycle'
    AND column_name = 'resultStatus'
);

SET @status_has_ready := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'examcycle'
    AND column_name = 'resultStatus'
    AND UPPER(column_type) LIKE '%READY_FOR_REVIEW%'
);

SET @sql := IF(
  @status_exists = 1 AND @status_has_ready = 0,
  'ALTER TABLE `examcycle` MODIFY COLUMN `resultStatus` ENUM(''DRAFT'',''READY_FOR_REVIEW'',''LOCKED'',''PUBLISHED'') NOT NULL DEFAULT ''DRAFT''',
  'SELECT ''examcycle.resultStatus already compatible'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add examcycle.resultPublishedByUserId.
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'examcycle'
    AND column_name = 'resultPublishedByUserId'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE `examcycle` ADD COLUMN `resultPublishedByUserId` VARCHAR(191) NULL',
  'SELECT ''examcycle.resultPublishedByUserId exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Index for publication actor.
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'examcycle'
    AND index_name = 'examcycle_resultPublishedByUserId_idx'
);
SET @sql := IF(
  @exists = 0,
  'CREATE INDEX `examcycle_resultPublishedByUserId_idx` ON `examcycle` (`resultPublishedByUserId`)',
  'SELECT ''examcycle_resultPublishedByUserId_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Composite index for result status queries.
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'examcycle'
    AND index_name = 'examcycle_tenantId_resultStatus_examEndsAt_idx'
);
SET @sql := IF(
  @exists = 0,
  'CREATE INDEX `examcycle_tenantId_resultStatus_examEndsAt_idx` ON `examcycle` (`tenantId`, `resultStatus`, `examEndsAt`)',
  'SELECT ''examcycle_tenantId_resultStatus_examEndsAt_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add foreign key examcycle.resultPublishedByUserId -> authuser.id.
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = @db
    AND table_name = 'examcycle'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name = 'examcycle_resultPublishedByUserId_fkey'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `examcycle` ADD CONSTRAINT `examcycle_resultPublishedByUserId_fkey` FOREIGN KEY (`resultPublishedByUserId`) REFERENCES `authuser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''examcycle_resultPublishedByUserId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Create examresultpublicationaudit table.
CREATE TABLE IF NOT EXISTS `examresultpublicationaudit` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `examCycleId` VARCHAR(191) NOT NULL,
  `action` ENUM('PUBLISHED','UNPUBLISHED') NOT NULL,
  `notes` TEXT NULL,
  `actedByUserId` VARCHAR(191) NOT NULL,
  `actedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `examresultpublicationaudit_tenantId_examCycleId_actedAt_idx` (`tenantId`, `examCycleId`, `actedAt`),
  KEY `examresultpublicationaudit_tenantId_action_actedAt_idx` (`tenantId`, `action`, `actedAt`),
  KEY `examresultpublicationaudit_actedByUserId_actedAt_idx` (`actedByUserId`, `actedAt`),
  CONSTRAINT `examresultpublicationaudit_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `examresultpublicationaudit_examCycleId_fkey` FOREIGN KEY (`examCycleId`) REFERENCES `examcycle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `examresultpublicationaudit_actedByUserId_fkey` FOREIGN KEY (`actedByUserId`) REFERENCES `authuser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Exam result publication governance migration completed.' AS status;
