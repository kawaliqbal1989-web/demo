-- migration_competition_workflow_hardening.sql
-- Idempotent, non-destructive schema delta for hardened competition workflow.
-- MySQL 5.7+ compatible. Safe for shared hosting manual runs.

SET @db := DATABASE();

-- Competition.rejectedAt
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'Competition' AND column_name = 'rejectedAt'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `Competition` ADD COLUMN `rejectedAt` DATETIME(3) NULL',
  'SELECT ''Competition.rejectedAt exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Competition.rejectedByUserId
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'Competition' AND column_name = 'rejectedByUserId'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `Competition` ADD COLUMN `rejectedByUserId` VARCHAR(191) NULL',
  'SELECT ''Competition.rejectedByUserId exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- CompetitionStageTransition (immutable transition log)
CREATE TABLE IF NOT EXISTS `CompetitionStageTransition` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `competitionId` VARCHAR(191) NOT NULL,
  `fromStage` ENUM('CENTER_REVIEW', 'FRANCHISE_REVIEW', 'BP_REVIEW', 'SUPERADMIN_APPROVAL', 'APPROVED', 'REJECTED') NOT NULL,
  `toStage` ENUM('CENTER_REVIEW', 'FRANCHISE_REVIEW', 'BP_REVIEW', 'SUPERADMIN_APPROVAL', 'APPROVED', 'REJECTED') NOT NULL,
  `action` ENUM('FORWARD', 'REJECT') NOT NULL,
  `reason` TEXT NULL,
  `actedByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Indexes
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'CompetitionStageTransition' AND index_name = 'CompetitionStageTransition_tenant_comp_created_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `CompetitionStageTransition_tenant_comp_created_idx` ON `CompetitionStageTransition` (`tenantId`, `competitionId`, `createdAt`)',
  'SELECT ''CompetitionStageTransition_tenant_comp_created_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'CompetitionStageTransition' AND index_name = 'CompetitionStageTransition_comp_created_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `CompetitionStageTransition_comp_created_idx` ON `CompetitionStageTransition` (`competitionId`, `createdAt`)',
  'SELECT ''CompetitionStageTransition_comp_created_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'CompetitionStageTransition' AND index_name = 'CompetitionStageTransition_actedByUserId_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `CompetitionStageTransition_actedByUserId_idx` ON `CompetitionStageTransition` (`actedByUserId`)',
  'SELECT ''CompetitionStageTransition_actedByUserId_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'Competition' AND index_name = 'Competition_tenantId_rejectedAt_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `Competition_tenantId_rejectedAt_idx` ON `Competition` (`tenantId`, `rejectedAt`)',
  'SELECT ''Competition_tenantId_rejectedAt_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'Competition' AND index_name = 'Competition_rejectedByUserId_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `Competition_rejectedByUserId_idx` ON `Competition` (`rejectedByUserId`)',
  'SELECT ''Competition_rejectedByUserId_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Foreign keys
SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'Competition_rejectedByUserId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `Competition` ADD CONSTRAINT `Competition_rejectedByUserId_fkey` FOREIGN KEY (`rejectedByUserId`) REFERENCES `AuthUser` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''Competition_rejectedByUserId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'CompetitionStageTransition_tenantId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `CompetitionStageTransition` ADD CONSTRAINT `CompetitionStageTransition_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''CompetitionStageTransition_tenantId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'CompetitionStageTransition_competitionId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `CompetitionStageTransition` ADD CONSTRAINT `CompetitionStageTransition_competitionId_fkey` FOREIGN KEY (`competitionId`) REFERENCES `Competition` (`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT ''CompetitionStageTransition_competitionId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'CompetitionStageTransition_actedByUserId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `CompetitionStageTransition` ADD CONSTRAINT `CompetitionStageTransition_actedByUserId_fkey` FOREIGN KEY (`actedByUserId`) REFERENCES `AuthUser` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''CompetitionStageTransition_actedByUserId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Competition workflow hardening migration completed.' AS status;
