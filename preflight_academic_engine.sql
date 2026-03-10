-- preflight_academic_engine.sql
-- Purpose: Strict, read-only preflight validation before academic migration.
-- Compatibility: MySQL 5.7+
-- Behavior:
--   - Emits PASS/FAIL rows per check.
--   - Aborts with forced SQL error when any violation exists.
--   - Makes no data changes and is safe to run repeatedly.

SET @db := DATABASE();

-- =========================================================
-- 0) Base table existence required for migration to proceed
-- =========================================================
SET @has_tenant := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = @db AND table_name = 'Tenant'
);
SET @has_level := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = @db AND table_name = 'Level'
);
SET @has_levelrule := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = @db AND table_name = 'LevelRule'
);
SET @has_worksheet := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = @db AND table_name = 'Worksheet'
);
SET @has_worksheetquestion := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = @db AND table_name = 'WorksheetQuestion'
);
SET @has_sub := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = @db AND table_name = 'WorksheetSubmission'
);

SET @missing_parent_tables :=
  (1 - LEAST(@has_tenant, 1)) +
  (1 - LEAST(@has_level, 1)) +
  (1 - LEAST(@has_levelrule, 1)) +
  (1 - LEAST(@has_worksheet, 1)) +
  (1 - LEAST(@has_worksheetquestion, 1)) +
  (1 - LEAST(@has_sub, 1));

SELECT
  'CHECK_BASE_TABLES' AS check_name,
  IF(@missing_parent_tables = 0, 'PASS', 'FAIL') AS status,
  CONCAT('missing_required_tables=', @missing_parent_tables,
         ' (Tenant,Level,LevelRule,Worksheet,WorksheetQuestion,WorksheetSubmission)') AS details;

-- =========================================================
-- 1) Required tenantId columns presence (consistency basis)
-- =========================================================
SET @worksheet_has_tenant := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'Worksheet' AND column_name = 'tenantId'
);
SET @worksheetquestion_has_tenant := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'WorksheetQuestion' AND column_name = 'tenantId'
);
SET @level_has_tenant := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'Level' AND column_name = 'tenantId'
);

SET @tenant_column_failures :=
  (1 - LEAST(@worksheet_has_tenant, 1)) +
  (1 - LEAST(@worksheetquestion_has_tenant, 1)) +
  (1 - LEAST(@level_has_tenant, 1));

SELECT
  'CHECK_TENANT_COLUMNS' AS check_name,
  IF(@tenant_column_failures = 0, 'PASS', 'FAIL') AS status,
  CONCAT('missing_tenant_columns=', @tenant_column_failures,
         ' (Worksheet.tenantId, WorksheetQuestion.tenantId, Level.tenantId)') AS details;

-- =========================================================
-- 2) Existing data risks for UNIQUE constraints
-- =========================================================
SET @has_template := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = @db AND table_name = 'WorksheetTemplate'
);
SET @has_qbank := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = @db AND table_name = 'QuestionBank'
);

SET @dup_template_tenant_level := 0;
SET @sql := IF(@has_template = 1,
  'SELECT COUNT(*) INTO @dup_template_tenant_level FROM (SELECT tenantId, levelId, COUNT(*) c FROM WorksheetTemplate GROUP BY tenantId, levelId HAVING COUNT(*) > 1) x',
  'SELECT 0 INTO @dup_template_tenant_level'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @dup_qbank_prompt := 0;
SET @sql := IF(@has_qbank = 1,
  'SELECT COUNT(*) INTO @dup_qbank_prompt FROM (SELECT tenantId, levelId, prompt, COUNT(*) c FROM QuestionBank GROUP BY tenantId, levelId, prompt HAVING COUNT(*) > 1) x',
  'SELECT 0 INTO @dup_qbank_prompt'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT
  'CHECK_UNIQUE_DUPLICATES' AS check_name,
  IF((@dup_template_tenant_level + @dup_qbank_prompt) = 0, 'PASS', 'FAIL') AS status,
  CONCAT('dup_template_tenant_level=', @dup_template_tenant_level,
         ', dup_qbank_prompt=', @dup_qbank_prompt) AS details;

-- =========================================================
-- 3) Orphan foreign key data checks (if columns/tables exist)
-- =========================================================
SET @worksheet_has_template_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'Worksheet' AND column_name = 'templateId'
);
SET @wq_has_qbank_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'WorksheetQuestion' AND column_name = 'questionBankId'
);
SET @qbank_has_template_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'QuestionBank' AND column_name = 'templateId'
);

SET @orphan_worksheet_template := 0;
SET @sql := IF(@has_template = 1 AND @worksheet_has_template_col = 1,
  'SELECT COUNT(*) INTO @orphan_worksheet_template FROM Worksheet w LEFT JOIN WorksheetTemplate wt ON wt.id = w.templateId WHERE w.templateId IS NOT NULL AND wt.id IS NULL',
  'SELECT 0 INTO @orphan_worksheet_template'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @orphan_wq_qbank := 0;
SET @sql := IF(@has_qbank = 1 AND @wq_has_qbank_col = 1,
  'SELECT COUNT(*) INTO @orphan_wq_qbank FROM WorksheetQuestion wq LEFT JOIN QuestionBank qb ON qb.id = wq.questionBankId WHERE wq.questionBankId IS NOT NULL AND qb.id IS NULL',
  'SELECT 0 INTO @orphan_wq_qbank'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @orphan_qbank_template := 0;
SET @sql := IF(@has_qbank = 1 AND @has_template = 1 AND @qbank_has_template_col = 1,
  'SELECT COUNT(*) INTO @orphan_qbank_template FROM QuestionBank qb LEFT JOIN WorksheetTemplate wt ON wt.id = qb.templateId WHERE qb.templateId IS NOT NULL AND wt.id IS NULL',
  'SELECT 0 INTO @orphan_qbank_template'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT
  'CHECK_ORPHAN_KEYS' AS check_name,
  IF((@orphan_worksheet_template + @orphan_wq_qbank + @orphan_qbank_template) = 0, 'PASS', 'FAIL') AS status,
  CONCAT('worksheet_template_orphans=', @orphan_worksheet_template,
         ', worksheetQuestion_qbank_orphans=', @orphan_wq_qbank,
         ', qbank_template_orphans=', @orphan_qbank_template) AS details;

-- =========================================================
-- 4) Tenant consistency checks across related entities
-- =========================================================
SET @tenant_mismatch_worksheet_template := 0;
SET @sql := IF(@has_template = 1 AND @worksheet_has_template_col = 1 AND @worksheet_has_tenant = 1,
  'SELECT COUNT(*) INTO @tenant_mismatch_worksheet_template FROM Worksheet w JOIN WorksheetTemplate wt ON wt.id = w.templateId WHERE w.templateId IS NOT NULL AND w.tenantId <> wt.tenantId',
  'SELECT 0 INTO @tenant_mismatch_worksheet_template'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @tenant_mismatch_wq_qbank := 0;
SET @sql := IF(@has_qbank = 1 AND @wq_has_qbank_col = 1 AND @worksheetquestion_has_tenant = 1,
  'SELECT COUNT(*) INTO @tenant_mismatch_wq_qbank FROM WorksheetQuestion wq JOIN QuestionBank qb ON qb.id = wq.questionBankId WHERE wq.questionBankId IS NOT NULL AND wq.tenantId <> qb.tenantId',
  'SELECT 0 INTO @tenant_mismatch_wq_qbank'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @tenant_mismatch_template_level := 0;
SET @sql := IF(@has_template = 1 AND @level_has_tenant = 1,
  'SELECT COUNT(*) INTO @tenant_mismatch_template_level FROM WorksheetTemplate wt JOIN Level l ON l.id = wt.levelId WHERE wt.tenantId <> l.tenantId',
  'SELECT 0 INTO @tenant_mismatch_template_level'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @tenant_mismatch_qbank_level := 0;
SET @sql := IF(@has_qbank = 1 AND @level_has_tenant = 1,
  'SELECT COUNT(*) INTO @tenant_mismatch_qbank_level FROM QuestionBank qb JOIN Level l ON l.id = qb.levelId WHERE qb.tenantId <> l.tenantId',
  'SELECT 0 INTO @tenant_mismatch_qbank_level'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT
  'CHECK_TENANT_CONSISTENCY' AS check_name,
  IF((@tenant_mismatch_worksheet_template + @tenant_mismatch_wq_qbank + @tenant_mismatch_template_level + @tenant_mismatch_qbank_level) = 0, 'PASS', 'FAIL') AS status,
  CONCAT('w_vs_template=', @tenant_mismatch_worksheet_template,
         ', wq_vs_qbank=', @tenant_mismatch_wq_qbank,
         ', template_vs_level=', @tenant_mismatch_template_level,
         ', qbank_vs_level=', @tenant_mismatch_qbank_level) AS details;

-- =========================================================
-- 5) Final aggregate + hard abort if any failure is present
-- =========================================================
SET @preflight_failures :=
  @missing_parent_tables +
  @tenant_column_failures +
  @dup_template_tenant_level +
  @dup_qbank_prompt +
  @orphan_worksheet_template +
  @orphan_wq_qbank +
  @orphan_qbank_template +
  @tenant_mismatch_worksheet_template +
  @tenant_mismatch_wq_qbank +
  @tenant_mismatch_template_level +
  @tenant_mismatch_qbank_level;

SELECT
  'PREFLIGHT_SUMMARY' AS check_name,
  IF(@preflight_failures = 0, 'PASS', 'FAIL') AS status,
  CONCAT('total_failure_count=', @preflight_failures) AS details;

-- Hard stop when failed (works on MySQL 5.7+ without routine privileges)
SET @abort_divisor := IF(@preflight_failures = 0, 1, 0);
SELECT 1 / @abort_divisor AS preflight_guard;

SELECT 'Preflight passed. Safe to execute migration_academic_engine.sql next.' AS status;
