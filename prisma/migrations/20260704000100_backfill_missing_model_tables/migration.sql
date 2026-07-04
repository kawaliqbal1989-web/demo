CREATE TABLE `operationalnotificationtarget` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `notificationId` VARCHAR(191) NOT NULL,
  `recipientUserId` VARCHAR(191) NOT NULL,
  `recipientRole` ENUM('SUPERADMIN', 'BP', 'FRANCHISE', 'CENTER', 'TEACHER', 'PARENT', 'STUDENT') NOT NULL,
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
  UNIQUE INDEX `opnt_nt_tkey_uq` (`notificationId`, `targetKey`),
  INDEX `opnt_t_usr_unrd_i` (`tenantId`, `recipientUserId`, `readAt`, `dismissedAt`),
  INDEX `opnt_t_usr_del_i` (`tenantId`, `recipientUserId`, `deliveredAt`),
  INDEX `opnt_t_usr_ct_i` (`tenantId`, `recipientUserId`, `createdAt`),
  INDEX `opnt_t_bp_role_i` (`tenantId`, `businessPartnerId`, `recipientRole`),
  INDEX `opnt_t_fr_role_i` (`tenantId`, `franchiseId`, `recipientRole`),
  INDEX `opnt_t_ct_role_i` (`tenantId`, `centerId`, `recipientRole`),

  CONSTRAINT `operationalnotificationtarget_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `operationalnotificationtarget_notificationId_fkey`
    FOREIGN KEY (`notificationId`) REFERENCES `operationalnotification`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `operationalnotificationtarget_recipientUserId_fkey`
    FOREIGN KEY (`recipientUserId`) REFERENCES `authuser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `operationalnotificationtarget_businessPartnerId_fkey`
    FOREIGN KEY (`businessPartnerId`) REFERENCES `businesspartner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `operationalnotificationtarget_franchiseId_fkey`
    FOREIGN KEY (`franchiseId`) REFERENCES `franchiseprofile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `operationalnotificationtarget_centerId_fkey`
    FOREIGN KEY (`centerId`) REFERENCES `centerprofile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `parentstudentlink` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `parentUserId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `relationship` VARCHAR(191) NULL,
  `isPrimary` BOOLEAN NOT NULL DEFAULT false,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `visibilityKey` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `parentstudentlink_tenantId_parentUserId_studentId_key` (`tenantId`, `parentUserId`, `studentId`),
  INDEX `parentstudentlink_tenantId_parentUserId_isActive_idx` (`tenantId`, `parentUserId`, `isActive`),
  INDEX `parentstudentlink_tenantId_studentId_isActive_idx` (`tenantId`, `studentId`, `isActive`),

  CONSTRAINT `parentstudentlink_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `parentstudentlink_parentUserId_fkey`
    FOREIGN KEY (`parentUserId`) REFERENCES `authuser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `parentstudentlink_studentId_fkey`
    FOREIGN KEY (`studentId`) REFERENCES `student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `studentengagementsnapshot` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `hierarchyNodeId` VARCHAR(191) NULL,
  `snapshotDate` DATETIME(3) NOT NULL,
  `sourceWindowKey` VARCHAR(191) NULL,
  `engagementScore` DECIMAL(5, 2) NULL,
  `consistencyScore` DECIMAL(5, 2) NULL,
  `streakScore` DECIMAL(5, 2) NULL,
  `participationScore` DECIMAL(5, 2) NULL,
  `completionScore` DECIMAL(5, 2) NULL,
  `inactivityRiskScore` DECIMAL(5, 2) NULL,
  `momentumScore` DECIMAL(5, 2) NULL,
  `currentPracticeStreak` INTEGER NOT NULL DEFAULT 0,
  `bestPracticeStreak` INTEGER NOT NULL DEFAULT 0,
  `currentAttendanceStreak` INTEGER NOT NULL DEFAULT 0,
  `bestAttendanceStreak` INTEGER NOT NULL DEFAULT 0,
  `completedWorksheetCount` INTEGER NOT NULL DEFAULT 0,
  `pendingWorksheetCount` INTEGER NOT NULL DEFAULT 0,
  `attendanceRate` DECIMAL(5, 2) NULL,
  `examParticipationRate` DECIMAL(5, 2) NULL,
  `inactiveDays` INTEGER NULL,
  `weakTopicCount` INTEGER NOT NULL DEFAULT 0,
  `achievementsCount` INTEGER NOT NULL DEFAULT 0,
  `practiceTrend` JSON NULL,
  `attendanceTrend` JSON NULL,
  `weakTopics` JSON NULL,
  `achievementsPreview` JSON NULL,
  `remindersPreview` JSON NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `studentengagementsnapshot_tenantId_studentId_snapshotDate_key` (`tenantId`, `studentId`, `snapshotDate`),
  INDEX `studentengagementsnapshot_tenantId_snapshotDate_idx` (`tenantId`, `snapshotDate`),
  INDEX `studentengagementsnapshot_tenantId_studentId_updatedAt_idx` (`tenantId`, `studentId`, `updatedAt`),
  INDEX `studentengagementsnapshot_tenantId_hierarchyNodeId_snapshotDate_idx` (`tenantId`, `hierarchyNodeId`, `snapshotDate`),

  CONSTRAINT `studentengagementsnapshot_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `studentengagementsnapshot_studentId_fkey`
    FOREIGN KEY (`studentId`) REFERENCES `student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;