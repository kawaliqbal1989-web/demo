SET @schema_name = DATABASE();

SET @has_branding_updated_at = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'businesspartner'
    AND COLUMN_NAME = 'brandingUpdatedAt'
);

SET @add_branding_updated_at = IF(
  @has_branding_updated_at = 0,
  'ALTER TABLE `businesspartner` ADD COLUMN `brandingUpdatedAt` DATETIME(3) NULL AFTER `logoUrl`',
  'SELECT 1'
);
PREPARE stmt FROM @add_branding_updated_at;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_branding_updated_by = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'businesspartner'
    AND COLUMN_NAME = 'brandingUpdatedByUserId'
);

SET @add_branding_updated_by = IF(
  @has_branding_updated_by = 0,
  'ALTER TABLE `businesspartner` ADD COLUMN `brandingUpdatedByUserId` VARCHAR(191) NULL AFTER `brandingUpdatedAt`',
  'SELECT 1'
);
PREPARE stmt FROM @add_branding_updated_by;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_branding_updated_by_index = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'businesspartner'
    AND INDEX_NAME = 'businesspartner_brandingUpdatedByUserId_idx'
);

SET @add_branding_updated_by_index = IF(
  @has_branding_updated_by_index = 0,
  'CREATE INDEX `businesspartner_brandingUpdatedByUserId_idx` ON `businesspartner`(`brandingUpdatedByUserId`)',
  'SELECT 1'
);
PREPARE stmt FROM @add_branding_updated_by_index;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_branding_updated_by_fk = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'businesspartner'
    AND CONSTRAINT_NAME = 'businesspartner_brandingUpdatedByUserId_fkey'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @add_branding_updated_by_fk = IF(
  @has_branding_updated_by_fk = 0,
  'ALTER TABLE `businesspartner` ADD CONSTRAINT `businesspartner_brandingUpdatedByUserId_fkey` FOREIGN KEY (`brandingUpdatedByUserId`) REFERENCES `authuser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @add_branding_updated_by_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
