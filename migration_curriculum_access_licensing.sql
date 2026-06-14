-- Curriculum Access Licensing Authority
-- Permanent licensing source of truth for center/franchise level caps.

ALTER TABLE franchiseprofile
  ADD COLUMN maxLicensedLevelRank INT NOT NULL DEFAULT 1,
  ADD COLUMN licenseStartDate DATETIME NULL,
  ADD COLUMN licenseExpiryDate DATETIME NULL,
  ADD COLUMN licenseNotes TEXT NULL;

ALTER TABLE centerprofile
  ADD COLUMN maxLicensedLevelRank INT NOT NULL DEFAULT 1,
  ADD COLUMN licenseStartDate DATETIME NULL,
  ADD COLUMN licenseExpiryDate DATETIME NULL,
  ADD COLUMN licenseNotes TEXT NULL;

-- Baseline backfill strategy: preserve continuity with minimum purchased access.
UPDATE franchiseprofile
SET maxLicensedLevelRank = 1
WHERE maxLicensedLevelRank IS NULL OR maxLicensedLevelRank < 1;

UPDATE centerprofile
SET maxLicensedLevelRank = 1
WHERE maxLicensedLevelRank IS NULL OR maxLicensedLevelRank < 1;
