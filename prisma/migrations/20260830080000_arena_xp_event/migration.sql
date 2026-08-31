-- Arena XP V1: immutable, tenant/student-scoped XP reward events.
-- Arena Level is derived from SUM(xp); academic Student.levelId is untouched.

CREATE TABLE `studentarenaxpevent` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `eventKey` VARCHAR(191) NOT NULL,
  `sourceType` VARCHAR(191) NOT NULL,
  `sourceId` VARCHAR(191) NOT NULL,
  `xp` INTEGER NOT NULL,
  `earnedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `saxe_t_s_ek_uq`(`tenantId`, `studentId`, `eventKey`),
  INDEX `saxe_t_s_ea_i`(`tenantId`, `studentId`, `earnedAt`),
  INDEX `saxe_t_st_sid_i`(`tenantId`, `sourceType`, `sourceId`),
  PRIMARY KEY (`id`),

  CONSTRAINT `studentarenaxpevent_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT `studentarenaxpevent_studentId_fkey`
    FOREIGN KEY (`studentId`) REFERENCES `student`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
