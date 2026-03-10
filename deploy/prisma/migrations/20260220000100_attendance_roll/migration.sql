-- Add Center attendance config
ALTER TABLE `CenterProfile` ADD COLUMN `attendanceConfig` JSON NULL;

-- CreateTable
CREATE TABLE `TeacherProfile` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `hierarchyNodeId` VARCHAR(191) NOT NULL,
  `authUserId` VARCHAR(191) NOT NULL,
  `fullName` VARCHAR(191) NOT NULL,
  `phonePrimary` VARCHAR(191) NULL,
  `status` ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `TeacherProfile_authUserId_key`(`authUserId`),
  INDEX `TeacherProfile_tenantId_hierarchyNodeId_status_isActive_idx`(`tenantId`, `hierarchyNodeId`, `status`, `isActive`),
  INDEX `TeacherProfile_hierarchyNodeId_createdAt_idx`(`hierarchyNodeId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Batch` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `hierarchyNodeId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `schedule` JSON NULL,
  `status` ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `Batch_tenantId_hierarchyNodeId_name_key`(`tenantId`, `hierarchyNodeId`, `name`),
  INDEX `Batch_tenantId_hierarchyNodeId_status_isActive_idx`(`tenantId`, `hierarchyNodeId`, `status`, `isActive`),
  INDEX `Batch_hierarchyNodeId_createdAt_idx`(`hierarchyNodeId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BatchTeacherAssignment` (
  `batchId` VARCHAR(191) NOT NULL,
  `teacherUserId` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `BatchTeacherAssignment_tenantId_teacherUserId_idx`(`tenantId`, `teacherUserId`),
  INDEX `BatchTeacherAssignment_tenantId_batchId_idx`(`tenantId`, `batchId`),
  PRIMARY KEY (`batchId`, `teacherUserId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Enrollment` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `hierarchyNodeId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(191) NOT NULL,
  `assignedTeacherUserId` VARCHAR(191) NULL,
  `levelId` VARCHAR(191) NULL,
  `startDate` DATETIME(3) NULL,
  `status` ENUM('ACTIVE', 'INACTIVE', 'TRANSFERRED', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `Enrollment_tenantId_hierarchyNodeId_status_idx`(`tenantId`, `hierarchyNodeId`, `status`),
  INDEX `Enrollment_tenantId_studentId_status_idx`(`tenantId`, `studentId`, `status`),
  INDEX `Enrollment_tenantId_batchId_status_idx`(`tenantId`, `batchId`, `status`),
  INDEX `Enrollment_assignedTeacherUserId_idx`(`assignedTeacherUserId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendanceSession` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `hierarchyNodeId` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(191) NOT NULL,
  `date` DATETIME(3) NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED', 'LOCKED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `version` INTEGER NOT NULL DEFAULT 1,
  `createdByUserId` VARCHAR(191) NULL,
  `publishedAt` DATETIME(3) NULL,
  `lockedAt` DATETIME(3) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `AttendanceSession_tenantId_batchId_date_key`(`tenantId`, `batchId`, `date`),
  INDEX `AttendanceSession_tenantId_hierarchyNodeId_date_idx`(`tenantId`, `hierarchyNodeId`, `date`),
  INDEX `AttendanceSession_tenantId_batchId_date_status_idx`(`tenantId`, `batchId`, `date`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendanceEntry` (
  `sessionId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `status` ENUM('PRESENT', 'ABSENT', 'LATE', 'EXCUSED') NOT NULL,
  `note` VARCHAR(191) NULL,
  `markedAt` DATETIME(3) NULL,
  `markedByUserId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `AttendanceEntry_tenantId_sessionId_idx`(`tenantId`, `sessionId`),
  INDEX `AttendanceEntry_tenantId_studentId_idx`(`tenantId`, `studentId`),
  PRIMARY KEY (`sessionId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendanceCorrectionRequest` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `requestedByUserId` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'APPLIED') NOT NULL DEFAULT 'PENDING',
  `reason` VARCHAR(191) NOT NULL,
  `requestedChanges` JSON NOT NULL,
  `reviewedByUserId` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `AttendanceCorrectionRequest_tenantId_sessionId_status_idx`(`tenantId`, `sessionId`, `status`),
  INDEX `AttendanceCorrectionRequest_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TeacherProfile` ADD CONSTRAINT `TeacherProfile_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `TeacherProfile` ADD CONSTRAINT `TeacherProfile_hierarchyNodeId_fkey` FOREIGN KEY (`hierarchyNodeId`) REFERENCES `HierarchyNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TeacherProfile` ADD CONSTRAINT `TeacherProfile_authUserId_fkey` FOREIGN KEY (`authUserId`) REFERENCES `AuthUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Batch` ADD CONSTRAINT `Batch_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Batch` ADD CONSTRAINT `Batch_hierarchyNodeId_fkey` FOREIGN KEY (`hierarchyNodeId`) REFERENCES `HierarchyNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `BatchTeacherAssignment` ADD CONSTRAINT `BatchTeacherAssignment_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `Batch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BatchTeacherAssignment` ADD CONSTRAINT `BatchTeacherAssignment_teacherUserId_fkey` FOREIGN KEY (`teacherUserId`) REFERENCES `AuthUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BatchTeacherAssignment` ADD CONSTRAINT `BatchTeacherAssignment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Enrollment` ADD CONSTRAINT `Enrollment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Enrollment` ADD CONSTRAINT `Enrollment_hierarchyNodeId_fkey` FOREIGN KEY (`hierarchyNodeId`) REFERENCES `HierarchyNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Enrollment` ADD CONSTRAINT `Enrollment_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Enrollment` ADD CONSTRAINT `Enrollment_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `Batch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Enrollment` ADD CONSTRAINT `Enrollment_assignedTeacherUserId_fkey` FOREIGN KEY (`assignedTeacherUserId`) REFERENCES `AuthUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Enrollment` ADD CONSTRAINT `Enrollment_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `AttendanceSession` ADD CONSTRAINT `AttendanceSession_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AttendanceSession` ADD CONSTRAINT `AttendanceSession_hierarchyNodeId_fkey` FOREIGN KEY (`hierarchyNodeId`) REFERENCES `HierarchyNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AttendanceSession` ADD CONSTRAINT `AttendanceSession_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `Batch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AttendanceSession` ADD CONSTRAINT `AttendanceSession_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `AttendanceEntry` ADD CONSTRAINT `AttendanceEntry_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `AttendanceSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AttendanceEntry` ADD CONSTRAINT `AttendanceEntry_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AttendanceEntry` ADD CONSTRAINT `AttendanceEntry_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AttendanceEntry` ADD CONSTRAINT `AttendanceEntry_markedByUserId_fkey` FOREIGN KEY (`markedByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `AttendanceCorrectionRequest` ADD CONSTRAINT `AttendanceCorrectionRequest_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AttendanceCorrectionRequest` ADD CONSTRAINT `AttendanceCorrectionRequest_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `AttendanceSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AttendanceCorrectionRequest` ADD CONSTRAINT `AttendanceCorrectionRequest_requestedByUserId_fkey` FOREIGN KEY (`requestedByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AttendanceCorrectionRequest` ADD CONSTRAINT `AttendanceCorrectionRequest_reviewedByUserId_fkey` FOREIGN KEY (`reviewedByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
