ALTER TABLE `questionbank`
  ADD COLUMN `courseId` VARCHAR(191) NULL,
  ADD COLUMN `courseLevelId` VARCHAR(191) NULL;

ALTER TABLE `worksheet`
  ADD COLUMN `courseId` VARCHAR(191) NULL,
  ADD COLUMN `courseLevelId` VARCHAR(191) NULL;

CREATE INDEX `questionbank_courseId_idx` ON `questionbank`(`courseId`);
CREATE INDEX `questionbank_courseLevelId_idx` ON `questionbank`(`courseLevelId`);
CREATE INDEX `questionbank_tenantId_courseId_courseLevelId_levelId_isActive_idx`
  ON `questionbank`(`tenantId`, `courseId`, `courseLevelId`, `levelId`, `isActive`);

CREATE INDEX `worksheet_courseId_idx` ON `worksheet`(`courseId`);
CREATE INDEX `worksheet_courseLevelId_idx` ON `worksheet`(`courseLevelId`);
CREATE INDEX `ws_tenant_course_level_cycle_pref_idx`
  ON `worksheet`(`tenantId`(150), `courseId`(150), `courseLevelId`(150), `levelId`(150), `examCycleId`(150));

ALTER TABLE `questionbank`
  ADD CONSTRAINT `questionbank_courseId_fkey`
  FOREIGN KEY (`courseId`) REFERENCES `course`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `questionbank_courseLevelId_fkey`
  FOREIGN KEY (`courseLevelId`) REFERENCES `courselevel`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `worksheet`
  ADD CONSTRAINT `worksheet_courseId_fkey`
  FOREIGN KEY (`courseId`) REFERENCES `course`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `worksheet_courseLevelId_fkey`
  FOREIGN KEY (`courseLevelId`) REFERENCES `courselevel`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
