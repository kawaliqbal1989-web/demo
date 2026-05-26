-- verification.sql
-- Post-migration verification checks for academic engine changes.

SET @db := DATABASE();

-- 1) Required tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = @db
  AND table_name IN ('WorksheetTemplate', 'QuestionBank', 'Worksheet', 'WorksheetQuestion', 'WorksheetSubmission', 'LevelRule')
ORDER BY table_name;

-- 2) Required columns exist
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = @db
  AND (
    (table_name = 'Worksheet' AND column_name IN ('templateId')) OR
    (table_name = 'WorksheetQuestion' AND column_name IN ('questionBankId')) OR
    (table_name = 'WorksheetSubmission' AND column_name IN ('submittedAnswers', 'finalSubmittedAt', 'passed', 'evaluationHash')) OR
    (table_name = 'LevelRule' AND column_name IN ('totalQuestions', 'passThreshold', 'timeLimitSeconds'))
  )
ORDER BY table_name, column_name;

-- 3) Expected indexes exist
SELECT table_name, index_name, non_unique
FROM information_schema.statistics
WHERE table_schema = @db
  AND (
    (table_name = 'Worksheet' AND index_name = 'Worksheet_templateId_idx') OR
    (table_name = 'WorksheetQuestion' AND index_name = 'WorksheetQuestion_questionBankId_idx') OR
    (table_name = 'WorksheetTemplate' AND index_name IN ('WorksheetTemplate_tenantId_isActive_idx', 'WorksheetTemplate_tenantId_levelId_key')) OR
    (table_name = 'QuestionBank' AND index_name IN ('QuestionBank_tenantId_levelId_difficulty_isActive_idx', 'QuestionBank_templateId_idx', 'QuestionBank_tenantId_levelId_prompt_key'))
  )
ORDER BY table_name, index_name;

-- 4) Expected foreign keys exist
SELECT table_name, constraint_name, referenced_table_name
FROM information_schema.key_column_usage
WHERE table_schema = @db
  AND referenced_table_name IS NOT NULL
  AND constraint_name IN (
    'Worksheet_templateId_fkey',
    'WorksheetQuestion_questionBankId_fkey',
    'WorksheetTemplate_tenantId_fkey',
    'WorksheetTemplate_levelId_fkey',
    'QuestionBank_tenantId_fkey',
    'QuestionBank_levelId_fkey',
    'QuestionBank_templateId_fkey'
  )
ORDER BY table_name, constraint_name;

-- 5) Pre-flight data risk checks (must return 0 rows ideally)
-- 5a) Duplicate question prompts per tenant+level (breaks unique index)
SELECT tenantId, levelId, prompt, COUNT(*) AS duplicate_count
FROM QuestionBank
GROUP BY tenantId, levelId, prompt
HAVING COUNT(*) > 1;

-- 5b) Orphan Worksheet.templateId values (would block FK add)
SELECT w.id AS worksheetId, w.templateId
FROM Worksheet w
LEFT JOIN WorksheetTemplate wt ON wt.id = w.templateId
WHERE w.templateId IS NOT NULL AND wt.id IS NULL;

-- 5c) Orphan WorksheetQuestion.questionBankId values (would block FK add)
SELECT wq.id AS worksheetQuestionId, wq.questionBankId
FROM WorksheetQuestion wq
LEFT JOIN QuestionBank qb ON qb.id = wq.questionBankId
WHERE wq.questionBankId IS NOT NULL AND qb.id IS NULL;

SELECT 'Verification complete' AS status;
