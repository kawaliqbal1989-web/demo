-- Phase 3 Step 1: Operational Notification Schema Foundation
-- Additive-only migration for operational notification storage, targeting, and rule state tracking.

CREATE TABLE `operationalnotification` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NOT NULL,
  `franchiseId` VARCHAR(191) NULL,
  `centerId` VARCHAR(191) NULL,
  `type` ENUM(
    'LOW_ATTENDANCE',
    'CRITICAL_ATTENDANCE',
    'REVENUE_DROP',
    'LOW_COLLECTIONS',
    'NO_ADMISSIONS',
    'WEAK_GROWTH',
    'UNHEALTHY_CENTER',
    'PENDING_SETTLEMENT',
    'SNAPSHOT_FAILURE',
    'SCHEDULER_FAILURE'
  ) NOT NULL,
  `category` ENUM('WORKFLOW', 'RISK', 'FINANCE', 'ACADEMIC', 'OPERATIONS', 'SYSTEM') NOT NULL DEFAULT 'OPERATIONS',
  `severity` ENUM('CRITICAL', 'HIGH', 'WARNING', 'INFO') NOT NULL,
  `status` ENUM('ACTIVE', 'RESOLVED', 'SUPPRESSED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  `title` VARCHAR(191) NOT NULL,
  `message` TEXT NOT NULL,
  `metricKey` VARCHAR(191) NULL,
  `thresholdValue` DOUBLE NULL,
  `observedValue` DOUBLE NULL,
  `deltaPercent` DOUBLE NULL,
  `sourceKind` ENUM('SNAPSHOT', 'LIVE_FALLBACK', 'SCHEDULER', 'SYSTEM') NOT NULL,
  `sourceSnapshotDate` DATETIME(3) NULL,
  `sourceWindowKey` VARCHAR(191) NULL,
  `fingerprint` VARCHAR(191) NOT NULL,
  `activeFingerprint` VARCHAR(191) NULL,
  `cooldownUntil` DATETIME(3) NULL,
  `firstTriggeredAt` DATETIME(3) NOT NULL,
  `lastTriggeredAt` DATETIME(3) NOT NULL,
  `resolvedAt` DATETIME(3) NULL,
  `expiresAt` DATETIME(3) NULL,
  `occurrenceCount` INTEGER NOT NULL DEFAULT 1,
  `deepLinkPath` VARCHAR(191) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `opn_t_actfp_uq`(`tenantId`, `activeFingerprint`),
  INDEX `opn_t_bp_stsev_i`(`tenantId`, `businessPartnerId`, `status`, `severity`),
  INDEX `opn_t_fr_st_i`(`tenantId`, `franchiseId`, `status`),
  INDEX `opn_t_ct_st_i`(`tenantId`, `centerId`, `status`),
  INDEX `opn_t_cool_i`(`tenantId`, `cooldownUntil`),
  INDEX `opn_t_st_last_i`(`tenantId`, `status`, `lastTriggeredAt`),
  INDEX `opn_t_bp_fp_i`(`tenantId`, `businessPartnerId`, `fingerprint`),
  INDEX `opn_t_srcsnap_i`(`tenantId`, `sourceKind`, `sourceSnapshotDate`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `operationalnotificationtarget` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `notificationId` VARCHAR(191) NOT NULL,
  `recipientUserId` VARCHAR(191) NOT NULL,
  `recipientRole` ENUM('SUPERADMIN', 'BP', 'FRANCHISE', 'CENTER', 'TEACHER', 'STUDENT') NOT NULL,
  `businessPartnerId` VARCHAR(191) NULL,
  `franchiseId` VARCHAR(191) NULL,
  `centerId` VARCHAR(191) NULL,
  `targetKey` VARCHAR(191) NOT NULL,
  `readAt` DATETIME(3) NULL,
  `deliveredAt` DATETIME(3) NULL,
  `reopenedAt` DATETIME(3) NULL,
  `dismissedAt` DATETIME(3) NULL,
  `lastSeenAt` DATETIME(3) NULL,
  `actionPathOverride` VARCHAR(191) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `opnt_nt_tkey_uq`(`notificationId`, `targetKey`),
  INDEX `opnt_t_usr_unrd_i`(`tenantId`, `recipientUserId`, `readAt`, `dismissedAt`),
  INDEX `opnt_t_usr_del_i`(`tenantId`, `recipientUserId`, `deliveredAt`),
  INDEX `opnt_t_usr_ct_i`(`tenantId`, `recipientUserId`, `createdAt`),
  INDEX `opnt_t_bp_role_i`(`tenantId`, `businessPartnerId`, `recipientRole`),
  INDEX `opnt_t_fr_role_i`(`tenantId`, `franchiseId`, `recipientRole`),
  INDEX `opnt_t_ct_role_i`(`tenantId`, `centerId`, `recipientRole`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `operationalnotificationrulestate` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NULL,
  `scopeKey` VARCHAR(191) NOT NULL,
  `ruleKey` VARCHAR(191) NOT NULL,
  `lastWindowKey` VARCHAR(191) NULL,
  `lastRunAt` DATETIME(3) NULL,
  `lastSuccessAt` DATETIME(3) NULL,
  `lastFailureAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `failureCount` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `oprs_t_scope_rule_uq`(`tenantId`, `scopeKey`, `ruleKey`),
  INDEX `oprs_t_bp_upd_i`(`tenantId`, `businessPartnerId`, `updatedAt`),
  INDEX `oprs_t_fail_i`(`tenantId`, `lastFailureAt`, `failureCount`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `operationalnotification`
  ADD CONSTRAINT `operationalnotification_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `operationalnotification_businessPartnerId_fkey`
    FOREIGN KEY (`businessPartnerId`) REFERENCES `businesspartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `operationalnotification_franchiseId_fkey`
    FOREIGN KEY (`franchiseId`) REFERENCES `franchiseprofile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `operationalnotification_centerId_fkey`
    FOREIGN KEY (`centerId`) REFERENCES `centerprofile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `operationalnotificationtarget`
  ADD CONSTRAINT `operationalnotificationtarget_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `operationalnotificationtarget_notificationId_fkey`
    FOREIGN KEY (`notificationId`) REFERENCES `operationalnotification`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `operationalnotificationtarget_recipientUserId_fkey`
    FOREIGN KEY (`recipientUserId`) REFERENCES `authuser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `operationalnotificationtarget_businessPartnerId_fkey`
    FOREIGN KEY (`businessPartnerId`) REFERENCES `businesspartner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `operationalnotificationtarget_franchiseId_fkey`
    FOREIGN KEY (`franchiseId`) REFERENCES `franchiseprofile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `operationalnotificationtarget_centerId_fkey`
    FOREIGN KEY (`centerId`) REFERENCES `centerprofile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `operationalnotificationrulestate`
  ADD CONSTRAINT `operationalnotificationrulestate_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `operationalnotificationrulestate_businessPartnerId_fkey`
    FOREIGN KEY (`businessPartnerId`) REFERENCES `businesspartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

SELECT 'Migration ready: operational notification schema foundation applied' AS status;