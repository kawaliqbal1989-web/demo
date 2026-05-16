-- migration_report_export_job_status_enum_restore.sql
-- Restores the reportexportjob.status enum so retry-capable worker flows can persist RETRY_WAIT.
-- Idempotent, MySQL compatible.

SET @db := DATABASE();

SET @status_column_type := (
  SELECT column_type
  FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'reportexportjob'
    AND column_name = 'status'
  LIMIT 1
);

SET @sql := IF(
  @status_column_type IS NULL,
  "SELECT 'reportexportjob.status missing'",
  IF(
    LOCATE("'RETRY_WAIT'", @status_column_type) > 0,
    "SELECT 'reportexportjob.status already supports RETRY_WAIT'",
    "ALTER TABLE `reportexportjob` MODIFY COLUMN `status` ENUM('QUEUED','PROCESSING','RETRY_WAIT','COMPLETED','FAILED','CANCELLED','EXPIRED') NOT NULL DEFAULT 'QUEUED'"
  )
);

PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;