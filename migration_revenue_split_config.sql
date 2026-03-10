-- migration_revenue_split_config.sql
-- Idempotent, non-destructive schema delta for BusinessPartner revenue split configuration.
-- MySQL 5.7+ compatible. Safe for shared hosting manual runs.

SET @db := DATABASE();

-- centerSharePercent
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'BusinessPartner' AND column_name = 'centerSharePercent'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `BusinessPartner` ADD COLUMN `centerSharePercent` INT NOT NULL DEFAULT 0',
  'SELECT ''BusinessPartner.centerSharePercent exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- franchiseSharePercent
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'BusinessPartner' AND column_name = 'franchiseSharePercent'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `BusinessPartner` ADD COLUMN `franchiseSharePercent` INT NOT NULL DEFAULT 0',
  'SELECT ''BusinessPartner.franchiseSharePercent exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- bpSharePercent
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'BusinessPartner' AND column_name = 'bpSharePercent'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `BusinessPartner` ADD COLUMN `bpSharePercent` INT NOT NULL DEFAULT 0',
  'SELECT ''BusinessPartner.bpSharePercent exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- platformSharePercent
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'BusinessPartner' AND column_name = 'platformSharePercent'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `BusinessPartner` ADD COLUMN `platformSharePercent` INT NOT NULL DEFAULT 100',
  'SELECT ''BusinessPartner.platformSharePercent exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: if a row has all zeros, set platformSharePercent = 100
UPDATE `BusinessPartner`
SET `platformSharePercent` = 100
WHERE (`platformSharePercent` IS NULL OR `platformSharePercent` = 0)
  AND IFNULL(`centerSharePercent`,0) = 0
  AND IFNULL(`franchiseSharePercent`,0) = 0
  AND IFNULL(`bpSharePercent`,0) = 0;

SELECT 'Revenue split config migration completed.' AS status;
