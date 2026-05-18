-- Backfill Student optional profile and temporary-exam columns for drifted production databases.
-- Uses guarded dynamic ALTER statements because this environment does not reliably support IF NOT EXISTS.

SET @db_name := DATABASE();

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'student' AND column_name = 'gender'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `student` ADD COLUMN `gender` ENUM("MALE","FEMALE","OTHER") NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'student' AND column_name = 'guardianEmail'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `student` ADD COLUMN `guardianEmail` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'student' AND column_name = 'phonePrimary'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `student` ADD COLUMN `phonePrimary` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'student' AND column_name = 'phoneSecondary'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `student` ADD COLUMN `phoneSecondary` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'student' AND column_name = 'address'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `student` ADD COLUMN `address` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'student' AND column_name = 'state'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `student` ADD COLUMN `state` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'student' AND column_name = 'district'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `student` ADD COLUMN `district` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'student' AND column_name = 'tehsil'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `student` ADD COLUMN `tehsil` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'student' AND column_name = 'photoUrl'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `student` ADD COLUMN `photoUrl` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'student' AND column_name = 'isTemporaryExam'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `student` ADD COLUMN `isTemporaryExam` BOOLEAN NOT NULL DEFAULT FALSE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'student' AND column_name = 'temporaryExpiresAt'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `student` ADD COLUMN `temporaryExpiresAt` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'student' AND column_name = 'temporaryExamCycleId'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `student` ADD COLUMN `temporaryExamCycleId` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
