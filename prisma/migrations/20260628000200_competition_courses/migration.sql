CREATE TABLE `competitioncourse` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` VARCHAR(191) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `competitioncourse_tenantId_code_key` (`tenantId`, `code`),
  INDEX `competitioncourse_tenantId_isActive_idx` (`tenantId`, `isActive`),

  CONSTRAINT `competitioncourse_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `competitioncourselevel` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `competitionCourseId` VARCHAR(191) NOT NULL,
  `levelNumber` INT NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` VARCHAR(191) NULL,
  `sortOrder` INT NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `competitioncourselevel_competitionCourseId_levelNumber_key` (`competitionCourseId`, `levelNumber`),
  INDEX `competitioncourselevel_tenantId_competitionCourseId_isActive_idx` (`tenantId`, `competitionCourseId`, `isActive`),
  INDEX `competitioncourselevel_tenantId_createdAt_id_idx` (`tenantId`, `createdAt`, `id`),

  CONSTRAINT `competitioncourselevel_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `competitioncourselevel_competitionCourseId_fkey`
    FOREIGN KEY (`competitionCourseId`) REFERENCES `competitioncourse`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `competition`
  ADD COLUMN `competitionCourseId` VARCHAR(191) NULL;

CREATE INDEX `competition_tenantId_competitionCourseId_idx`
  ON `competition`(`tenantId`, `competitionCourseId`);

ALTER TABLE `competition`
  ADD CONSTRAINT `competition_competitionCourseId_fkey`
  FOREIGN KEY (`competitionCourseId`) REFERENCES `competitioncourse`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;
