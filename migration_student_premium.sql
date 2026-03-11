-- Phase 5: Student Premium Experience — StudentMilestone table
-- Run this migration against MySQL to create the milestone tracking table.

CREATE TABLE IF NOT EXISTS `student_milestones` (
  `id`          VARCHAR(30)  NOT NULL,
  `tenantId`    VARCHAR(30)  NOT NULL,
  `studentId`   VARCHAR(30)  NOT NULL,
  `key`         VARCHAR(100) NOT NULL,
  `title`       VARCHAR(200) NOT NULL,
  `description` VARCHAR(500) NULL,
  `icon`        VARCHAR(20)  NULL,
  `earnedAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `student_milestones_tenantId_studentId_key_key` (`tenantId`, `studentId`, `key`),
  INDEX `student_milestones_tenantId_studentId_earnedAt_idx` (`tenantId`, `studentId`, `earnedAt`),

  CONSTRAINT `student_milestones_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `student_milestones_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
