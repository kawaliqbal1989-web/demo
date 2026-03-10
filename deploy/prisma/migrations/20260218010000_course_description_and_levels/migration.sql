-- Add optional description to Course
ALTER TABLE `Course`
  ADD COLUMN `description` TEXT NULL;

-- Create CourseLevel (course-specific levels 1-8)
CREATE TABLE `CourseLevel` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `courseId` VARCHAR(191) NOT NULL,
  `levelNumber` INT NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `sortOrder` INT NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `CourseLevel_courseId_levelNumber_key` (`courseId`, `levelNumber`),
  INDEX `CourseLevel_tenantId_courseId_isActive_idx` (`tenantId`, `courseId`, `isActive`),
  INDEX `CourseLevel_tenantId_createdAt_id_idx` (`tenantId`, `createdAt`, `id`),
  CONSTRAINT `CourseLevel_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CourseLevel_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
