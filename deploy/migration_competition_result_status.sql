-- migration_competition_result_status.sql
-- Idempotent schema delta for competition result publish/unpublish controls.
-- MySQL 5.7+ compatible.

SET @db := DATABASE();

-- Competition.resultStatus
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'Competition' AND column_name = 'resultStatus'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `Competition` ADD COLUMN `resultStatus` ENUM(''DRAFT'',''LOCKED'',''PUBLISHED'') NOT NULL DEFAULT ''DRAFT''',
  'SELECT ''Competition.resultStatus exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Competition.resultPublishedAt
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'Competition' AND column_name = 'resultPublishedAt'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `Competition` ADD COLUMN `resultPublishedAt` DATETIME(3) NULL',
  'SELECT ''Competition.resultPublishedAt exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Index: Competition_tenantId_resultStatus_idx
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'Competition' AND index_name = 'Competition_tenantId_resultStatus_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `Competition_tenantId_resultStatus_idx` ON `Competition` (`tenantId`, `resultStatus`)',
  'SELECT ''Competition_tenantId_resultStatus_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Competition result status migration completed.' AS status;
