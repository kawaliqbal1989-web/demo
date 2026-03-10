-- CreateTable
CREATE TABLE `TeacherNote` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `hierarchyNodeId` VARCHAR(191) NOT NULL,
  `teacherUserId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `note` TEXT NOT NULL,
  `tags` JSON NULL,
  `isDeleted` BOOLEAN NOT NULL DEFAULT false,
  `deletedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `TeacherNote_tenantId_hierarchyNodeId_createdAt_idx`(`tenantId`, `hierarchyNodeId`, `createdAt`),
  INDEX `TeacherNote_tenantId_teacherUserId_createdAt_idx`(`tenantId`, `teacherUserId`, `createdAt`),
  INDEX `TeacherNote_tenantId_studentId_createdAt_idx`(`tenantId`, `studentId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TeacherNote` ADD CONSTRAINT `TeacherNote_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `TeacherNote` ADD CONSTRAINT `TeacherNote_hierarchyNodeId_fkey` FOREIGN KEY (`hierarchyNodeId`) REFERENCES `HierarchyNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TeacherNote` ADD CONSTRAINT `TeacherNote_teacherUserId_fkey` FOREIGN KEY (`teacherUserId`) REFERENCES `AuthUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TeacherNote` ADD CONSTRAINT `TeacherNote_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
