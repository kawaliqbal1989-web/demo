CREATE TABLE `businesspartnerfranchise` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NOT NULL,
  `franchiseId` VARCHAR(191) NOT NULL,
  `ownershipType` ENUM('PRIMARY','SHARED','ADVISORY','TEMPORARY') NOT NULL DEFAULT 'PRIMARY',
  `status` ENUM('ACTIVE','INACTIVE','SUSPENDED','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  `activeFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `activeTo` DATETIME(3) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `businesspartnerfranchise_businessPartnerId_franchiseId_key` (`businessPartnerId`, `franchiseId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `businesspartnercenterscope` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NOT NULL,
  `centerId` VARCHAR(191) NOT NULL,
  `scopeType` ENUM('DIRECT','INHERITED','OVERRIDE') NOT NULL DEFAULT 'DIRECT',
  `status` ENUM('ACTIVE','INACTIVE','SUSPENDED','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  `activeFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `activeTo` DATETIME(3) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `businesspartnercenterscope_businessPartnerId_centerId_key` (`businessPartnerId`, `centerId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `analyticsdailysnapshot` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NOT NULL,
  `snapshotDate` DATETIME(3) NOT NULL,
  `totalStudents` INT NOT NULL DEFAULT 0,
  `activeStudents` INT NOT NULL DEFAULT 0,
  `totalFranchises` INT NOT NULL DEFAULT 0,
  `activeCenters` INT NOT NULL DEFAULT 0,
  `monthlyCollections` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `pendingFees` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `newAdmissions` INT NOT NULL DEFAULT 0,
  `attendancePercent` DECIMAL(8,2) NOT NULL DEFAULT 0,
  `studentGrowthPercent` DECIMAL(8,2) NOT NULL DEFAULT 0,
  `healthScore` DECIMAL(8,2) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `analyticsdailysnapshot_businessPartnerId_snapshotDate_key` (`businessPartnerId`, `snapshotDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `franchiseanalyticssnapshot` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NOT NULL,
  `franchiseId` VARCHAR(191) NOT NULL,
  `snapshotDate` DATETIME(3) NOT NULL,
  `studentCount` INT NOT NULL DEFAULT 0,
  `activeStudents` INT NOT NULL DEFAULT 0,
  `centerCount` INT NOT NULL DEFAULT 0,
  `teacherCount` INT NOT NULL DEFAULT 0,
  `monthlyCollections` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `pendingFees` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `attendancePercent` DECIMAL(8,2) NOT NULL DEFAULT 0,
  `studentGrowthPercent` DECIMAL(8,2) NOT NULL DEFAULT 0,
  `healthScore` DECIMAL(8,2) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `franchiseanalyticssnapshot_franchiseId_snapshotDate_key` (`franchiseId`, `snapshotDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `centeranalyticssnapshot` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NOT NULL,
  `franchiseId` VARCHAR(191) NOT NULL,
  `centerId` VARCHAR(191) NOT NULL,
  `snapshotDate` DATETIME(3) NOT NULL,
  `activeStudents` INT NOT NULL DEFAULT 0,
  `attendancePercent` DECIMAL(8,2) NOT NULL DEFAULT 0,
  `monthlyRevenue` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `pendingFees` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `teacherCount` INT NOT NULL DEFAULT 0,
  `studentGrowthPercent` DECIMAL(8,2) NOT NULL DEFAULT 0,
  `retentionPercent` DECIMAL(8,2) NOT NULL DEFAULT 0,
  `healthScore` DECIMAL(8,2) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `centeranalyticssnapshot_centerId_snapshotDate_key` (`centerId`, `snapshotDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `businesspartnerfranchise`
  ADD CONSTRAINT `businesspartnerfranchise_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `businesspartnerfranchise_businessPartnerId_fkey`
    FOREIGN KEY (`businessPartnerId`) REFERENCES `businesspartner`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `businesspartnerfranchise_franchiseId_fkey`
    FOREIGN KEY (`franchiseId`) REFERENCES `franchiseprofile`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `businesspartnercenterscope`
  ADD CONSTRAINT `businesspartnercenterscope_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `businesspartnercenterscope_businessPartnerId_fkey`
    FOREIGN KEY (`businessPartnerId`) REFERENCES `businesspartner`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `businesspartnercenterscope_centerId_fkey`
    FOREIGN KEY (`centerId`) REFERENCES `centerprofile`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `analyticsdailysnapshot`
  ADD CONSTRAINT `analyticsdailysnapshot_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `analyticsdailysnapshot_businessPartnerId_fkey`
    FOREIGN KEY (`businessPartnerId`) REFERENCES `businesspartner`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `franchiseanalyticssnapshot`
  ADD CONSTRAINT `franchiseanalyticssnapshot_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `franchiseanalyticssnapshot_businessPartnerId_fkey`
    FOREIGN KEY (`businessPartnerId`) REFERENCES `businesspartner`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `franchiseanalyticssnapshot_franchiseId_fkey`
    FOREIGN KEY (`franchiseId`) REFERENCES `franchiseprofile`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `centeranalyticssnapshot`
  ADD CONSTRAINT `centeranalyticssnapshot_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `centeranalyticssnapshot_businessPartnerId_fkey`
    FOREIGN KEY (`businessPartnerId`) REFERENCES `businesspartner`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `centeranalyticssnapshot_franchiseId_fkey`
    FOREIGN KEY (`franchiseId`) REFERENCES `franchiseprofile`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `centeranalyticssnapshot_centerId_fkey`
    FOREIGN KEY (`centerId`) REFERENCES `centerprofile`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX `businesspartnerfranchise_tenantId_businessPartnerId_status_idx`
  ON `businesspartnerfranchise` (`tenantId`, `businessPartnerId`, `status`);

CREATE INDEX `businesspartnerfranchise_tenantId_franchiseId_status_idx`
  ON `businesspartnerfranchise` (`tenantId`, `franchiseId`, `status`);

CREATE INDEX `bpf_tenant_bp_active_window_idx`
  ON `businesspartnerfranchise` (`tenantId`, `businessPartnerId`, `activeFrom`, `activeTo`);

CREATE INDEX `businesspartnercenterscope_tenantId_businessPartnerId_status_idx`
  ON `businesspartnercenterscope` (`tenantId`, `businessPartnerId`, `status`);

CREATE INDEX `businesspartnercenterscope_tenantId_centerId_status_idx`
  ON `businesspartnercenterscope` (`tenantId`, `centerId`, `status`);

CREATE INDEX `bpcs_tenant_bp_active_window_idx`
  ON `businesspartnercenterscope` (`tenantId`, `businessPartnerId`, `activeFrom`, `activeTo`);

CREATE INDEX `ads_tenant_bp_date_idx`
  ON `analyticsdailysnapshot` (`tenantId`, `businessPartnerId`, `snapshotDate`);

CREATE INDEX `ads_tenant_date_idx`
  ON `analyticsdailysnapshot` (`tenantId`, `snapshotDate`);

CREATE INDEX `ads_tenant_bp_health_idx`
  ON `analyticsdailysnapshot` (`tenantId`, `businessPartnerId`, `snapshotDate`, `healthScore`);

CREATE INDEX `fas_tenant_bp_date_idx`
  ON `franchiseanalyticssnapshot` (`tenantId`, `businessPartnerId`, `snapshotDate`);

CREATE INDEX `fas_tenant_fr_date_idx`
  ON `franchiseanalyticssnapshot` (`tenantId`, `franchiseId`, `snapshotDate`);

CREATE INDEX `fas_tenant_bp_health_idx`
  ON `franchiseanalyticssnapshot` (`tenantId`, `businessPartnerId`, `snapshotDate`, `healthScore`);

CREATE INDEX `cas_tenant_bp_date_idx`
  ON `centeranalyticssnapshot` (`tenantId`, `businessPartnerId`, `snapshotDate`);

CREATE INDEX `cas_tenant_fr_date_idx`
  ON `centeranalyticssnapshot` (`tenantId`, `franchiseId`, `snapshotDate`);

CREATE INDEX `cas_tenant_center_date_idx`
  ON `centeranalyticssnapshot` (`tenantId`, `centerId`, `snapshotDate`);

CREATE INDEX `cas_tenant_bp_health_idx`
  ON `centeranalyticssnapshot` (`tenantId`, `businessPartnerId`, `snapshotDate`, `healthScore`);

INSERT INTO `businesspartnerfranchise` (
  `id`,
  `tenantId`,
  `businessPartnerId`,
  `franchiseId`,
  `ownershipType`,
  `status`,
  `activeFrom`,
  `activeTo`,
  `notes`,
  `createdAt`,
  `updatedAt`
)
SELECT
  REPLACE(UUID(), '-', ''),
  `fp`.`tenantId`,
  `fp`.`businessPartnerId`,
  `fp`.`id`,
  'PRIMARY',
  CASE
    WHEN `fp`.`status` = 'ARCHIVED' THEN 'INACTIVE'
    ELSE 'ACTIVE'
  END,
  COALESCE(`fp`.`onboardingDate`, `fp`.`createdAt`, CURRENT_TIMESTAMP(3)),
  NULL,
  'Backfilled from franchiseprofile.businessPartnerId',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `franchiseprofile` `fp`
WHERE `fp`.`businessPartnerId` IS NOT NULL
ON DUPLICATE KEY UPDATE
  `tenantId` = VALUES(`tenantId`),
  `ownershipType` = VALUES(`ownershipType`),
  `status` = VALUES(`status`),
  `activeFrom` = IF(`businesspartnerfranchise`.`activeFrom` IS NULL, VALUES(`activeFrom`), `businesspartnerfranchise`.`activeFrom`),
  `updatedAt` = CURRENT_TIMESTAMP(3);