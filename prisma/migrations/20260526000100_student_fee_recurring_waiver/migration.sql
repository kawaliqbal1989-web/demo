-- Student fee recurring templates + month waiver/pause adjustments

ALTER TABLE `studentfeeinstallment`
  ADD COLUMN `isRecurringMonthly` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `recurrenceEndDate` DATETIME(3) NULL;

CREATE INDEX `sfi_tenant_student_recur_due_idx`
  ON `studentfeeinstallment`(`tenantId`, `studentId`, `isRecurringMonthly`, `dueDate`);

CREATE TABLE `studentfeemonthadjustment` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `year` INTEGER NOT NULL,
  `month` INTEGER NOT NULL,
  `adjustmentType` ENUM('WAIVED', 'PAUSED') NOT NULL,
  `remarks` TEXT NOT NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `sfma_tenant_student_month_uq`(`tenantId`, `studentId`, `year`, `month`),
  INDEX `sfma_tenant_student_ct_idx`(`tenantId`, `studentId`, `createdAt`),
  INDEX `sfma_tenant_year_month_idx`(`tenantId`, `year`, `month`),
  INDEX `sfma_actor_ct_idx`(`createdByUserId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `studentfeemonthadjustment`
  ADD CONSTRAINT `studentfeemonthadjustment_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `studentfeemonthadjustment_studentId_fkey`
    FOREIGN KEY (`studentId`) REFERENCES `student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `studentfeemonthadjustment_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `authuser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
