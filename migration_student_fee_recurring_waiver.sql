-- Recurring student installment templates + month waiver/pause history
-- Idempotent migration for direct SQL migration pipeline.

SET @db_name := DATABASE();

-- studentfeeinstallment.isRecurringMonthly
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'studentfeeinstallment' AND column_name = 'isRecurringMonthly'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `studentfeeinstallment` ADD COLUMN `isRecurringMonthly` BOOLEAN NOT NULL DEFAULT FALSE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- studentfeeinstallment.recurrenceEndDate
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'studentfeeinstallment' AND column_name = 'recurrenceEndDate'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `studentfeeinstallment` ADD COLUMN `recurrenceEndDate` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- studentfeeinstallment recurring lookup index
SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'studentfeeinstallment'
    AND index_name = 'sfi_tenant_student_recur_due_idx'
);
SET @sql := IF(@has_idx = 0,
  'CREATE INDEX `sfi_tenant_student_recur_due_idx` ON `studentfeeinstallment`(`tenantId`, `studentId`, `isRecurringMonthly`, `dueDate`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Create month-adjustment table if it does not exist.
CREATE TABLE IF NOT EXISTS `studentfeemonthadjustment` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `year` INT NOT NULL,
  `month` INT NOT NULL,
  `adjustmentType` ENUM('WAIVED', 'PAUSED') NOT NULL,
  `remarks` TEXT NOT NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Ensure month-adjustment indexes exist.
SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'studentfeemonthadjustment'
    AND index_name = 'sfma_tenant_student_month_uq'
);
SET @sql := IF(@has_idx = 0,
  'CREATE UNIQUE INDEX `sfma_tenant_student_month_uq` ON `studentfeemonthadjustment`(`tenantId`, `studentId`, `year`, `month`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'studentfeemonthadjustment'
    AND index_name = 'sfma_tenant_student_ct_idx'
);
SET @sql := IF(@has_idx = 0,
  'CREATE INDEX `sfma_tenant_student_ct_idx` ON `studentfeemonthadjustment`(`tenantId`, `studentId`, `createdAt`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'studentfeemonthadjustment'
    AND index_name = 'sfma_tenant_year_month_idx'
);
SET @sql := IF(@has_idx = 0,
  'CREATE INDEX `sfma_tenant_year_month_idx` ON `studentfeemonthadjustment`(`tenantId`, `year`, `month`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'studentfeemonthadjustment'
    AND index_name = 'sfma_actor_ct_idx'
);
SET @sql := IF(@has_idx = 0,
  'CREATE INDEX `sfma_actor_ct_idx` ON `studentfeemonthadjustment`(`createdByUserId`, `createdAt`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Ensure foreign keys exist (idempotent via information_schema.table_constraints).
SET @has_fk := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = @db_name
    AND table_name = 'studentfeemonthadjustment'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name = 'studentfeemonthadjustment_tenantId_fkey'
);
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `studentfeemonthadjustment` ADD CONSTRAINT `studentfeemonthadjustment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = @db_name
    AND table_name = 'studentfeemonthadjustment'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name = 'studentfeemonthadjustment_studentId_fkey'
);
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `studentfeemonthadjustment` ADD CONSTRAINT `studentfeemonthadjustment_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = @db_name
    AND table_name = 'studentfeemonthadjustment'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name = 'studentfeemonthadjustment_createdByUserId_fkey'
);
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `studentfeemonthadjustment` ADD CONSTRAINT `studentfeemonthadjustment_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `authuser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
