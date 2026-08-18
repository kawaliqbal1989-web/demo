ALTER TABLE `competition`
  ADD COLUMN `code` VARCHAR(191) NULL,
  ADD COLUMN `enrollmentStartAt` DATETIME(3) NULL,
  ADD COLUMN `enrollmentEndAt` DATETIME(3) NULL;

CREATE INDEX `Competition_tenantId_seasonId_code_idx`
  ON `competition`(`tenantId`, `seasonId`, `code`);

CREATE INDEX `Competition_tenantId_seasonId_title_idx`
  ON `competition`(`tenantId`, `seasonId`, `title`);
