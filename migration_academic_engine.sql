-- migration_academic_engine.sql
-- Purpose: Idempotent, non-destructive academic engine migration for MySQL.
-- Scope:
--   1) LevelRule columns: totalQuestions, passThreshold, timeLimitSeconds
--   2) Worksheet column: templateId (+ index + FK)
--   3) WorksheetQuestion column: questionBankId (+ index + FK)
--   4) WorksheetSubmission hardening columns: submittedAnswers, finalSubmittedAt, passed, evaluationHash
--   5) New tables: WorksheetTemplate, QuestionBank (+ indexes + FK)
-- Safe for repeated execution via information_schema checks.

SET @db := DATABASE();

-- ============================
-- LevelRule academic thresholds
-- ============================
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'LevelRule' AND column_name = 'totalQuestions'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `LevelRule` ADD COLUMN `totalQuestions` INT NULL',
  'SELECT ''LevelRule.totalQuestions exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'LevelRule' AND column_name = 'passThreshold'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `LevelRule` ADD COLUMN `passThreshold` DECIMAL(5,2) NULL',
  'SELECT ''LevelRule.passThreshold exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'LevelRule' AND column_name = 'timeLimitSeconds'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `LevelRule` ADD COLUMN `timeLimitSeconds` INT NULL',
  'SELECT ''LevelRule.timeLimitSeconds exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =======================================
-- WorksheetTemplate table (new academic)
-- =======================================
CREATE TABLE IF NOT EXISTS `WorksheetTemplate` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `levelId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `totalQuestions` INT NOT NULL,
  `easyCount` INT NOT NULL,
  `mediumCount` INT NOT NULL,
  `hardCount` INT NOT NULL,
  `timeLimitSeconds` INT NOT NULL DEFAULT 600,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'WorksheetTemplate' AND index_name = 'WorksheetTemplate_tenantId_isActive_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `WorksheetTemplate_tenantId_isActive_idx` ON `WorksheetTemplate` (`tenantId`, `isActive`)',
  'SELECT ''WorksheetTemplate_tenantId_isActive_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'WorksheetTemplate' AND index_name = 'WorksheetTemplate_tenantId_levelId_key'
);
SET @sql := IF(@exists = 0,
  'CREATE UNIQUE INDEX `WorksheetTemplate_tenantId_levelId_key` ON `WorksheetTemplate` (`tenantId`, `levelId`)',
  'SELECT ''WorksheetTemplate_tenantId_levelId_key exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'WorksheetTemplate_tenantId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `WorksheetTemplate` ADD CONSTRAINT `WorksheetTemplate_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''WorksheetTemplate_tenantId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'WorksheetTemplate_levelId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `WorksheetTemplate` ADD CONSTRAINT `WorksheetTemplate_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''WorksheetTemplate_levelId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ==================================
-- QuestionBank table (new academic)
-- ==================================
CREATE TABLE IF NOT EXISTS `QuestionBank` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `levelId` VARCHAR(191) NOT NULL,
  `templateId` VARCHAR(191) NULL,
  `difficulty` ENUM('EASY','MEDIUM','HARD') NOT NULL,
  `prompt` VARCHAR(191) NOT NULL,
  `operands` JSON NOT NULL,
  `operation` VARCHAR(191) NOT NULL,
  `correctAnswer` INT NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'QuestionBank' AND index_name = 'QuestionBank_tenantId_levelId_difficulty_isActive_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `QuestionBank_tenantId_levelId_difficulty_isActive_idx` ON `QuestionBank` (`tenantId`, `levelId`, `difficulty`, `isActive`)',
  'SELECT ''QuestionBank_tenantId_levelId_difficulty_isActive_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'QuestionBank' AND index_name = 'QuestionBank_templateId_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `QuestionBank_templateId_idx` ON `QuestionBank` (`templateId`)',
  'SELECT ''QuestionBank_templateId_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'QuestionBank' AND index_name = 'QuestionBank_tenantId_levelId_prompt_key'
);
SET @sql := IF(@exists = 0,
  'CREATE UNIQUE INDEX `QuestionBank_tenantId_levelId_prompt_key` ON `QuestionBank` (`tenantId`, `levelId`, `prompt`)',
  'SELECT ''QuestionBank_tenantId_levelId_prompt_key exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'QuestionBank_tenantId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `QuestionBank` ADD CONSTRAINT `QuestionBank_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''QuestionBank_tenantId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'QuestionBank_levelId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `QuestionBank` ADD CONSTRAINT `QuestionBank_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''QuestionBank_levelId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'QuestionBank_templateId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `QuestionBank` ADD CONSTRAINT `QuestionBank_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `WorksheetTemplate` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''QuestionBank_templateId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ==========================================
-- Worksheet -> WorksheetTemplate relationship
-- ==========================================
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'Worksheet' AND column_name = 'templateId'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `Worksheet` ADD COLUMN `templateId` VARCHAR(191) NULL',
  'SELECT ''Worksheet.templateId exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'Worksheet' AND index_name = 'Worksheet_templateId_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `Worksheet_templateId_idx` ON `Worksheet` (`templateId`)',
  'SELECT ''Worksheet_templateId_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'Worksheet_templateId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `Worksheet` ADD CONSTRAINT `Worksheet_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `WorksheetTemplate` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''Worksheet_templateId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =============================================
-- WorksheetQuestion -> QuestionBank relationship
-- =============================================
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'WorksheetQuestion' AND column_name = 'questionBankId'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `WorksheetQuestion` ADD COLUMN `questionBankId` VARCHAR(191) NULL',
  'SELECT ''WorksheetQuestion.questionBankId exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'WorksheetQuestion' AND index_name = 'WorksheetQuestion_questionBankId_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `WorksheetQuestion_questionBankId_idx` ON `WorksheetQuestion` (`questionBankId`)',
  'SELECT ''WorksheetQuestion_questionBankId_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'WorksheetQuestion_questionBankId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `WorksheetQuestion` ADD CONSTRAINT `WorksheetQuestion_questionBankId_fkey` FOREIGN KEY (`questionBankId`) REFERENCES `QuestionBank` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''WorksheetQuestion_questionBankId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =========================================
-- Submission hardening columns (non-destruct)
-- =========================================
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'WorksheetSubmission' AND column_name = 'submittedAnswers'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `WorksheetSubmission` ADD COLUMN `submittedAnswers` JSON NULL',
  'SELECT ''WorksheetSubmission.submittedAnswers exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'WorksheetSubmission' AND column_name = 'finalSubmittedAt'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `WorksheetSubmission` ADD COLUMN `finalSubmittedAt` DATETIME(3) NULL',
  'SELECT ''WorksheetSubmission.finalSubmittedAt exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'WorksheetSubmission' AND column_name = 'passed'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `WorksheetSubmission` ADD COLUMN `passed` BOOLEAN NULL',
  'SELECT ''WorksheetSubmission.passed exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'WorksheetSubmission' AND column_name = 'evaluationHash'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `WorksheetSubmission` ADD COLUMN `evaluationHash` VARCHAR(191) NULL',
  'SELECT ''WorksheetSubmission.evaluationHash exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Academic engine migration completed (idempotent).' AS status;
