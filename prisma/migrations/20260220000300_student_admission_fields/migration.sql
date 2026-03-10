-- Add student admission fields used by center/school role
ALTER TABLE `Student` ADD COLUMN `guardianName` VARCHAR(191) NULL;
ALTER TABLE `Student` ADD COLUMN `guardianPhone` VARCHAR(191) NULL;
ALTER TABLE `Student` ADD COLUMN `address` VARCHAR(191) NULL;
