-- EXAM LEVEL MAPPING AUDIT + REPAIR
-- Scope: Find and optionally repair exam enrollment level mismatches.
-- Assumes MySQL and current schema naming in this repo.

-- ============================================================
-- 1) AUDIT: exam enrollment level vs active academic enrollment level
-- ============================================================
-- Returns students where exam enrolled level differs from active enrollment level.
SELECT
  e.tenantId,
  e.examCycleId,
  ec.code AS examCode,
  ec.name AS examName,
  s.id AS studentId,
  s.admissionNo,
  CONCAT(COALESCE(s.firstName, ''), ' ', COALESCE(s.lastName, '')) AS studentName,
  e.enrolledLevelId AS examLevelId,
  exLvl.name AS examLevelName,
  exLvl.rank AS examLevelRank,
  enr.levelId AS academicLevelId,
  acLvl.name AS academicLevelName,
  acLvl.rank AS academicLevelRank,
  CASE
    WHEN e.enrolledLevelId <> enr.levelId THEN 'MISMATCH'
    ELSE 'MATCH'
  END AS mappingStatus,
  e.createdAt AS examEnrolledAt
FROM examenrollmententry e
JOIN examcycle ec
  ON ec.id = e.examCycleId
 AND ec.tenantId = e.tenantId
JOIN student s
  ON s.id = e.studentId
 AND s.tenantId = e.tenantId
JOIN level exLvl
  ON exLvl.id = e.enrolledLevelId
 AND exLvl.tenantId = e.tenantId
JOIN enrollment enr
  ON enr.studentId = e.studentId
 AND enr.tenantId = e.tenantId
 AND enr.status = 'ACTIVE'
JOIN level acLvl
  ON acLvl.id = enr.levelId
 AND acLvl.tenantId = e.tenantId
WHERE e.enrolledLevelId <> enr.levelId
ORDER BY e.tenantId, e.examCycleId, s.admissionNo;

-- ============================================================
-- 2) AUDIT: exam worksheet level vs exam enrollment level
-- ============================================================
-- Detects students with exam worksheet generated at different level than enrolled exam level.
SELECT
  e.tenantId,
  e.examCycleId,
  ec.code AS examCode,
  e.studentId,
  s.admissionNo,
  e.enrolledLevelId,
  w.levelId AS worksheetLevelId,
  wa.assignedAt,
  CASE
    WHEN w.levelId <> e.enrolledLevelId THEN 'MISMATCH'
    ELSE 'MATCH'
  END AS mappingStatus
FROM examenrollmententry e
JOIN examcycle ec
  ON ec.id = e.examCycleId
 AND ec.tenantId = e.tenantId
JOIN worksheetassignment wa
  ON wa.studentId = e.studentId
 AND wa.tenantId = e.tenantId
 AND wa.isActive = 1
JOIN worksheet w
  ON w.id = wa.worksheetId
 AND w.tenantId = e.tenantId
 AND w.examCycleId = e.examCycleId
 AND w.generationMode = 'EXAM'
JOIN student s
  ON s.id = e.studentId
 AND s.tenantId = e.tenantId
WHERE w.levelId <> e.enrolledLevelId
ORDER BY e.tenantId, e.examCycleId, s.admissionNo;

-- ============================================================
-- 3) AUDIT: generated question-set level vs exam enrollment level
-- ============================================================
SELECT
  e.tenantId,
  e.examCycleId,
  ec.code AS examCode,
  e.studentId,
  s.admissionNo,
  e.enrolledLevelId,
  g.levelId AS generatedLevelId,
  g.questionBankId,
  g.generatedAt,
  CASE
    WHEN g.levelId <> e.enrolledLevelId THEN 'MISMATCH'
    ELSE 'MATCH'
  END AS mappingStatus
FROM examenrollmententry e
JOIN examgeneratedquestionset g
  ON g.tenantId = e.tenantId
 AND g.examCycleId = e.examCycleId
 AND g.studentId = e.studentId
JOIN examcycle ec
  ON ec.id = e.examCycleId
 AND ec.tenantId = e.tenantId
JOIN student s
  ON s.id = e.studentId
 AND s.tenantId = e.tenantId
WHERE g.levelId <> e.enrolledLevelId
ORDER BY e.tenantId, e.examCycleId, s.admissionNo;

-- ============================================================
-- 4) OPTIONAL REPAIR (transactional)
-- ============================================================
-- WARNING:
-- - Review audit output before running.
-- - Prefer repairing only affected tenant/examCycle with extra WHERE clauses.

START TRANSACTION;

-- 4A) Update exam enrollment level from active enrollment level.
UPDATE examenrollmententry e
JOIN enrollment enr
  ON enr.studentId = e.studentId
 AND enr.tenantId = e.tenantId
 AND enr.status = 'ACTIVE'
SET e.enrolledLevelId = enr.levelId
WHERE e.enrolledLevelId <> enr.levelId;

-- 4B) Delete stale generated question sets that no longer match repaired enrollment level.
--     They will be regenerated using correct level through API flow.
DELETE g
FROM examgeneratedquestionset g
JOIN examenrollmententry e
  ON e.tenantId = g.tenantId
 AND e.examCycleId = g.examCycleId
 AND e.studentId = g.studentId
WHERE g.levelId <> e.enrolledLevelId;

-- 4C) Optional cleanup query (preview only): detect exam worksheets whose level does not match repaired enrollment.
-- SELECT w.id, w.tenantId, w.examCycleId, wa.studentId, w.levelId, e.enrolledLevelId
-- FROM worksheet w
-- JOIN worksheetassignment wa
--   ON wa.worksheetId = w.id
--  AND wa.tenantId = w.tenantId
--  AND wa.isActive = 1
-- JOIN examenrollmententry e
--   ON e.tenantId = w.tenantId
--  AND e.examCycleId = w.examCycleId
--  AND e.studentId = wa.studentId
-- WHERE w.generationMode = 'EXAM'
--   AND w.levelId <> e.enrolledLevelId;

COMMIT;
