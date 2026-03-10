-- CreateTable
CREATE TABLE `Certificate` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `certificateNumber` VARCHAR(191) NOT NULL,
  `status` ENUM('ISSUED', 'REVOKED') NOT NULL DEFAULT 'ISSUED',
  `studentId` VARCHAR(191) NOT NULL,
  `levelId` VARCHAR(191) NOT NULL,
  `issuedByUserId` VARCHAR(191) NOT NULL,
  `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `revokedAt` DATETIME(3) NULL,
  `revokedByUserId` VARCHAR(191) NULL,
  `reason` VARCHAR(191) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Certificate_tenantId_certificateNumber_key` (`tenantId`, `certificateNumber`),
  KEY `Certificate_tenantId_status_issuedAt_idx` (`tenantId`, `status`, `issuedAt`),
  KEY `Certificate_tenantId_studentId_issuedAt_idx` (`tenantId`, `studentId`, `issuedAt`),
  KEY `Certificate_tenantId_levelId_issuedAt_idx` (`tenantId`, `levelId`, `issuedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Certificate`
  ADD CONSTRAINT `Certificate_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Certificate_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `Certificate_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Certificate_issuedByUserId_fkey` FOREIGN KEY (`issuedByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Certificate_revokedByUserId_fkey` FOREIGN KEY (`revokedByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
