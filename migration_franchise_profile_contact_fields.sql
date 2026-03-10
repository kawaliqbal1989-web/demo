-- migration_franchise_profile_contact_fields.sql
-- Adds persisted fields used by BP Franchise create/edit screens.
-- Idempotent, MySQL compatible.

SET @db := DATABASE();

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'FranchiseProfile'
    AND column_name = 'phoneAlternate'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `FranchiseProfile` ADD COLUMN `phoneAlternate` VARCHAR(191) NULL',
  'SELECT ''FranchiseProfile.phoneAlternate exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'FranchiseProfile'
    AND column_name = 'emailSupport'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `FranchiseProfile` ADD COLUMN `emailSupport` VARCHAR(191) NULL',
  'SELECT ''FranchiseProfile.emailSupport exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'FranchiseProfile'
    AND column_name = 'websiteUrl'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `FranchiseProfile` ADD COLUMN `websiteUrl` TEXT NULL',
  'SELECT ''FranchiseProfile.websiteUrl exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'FranchiseProfile'
    AND column_name = 'onboardingDate'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `FranchiseProfile` ADD COLUMN `onboardingDate` DATETIME(3) NULL',
  'SELECT ''FranchiseProfile.onboardingDate exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
