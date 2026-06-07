-- Level-wise assessment configuration for exam cycles with worksheet or question-bank mode.

CREATE TABLE `examlevelassessmentconfig` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `examCycleId` VARCHAR(191) NOT NULL,
  `levelId` VARCHAR(191) NOT NULL,
  `assessmentType` ENUM('WORKSHEET', 'QUESTION_BANK') NOT NULL,
  `worksheetId` VARCHAR(191) NULL,
  `questionBankId` VARCHAR(191) NULL,
  `questionCount` INT NULL,
  `timeLimitMinutes` INT NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `ELAC_tenant_cycle_level_uq` (`tenantId`, `examCycleId`, `levelId`),
  INDEX `ELAC_tenant_cycle_idx` (`tenantId`, `examCycleId`),
  INDEX `ELAC_tenant_level_idx` (`tenantId`, `levelId`),
  INDEX `ELAC_worksheet_idx` (`worksheetId`),

  CONSTRAINT `ELAC_tenant_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ELAC_cycle_fkey` FOREIGN KEY (`examCycleId`) REFERENCES `ExamCycle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ELAC_level_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ELAC_worksheet_fkey` FOREIGN KEY (`worksheetId`) REFERENCES `Worksheet`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ELAC_createdBy_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `examgeneratedquestionset` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `examCycleId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `levelId` VARCHAR(191) NOT NULL,
  `questionBankId` VARCHAR(191) NOT NULL,
  `generatedQuestionIds` JSON NOT NULL,
  `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `EGQS_tenant_cycle_student_level_uq` (`tenantId`, `examCycleId`, `studentId`, `levelId`),
  INDEX `EGQS_tenant_cycle_idx` (`tenantId`, `examCycleId`),
  INDEX `EGQS_tenant_student_idx` (`tenantId`, `studentId`),
  INDEX `EGQS_tenant_level_idx` (`tenantId`, `levelId`),

  CONSTRAINT `EGQS_tenant_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EGQS_cycle_fkey` FOREIGN KEY (`examCycleId`) REFERENCES `ExamCycle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `EGQS_student_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `EGQS_level_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
