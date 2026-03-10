ALTER TABLE `WorksheetAssignment`
  ADD COLUMN `dueDate` DATETIME(3) NULL AFTER `assignedAt`;

CREATE INDEX `WorksheetAssignment_tenantId_studentId_dueDate_idx`
  ON `WorksheetAssignment` (`tenantId`, `studentId`, `dueDate`);
