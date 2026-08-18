-- Competition Phase A additive repair.
-- Prepared only: do not apply until legacy enrollment reconciliation is approved.
-- This migration deliberately preserves the legacy CompetitionEnrollment primary key.

ALTER TABLE `competitionenrollment`
  ADD COLUMN `id` VARCHAR(191) NULL,
  ADD COLUMN `competitionCourseLevelId` VARCHAR(191) NULL,
  ADD COLUMN `enrolledLevelId` VARCHAR(191) NULL,
  ADD COLUMN `hierarchyNodeId` VARCHAR(191) NULL,
  ADD COLUMN `sourceTeacherUserId` VARCHAR(191) NULL,
  ADD COLUMN `createdByUserId` VARCHAR(191) NULL,
  ADD COLUMN `isTemporary` BOOLEAN NULL DEFAULT FALSE,
  ADD COLUMN `approvedAt` DATETIME(3) NULL;

-- This is not the final student-level uniqueness constraint. Multiple NULL
-- legacy values remain valid, while newly created participation IDs are unique.
CREATE UNIQUE INDEX `competitionenrollment_id_key`
  ON `competitionenrollment` (`id`);

CREATE INDEX `competitionenrollment_tenant_comp_active_idx`
  ON `competitionenrollment` (`tenantId`, `competitionId`, `isActive`);
CREATE INDEX `competitionenrollment_tenant_node_active_idx`
  ON `competitionenrollment` (`tenantId`, `hierarchyNodeId`, `isActive`);
CREATE INDEX `competitionenrollment_tenant_level_active_idx`
  ON `competitionenrollment` (`tenantId`, `enrolledLevelId`, `isActive`);
CREATE INDEX `competitionenrollment_tenant_teacher_idx`
  ON `competitionenrollment` (`tenantId`, `sourceTeacherUserId`);

ALTER TABLE `student`
  ADD COLUMN `isTemporaryCompetition` BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE `competitionenrollmentlist` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `competitionId` VARCHAR(191) NOT NULL,
  `type` ENUM('TEACHER', 'CENTER_COMBINED') NOT NULL,
  `scopeKey` VARCHAR(191) NOT NULL,
  `hierarchyNodeId` VARCHAR(191) NOT NULL,
  `teacherUserId` VARCHAR(191) NULL,
  `status` ENUM('DRAFT', 'SUBMITTED_TO_CENTER', 'SUBMITTED_TO_FRANCHISE', 'SUBMITTED_TO_BUSINESS_PARTNER', 'SUBMITTED_TO_SUPERADMIN', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
  `locked` BOOLEAN NOT NULL DEFAULT FALSE,
  `submittedAt` DATETIME(3) NULL,
  `forwardedAt` DATETIME(3) NULL,
  `approvedAt` DATETIME(3) NULL,
  `rejectedAt` DATETIME(3) NULL,
  `rejectedByUserId` VARCHAR(191) NULL,
  `rejectedRemark` VARCHAR(191) NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `competitionenrollmentlist_tenant_comp_scope_uq` (`tenantId`, `competitionId`, `scopeKey`),
  INDEX `competitionenrollmentlist_tenant_comp_status_idx` (`tenantId`, `competitionId`, `status`),
  INDEX `competitionenrollmentlist_tenant_node_status_idx` (`tenantId`, `hierarchyNodeId`, `status`),
  INDEX `competitionenrollmentlist_teacher_idx` (`teacherUserId`),

  CONSTRAINT `competitionenrollmentlist_tenant_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `competitionenrollmentlist_competition_fkey` FOREIGN KEY (`competitionId`) REFERENCES `competition` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `competitionenrollmentlist_node_fkey` FOREIGN KEY (`hierarchyNodeId`) REFERENCES `hierarchynode` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `competitionenrollmentlist_teacher_fkey` FOREIGN KEY (`teacherUserId`) REFERENCES `authuser` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `competitionenrollmentlist_created_by_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `authuser` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `competitionenrollmentlist_rejected_by_fkey` FOREIGN KEY (`rejectedByUserId`) REFERENCES `authuser` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `competitionenrollmentlistitem` (
  `tenantId` VARCHAR(191) NOT NULL,
  `listId` VARCHAR(191) NOT NULL,
  `enrollmentId` VARCHAR(191) NOT NULL,
  `included` BOOLEAN NOT NULL DEFAULT TRUE,
  `exclusionReason` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`listId`, `enrollmentId`),
  INDEX `competitionenrollmentlistitem_tenant_created_idx` (`tenantId`, `createdAt`),
  INDEX `competitionenrollmentlistitem_enrollment_idx` (`enrollmentId`),

  CONSTRAINT `competitionenrollmentlistitem_tenant_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `competitionenrollmentlistitem_list_fkey` FOREIGN KEY (`listId`) REFERENCES `competitionenrollmentlist` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Intentionally deferred: enrollment foreign keys, final NOT NULL fields,
-- replacement primary key, and the student-level participation unique key.
