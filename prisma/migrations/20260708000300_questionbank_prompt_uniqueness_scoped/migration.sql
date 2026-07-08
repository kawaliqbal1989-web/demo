ALTER TABLE `questionbank`
  ADD COLUMN `promptScopeKey` CHAR(64) NULL;

UPDATE `questionbank`
SET `promptScopeKey` = SHA2(CONCAT_WS('|', COALESCE(`courseId`, 'LEGACY'), COALESCE(`courseLevelId`, 'LEGACY'), COALESCE(`prompt`, '')), 256)
WHERE `promptScopeKey` IS NULL;

ALTER TABLE `questionbank`
  MODIFY COLUMN `promptScopeKey` CHAR(64) NOT NULL;

SET @legacy_prompt_uq_name := (
  SELECT stats.INDEX_NAME
  FROM INFORMATION_SCHEMA.STATISTICS stats
  WHERE stats.TABLE_SCHEMA = DATABASE()
    AND stats.TABLE_NAME = 'questionbank'
    AND stats.NON_UNIQUE = 0
  GROUP BY stats.INDEX_NAME
  HAVING SUM(CASE WHEN stats.COLUMN_NAME = 'tenantId' THEN 1 ELSE 0 END) > 0
     AND SUM(CASE WHEN stats.COLUMN_NAME = 'levelId' THEN 1 ELSE 0 END) > 0
     AND SUM(CASE WHEN stats.COLUMN_NAME = 'prompt' THEN 1 ELSE 0 END) > 0
     AND COUNT(*) = 3
  ORDER BY (stats.INDEX_NAME = 'questionbank_tenantId_levelId_prompt_key') DESC
  LIMIT 1
);

SET @drop_legacy_prompt_uq_sql := IF(
  @legacy_prompt_uq_name IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE `questionbank` DROP INDEX `', REPLACE(@legacy_prompt_uq_name, '`', '``'), '`')
);

PREPARE drop_legacy_prompt_uq_stmt FROM @drop_legacy_prompt_uq_sql;
EXECUTE drop_legacy_prompt_uq_stmt;
DEALLOCATE PREPARE drop_legacy_prompt_uq_stmt;

CREATE UNIQUE INDEX `questionbank_tenantId_levelId_promptScopeKey_key`
  ON `questionbank`(`tenantId`, `levelId`, `promptScopeKey`);
