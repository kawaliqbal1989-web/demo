-- migration_report_export_schema_restore.sql
-- Restores report export schema objects required by the reporting operations dashboards.
-- Idempotent, MySQL compatible.

SET @db := DATABASE();

CREATE TABLE IF NOT EXISTS `reportexportschedule` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `createdByUserId` VARCHAR(191) NULL,
  `reportKey` VARCHAR(191) NOT NULL,
  `exportFormat` ENUM('PDF','XLSX') NOT NULL,
  `status` ENUM('ACTIVE','PAUSED') NOT NULL DEFAULT 'ACTIVE',
  `frequency` ENUM('DAILY') NOT NULL DEFAULT 'DAILY',
  `title` VARCHAR(191) NULL,
  `targetRole` ENUM('SUPERADMIN','BP','FRANCHISE','CENTER','TEACHER','PARENT','STUDENT') NULL,
  `targetEntityId` VARCHAR(191) NULL,
  `filters` JSON NULL,
  `executionContext` JSON NULL,
  `queueName` VARCHAR(191) NOT NULL DEFAULT 'scheduled',
  `priority` INTEGER NOT NULL DEFAULT 50,
  `runHourUtc` INTEGER NOT NULL DEFAULT 1,
  `runMinuteUtc` INTEGER NOT NULL DEFAULT 15,
  `maxRetentionHours` INTEGER NOT NULL DEFAULT 168,
  `maxAttempts` INTEGER NOT NULL DEFAULT 3,
  `retryBackoffMs` INTEGER NOT NULL DEFAULT 60000,
  `lastWindowKey` VARCHAR(191) NULL,
  `lastQueuedAt` DATETIME(3) NULL,
  `lastCompletedAt` DATETIME(3) NULL,
  `nextRunAt` DATETIME(3) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `res_t_st_nr_i`(`tenantId`, `status`, `nextRunAt`),
  INDEX `res_t_rk_st_i`(`tenantId`, `reportKey`, `status`),
  INDEX `res_t_tr_te_i`(`tenantId`, `targetRole`, `targetEntityId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ReportExportSchedule_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ReportExportSchedule_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `authuser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reportexportartifact` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `jobId` VARCHAR(191) NOT NULL,
  `reportKey` VARCHAR(191) NOT NULL,
  `exportFormat` ENUM('PDF','XLSX') NOT NULL,
  `status` ENUM('PENDING','AVAILABLE','EXPIRED','DELETED','ORPHANED') NOT NULL DEFAULT 'PENDING',
  `snapshotReferenceId` VARCHAR(191) NOT NULL,
  `fileName` VARCHAR(191) NOT NULL,
  `filePath` VARCHAR(191) NOT NULL,
  `fileHash` VARCHAR(191) NULL,
  `mimeType` VARCHAR(191) NOT NULL,
  `byteLength` INTEGER NULL,
  `rowCount` INTEGER NOT NULL DEFAULT 0,
  `tableCount` INTEGER NOT NULL DEFAULT 0,
  `retentionUntil` DATETIME(3) NULL,
  `expiresAt` DATETIME(3) NULL,
  `availableAt` DATETIME(3) NULL,
  `deletedAt` DATETIME(3) NULL,
  `deleteReason` VARCHAR(191) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `reportexportartifact_jobId_key`(`jobId`),
  INDEX `rea_t_st_ex_i`(`tenantId`, `status`, `expiresAt`),
  INDEX `rea_t_snap_i`(`tenantId`, `snapshotReferenceId`),
  INDEX `rea_t_rk_ct_i`(`tenantId`, `reportKey`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ReportExportArtifact_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ReportExportArtifact_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `reportexportjob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- add missing reportexportjob columns
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'scheduleId'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `scheduleId` VARCHAR(191) NULL AFTER `requestedByRole`',
  "SELECT 'reportexportjob.scheduleId exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'triggerSource'
);
SET @sql := IF(@exists = 0,
  "ALTER TABLE `reportexportjob` ADD COLUMN `triggerSource` ENUM('USER','RETRY','SCHEDULED') NOT NULL DEFAULT 'USER' AFTER `exportFormat`",
  "SELECT 'reportexportjob.triggerSource exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'queueName'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `queueName` VARCHAR(191) NOT NULL DEFAULT ''interactive'' AFTER `activeLockKey`',
  "SELECT 'reportexportjob.queueName exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'priority'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `priority` INTEGER NOT NULL DEFAULT 100 AFTER `queueName`',
  "SELECT 'reportexportjob.priority exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'maxAttempts'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `maxAttempts` INTEGER NOT NULL DEFAULT 3 AFTER `priority`',
  "SELECT 'reportexportjob.maxAttempts exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'retryBackoffMs'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `retryBackoffMs` INTEGER NOT NULL DEFAULT 30000 AFTER `maxAttempts`',
  "SELECT 'reportexportjob.retryBackoffMs exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'nextRetryAt'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `nextRetryAt` DATETIME(3) NULL AFTER `retryBackoffMs`',
  "SELECT 'reportexportjob.nextRetryAt exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'leaseOwner'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `leaseOwner` VARCHAR(191) NULL AFTER `nextRetryAt`',
  "SELECT 'reportexportjob.leaseOwner exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'leaseExpiresAt'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `leaseExpiresAt` DATETIME(3) NULL AFTER `leaseOwner`',
  "SELECT 'reportexportjob.leaseExpiresAt exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'lastHeartbeatAt'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `lastHeartbeatAt` DATETIME(3) NULL AFTER `leaseExpiresAt`',
  "SELECT 'reportexportjob.lastHeartbeatAt exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'scheduledWindowKey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `scheduledWindowKey` VARCHAR(191) NULL AFTER `lastHeartbeatAt`',
  "SELECT 'reportexportjob.scheduledWindowKey exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'progressPhase'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `progressPhase` VARCHAR(191) NULL AFTER `retryCount`',
  "SELECT 'reportexportjob.progressPhase exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'progressPercent'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `progressPercent` INTEGER NOT NULL DEFAULT 0 AFTER `progressPhase`',
  "SELECT 'reportexportjob.progressPercent exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'progressCompletedUnits'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `progressCompletedUnits` INTEGER NOT NULL DEFAULT 0 AFTER `progressPercent`',
  "SELECT 'reportexportjob.progressCompletedUnits exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'progressTotalUnits'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `progressTotalUnits` INTEGER NOT NULL DEFAULT 0 AFTER `progressCompletedUnits`',
  "SELECT 'reportexportjob.progressTotalUnits exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'checkpointCursor'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `checkpointCursor` JSON NULL AFTER `snapshotMetadata`',
  "SELECT 'reportexportjob.checkpointCursor exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'checkpointState'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `checkpointState` JSON NULL AFTER `checkpointCursor`',
  "SELECT 'reportexportjob.checkpointState exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'workerMetadata'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `workerMetadata` JSON NULL AFTER `checkpointState`',
  "SELECT 'reportexportjob.workerMetadata exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'retentionUntil'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `retentionUntil` DATETIME(3) NULL AFTER `auditMetadata`',
  "SELECT 'reportexportjob.retentionUntil exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'artifactExpiresAt'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `artifactExpiresAt` DATETIME(3) NULL AFTER `retentionUntil`',
  "SELECT 'reportexportjob.artifactExpiresAt exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND column_name = 'cancelledAt'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD COLUMN `cancelledAt` DATETIME(3) NULL AFTER `failedAt`',
  "SELECT 'reportexportjob.cancelledAt exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- add reportexportjob foreign key to reportexportschedule
SET @exists := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = @db
    AND table_name = 'reportexportjob'
    AND constraint_name = 'ReportExportJob_scheduleId_fkey'
    AND constraint_type = 'FOREIGN KEY'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD CONSTRAINT `ReportExportJob_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `reportexportschedule` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  "SELECT 'ReportExportJob_scheduleId_fkey exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- add missing reportexportjob indexes
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND index_name = 'rej_t_st_nr_i'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD INDEX `rej_t_st_nr_i` (`tenantId`,`status`,`nextRetryAt`)',
  "SELECT 'rej_t_st_nr_i exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND index_name = 'rej_t_st_lex_i'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD INDEX `rej_t_st_lex_i` (`tenantId`,`status`,`leaseExpiresAt`)',
  "SELECT 'rej_t_st_lex_i exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND index_name = 'rej_t_sid_qd_i'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD INDEX `rej_t_sid_qd_i` (`tenantId`,`scheduleId`,`queuedAt`)',
  "SELECT 'rej_t_sid_qd_i exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'reportexportjob' AND index_name = 'rej_t_swk_i'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `reportexportjob` ADD INDEX `rej_t_swk_i` (`tenantId`,`scheduledWindowKey`)',
  "SELECT 'rej_t_swk_i exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;