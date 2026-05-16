-- migration_center_capacity_schema_restore.sql
-- Restores the CenterCapacity table required by capacity governance endpoints.
-- Idempotent, MySQL compatible.

CREATE TABLE IF NOT EXISTS `centercapacity` (
  `id` VARCHAR(191) NOT NULL,
  `centerId` VARCHAR(191) NOT NULL,
  `maxTeachers` INT NOT NULL DEFAULT 0,
  `maxStudents` INT NOT NULL DEFAULT 0,
  `allowOverAllocation` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `centercapacity_centerId_key`(`centerId`),
  INDEX `centercapacity_updatedAt_idx`(`updatedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CenterCapacity_centerId_fkey`
    FOREIGN KEY (`centerId`) REFERENCES `centerprofile`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;