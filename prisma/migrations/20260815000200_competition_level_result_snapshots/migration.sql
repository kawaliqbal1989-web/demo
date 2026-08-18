-- Phase 3E D5.8: stable per-participation Competition result snapshots.

ALTER TABLE `competitionenrollment`
  ADD COLUMN `resultCompletionTimeSeconds` INTEGER NULL,
  ADD COLUMN `resultSubmissionId` VARCHAR(191) NULL,
  ADD COLUMN `resultCalculatedAt` DATETIME(3) NULL;

CREATE INDEX `competitionenrollment_result_rank_idx`
  ON `competitionenrollment`(`tenantId`, `competitionId`, `competitionCourseLevelId`, `rank`);

CREATE INDEX `competitionenrollment_result_submission_idx`
  ON `competitionenrollment`(`resultSubmissionId`);
