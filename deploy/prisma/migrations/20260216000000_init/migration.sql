-- CreateTable
CREATE TABLE `Superadmin` (
  `id` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `passwordHash` VARCHAR(191) NOT NULL,
  `fullName` VARCHAR(191) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Superadmin_email_key`(`email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HierarchyNode` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NULL,
  `type` ENUM('COUNTRY', 'REGION', 'DISTRICT', 'SCHOOL', 'BRANCH') NOT NULL,
  `parentId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `HierarchyNode_code_key`(`code`),
  INDEX `HierarchyNode_type_idx`(`type`),
  INDEX `HierarchyNode_parentId_idx`(`parentId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Level` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `rank` INTEGER NOT NULL,
  `description` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Level_name_key`(`name`),
  UNIQUE INDEX `Level_rank_key`(`rank`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Student` (
  `id` VARCHAR(191) NOT NULL,
  `admissionNo` VARCHAR(191) NOT NULL,
  `firstName` VARCHAR(191) NOT NULL,
  `lastName` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NULL,
  `dateOfBirth` DATETIME(3) NULL,
  `hierarchyNodeId` VARCHAR(191) NOT NULL,
  `levelId` VARCHAR(191) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Student_admissionNo_key`(`admissionNo`),
  UNIQUE INDEX `Student_email_key`(`email`),
  INDEX `Student_hierarchyNodeId_idx`(`hierarchyNodeId`),
  INDEX `Student_levelId_idx`(`levelId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Worksheet` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` VARCHAR(191) NULL,
  `difficulty` ENUM('EASY', 'MEDIUM', 'HARD') NOT NULL DEFAULT 'MEDIUM',
  `levelId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `isPublished` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `Worksheet_levelId_idx`(`levelId`),
  INDEX `Worksheet_createdById_idx`(`createdById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorksheetSubmission` (
  `id` VARCHAR(191) NOT NULL,
  `worksheetId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `score` DECIMAL(5, 2) NULL,
  `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `status` ENUM('PENDING', 'REVIEWED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `remarks` VARCHAR(191) NULL,
  UNIQUE INDEX `WorksheetSubmission_worksheetId_studentId_key`(`worksheetId`, `studentId`),
  INDEX `WorksheetSubmission_studentId_idx`(`studentId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Competition` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` VARCHAR(191) NULL,
  `status` ENUM('DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `startsAt` DATETIME(3) NOT NULL,
  `endsAt` DATETIME(3) NOT NULL,
  `hierarchyNodeId` VARCHAR(191) NOT NULL,
  `levelId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `Competition_hierarchyNodeId_idx`(`hierarchyNodeId`),
  INDEX `Competition_levelId_idx`(`levelId`),
  INDEX `Competition_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompetitionWorksheet` (
  `competitionId` VARCHAR(191) NOT NULL,
  `worksheetId` VARCHAR(191) NOT NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`competitionId`, `worksheetId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompetitionEnrollment` (
  `competitionId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `enrolledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `rank` INTEGER NULL,
  `totalScore` DECIMAL(6, 2) NULL,
  INDEX `CompetitionEnrollment_studentId_idx`(`studentId`),
  PRIMARY KEY (`competitionId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `HierarchyNode`
  ADD CONSTRAINT `HierarchyNode_parentId_fkey`
  FOREIGN KEY (`parentId`) REFERENCES `HierarchyNode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student`
  ADD CONSTRAINT `Student_hierarchyNodeId_fkey`
  FOREIGN KEY (`hierarchyNodeId`) REFERENCES `HierarchyNode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student`
  ADD CONSTRAINT `Student_levelId_fkey`
  FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Worksheet`
  ADD CONSTRAINT `Worksheet_levelId_fkey`
  FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Worksheet`
  ADD CONSTRAINT `Worksheet_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `Superadmin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorksheetSubmission`
  ADD CONSTRAINT `WorksheetSubmission_worksheetId_fkey`
  FOREIGN KEY (`worksheetId`) REFERENCES `Worksheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorksheetSubmission`
  ADD CONSTRAINT `WorksheetSubmission_studentId_fkey`
  FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Competition`
  ADD CONSTRAINT `Competition_hierarchyNodeId_fkey`
  FOREIGN KEY (`hierarchyNodeId`) REFERENCES `HierarchyNode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Competition`
  ADD CONSTRAINT `Competition_levelId_fkey`
  FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Competition`
  ADD CONSTRAINT `Competition_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `Superadmin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompetitionWorksheet`
  ADD CONSTRAINT `CompetitionWorksheet_competitionId_fkey`
  FOREIGN KEY (`competitionId`) REFERENCES `Competition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompetitionWorksheet`
  ADD CONSTRAINT `CompetitionWorksheet_worksheetId_fkey`
  FOREIGN KEY (`worksheetId`) REFERENCES `Worksheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompetitionEnrollment`
  ADD CONSTRAINT `CompetitionEnrollment_competitionId_fkey`
  FOREIGN KEY (`competitionId`) REFERENCES `Competition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompetitionEnrollment`
  ADD CONSTRAINT `CompetitionEnrollment_studentId_fkey`
  FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
