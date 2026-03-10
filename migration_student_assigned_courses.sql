CREATE TABLE `StudentAssignedCourse` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `courseId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `StudentAssignedCourse_tenantId_studentId_courseId_key` (`tenantId`, `studentId`, `courseId`),
  KEY `StudentAssignedCourse_tenantId_studentId_idx` (`tenantId`, `studentId`),
  KEY `StudentAssignedCourse_tenantId_courseId_idx` (`tenantId`, `courseId`),
  CONSTRAINT `StudentAssignedCourse_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `StudentAssignedCourse_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `StudentAssignedCourse_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;