-- migration_centerprofile_branding_schema_restore.sql
-- Restores CenterProfile branding columns required by the current Prisma schema.
-- Idempotent, MySQL compatible.

SET @db := DATABASE();

-- add brandingMode
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'centerprofile'
    AND column_name = 'brandingMode'
);
SET @sql := IF(@exists = 0,
  "ALTER TABLE `centerprofile` ADD COLUMN `brandingMode` ENUM('INHERIT_FRANCHISE','CUSTOM_CENTER') NOT NULL DEFAULT 'INHERIT_FRANCHISE'",
  "SELECT 'centerprofile.brandingMode exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- add inheritBranding
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'centerprofile'
    AND column_name = 'inheritBranding'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `centerprofile` ADD COLUMN `inheritBranding` TINYINT(1) NOT NULL DEFAULT 1',
  "SELECT 'centerprofile.inheritBranding exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- add customLogoUrl
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'centerprofile'
    AND column_name = 'customLogoUrl'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `centerprofile` ADD COLUMN `customLogoUrl` VARCHAR(191) NULL',
  "SELECT 'centerprofile.customLogoUrl exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- add customBrandName
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'centerprofile'
    AND column_name = 'customBrandName'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `centerprofile` ADD COLUMN `customBrandName` VARCHAR(191) NULL',
  "SELECT 'centerprofile.customBrandName exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- add brandingApprovedAt
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'centerprofile'
    AND column_name = 'brandingApprovedAt'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `centerprofile` ADD COLUMN `brandingApprovedAt` DATETIME(3) NULL',
  "SELECT 'centerprofile.brandingApprovedAt exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- add brandingApprovedById
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'centerprofile'
    AND column_name = 'brandingApprovedById'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `centerprofile` ADD COLUMN `brandingApprovedById` VARCHAR(191) NULL',
  "SELECT 'centerprofile.brandingApprovedById exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- add brandingNotes
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'centerprofile'
    AND column_name = 'brandingNotes'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `centerprofile` ADD COLUMN `brandingNotes` TEXT NULL',
  "SELECT 'centerprofile.brandingNotes exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- add brandingActive
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'centerprofile'
    AND column_name = 'brandingActive'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `centerprofile` ADD COLUMN `brandingActive` TINYINT(1) NOT NULL DEFAULT 1',
  "SELECT 'centerprofile.brandingActive exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- add brandingLocked
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'centerprofile'
    AND column_name = 'brandingLocked'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `centerprofile` ADD COLUMN `brandingLocked` TINYINT(1) NOT NULL DEFAULT 0',
  "SELECT 'centerprofile.brandingLocked exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- add commercializationTier
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'centerprofile'
    AND column_name = 'commercializationTier'
);
SET @sql := IF(@exists = 0,
  "ALTER TABLE `centerprofile` ADD COLUMN `commercializationTier` ENUM('STANDARD_CENTER','MINI_CENTER','PREMIUM_CENTER') NOT NULL DEFAULT 'STANDARD_CENTER'",
  "SELECT 'centerprofile.commercializationTier exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- add brandingApprovedBy foreign key
SET @exists := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = @db
    AND table_name = 'centerprofile'
    AND constraint_name = 'CenterProfile_brandingApprovedById_fkey'
    AND constraint_type = 'FOREIGN KEY'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `centerprofile` ADD CONSTRAINT `CenterProfile_brandingApprovedById_fkey` FOREIGN KEY (`brandingApprovedById`) REFERENCES `authuser` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  "SELECT 'CenterProfile_brandingApprovedById_fkey exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- add branding lookup index
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'centerprofile'
    AND index_name = 'CenterProfile_tenantId_brandingMode_brandingActive_idx'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `centerprofile` ADD KEY `CenterProfile_tenantId_brandingMode_brandingActive_idx` (`tenantId`,`brandingMode`,`brandingActive`)',
  "SELECT 'CenterProfile_tenantId_brandingMode_brandingActive_idx exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;