-- Add optional AuthUser linkage to Superadmin identity model
ALTER TABLE `Superadmin`
  ADD COLUMN `authUserId` VARCHAR(191) NULL;

-- Backfill using tenant+email match where possible
UPDATE `Superadmin` s
JOIN `AuthUser` u
  ON u.`tenantId` = s.`tenantId`
 AND u.`email` = s.`email`
SET s.`authUserId` = u.`id`
WHERE s.`authUserId` IS NULL;

-- Enforce uniqueness and referential integrity for linked identities
CREATE UNIQUE INDEX `Superadmin_authUserId_key` ON `Superadmin`(`authUserId`);

ALTER TABLE `Superadmin`
  ADD CONSTRAINT `Superadmin_authUserId_fkey`
  FOREIGN KEY (`authUserId`) REFERENCES `AuthUser`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
