-- rollback_academic_engine.sql
-- Purpose: Non-destructive rollback for academic engine constraints/indexes.
-- NOTE: To avoid data loss, this script DOES NOT drop columns or tables.
-- It only removes foreign keys and indexes introduced by migration_academic_engine.sql.

SET @db := DATABASE();

-- =======================
-- Drop foreign constraints
-- =======================
SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'WorksheetQuestion_questionBankId_fkey'
);
SET @sql := IF(@exists = 1,
  'ALTER TABLE `WorksheetQuestion` DROP FOREIGN KEY `WorksheetQuestion_questionBankId_fkey`',
  'SELECT ''WorksheetQuestion_questionBankId_fkey not present'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'Worksheet_templateId_fkey'
);
SET @sql := IF(@exists = 1,
  'ALTER TABLE `Worksheet` DROP FOREIGN KEY `Worksheet_templateId_fkey`',
  'SELECT ''Worksheet_templateId_fkey not present'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'QuestionBank_templateId_fkey'
);
SET @sql := IF(@exists = 1,
  'ALTER TABLE `QuestionBank` DROP FOREIGN KEY `QuestionBank_templateId_fkey`',
  'SELECT ''QuestionBank_templateId_fkey not present'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'QuestionBank_levelId_fkey'
);
SET @sql := IF(@exists = 1,
  'ALTER TABLE `QuestionBank` DROP FOREIGN KEY `QuestionBank_levelId_fkey`',
  'SELECT ''QuestionBank_levelId_fkey not present'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'QuestionBank_tenantId_fkey'
);
SET @sql := IF(@exists = 1,
  'ALTER TABLE `QuestionBank` DROP FOREIGN KEY `QuestionBank_tenantId_fkey`',
  'SELECT ''QuestionBank_tenantId_fkey not present'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'WorksheetTemplate_levelId_fkey'
);
SET @sql := IF(@exists = 1,
  'ALTER TABLE `WorksheetTemplate` DROP FOREIGN KEY `WorksheetTemplate_levelId_fkey`',
  'SELECT ''WorksheetTemplate_levelId_fkey not present'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'WorksheetTemplate_tenantId_fkey'
);
SET @sql := IF(@exists = 1,
  'ALTER TABLE `WorksheetTemplate` DROP FOREIGN KEY `WorksheetTemplate_tenantId_fkey`',
  'SELECT ''WorksheetTemplate_tenantId_fkey not present'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===========
-- Drop indexes
-- ===========
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'WorksheetQuestion' AND index_name = 'WorksheetQuestion_questionBankId_idx'
);
SET @sql := IF(@exists > 0,
  'DROP INDEX `WorksheetQuestion_questionBankId_idx` ON `WorksheetQuestion`',
  'SELECT ''WorksheetQuestion_questionBankId_idx not present'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'Worksheet' AND index_name = 'Worksheet_templateId_idx'
);
SET @sql := IF(@exists > 0,
  'DROP INDEX `Worksheet_templateId_idx` ON `Worksheet`',
  'SELECT ''Worksheet_templateId_idx not present'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'QuestionBank' AND index_name = 'QuestionBank_templateId_idx'
);
SET @sql := IF(@exists > 0,
  'DROP INDEX `QuestionBank_templateId_idx` ON `QuestionBank`',
  'SELECT ''QuestionBank_templateId_idx not present'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'QuestionBank' AND index_name = 'QuestionBank_tenantId_levelId_difficulty_isActive_idx'
);
SET @sql := IF(@exists > 0,
  'DROP INDEX `QuestionBank_tenantId_levelId_difficulty_isActive_idx` ON `QuestionBank`',
  'SELECT ''QuestionBank_tenantId_levelId_difficulty_isActive_idx not present'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'QuestionBank' AND index_name = 'QuestionBank_tenantId_levelId_prompt_key'
);
SET @sql := IF(@exists > 0,
  'DROP INDEX `QuestionBank_tenantId_levelId_prompt_key` ON `QuestionBank`',
  'SELECT ''QuestionBank_tenantId_levelId_prompt_key not present'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'WorksheetTemplate' AND index_name = 'WorksheetTemplate_tenantId_isActive_idx'
);
SET @sql := IF(@exists > 0,
  'DROP INDEX `WorksheetTemplate_tenantId_isActive_idx` ON `WorksheetTemplate`',
  'SELECT ''WorksheetTemplate_tenantId_isActive_idx not present'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'WorksheetTemplate' AND index_name = 'WorksheetTemplate_tenantId_levelId_key'
);
SET @sql := IF(@exists > 0,
  'DROP INDEX `WorksheetTemplate_tenantId_levelId_key` ON `WorksheetTemplate`',
  'SELECT ''WorksheetTemplate_tenantId_levelId_key not present'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Non-destructive rollback completed. Columns/tables were intentionally preserved.' AS status;
