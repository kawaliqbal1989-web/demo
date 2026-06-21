-- Allow decimal correct answers in QuestionBank and WorksheetQuestion.
-- Uses information_schema checks so repeated runs are safe.
SET @db := DATABASE();

SET @has_questionbank := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = @db
    AND table_name = 'questionbank'
);
SET @sql_questionbank := IF(
  @has_questionbank > 0,
  'ALTER TABLE `questionbank` MODIFY COLUMN `correctAnswer` DOUBLE NOT NULL',
  'SELECT ''questionbank table missing, skip'''
);
PREPARE stmt_questionbank FROM @sql_questionbank;
EXECUTE stmt_questionbank;
DEALLOCATE PREPARE stmt_questionbank;

SET @has_worksheetquestion := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = @db
    AND table_name = 'worksheetquestion'
);
SET @sql_worksheetquestion := IF(
  @has_worksheetquestion > 0,
  'ALTER TABLE `worksheetquestion` MODIFY COLUMN `correctAnswer` DOUBLE NOT NULL',
  'SELECT ''worksheetquestion table missing, skip'''
);
PREPARE stmt_worksheetquestion FROM @sql_worksheetquestion;
EXECUTE stmt_worksheetquestion;
DEALLOCATE PREPARE stmt_worksheetquestion;
