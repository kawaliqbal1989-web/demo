-- migration_drop_centerprofile_branding_fields.sql
-- Drops no-longer-needed branding/operational columns from CenterProfile.
-- Idempotent, MySQL compatible.

SET @db := DATABASE();

-- drop socialMediaLinks
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'CenterProfile'
    AND column_name = 'socialMediaLinks'
);
SET @sql := IF(@exists = 1,
  'ALTER TABLE `CenterProfile` DROP COLUMN `socialMediaLinks`',
  'SELECT ''CenterProfile.socialMediaLinks missing'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- drop operationalAreas
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'CenterProfile'
    AND column_name = 'operationalAreas'
);
SET @sql := IF(@exists = 1,
  'ALTER TABLE `CenterProfile` DROP COLUMN `operationalAreas`',
  'SELECT ''CenterProfile.operationalAreas missing'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- drop brandColors
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'CenterProfile'
    AND column_name = 'brandColors'
);
SET @sql := IF(@exists = 1,
  'ALTER TABLE `CenterProfile` DROP COLUMN `brandColors`',
  'SELECT ''CenterProfile.brandColors missing'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
