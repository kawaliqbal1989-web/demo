-- Payment Receipt Engine
-- Adds immutable receipt, allocation, refund, and receipt audit infrastructure.
-- Idempotent for direct SQL migration runner.

SET @db_name := DATABASE();

-- Expand payment mode enum on financialtransaction to support enterprise payment rails.
SET @has_mode := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db_name
    AND table_name = 'financialtransaction'
    AND column_name = 'paymentMode'
    AND column_type LIKE '%ONLINE_GATEWAY%'
);
SET @sql := IF(@has_mode = 0,
  'ALTER TABLE `financialtransaction` MODIFY COLUMN `paymentMode` ENUM(''CASH'',''UPI'',''BANK_TRANSFER'',''CARD'',''CHEQUE'',''ONLINE_GATEWAY'',''ONLINE'',''GPAY'',''PAYTM'') NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `receiptsequence` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `centerId` VARCHAR(191) NOT NULL,
  `financialYear` INT NOT NULL,
  `prefix` VARCHAR(64) NOT NULL,
  `lastNumber` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `receiptsequence_scope_uq` (`tenantId`, `centerId`, `financialYear`, `prefix`),
  KEY `receiptsequence_scope_idx` (`tenantId`, `centerId`, `financialYear`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `paymentreceipt` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `centerId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `receiptNumber` VARCHAR(191) NOT NULL,
  `financialYear` INT NOT NULL,
  `sequenceNumber` INT NOT NULL,
  `prefix` VARCHAR(64) NOT NULL,
  `status` ENUM('ACTIVE', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  `paymentMode` ENUM('CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'ONLINE_GATEWAY', 'ONLINE', 'GPAY', 'PAYTM') NOT NULL,
  `totalAmount` DECIMAL(10,2) NOT NULL,
  `allocatedAmount` DECIMAL(10,2) NOT NULL,
  `unallocatedAmount` DECIMAL(10,2) NOT NULL,
  `referenceNumber` VARCHAR(191) NULL,
  `transactionId` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `collectedAt` DATETIME(3) NOT NULL,
  `collectedByUserId` VARCHAR(191) NOT NULL,
  `cancelledAt` DATETIME(3) NULL,
  `cancelledByUserId` VARCHAR(191) NULL,
  `cancelReason` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `paymentreceipt_tenant_receipt_uq` (`tenantId`, `receiptNumber`),
  KEY `paymentreceipt_tenant_center_ct_idx` (`tenantId`, `centerId`, `createdAt`),
  KEY `paymentreceipt_tenant_student_ct_idx` (`tenantId`, `studentId`, `createdAt`),
  KEY `paymentreceipt_tenant_status_ct_idx` (`tenantId`, `status`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `paymenttransaction` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `receiptId` VARCHAR(191) NOT NULL,
  `financialTransactionId` VARCHAR(191) NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `centerId` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `paymentMode` ENUM('CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'ONLINE_GATEWAY', 'ONLINE', 'GPAY', 'PAYTM') NOT NULL,
  `referenceNumber` VARCHAR(191) NULL,
  `transactionId` VARCHAR(191) NULL,
  `collectedAt` DATETIME(3) NOT NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `paymenttransaction_financial_uq` (`financialTransactionId`),
  KEY `paymenttransaction_tenant_center_ct_idx` (`tenantId`, `centerId`, `createdAt`),
  KEY `paymenttransaction_tenant_student_ct_idx` (`tenantId`, `studentId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `receiptallocation` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `receiptId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `allocationType` ENUM('DUE', 'OVERPAYMENT', 'REVERSAL') NOT NULL DEFAULT 'DUE',
  `sourceInstallmentId` VARCHAR(191) NULL,
  `dueDate` DATETIME(3) NULL,
  `dueYear` INT NULL,
  `dueMonth` INT NULL,
  `dueStatusBefore` VARCHAR(64) NULL,
  `duePendingBefore` DECIMAL(10,2) NULL,
  `allocatedAmount` DECIMAL(10,2) NOT NULL,
  `duePendingAfter` DECIMAL(10,2) NULL,
  `reversalOfAllocationId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `receiptallocation_receipt_ct_idx` (`tenantId`, `receiptId`, `createdAt`),
  KEY `receiptallocation_student_ct_idx` (`tenantId`, `studentId`, `createdAt`),
  KEY `receiptallocation_installment_idx` (`sourceInstallmentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `refundtransaction` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `receiptId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `centerId` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `paymentMode` ENUM('CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'ONLINE_GATEWAY', 'ONLINE', 'GPAY', 'PAYTM') NOT NULL,
  `referenceNumber` VARCHAR(191) NULL,
  `transactionId` VARCHAR(191) NULL,
  `reason` TEXT NOT NULL,
  `processedAt` DATETIME(3) NOT NULL,
  `processedByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `refundtransaction_center_pt_idx` (`tenantId`, `centerId`, `processedAt`),
  KEY `refundtransaction_student_pt_idx` (`tenantId`, `studentId`, `processedAt`),
  KEY `refundtransaction_receipt_pt_idx` (`tenantId`, `receiptId`, `processedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `receiptauditlog` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `receiptId` VARCHAR(191) NOT NULL,
  `actorUserId` VARCHAR(191) NULL,
  `action` ENUM('CREATED', 'ALLOCATED', 'REFUNDED', 'CANCELLED', 'PDF_RENDERED') NOT NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `receiptauditlog_receipt_ct_idx` (`tenantId`, `receiptId`, `createdAt`),
  KEY `receiptauditlog_actor_ct_idx` (`actorUserId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Foreign keys for receiptsequence
SET @has_fk := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = @db_name AND table_name = 'receiptsequence' AND constraint_name = 'receiptsequence_tenantId_fkey'
);
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `receiptsequence` ADD CONSTRAINT `receiptsequence_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = @db_name AND table_name = 'receiptsequence' AND constraint_name = 'receiptsequence_centerId_fkey'
);
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `receiptsequence` ADD CONSTRAINT `receiptsequence_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `hierarchynode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Foreign keys for paymentreceipt
SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'paymentreceipt' AND constraint_name = 'paymentreceipt_tenantId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `paymentreceipt` ADD CONSTRAINT `paymentreceipt_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'paymentreceipt' AND constraint_name = 'paymentreceipt_centerId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `paymentreceipt` ADD CONSTRAINT `paymentreceipt_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `hierarchynode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'paymentreceipt' AND constraint_name = 'paymentreceipt_studentId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `paymentreceipt` ADD CONSTRAINT `paymentreceipt_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'paymentreceipt' AND constraint_name = 'paymentreceipt_collectedByUserId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `paymentreceipt` ADD CONSTRAINT `paymentreceipt_collectedByUserId_fkey` FOREIGN KEY (`collectedByUserId`) REFERENCES `authuser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'paymentreceipt' AND constraint_name = 'paymentreceipt_cancelledByUserId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `paymentreceipt` ADD CONSTRAINT `paymentreceipt_cancelledByUserId_fkey` FOREIGN KEY (`cancelledByUserId`) REFERENCES `authuser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Foreign keys for paymenttransaction
SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'paymenttransaction' AND constraint_name = 'paymenttransaction_tenantId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `paymenttransaction` ADD CONSTRAINT `paymenttransaction_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'paymenttransaction' AND constraint_name = 'paymenttransaction_receiptId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `paymenttransaction` ADD CONSTRAINT `paymenttransaction_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `paymentreceipt`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'paymenttransaction' AND constraint_name = 'paymenttransaction_studentId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `paymenttransaction` ADD CONSTRAINT `paymenttransaction_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'paymenttransaction' AND constraint_name = 'paymenttransaction_centerId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `paymenttransaction` ADD CONSTRAINT `paymenttransaction_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `hierarchynode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'paymenttransaction' AND constraint_name = 'paymenttransaction_createdByUserId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `paymenttransaction` ADD CONSTRAINT `paymenttransaction_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `authuser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'paymenttransaction' AND constraint_name = 'paymenttransaction_financialTransactionId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `paymenttransaction` ADD CONSTRAINT `paymenttransaction_financialTransactionId_fkey` FOREIGN KEY (`financialTransactionId`) REFERENCES `financialtransaction`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Foreign keys for receiptallocation
SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'receiptallocation' AND constraint_name = 'receiptallocation_tenantId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `receiptallocation` ADD CONSTRAINT `receiptallocation_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'receiptallocation' AND constraint_name = 'receiptallocation_receiptId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `receiptallocation` ADD CONSTRAINT `receiptallocation_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `paymentreceipt`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'receiptallocation' AND constraint_name = 'receiptallocation_studentId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `receiptallocation` ADD CONSTRAINT `receiptallocation_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'receiptallocation' AND constraint_name = 'receiptallocation_sourceInstallmentId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `receiptallocation` ADD CONSTRAINT `receiptallocation_sourceInstallmentId_fkey` FOREIGN KEY (`sourceInstallmentId`) REFERENCES `studentfeeinstallment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'receiptallocation' AND constraint_name = 'receiptallocation_reversalOfAllocationId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `receiptallocation` ADD CONSTRAINT `receiptallocation_reversalOfAllocationId_fkey` FOREIGN KEY (`reversalOfAllocationId`) REFERENCES `receiptallocation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Foreign keys for refundtransaction
SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'refundtransaction' AND constraint_name = 'refundtransaction_tenantId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `refundtransaction` ADD CONSTRAINT `refundtransaction_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'refundtransaction' AND constraint_name = 'refundtransaction_receiptId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `refundtransaction` ADD CONSTRAINT `refundtransaction_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `paymentreceipt`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'refundtransaction' AND constraint_name = 'refundtransaction_studentId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `refundtransaction` ADD CONSTRAINT `refundtransaction_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'refundtransaction' AND constraint_name = 'refundtransaction_centerId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `refundtransaction` ADD CONSTRAINT `refundtransaction_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `hierarchynode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'refundtransaction' AND constraint_name = 'refundtransaction_processedByUserId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `refundtransaction` ADD CONSTRAINT `refundtransaction_processedByUserId_fkey` FOREIGN KEY (`processedByUserId`) REFERENCES `authuser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Foreign keys for receiptauditlog
SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'receiptauditlog' AND constraint_name = 'receiptauditlog_tenantId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `receiptauditlog` ADD CONSTRAINT `receiptauditlog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'receiptauditlog' AND constraint_name = 'receiptauditlog_receiptId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `receiptauditlog` ADD CONSTRAINT `receiptauditlog_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `paymentreceipt`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = @db_name AND table_name = 'receiptauditlog' AND constraint_name = 'receiptauditlog_actorUserId_fkey');
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE `receiptauditlog` ADD CONSTRAINT `receiptauditlog_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `authuser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
