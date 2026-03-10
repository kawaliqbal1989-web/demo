-- Store SuperAdmin-selected base exam worksheet per (combined enrollment list, level)

CREATE TABLE `ExamEnrollmentLevelWorksheetSelection` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `listId` VARCHAR(191) NOT NULL,
  `levelId` VARCHAR(191) NOT NULL,
  `baseWorksheetId` VARCHAR(191) NOT NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),

  UNIQUE INDEX `EELWS_tenant_list_level_uq` (`tenantId`, `listId`, `levelId`),
  INDEX `EELWS_tenant_list_idx` (`tenantId`, `listId`),
  INDEX `EELWS_tenant_level_idx` (`tenantId`, `levelId`),
  INDEX `EELWS_baseWorksheet_idx` (`baseWorksheetId`),

  CONSTRAINT `EELWS_tenant_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EELWS_list_fkey` FOREIGN KEY (`listId`) REFERENCES `ExamEnrollmentList`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `EELWS_level_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EELWS_baseWorksheet_fkey` FOREIGN KEY (`baseWorksheetId`) REFERENCES `Worksheet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EELWS_createdBy_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
