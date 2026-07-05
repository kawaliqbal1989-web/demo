-- AlterTable
ALTER TABLE `examenrollmententry`
  ADD COLUMN `allowSecondAttempt` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `attemptOverride` VARCHAR(191) NULL,
  ADD COLUMN `secondAttemptGrantedAt` DATETIME(3) NULL,
  ADD COLUMN `secondAttemptGrantedByUserId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `worksheetsubmission`
  ADD COLUMN `attemptNo` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `supersededAt` DATETIME(3) NULL,
  ADD COLUMN `supersededByUserId` VARCHAR(191) NULL;

-- DropIndex
DROP INDEX `WorksheetSubmission_worksheetId_studentId_key` ON `worksheetsubmission`;

-- CreateIndex
CREATE UNIQUE INDEX `worksheet_submission_attempt_uq` ON `worksheetsubmission`(`worksheetId`, `studentId`, `attemptNo`);
