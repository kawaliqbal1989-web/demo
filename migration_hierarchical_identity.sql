-- migration_hierarchical_identity.sql
-- Idempotent, non-destructive schema delta for hierarchical identity system.
-- MySQL 5.7+ compatible.

SET @db := DATABASE();

-- AuthUser.username (server-generated immutable identifier)
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'AuthUser' AND column_name = 'username'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `AuthUser` ADD COLUMN `username` VARCHAR(191) NULL',
  'SELECT ''AuthUser.username exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- AuthUser.parentUserId
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'AuthUser' AND column_name = 'parentUserId'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `AuthUser` ADD COLUMN `parentUserId` VARCHAR(191) NULL',
  'SELECT ''AuthUser.parentUserId exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- AuthUser.failedAttempts
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'AuthUser' AND column_name = 'failedAttempts'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `AuthUser` ADD COLUMN `failedAttempts` INT NOT NULL DEFAULT 0',
  'SELECT ''AuthUser.failedAttempts exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- AuthUser.lockUntil
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'AuthUser' AND column_name = 'lockUntil'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `AuthUser` ADD COLUMN `lockUntil` DATETIME(3) NULL',
  'SELECT ''AuthUser.lockUntil exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- AuthUser.mustChangePassword
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'AuthUser' AND column_name = 'mustChangePassword'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `AuthUser` ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT FALSE',
  'SELECT ''AuthUser.mustChangePassword exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- UserSequence table for race-safe role counters per tenant
CREATE TABLE IF NOT EXISTS `UserSequence` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `role` ENUM('SUPERADMIN', 'BP', 'FRANCHISE', 'CENTER', 'TEACHER', 'STUDENT') NOT NULL,
  `nextValue` INT NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill username for existing rows if null/empty (best-effort deterministic by role)
-- NOTE: this keeps migration non-destructive and allows later NOT NULL + unique constraints.
SET @rownum_sa := 0;
UPDATE `AuthUser`
SET `username` = CONCAT('SA', LPAD((@rownum_sa := @rownum_sa + 1), 3, '0'))
WHERE (`username` IS NULL OR `username` = '') AND `role` = 'SUPERADMIN';

SET @rownum_bp := 0;
UPDATE `AuthUser`
SET `username` = CONCAT('BP', LPAD((@rownum_bp := @rownum_bp + 1), 3, '0'))
WHERE (`username` IS NULL OR `username` = '') AND `role` = 'BP';

SET @rownum_fr := 0;
UPDATE `AuthUser`
SET `username` = CONCAT('FR', LPAD((@rownum_fr := @rownum_fr + 1), 3, '0'))
WHERE (`username` IS NULL OR `username` = '') AND `role` = 'FRANCHISE';

SET @rownum_ce := 0;
UPDATE `AuthUser`
SET `username` = CONCAT('CE', LPAD((@rownum_ce := @rownum_ce + 1), 3, '0'))
WHERE (`username` IS NULL OR `username` = '') AND `role` = 'CENTER';

SET @rownum_te := 0;
UPDATE `AuthUser`
SET `username` = CONCAT('TE', LPAD((@rownum_te := @rownum_te + 1), 3, '0'))
WHERE (`username` IS NULL OR `username` = '') AND `role` = 'TEACHER';

SET @rownum_st := 0;
UPDATE `AuthUser`
SET `username` = CONCAT('ST', LPAD((@rownum_st := @rownum_st + 1), 4, '0'))
WHERE (`username` IS NULL OR `username` = '') AND `role` = 'STUDENT';

-- Enforce NOT NULL for username after backfill
SET @nullable := (
  SELECT IS_NULLABLE
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'AuthUser' AND column_name = 'username'
  LIMIT 1
);
SET @sql := IF(@nullable = 'YES',
  'ALTER TABLE `AuthUser` MODIFY COLUMN `username` VARCHAR(191) NOT NULL',
  'SELECT ''AuthUser.username already NOT NULL'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Indexes
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'AuthUser' AND index_name = 'AuthUser_username_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `AuthUser_username_idx` ON `AuthUser` (`username`)',
  'SELECT ''AuthUser_username_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'AuthUser' AND index_name = 'AuthUser_tenantId_role_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `AuthUser_tenantId_role_idx` ON `AuthUser` (`tenantId`, `role`)',
  'SELECT ''AuthUser_tenantId_role_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'AuthUser' AND index_name = 'AuthUser_parentUserId_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `AuthUser_parentUserId_idx` ON `AuthUser` (`parentUserId`)',
  'SELECT ''AuthUser_parentUserId_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Composite unique username per tenant
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'AuthUser' AND index_name = 'AuthUser_tenantId_username_key'
);
SET @sql := IF(@exists = 0,
  'CREATE UNIQUE INDEX `AuthUser_tenantId_username_key` ON `AuthUser` (`tenantId`, `username`)',
  'SELECT ''AuthUser_tenantId_username_key exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- UserSequence indexes
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'UserSequence' AND index_name = 'UserSequence_tenantId_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `UserSequence_tenantId_idx` ON `UserSequence` (`tenantId`)',
  'SELECT ''UserSequence_tenantId_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'UserSequence' AND index_name = 'UserSequence_tenantId_role_key'
);
SET @sql := IF(@exists = 0,
  'CREATE UNIQUE INDEX `UserSequence_tenantId_role_key` ON `UserSequence` (`tenantId`, `role`)',
  'SELECT ''UserSequence_tenantId_role_key exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Foreign keys
SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'AuthUser_parentUserId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `AuthUser` ADD CONSTRAINT `AuthUser_parentUserId_fkey` FOREIGN KEY (`parentUserId`) REFERENCES `AuthUser` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''AuthUser_parentUserId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'UserSequence_tenantId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `UserSequence` ADD CONSTRAINT `UserSequence_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT ''UserSequence_tenantId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Hierarchical identity migration completed.' AS status;
