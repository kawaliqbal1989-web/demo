SET @has_businesspartner_logo_file_path = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'businesspartner'
    AND column_name = 'logoFilePath'
);
SET @businesspartner_logo_file_path_sql = IF(
  @has_businesspartner_logo_file_path = 0,
  'ALTER TABLE `businesspartner` ADD COLUMN `logoFilePath` VARCHAR(255) NULL AFTER `logoPath`',
  'SELECT 1'
);
PREPARE businesspartner_logo_file_path_stmt FROM @businesspartner_logo_file_path_sql;
EXECUTE businesspartner_logo_file_path_stmt;
DEALLOCATE PREPARE businesspartner_logo_file_path_stmt;

SET @has_franchiseprofile_logo_file_path = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'franchiseprofile'
    AND column_name = 'logoFilePath'
);
SET @franchiseprofile_logo_file_path_sql = IF(
  @has_franchiseprofile_logo_file_path = 0,
  'ALTER TABLE `franchiseprofile` ADD COLUMN `logoFilePath` VARCHAR(255) NULL AFTER `logoPath`',
  'SELECT 1'
);
PREPARE franchiseprofile_logo_file_path_stmt FROM @franchiseprofile_logo_file_path_sql;
EXECUTE franchiseprofile_logo_file_path_stmt;
DEALLOCATE PREPARE franchiseprofile_logo_file_path_stmt;

SET @has_centerprofile_logo_file_path = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'centerprofile'
    AND column_name = 'logoFilePath'
);
SET @centerprofile_logo_file_path_sql = IF(
  @has_centerprofile_logo_file_path = 0,
  'ALTER TABLE `centerprofile` ADD COLUMN `logoFilePath` VARCHAR(255) NULL AFTER `logoPath`',
  'SELECT 1'
);
PREPARE centerprofile_logo_file_path_stmt FROM @centerprofile_logo_file_path_sql;
EXECUTE centerprofile_logo_file_path_stmt;
DEALLOCATE PREPARE centerprofile_logo_file_path_stmt;

UPDATE `businesspartner`
SET `logoFilePath` = CONCAT('business-partner-logos/', `logoPath`)
WHERE `logoFilePath` IS NULL
  AND `logoPath` IS NOT NULL
  AND TRIM(`logoPath`) <> '';

UPDATE `franchiseprofile`
SET `logoFilePath` = CONCAT('franchise-logos/', `logoPath`)
WHERE `logoFilePath` IS NULL
  AND `logoPath` IS NOT NULL
  AND TRIM(`logoPath`) <> '';

UPDATE `centerprofile`
SET `logoFilePath` = CONCAT('logos/', `logoPath`)
WHERE `logoFilePath` IS NULL
  AND `logoPath` IS NOT NULL
  AND TRIM(`logoPath`) <> '';