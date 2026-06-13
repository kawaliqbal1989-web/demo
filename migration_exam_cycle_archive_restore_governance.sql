ALTER TABLE `examcycle`
  ADD COLUMN `isArchived` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `archivedAt` DATETIME(3) NULL,
  ADD COLUMN `archivedBy` VARCHAR(191) NULL,
  ADD COLUMN `archiveReason` TEXT NULL;

CREATE INDEX `examcycle_tenantId_isArchived_createdAt_idx`
  ON `examcycle`(`tenantId`, `isArchived`, `createdAt`);
