ALTER TABLE `certificate`
  ADD COLUMN `courseId` VARCHAR(191) NULL,
  ADD COLUMN `courseSnapshot` JSON NULL,
  ADD COLUMN `levelSnapshot` JSON NULL;

CREATE INDEX `certificate_tenantId_courseId_issuedAt_idx`
  ON `certificate`(`tenantId`, `courseId`, `issuedAt`);

ALTER TABLE `certificate`
  ADD CONSTRAINT `certificate_courseId_fkey`
  FOREIGN KEY (`courseId`) REFERENCES `course`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;
