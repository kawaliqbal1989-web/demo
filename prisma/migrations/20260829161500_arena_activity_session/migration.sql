-- Virtual Abacus Arena raw completed-session persistence.
-- This generic activity record intentionally does not duplicate milestones,
-- engagement snapshots, worksheets, mock tests, or competition attempts.

CREATE TABLE `arenaactivitysession` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `activityKey` VARCHAR(191) NOT NULL,
  `mode` VARCHAR(191) NULL,
  `attemptCount` INTEGER NOT NULL DEFAULT 0,
  `correctCount` INTEGER NOT NULL DEFAULT 0,
  `accuracy` DECIMAL(5,2) NULL,
  `durationMs` INTEGER NULL,
  `metrics` JSON NULL,
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `aas_t_s_ct_i`(`tenantId`, `studentId`, `completedAt`),
  INDEX `aas_t_s_a_ct_i`(`tenantId`, `studentId`, `activityKey`, `completedAt`),
  INDEX `aas_t_a_ct_i`(`tenantId`, `activityKey`, `completedAt`),
  PRIMARY KEY (`id`),

  CONSTRAINT `arenaactivitysession_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT `arenaactivitysession_studentId_fkey`
    FOREIGN KEY (`studentId`) REFERENCES `student`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
