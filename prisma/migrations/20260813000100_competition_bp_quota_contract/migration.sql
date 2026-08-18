-- Phase 3E-A: Competition + Business Partner participation-ID quota contract.
-- This migration is additive. It does not change the active workflow by itself.

ALTER TABLE `competitionenrollmentlist`
  MODIFY COLUMN `status` ENUM(
    'DRAFT',
    'SUBMITTED_TO_CENTER',
    'SUBMITTED_TO_FRANCHISE',
    'SUBMITTED_TO_BUSINESS_PARTNER',
    'SUBMITTED_TO_SUPERADMIN',
    'WAITING_FOR_QUOTA',
    'APPROVED',
    'REJECTED'
  ) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN `approvalMode` ENUM('AUTO_QUOTA','SUPERADMIN_OVERRIDE') NULL,
  ADD COLUMN `quotaEvaluatedAt` DATETIME(3) NULL,
  ADD COLUMN `waitingReason` VARCHAR(512) NULL;

CREATE TABLE `competitionbusinesspartnerquota` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `competitionId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NOT NULL,
  `quotaLimit` INTEGER NOT NULL DEFAULT 0,
  `lastChangeReason` VARCHAR(512) NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `updatedByUserId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `compquota_t_comp_bp_uq` (`tenantId`, `competitionId`, `businessPartnerId`),
  INDEX `compquota_t_comp_i` (`tenantId`, `competitionId`),
  INDEX `compquota_t_bp_i` (`tenantId`, `businessPartnerId`),
  INDEX `compquota_created_by_i` (`createdByUserId`),
  INDEX `compquota_updated_by_i` (`updatedByUserId`),

  CONSTRAINT `compquota_tenant_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `compquota_competition_fkey`
    FOREIGN KEY (`competitionId`) REFERENCES `competition`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `compquota_bp_fkey`
    FOREIGN KEY (`businessPartnerId`) REFERENCES `businesspartner`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `compquota_created_by_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `authuser`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `compquota_updated_by_fkey`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `authuser`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `competitionquotaallocation` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `quotaId` VARCHAR(191) NOT NULL,
  `competitionId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NOT NULL,
  `enrollmentListId` VARCHAR(191) NOT NULL,
  `submittedByUserId` VARCHAR(191) NOT NULL,
  `requestedIds` INTEGER NOT NULL,
  `approvedIds` INTEGER NOT NULL DEFAULT 0,
  `quotaLimitSnapshot` INTEGER NOT NULL DEFAULT 0,
  `usedIdsBefore` INTEGER NOT NULL DEFAULT 0,
  `usedIdsAfter` INTEGER NOT NULL DEFAULT 0,
  `status` ENUM('WAITING_FOR_QUOTA','APPROVED','RELEASED','VALIDATION_FAILED') NOT NULL DEFAULT 'WAITING_FOR_QUOTA',
  `approvalMode` ENUM('AUTO_QUOTA','SUPERADMIN_OVERRIDE') NULL,
  `requestHash` VARCHAR(191) NULL,
  `waitingReason` VARCHAR(512) NULL,
  `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `evaluatedAt` DATETIME(3) NULL,
  `approvedAt` DATETIME(3) NULL,
  `releasedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `compqalloc_list_uq` (`enrollmentListId`),
  INDEX `compqalloc_quota_status_i` (`quotaId`, `status`, `submittedAt`),
  INDEX `compqalloc_t_comp_bp_st_i` (`tenantId`, `competitionId`, `businessPartnerId`, `status`, `submittedAt`),
  INDEX `compqalloc_submitted_by_i` (`submittedByUserId`),

  CONSTRAINT `compqalloc_tenant_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `compqalloc_quota_fkey`
    FOREIGN KEY (`quotaId`) REFERENCES `competitionbusinesspartnerquota`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `compqalloc_competition_fkey`
    FOREIGN KEY (`competitionId`) REFERENCES `competition`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `compqalloc_bp_fkey`
    FOREIGN KEY (`businessPartnerId`) REFERENCES `businesspartner`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `compqalloc_list_fkey`
    FOREIGN KEY (`enrollmentListId`) REFERENCES `competitionenrollmentlist`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `compqalloc_submitted_by_fkey`
    FOREIGN KEY (`submittedByUserId`) REFERENCES `authuser`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `competitionquotachange` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `quotaId` VARCHAR(191) NOT NULL,
  `competitionId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NOT NULL,
  `previousLimit` INTEGER NOT NULL,
  `newLimit` INTEGER NOT NULL,
  `reason` VARCHAR(512) NOT NULL,
  `changedByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `compqchange_quota_created_i` (`quotaId`, `createdAt`),
  INDEX `compqchange_t_comp_bp_created_i` (`tenantId`, `competitionId`, `businessPartnerId`, `createdAt`),
  INDEX `compqchange_actor_i` (`changedByUserId`),

  CONSTRAINT `compqchange_tenant_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `compqchange_quota_fkey`
    FOREIGN KEY (`quotaId`) REFERENCES `competitionbusinesspartnerquota`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `compqchange_competition_fkey`
    FOREIGN KEY (`competitionId`) REFERENCES `competition`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `compqchange_bp_fkey`
    FOREIGN KEY (`businessPartnerId`) REFERENCES `businesspartner`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `compqchange_actor_fkey`
    FOREIGN KEY (`changedByUserId`) REFERENCES `authuser`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
