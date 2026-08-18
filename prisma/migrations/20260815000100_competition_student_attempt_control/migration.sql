-- Phase 3E D5.7: strict Competition student attempt control.
-- Safe for the current MySQL contract after 20260704000100_second_attempt_support.

ALTER TABLE `competition`
  ADD COLUMN `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Kolkata';

ALTER TABLE `competitionenrollment`
  ADD COLUMN `attemptLimitOverride` INTEGER NULL,
  ADD COLUMN `extraAttemptGrantedAt` DATETIME(3) NULL,
  ADD COLUMN `extraAttemptGrantedByUserId` VARCHAR(191) NULL,
  ADD COLUMN `extraAttemptReason` VARCHAR(512) NULL;

CREATE INDEX `competitionenrollment_extra_attempt_granted_by_idx`
  ON `competitionenrollment`(`extraAttemptGrantedByUserId`);

ALTER TABLE `competitionenrollment`
  ADD CONSTRAINT `competitionenrollment_extra_attempt_granted_by_fkey`
  FOREIGN KEY (`extraAttemptGrantedByUserId`) REFERENCES `authuser`(`id`)
  ON DELETE NO ACTION ON UPDATE CASCADE;
