ALTER TABLE `settlement`
  MODIFY COLUMN `status` ENUM(
    'PENDING',
    'DRAFT',
    'PENDING_REVIEW',
    'REVIEWED',
    'APPROVED',
    'REJECTED',
    'PAID',
    'OVERDUE',
    'ESCALATED'
  ) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `workflowVersion` INT NOT NULL DEFAULT 1,
  ADD COLUMN `currentActionRole` ENUM('SUPERADMIN', 'BP', 'FRANCHISE', 'CENTER', 'TEACHER', 'STUDENT') NULL,
  ADD COLUMN `submittedAt` DATETIME(3) NULL,
  ADD COLUMN `reviewedAt` DATETIME(3) NULL,
  ADD COLUMN `approvedAt` DATETIME(3) NULL,
  ADD COLUMN `rejectedAt` DATETIME(3) NULL,
  ADD COLUMN `reopenedAt` DATETIME(3) NULL,
  ADD COLUMN `escalatedAt` DATETIME(3) NULL,
  ADD COLUMN `payoutDueAt` DATETIME(3) NULL,
  ADD COLUMN `approvalActorUserId` VARCHAR(191) NULL,
  ADD COLUMN `reviewActorUserId` VARCHAR(191) NULL,
  ADD COLUMN `rejectionActorUserId` VARCHAR(191) NULL,
  ADD COLUMN `paidActorUserId` VARCHAR(191) NULL,
  ADD COLUMN `rejectionReason` TEXT NULL,
  ADD COLUMN `payoutReference` VARCHAR(191) NULL,
  ADD COLUMN `operationalNotes` TEXT NULL,
  ADD COLUMN `lastWorkflowActionAt` DATETIME(3) NULL;

ALTER TABLE `settlement`
  ADD CONSTRAINT `settlement_approvalActorUserId_fkey`
    FOREIGN KEY (`approvalActorUserId`) REFERENCES `authuser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `settlement_reviewActorUserId_fkey`
    FOREIGN KEY (`reviewActorUserId`) REFERENCES `authuser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `settlement_rejectionActorUserId_fkey`
    FOREIGN KEY (`rejectionActorUserId`) REFERENCES `authuser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `settlement_paidActorUserId_fkey`
    FOREIGN KEY (`paidActorUserId`) REFERENCES `authuser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `sett_t_role_st_u_i` ON `settlement`(`tenantId`, `currentActionRole`, `status`, `updatedAt`);
CREATE INDEX `sett_t_due_st_i` ON `settlement`(`tenantId`, `payoutDueAt`, `status`);
CREATE INDEX `sett_t_wfv_i` ON `settlement`(`tenantId`, `workflowVersion`);

CREATE TABLE `settlementworkflowhistory` (
  `id` VARCHAR(191) NOT NULL,
  `settlementId` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NULL,
  `franchiseId` VARCHAR(191) NULL,
  `centerId` VARCHAR(191) NULL,
  `fromStatus` ENUM('PENDING', 'DRAFT', 'PENDING_REVIEW', 'REVIEWED', 'APPROVED', 'REJECTED', 'PAID', 'OVERDUE', 'ESCALATED') NOT NULL,
  `toStatus` ENUM('PENDING', 'DRAFT', 'PENDING_REVIEW', 'REVIEWED', 'APPROVED', 'REJECTED', 'PAID', 'OVERDUE', 'ESCALATED') NOT NULL,
  `actionType` ENUM('SUBMIT', 'REVIEW', 'APPROVE', 'REJECT', 'REOPEN', 'ESCALATE', 'RESOLVE', 'MARK_PAID') NOT NULL,
  `actorUserId` VARCHAR(191) NOT NULL,
  `actorRole` ENUM('SUPERADMIN', 'BP', 'FRANCHISE', 'CENTER', 'TEACHER', 'STUDENT') NOT NULL,
  `expectedVersion` INT NOT NULL,
  `resultingVersion` INT NOT NULL,
  `reason` TEXT NULL,
  `notes` TEXT NULL,
  `payoutReference` VARCHAR(191) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  CONSTRAINT `swh_settlement_fkey` FOREIGN KEY (`settlementId`) REFERENCES `settlement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `swh_tenant_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `swh_bp_fkey` FOREIGN KEY (`businessPartnerId`) REFERENCES `businesspartner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `swh_franchise_fkey` FOREIGN KEY (`franchiseId`) REFERENCES `franchiseprofile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `swh_center_fkey` FOREIGN KEY (`centerId`) REFERENCES `centerprofile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `swh_actor_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `authuser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `swh_set_ct_i` ON `settlementworkflowhistory`(`settlementId`, `createdAt`);
CREATE INDEX `swh_t_bp_ct_i` ON `settlementworkflowhistory`(`tenantId`, `businessPartnerId`, `createdAt`);
CREATE INDEX `swh_t_fr_ct_i` ON `settlementworkflowhistory`(`tenantId`, `franchiseId`, `createdAt`);
CREATE INDEX `swh_t_ce_ct_i` ON `settlementworkflowhistory`(`tenantId`, `centerId`, `createdAt`);
CREATE INDEX `swh_t_usr_ct_i` ON `settlementworkflowhistory`(`tenantId`, `actorUserId`, `createdAt`);

CREATE TABLE `settlementworkflowtask` (
  `id` VARCHAR(191) NOT NULL,
  `settlementId` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NULL,
  `franchiseId` VARCHAR(191) NULL,
  `centerId` VARCHAR(191) NULL,
  `targetRole` ENUM('SUPERADMIN', 'BP', 'FRANCHISE', 'CENTER', 'TEACHER', 'STUDENT') NOT NULL,
  `targetUserId` VARCHAR(191) NULL,
  `taskType` ENUM('REVIEW_REQUIRED', 'APPROVAL_REQUIRED', 'REJECTION_RESPONSE', 'PAYOUT_CONFIRMATION', 'ESCALATION_RESPONSE') NOT NULL,
  `state` ENUM('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE') NOT NULL DEFAULT 'OPEN',
  `dueAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `escalatedAt` DATETIME(3) NULL,
  `resolvedAt` DATETIME(3) NULL,
  `escalationCount` INT NOT NULL DEFAULT 0,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  CONSTRAINT `swt_settlement_fkey` FOREIGN KEY (`settlementId`) REFERENCES `settlement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `swt_tenant_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `swt_bp_fkey` FOREIGN KEY (`businessPartnerId`) REFERENCES `businesspartner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `swt_franchise_fkey` FOREIGN KEY (`franchiseId`) REFERENCES `franchiseprofile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `swt_center_fkey` FOREIGN KEY (`centerId`) REFERENCES `centerprofile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `swt_target_user_fkey` FOREIGN KEY (`targetUserId`) REFERENCES `authuser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `swt_t_role_st_d_i` ON `settlementworkflowtask`(`tenantId`, `targetRole`, `state`, `dueAt`);
CREATE INDEX `swt_t_usr_st_d_i` ON `settlementworkflowtask`(`tenantId`, `targetUserId`, `state`, `dueAt`);
CREATE INDEX `swt_set_st_i` ON `settlementworkflowtask`(`settlementId`, `state`);
CREATE INDEX `swt_t_bp_st_i` ON `settlementworkflowtask`(`tenantId`, `businessPartnerId`, `state`);
CREATE INDEX `swt_t_fr_st_i` ON `settlementworkflowtask`(`tenantId`, `franchiseId`, `state`);
CREATE INDEX `swt_t_ce_st_i` ON `settlementworkflowtask`(`tenantId`, `centerId`, `state`);

CREATE TABLE `settlementescalation` (
  `id` VARCHAR(191) NOT NULL,
  `settlementId` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NULL,
  `franchiseId` VARCHAR(191) NULL,
  `centerId` VARCHAR(191) NULL,
  `escalationType` ENUM('UNREVIEWED_SETTLEMENT', 'UNAPPROVED_SETTLEMENT', 'PAYOUT_DELAY', 'REPEATED_REJECTION') NOT NULL,
  `severity` ENUM('WARNING', 'HIGH', 'CRITICAL') NOT NULL,
  `state` ENUM('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  `triggeredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `acknowledgedAt` DATETIME(3) NULL,
  `resolvedAt` DATETIME(3) NULL,
  `escalationReason` TEXT NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  CONSTRAINT `se_settlement_fkey` FOREIGN KEY (`settlementId`) REFERENCES `settlement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `se_tenant_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `se_bp_fkey` FOREIGN KEY (`businessPartnerId`) REFERENCES `businesspartner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `se_franchise_fkey` FOREIGN KEY (`franchiseId`) REFERENCES `franchiseprofile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `se_center_fkey` FOREIGN KEY (`centerId`) REFERENCES `centerprofile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `se_t_st_sev_tr_i` ON `settlementescalation`(`tenantId`, `state`, `severity`, `triggeredAt`);
CREATE INDEX `se_set_st_i` ON `settlementescalation`(`settlementId`, `state`);
CREATE INDEX `se_t_bp_st_i` ON `settlementescalation`(`tenantId`, `businessPartnerId`, `state`);
CREATE INDEX `se_t_fr_st_i` ON `settlementescalation`(`tenantId`, `franchiseId`, `state`);
CREATE INDEX `se_t_ce_st_i` ON `settlementescalation`(`tenantId`, `centerId`, `state`);

CREATE TABLE `settlementsupportingrecord` (
  `id` VARCHAR(191) NOT NULL,
  `settlementId` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `uploadedByUserId` VARCHAR(191) NOT NULL,
  `uploadedByRole` ENUM('SUPERADMIN', 'BP', 'FRANCHISE', 'CENTER', 'TEACHER', 'STUDENT') NOT NULL,
  `recordType` VARCHAR(191) NOT NULL,
  `fileUrl` TEXT NOT NULL,
  `fileName` VARCHAR(191) NOT NULL,
  `mimeType` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  CONSTRAINT `ssr_settlement_fkey` FOREIGN KEY (`settlementId`) REFERENCES `settlement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ssr_tenant_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ssr_uploaded_by_fkey` FOREIGN KEY (`uploadedByUserId`) REFERENCES `authuser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ssr_set_ct_i` ON `settlementsupportingrecord`(`settlementId`, `createdAt`);
CREATE INDEX `ssr_t_usr_ct_i` ON `settlementsupportingrecord`(`tenantId`, `uploadedByUserId`, `createdAt`);