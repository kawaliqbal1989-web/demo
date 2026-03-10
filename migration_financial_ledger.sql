-- migration_financial_ledger.sql
-- Idempotent, non-destructive schema delta for immutable financial ledger.
-- MySQL 5.7+ compatible. Safe for shared hosting manual runs.

SET @db := DATABASE();

CREATE TABLE IF NOT EXISTS `FinancialTransaction` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NULL,
  `studentId` VARCHAR(191) NULL,
  `centerId` VARCHAR(191) NOT NULL,
  `franchiseId` VARCHAR(191) NULL,
  `type` ENUM('ENROLLMENT','RENEWAL','COMPETITION','ADJUSTMENT') NOT NULL,
  `grossAmount` DECIMAL(10,2) NOT NULL,
  `centerShare` DECIMAL(10,2) NOT NULL,
  `franchiseShare` DECIMAL(10,2) NOT NULL,
  `bpShare` DECIMAL(10,2) NOT NULL,
  `platformShare` DECIMAL(10,2) NOT NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Indexes
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'FinancialTransaction' AND index_name = 'FinancialTransaction_tenantId_createdAt_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `FinancialTransaction_tenantId_createdAt_idx` ON `FinancialTransaction` (`tenantId`, `createdAt`)',
  'SELECT ''FinancialTransaction_tenantId_createdAt_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'FinancialTransaction' AND index_name = 'FinancialTransaction_tenantId_type_createdAt_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `FinancialTransaction_tenantId_type_createdAt_idx` ON `FinancialTransaction` (`tenantId`, `type`, `createdAt`)',
  'SELECT ''FinancialTransaction_tenantId_type_createdAt_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'FinancialTransaction' AND index_name = 'FinancialTransaction_studentId_createdAt_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `FinancialTransaction_studentId_createdAt_idx` ON `FinancialTransaction` (`studentId`, `createdAt`)',
  'SELECT ''FinancialTransaction_studentId_createdAt_idx exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Foreign keys
SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'FinancialTransaction_tenantId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `FinancialTransaction` ADD CONSTRAINT `FinancialTransaction_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''FinancialTransaction_tenantId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'FinancialTransaction_businessPartnerId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `FinancialTransaction` ADD CONSTRAINT `FinancialTransaction_businessPartnerId_fkey` FOREIGN KEY (`businessPartnerId`) REFERENCES `BusinessPartner` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''FinancialTransaction_businessPartnerId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'FinancialTransaction_studentId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `FinancialTransaction` ADD CONSTRAINT `FinancialTransaction_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''FinancialTransaction_studentId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'FinancialTransaction_centerId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `FinancialTransaction` ADD CONSTRAINT `FinancialTransaction_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `HierarchyNode` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''FinancialTransaction_centerId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'FinancialTransaction_franchiseId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `FinancialTransaction` ADD CONSTRAINT `FinancialTransaction_franchiseId_fkey` FOREIGN KEY (`franchiseId`) REFERENCES `HierarchyNode` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''FinancialTransaction_franchiseId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = @db AND constraint_name = 'FinancialTransaction_createdByUserId_fkey'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `FinancialTransaction` ADD CONSTRAINT `FinancialTransaction_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `AuthUser` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''FinancialTransaction_createdByUserId_fkey exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Financial ledger migration completed.' AS status;
