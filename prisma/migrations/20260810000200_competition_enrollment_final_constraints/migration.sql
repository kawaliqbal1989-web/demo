-- Competition enrollment final constraints.
-- Prerequisite: Phase A applied and all legacy rows reconciled/validated.
-- This migration does not delete enrollment data.

ALTER TABLE `competitionenrollment`
  ADD INDEX `competitionenrollment_competitionId_idx` (`competitionId`);

ALTER TABLE `competitionenrollment`
  MODIFY `id` VARCHAR(191) NOT NULL,
  MODIFY `competitionCourseLevelId` VARCHAR(191) NOT NULL,
  MODIFY `enrolledLevelId` VARCHAR(191) NOT NULL,
  MODIFY `hierarchyNodeId` VARCHAR(191) NOT NULL,
  MODIFY `createdByUserId` VARCHAR(191) NOT NULL,
  MODIFY `isTemporary` BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE `competitionenrollment`
  ADD CONSTRAINT `competitionenrollment_tenant_comp_student_level_uq`
    UNIQUE (`tenantId`, `competitionId`, `studentId`, `competitionCourseLevelId`);

ALTER TABLE `competitionenrollment`
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`id`);

ALTER TABLE `competitionenrollment`
  ADD CONSTRAINT `competitionenrollment_course_level_fkey`
    FOREIGN KEY (`competitionCourseLevelId`) REFERENCES `competitioncourselevel` (`id`)
    ON DELETE NO ACTION ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionenrollment_enrolled_level_fkey`
    FOREIGN KEY (`enrolledLevelId`) REFERENCES `level` (`id`)
    ON DELETE NO ACTION ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionenrollment_hierarchy_node_fkey`
    FOREIGN KEY (`hierarchyNodeId`) REFERENCES `hierarchynode` (`id`)
    ON DELETE NO ACTION ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionenrollment_source_teacher_fkey`
    FOREIGN KEY (`sourceTeacherUserId`) REFERENCES `authuser` (`id`)
    ON DELETE NO ACTION ON UPDATE CASCADE,
  ADD CONSTRAINT `competitionenrollment_created_by_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `authuser` (`id`)
    ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE `competitionenrollmentlistitem`
  ADD CONSTRAINT `competitionenrollmentlistitem_enrollment_fkey`
    FOREIGN KEY (`enrollmentId`) REFERENCES `competitionenrollment` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
