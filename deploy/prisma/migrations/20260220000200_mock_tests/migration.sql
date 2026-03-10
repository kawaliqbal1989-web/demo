-- CreateTable
CREATE TABLE `MockTest` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `hierarchyNodeId` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `date` DATETIME(3) NOT NULL,
  `maxMarks` INTEGER NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `MockTest_tenantId_batchId_date_title_key`(`tenantId`, `batchId`, `date`, `title`),
  INDEX `MockTest_tenantId_hierarchyNodeId_date_idx`(`tenantId`, `hierarchyNodeId`, `date`),
  INDEX `MockTest_tenantId_batchId_date_idx`(`tenantId`, `batchId`, `date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MockTestResult` (
  `mockTestId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `marks` INTEGER NOT NULL,
  `recordedByUserId` VARCHAR(191) NOT NULL,
  `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `MockTestResult_tenantId_studentId_idx`(`tenantId`, `studentId`),
  PRIMARY KEY (`mockTestId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MockTest` ADD CONSTRAINT `MockTest_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `MockTest` ADD CONSTRAINT `MockTest_hierarchyNodeId_fkey` FOREIGN KEY (`hierarchyNodeId`) REFERENCES `HierarchyNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MockTest` ADD CONSTRAINT `MockTest_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `Batch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MockTest` ADD CONSTRAINT `MockTest_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `MockTestResult` ADD CONSTRAINT `MockTestResult_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `MockTestResult` ADD CONSTRAINT `MockTestResult_mockTestId_fkey` FOREIGN KEY (`mockTestId`) REFERENCES `MockTest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MockTestResult` ADD CONSTRAINT `MockTestResult_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MockTestResult` ADD CONSTRAINT `MockTestResult_recordedByUserId_fkey` FOREIGN KEY (`recordedByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
