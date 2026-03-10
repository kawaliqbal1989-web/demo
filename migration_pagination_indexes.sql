-- migration_pagination_indexes.sql
-- Idempotent, non-destructive pagination index hardening.
-- MySQL 5.7+ compatible. Safe for shared hosting manual runs.

SET @db := DATABASE();

-- WorksheetSubmission.createdAt (needed for deterministic sorting + indexes)
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'WorksheetSubmission' AND column_name = 'createdAt'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `WorksheetSubmission` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)',
  'SELECT ''WorksheetSubmission.createdAt exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- WorksheetSubmission.updatedAt (added for consistency; defaulted for safe online alter)
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'WorksheetSubmission' AND column_name = 'updatedAt'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `WorksheetSubmission` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)',
  'SELECT ''WorksheetSubmission.updatedAt exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill createdAt from submittedAt (best-effort)
-- Note: If the column was just added, existing rows will get CURRENT_TIMESTAMP; align them to submittedAt.
SET @sql := 'UPDATE `WorksheetSubmission` SET `createdAt` = `submittedAt` WHERE `createdAt` IS NULL OR `createdAt` > `submittedAt`';
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Student: (tenantId, createdAt, id)
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'Student' AND index_name = 'Student_tenantId_createdAt_id_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `Student_tenantId_createdAt_id_idx` ON `Student` (`tenantId`, `createdAt`, `id`)',
  'SELECT ''Student_tenantId_createdAt_id_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Competition: (tenantId, createdAt, id)
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'Competition' AND index_name = 'Competition_tenantId_createdAt_id_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `Competition_tenantId_createdAt_id_idx` ON `Competition` (`tenantId`, `createdAt`, `id`)',
  'SELECT ''Competition_tenantId_createdAt_id_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Competition: (tenantId, workflowStage, createdAt)
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'Competition' AND index_name = 'Competition_tenantId_workflowStage_createdAt_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `Competition_tenantId_workflowStage_createdAt_idx` ON `Competition` (`tenantId`, `workflowStage`, `createdAt`)',
  'SELECT ''Competition_tenantId_workflowStage_createdAt_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Worksheet: (tenantId, createdAt, id)
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'Worksheet' AND index_name = 'Worksheet_tenantId_createdAt_id_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `Worksheet_tenantId_createdAt_id_idx` ON `Worksheet` (`tenantId`, `createdAt`, `id`)',
  'SELECT ''Worksheet_tenantId_createdAt_id_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- HierarchyNode: (tenantId, createdAt, id)
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'HierarchyNode' AND index_name = 'HierarchyNode_tenantId_createdAt_id_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `HierarchyNode_tenantId_createdAt_id_idx` ON `HierarchyNode` (`tenantId`, `createdAt`, `id`)',
  'SELECT ''HierarchyNode_tenantId_createdAt_id_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- WorksheetSubmission: (tenantId, createdAt, id)
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'WorksheetSubmission' AND index_name = 'WorksheetSubmission_tenantId_createdAt_id_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `WorksheetSubmission_tenantId_createdAt_id_idx` ON `WorksheetSubmission` (`tenantId`, `createdAt`, `id`)',
  'SELECT ''WorksheetSubmission_tenantId_createdAt_id_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- WorksheetSubmission: (tenantId, studentId, createdAt)
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'WorksheetSubmission' AND index_name = 'WorksheetSubmission_tenantId_studentId_createdAt_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `WorksheetSubmission_tenantId_studentId_createdAt_idx` ON `WorksheetSubmission` (`tenantId`, `studentId`, `createdAt`)',
  'SELECT ''WorksheetSubmission_tenantId_studentId_createdAt_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- AuthUser (teachers list): (tenantId, createdAt, id)
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'AuthUser' AND index_name = 'AuthUser_tenantId_createdAt_id_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `AuthUser_tenantId_createdAt_id_idx` ON `AuthUser` (`tenantId`, `createdAt`, `id`)',
  'SELECT ''AuthUser_tenantId_createdAt_id_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- AuthUser (teachers list): (tenantId, role, createdAt)
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'AuthUser' AND index_name = 'AuthUser_tenantId_role_createdAt_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `AuthUser_tenantId_role_createdAt_idx` ON `AuthUser` (`tenantId`, `role`, `createdAt`)',
  'SELECT ''AuthUser_tenantId_role_createdAt_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Pagination index migration completed.' AS status;
