-- CreateTable
CREATE TABLE `FranchiseProfile` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NOT NULL,
  `authUserId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `displayName` VARCHAR(191) NULL,
  `status` ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `phonePrimary` VARCHAR(191) NULL,
  `emailOfficial` VARCHAR(191) NULL,
  `whatsappEnabled` BOOLEAN NOT NULL DEFAULT false,
  `inheritBranding` BOOLEAN NOT NULL DEFAULT true,
  `logoPath` VARCHAR(191) NULL,
  `logoUrl` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `FranchiseProfile_authUserId_key` (`authUserId`),
  UNIQUE KEY `FranchiseProfile_tenantId_code_key` (`tenantId`, `code`),
  KEY `FranchiseProfile_tenantId_businessPartnerId_status_isActive_idx` (`tenantId`, `businessPartnerId`, `status`, `isActive`),
  KEY `FranchiseProfile_businessPartnerId_createdAt_idx` (`businessPartnerId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FranchiseAddress` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `franchiseProfileId` VARCHAR(191) NOT NULL,
  `addressLine1` VARCHAR(191) NOT NULL,
  `addressLine2` VARCHAR(191) NULL,
  `city` VARCHAR(191) NOT NULL,
  `district` VARCHAR(191) NULL,
  `state` VARCHAR(191) NOT NULL,
  `country` VARCHAR(191) NOT NULL DEFAULT 'India',
  `pincode` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `FranchiseAddress_franchiseProfileId_key` (`franchiseProfileId`),
  KEY `FranchiseAddress_tenantId_idx` (`tenantId`),
  KEY `FranchiseAddress_city_idx` (`city`),
  KEY `FranchiseAddress_state_idx` (`state`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FranchiseProfile`
  ADD CONSTRAINT `FranchiseProfile_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FranchiseProfile_businessPartnerId_fkey` FOREIGN KEY (`businessPartnerId`) REFERENCES `BusinessPartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `FranchiseProfile_authUserId_fkey` FOREIGN KEY (`authUserId`) REFERENCES `AuthUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `FranchiseAddress`
  ADD CONSTRAINT `FranchiseAddress_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FranchiseAddress_franchiseProfileId_fkey` FOREIGN KEY (`franchiseProfileId`) REFERENCES `FranchiseProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
