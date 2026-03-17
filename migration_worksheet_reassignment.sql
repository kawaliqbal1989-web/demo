-- Migration: Worksheet Reassignment Request workflow
-- Adds WorksheetReassignmentRequest table with approval lifecycle

-- Step 1: Create the WorksheetReassignmentRequest table
CREATE TABLE IF NOT EXISTS `worksheetreassignmentrequest` (
  `id`                 VARCHAR(30)  NOT NULL,
  `tenantId`           VARCHAR(30)  NOT NULL,
  `studentId`          VARCHAR(30)  NOT NULL,
  `currentWorksheetId` VARCHAR(30)  NOT NULL,
  `type`               ENUM('RETRY','SWAP') NOT NULL DEFAULT 'RETRY',
  `newWorksheetId`     VARCHAR(30)  NULL,
  `reason`             TEXT         NOT NULL,
  `status`             ENUM('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `requestedByUserId`  VARCHAR(30)  NOT NULL,
  `reviewedByUserId`   VARCHAR(30)  NULL,
  `reviewReason`       TEXT         NULL,
  `reviewedAt`         DATETIME(3)  NULL,
  `createdAt`          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`          DATETIME(3)  NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Step 2: Add indexes
CREATE INDEX `WorksheetReassignmentRequest_tenantId_studentId_status_idx`
  ON `worksheetreassignmentrequest` (`tenantId`, `studentId`, `status`);

CREATE INDEX `WorksheetReassignmentRequest_tenantId_status_createdAt_idx`
  ON `worksheetreassignmentrequest` (`tenantId`, `status`, `createdAt`);

CREATE INDEX `WorksheetReassignmentRequest_tenantId_currentWorksheetId_idx`
  ON `worksheetreassignmentrequest` (`tenantId`, `currentWorksheetId`);

CREATE INDEX `WorksheetReassignmentRequest_requestedByUserId_idx`
  ON `worksheetreassignmentrequest` (`requestedByUserId`);

CREATE INDEX `WorksheetReassignmentRequest_reviewedByUserId_idx`
  ON `worksheetreassignmentrequest` (`reviewedByUserId`);

-- Step 3: Add foreign keys
ALTER TABLE `worksheetreassignmentrequest`
  ADD CONSTRAINT `WorksheetReassignmentRequest_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `WorksheetReassignmentRequest_studentId_fkey`
    FOREIGN KEY (`studentId`) REFERENCES `student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `WorksheetReassignmentRequest_currentWorksheetId_fkey`
    FOREIGN KEY (`currentWorksheetId`) REFERENCES `worksheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `WorksheetReassignmentRequest_newWorksheetId_fkey`
    FOREIGN KEY (`newWorksheetId`) REFERENCES `worksheet`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `WorksheetReassignmentRequest_requestedByUserId_fkey`
    FOREIGN KEY (`requestedByUserId`) REFERENCES `authuser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `WorksheetReassignmentRequest_reviewedByUserId_fkey`
    FOREIGN KEY (`reviewedByUserId`) REFERENCES `authuser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Verification
SELECT 'WorksheetReassignmentRequest table created' AS status;
SELECT COUNT(*) AS index_count FROM information_schema.STATISTICS
  WHERE TABLE_NAME = 'worksheetreassignmentrequest' AND TABLE_SCHEMA = DATABASE();
