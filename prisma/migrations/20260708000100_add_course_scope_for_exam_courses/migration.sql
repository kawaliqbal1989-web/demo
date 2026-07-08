-- Add exam/general catalog discriminator on course.
ALTER TABLE `course`
  ADD COLUMN `scope` ENUM('GENERAL', 'EXAM') NOT NULL DEFAULT 'GENERAL';

CREATE INDEX `course_tenantId_scope_isActive_idx`
  ON `course` (`tenantId`, `scope`, `isActive`);
