-- migration_student_lifecycle_integrity.sql
-- Phase 1: Student Lifecycle Integrity
-- Idempotent, non-destructive, MySQL 5.7+ compatible.

SET @db := DATABASE();

-- ===============================================
-- 1) StudentLevelProgressionHistory (immutable log)
-- ===============================================
CREATE TABLE IF NOT EXISTS `StudentLevelProgressionHistory` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `fromLevelId` VARCHAR(191) NOT NULL,
  `toLevelId` VARCHAR(191) NOT NULL,
  `score` DECIMAL(5,2) NULL,
  `passed` BOOLEAN NOT NULL,
  `promotedByUserId` VARCHAR(191) NOT NULL,
  `reason` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'StudentLevelProgressionHistory'
    AND index_name = 'StudentLevelProgressionHistory_tenantId_studentId_createdAt_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `StudentLevelProgressionHistory_tenantId_studentId_createdAt_idx` ON `StudentLevelProgressionHistory` (`tenantId`, `studentId`, `createdAt`)',
  'SELECT ''StudentLevelProgressionHistory_tenantId_studentId_createdAt_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'StudentLevelProgressionHistory'
    AND index_name = 'StudentLevelProgressionHistory_tenantId_fromLevelId_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `StudentLevelProgressionHistory_tenantId_fromLevelId_idx` ON `StudentLevelProgressionHistory` (`tenantId`, `fromLevelId`)',
  'SELECT ''StudentLevelProgressionHistory_tenantId_fromLevelId_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'StudentLevelProgressionHistory'
    AND index_name = 'StudentLevelProgressionHistory_tenantId_toLevelId_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `StudentLevelProgressionHistory_tenantId_toLevelId_idx` ON `StudentLevelProgressionHistory` (`tenantId`, `toLevelId`)',
  'SELECT ''StudentLevelProgressionHistory_tenantId_toLevelId_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'StudentLevelProgressionHistory'
    AND index_name = 'StudentLevelProgressionHistory_tenantId_studentId_fromLevelId_toLevelId_key'
);
SET @sql := IF(@exists = 0,
  'CREATE UNIQUE INDEX `StudentLevelProgressionHistory_tenantId_studentId_fromLevelId_toLevelId_key` ON `StudentLevelProgressionHistory` (`tenantId`, `studentId`, `fromLevelId`, `toLevelId`)',
  'SELECT ''StudentLevelProgressionHistory unique key exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db
    AND constraint_name = 'StudentLevelProgressionHistory_tenantId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `StudentLevelProgressionHistory` ADD CONSTRAINT `StudentLevelProgressionHistory_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''StudentLevelProgressionHistory_tenantId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db
    AND constraint_name = 'StudentLevelProgressionHistory_studentId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `StudentLevelProgressionHistory` ADD CONSTRAINT `StudentLevelProgressionHistory_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student` (`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT ''StudentLevelProgressionHistory_studentId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db
    AND constraint_name = 'StudentLevelProgressionHistory_fromLevelId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `StudentLevelProgressionHistory` ADD CONSTRAINT `StudentLevelProgressionHistory_fromLevelId_fkey` FOREIGN KEY (`fromLevelId`) REFERENCES `Level` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''StudentLevelProgressionHistory_fromLevelId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db
    AND constraint_name = 'StudentLevelProgressionHistory_toLevelId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `StudentLevelProgressionHistory` ADD CONSTRAINT `StudentLevelProgressionHistory_toLevelId_fkey` FOREIGN KEY (`toLevelId`) REFERENCES `Level` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''StudentLevelProgressionHistory_toLevelId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db
    AND constraint_name = 'StudentLevelProgressionHistory_promotedByUserId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `StudentLevelProgressionHistory` ADD CONSTRAINT `StudentLevelProgressionHistory_promotedByUserId_fkey` FOREIGN KEY (`promotedByUserId`) REFERENCES `AuthUser` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''StudentLevelProgressionHistory_promotedByUserId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =================================
-- 2) CompetitionEnrollment integrity
-- =================================
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'CompetitionEnrollment'
    AND column_name = 'isActive'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `CompetitionEnrollment` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT TRUE',
  'SELECT ''CompetitionEnrollment.isActive exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'CompetitionEnrollment'
    AND index_name = 'CompetitionEnrollment_tenantId_studentId_isActive_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `CompetitionEnrollment_tenantId_studentId_isActive_idx` ON `CompetitionEnrollment` (`tenantId`, `studentId`, `isActive`)',
  'SELECT ''CompetitionEnrollment_tenantId_studentId_isActive_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Student lifecycle integrity migration completed.' AS status;
