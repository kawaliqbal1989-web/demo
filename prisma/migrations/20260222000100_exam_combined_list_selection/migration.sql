-- Center can select/unselect students in combined enrollment list
ALTER TABLE `ExamEnrollmentListItem` ADD COLUMN `included` BOOLEAN NOT NULL DEFAULT true;
