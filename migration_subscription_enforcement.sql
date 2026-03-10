-- migration_subscription_enforcement.sql
-- Idempotent, non-destructive schema delta for BusinessPartner subscription enforcement.
-- MySQL 5.7+ compatible. Safe for shared hosting manual runs.

SET @db := DATABASE();

-- BusinessPartner.subscriptionStatus
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'BusinessPartner' AND column_name = 'subscriptionStatus'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `BusinessPartner` ADD COLUMN `subscriptionStatus` ENUM(\'ACTIVE\',\'SUSPENDED\',\'EXPIRED\') NOT NULL DEFAULT \'ACTIVE\'',
  'SELECT ''BusinessPartner.subscriptionStatus exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- BusinessPartner.subscriptionExpiresAt
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'BusinessPartner' AND column_name = 'subscriptionExpiresAt'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `BusinessPartner` ADD COLUMN `subscriptionExpiresAt` DATETIME(3) NULL',
  'SELECT ''BusinessPartner.subscriptionExpiresAt exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- BusinessPartner.gracePeriodUntil
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'BusinessPartner' AND column_name = 'gracePeriodUntil'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `BusinessPartner` ADD COLUMN `gracePeriodUntil` DATETIME(3) NULL',
  'SELECT ''BusinessPartner.gracePeriodUntil exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Index: (tenantId, subscriptionStatus, subscriptionExpiresAt)
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'BusinessPartner' AND index_name = 'BusinessPartner_tenantId_subscriptionStatus_subscriptionExpiresAt_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `BusinessPartner_tenantId_subscriptionStatus_subscriptionExpiresAt_idx` ON `BusinessPartner` (`tenantId`, `subscriptionStatus`, `subscriptionExpiresAt`)',
  'SELECT ''BusinessPartner_tenantId_subscriptionStatus_subscriptionExpiresAt_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Subscription enforcement migration completed.' AS status;
