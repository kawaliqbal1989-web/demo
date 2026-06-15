CREATE TABLE `examlateenrollmentrequest` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `examCycleId` VARCHAR(191) NOT NULL,
  `centerId` VARCHAR(191) NOT NULL,
  `submittedByUserId` VARCHAR(191) NOT NULL,
  `status` ENUM('SUBMITTED', 'UNDER_REVIEW', 'PARTIALLY_APPROVED', 'APPROVED', 'REJECTED', 'EXPIRED') NOT NULL DEFAULT 'SUBMITTED',
  `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reviewedAt` DATETIME(3) NULL,
  `reviewedByUserId` VARCHAR(191) NULL,
  `remarks` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `ELER_tenant_cycle_status_idx` (`tenantId`, `examCycleId`, `status`),
  INDEX `ELER_tenant_center_submitted_idx` (`tenantId`, `centerId`, `submittedAt`),
  INDEX `ELER_tenant_submitter_submitted_idx` (`tenantId`, `submittedByUserId`, `submittedAt`),
  INDEX `ELER_reviewedBy_idx` (`reviewedByUserId`),

  CONSTRAINT `ELER_tenant_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ELER_cycle_fkey` FOREIGN KEY (`examCycleId`) REFERENCES `ExamCycle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ELER_center_fkey` FOREIGN KEY (`centerId`) REFERENCES `HierarchyNode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ELER_submittedBy_fkey` FOREIGN KEY (`submittedByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ELER_reviewedBy_fkey` FOREIGN KEY (`reviewedByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `examlateenrollmentstudent` (
  `id` VARCHAR(191) NOT NULL,
  `requestId` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `levelId` VARCHAR(191) NOT NULL,
  `status` ENUM('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED') NOT NULL DEFAULT 'SUBMITTED',
  `reviewRemarks` TEXT NULL,
  `approvedAt` DATETIME(3) NULL,
  `approvedByUserId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `ELES_request_student_uq` (`requestId`, `studentId`),
  INDEX `ELES_tenant_student_status_idx` (`tenantId`, `studentId`, `status`),
  INDEX `ELES_tenant_level_status_idx` (`tenantId`, `levelId`, `status`),
  INDEX `ELES_approvedBy_idx` (`approvedByUserId`),

  CONSTRAINT `ELES_request_fkey` FOREIGN KEY (`requestId`) REFERENCES `examlateenrollmentrequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ELES_tenant_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ELES_student_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ELES_level_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ELES_approvedBy_fkey` FOREIGN KEY (`approvedByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
