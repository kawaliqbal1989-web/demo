UPDATE `batch`
SET `status` = 'PAUSED'
WHERE `status` = 'INACTIVE';

ALTER TABLE `batch`
  MODIFY COLUMN `status` ENUM('ACTIVE','UPCOMING','PAUSED','COMPLETED','ARCHIVED','TRIAL')
  NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE `batch`
  ADD COLUMN `modality` ENUM('ONLINE','OFFLINE','HYBRID') NULL AFTER `name`,
  ADD COLUMN `levelId` VARCHAR(191) NULL AFTER `modality`,
  ADD COLUMN `primaryTeacherUserId` VARCHAR(191) NULL AFTER `levelId`,
  ADD COLUMN `maxStudents` INT NULL AFTER `primaryTeacherUserId`,
  ADD COLUMN `durationMinutes` INT NULL AFTER `maxStudents`,
  ADD COLUMN `tags` JSON NULL AFTER `schedule`,
  ADD COLUMN `notes` TEXT NULL AFTER `tags`,
  ADD COLUMN `archivedAt` DATETIME(3) NULL AFTER `isActive`,
  ADD COLUMN `archivedByUserId` VARCHAR(191) NULL AFTER `archivedAt`,
  ADD COLUMN `deletedAt` DATETIME(3) NULL AFTER `archivedByUserId`,
  ADD COLUMN `deletedByUserId` VARCHAR(191) NULL AFTER `deletedAt`;

CREATE TABLE `batchscheduleslot` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(191) NOT NULL,
  `dayOfWeek` INT NOT NULL,
  `startTime` INT NOT NULL,
  `endTime` INT NOT NULL,
  `roomId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `batch`
  ADD CONSTRAINT `batch_levelId_fkey`
    FOREIGN KEY (`levelId`) REFERENCES `level`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `batch_primaryTeacherUserId_fkey`
    FOREIGN KEY (`primaryTeacherUserId`) REFERENCES `authuser`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `batch_archivedByUserId_fkey`
    FOREIGN KEY (`archivedByUserId`) REFERENCES `authuser`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `batch_deletedByUserId_fkey`
    FOREIGN KEY (`deletedByUserId`) REFERENCES `authuser`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `batchscheduleslot`
  ADD CONSTRAINT `batchscheduleslot_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `batchscheduleslot_batchId_fkey`
    FOREIGN KEY (`batchId`) REFERENCES `batch`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX `batch_tenantId_hierarchyNodeId_status_deletedAt_createdAt_idx`
  ON `batch` (`tenantId`, `hierarchyNodeId`, `status`, `deletedAt`, `createdAt`);

CREATE INDEX `batch_tenantId_primaryTeacherUserId_status_deletedAt_idx`
  ON `batch` (`tenantId`, `primaryTeacherUserId`, `status`, `deletedAt`);

CREATE INDEX `batch_tenantId_levelId_status_deletedAt_idx`
  ON `batch` (`tenantId`, `levelId`, `status`, `deletedAt`);

CREATE INDEX `batch_tenantId_modality_status_deletedAt_idx`
  ON `batch` (`tenantId`, `modality`, `status`, `deletedAt`);

CREATE INDEX `batchscheduleslot_tenantId_batchId_dayOfWeek_idx`
  ON `batchscheduleslot` (`tenantId`, `batchId`, `dayOfWeek`);

CREATE INDEX `batchscheduleslot_tenantId_dayOfWeek_startTime_endTime_idx`
  ON `batchscheduleslot` (`tenantId`, `dayOfWeek`, `startTime`, `endTime`);

CREATE INDEX `batchscheduleslot_tenantId_roomId_dayOfWeek_startTime_idx`
  ON `batchscheduleslot` (`tenantId`, `roomId`, `dayOfWeek`, `startTime`);

CREATE INDEX `batchteacherassignment_tenantId_teacherUserId_batchId_idx`
  ON `batchteacherassignment` (`tenantId`, `teacherUserId`, `batchId`);

CREATE INDEX `enrollment_tenantId_batchId_status_assignedTeacherUserId_idx`
  ON `enrollment` (`tenantId`, `batchId`, `status`, `assignedTeacherUserId`);

UPDATE `batch`
SET `modality` = CASE
  WHEN LOWER(`name`) LIKE '%online%' THEN 'ONLINE'
  WHEN LOWER(`name`) LIKE '%offline%' THEN 'OFFLINE'
  ELSE NULL
END
WHERE `modality` IS NULL;