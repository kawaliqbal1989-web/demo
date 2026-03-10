-- Practice Feature Entitlement System Migration
-- Run this against your MySQL database

-- Add PracticeFeatureKey enum type (handled by Prisma enum)

-- Layer 1: Superadmin → BP entitlement
CREATE TABLE IF NOT EXISTS `BusinessPartnerPracticeEntitlement` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `businessPartnerId` VARCHAR(191) NOT NULL,
  `featureKey` ENUM('PRACTICE', 'ABACUS_PRACTICE') NOT NULL,
  `isEnabled` BOOLEAN NOT NULL DEFAULT false,
  `totalSeats` INTEGER NOT NULL DEFAULT 0,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `bp_practice_entitlement_uniq`(`tenantId`, `businessPartnerId`, `featureKey`),
  INDEX `bp_practice_entitlement_bp_idx`(`tenantId`, `businessPartnerId`),
  PRIMARY KEY (`id`),
  
  CONSTRAINT `BusinessPartnerPracticeEntitlement_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `BusinessPartnerPracticeEntitlement_businessPartnerId_fkey` FOREIGN KEY (`businessPartnerId`) REFERENCES `BusinessPartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `BusinessPartnerPracticeEntitlement_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Layer 2: BP/Franchise → Center seat allocation
CREATE TABLE IF NOT EXISTS `CenterPracticeAllocation` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `entitlementId` VARCHAR(191) NOT NULL,
  `centerNodeId` VARCHAR(191) NOT NULL,
  `allocatedSeats` INTEGER NOT NULL DEFAULT 0,
  `allocatedByUserId` VARCHAR(191) NOT NULL,
  `allocatedByRole` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `center_practice_alloc_uniq`(`tenantId`, `entitlementId`, `centerNodeId`),
  INDEX `center_practice_alloc_center_idx`(`tenantId`, `centerNodeId`),
  INDEX `center_practice_alloc_ent_idx`(`entitlementId`),
  PRIMARY KEY (`id`),
  
  CONSTRAINT `CenterPracticeAllocation_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CenterPracticeAllocation_entitlementId_fkey` FOREIGN KEY (`entitlementId`) REFERENCES `BusinessPartnerPracticeEntitlement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CenterPracticeAllocation_centerNodeId_fkey` FOREIGN KEY (`centerNodeId`) REFERENCES `HierarchyNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CenterPracticeAllocation_allocatedByUserId_fkey` FOREIGN KEY (`allocatedByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Layer 3: Center → Student feature assignment
CREATE TABLE IF NOT EXISTS `StudentPracticeAssignment` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `allocationId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `featureKey` ENUM('PRACTICE', 'ABACUS_PRACTICE') NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `assignedByUserId` VARCHAR(191) NOT NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `unassignedAt` DATETIME(3) NULL,
  `unassignedByUserId` VARCHAR(191) NULL,

  UNIQUE INDEX `student_practice_assign_uniq`(`tenantId`, `studentId`, `featureKey`),
  INDEX `student_practice_alloc_active_idx`(`tenantId`, `allocationId`, `isActive`),
  INDEX `student_practice_lookup_idx`(`tenantId`, `studentId`, `featureKey`, `isActive`),
  INDEX `student_practice_assigned_by_idx`(`assignedByUserId`),
  PRIMARY KEY (`id`),
  
  CONSTRAINT `StudentPracticeAssignment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `StudentPracticeAssignment_allocationId_fkey` FOREIGN KEY (`allocationId`) REFERENCES `CenterPracticeAllocation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `StudentPracticeAssignment_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `StudentPracticeAssignment_assignedByUserId_fkey` FOREIGN KEY (`assignedByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `StudentPracticeAssignment_unassignedByUserId_fkey` FOREIGN KEY (`unassignedByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
