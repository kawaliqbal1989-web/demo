-- migration_business_partner_code_normalization.sql
-- Normalizes legacy dashed business partner codes to the canonical undashed format.
-- Idempotent, MySQL compatible.

UPDATE `businesspartner` bp
LEFT JOIN `businesspartner` existing
  ON existing.`tenantId` = bp.`tenantId`
 AND existing.`code` = 'BP001'
SET bp.`code` = 'BP001'
WHERE bp.`code` = 'BP-001'
  AND existing.`id` IS NULL;

UPDATE `businesspartner` bp
LEFT JOIN `businesspartner` existing
  ON existing.`tenantId` = bp.`tenantId`
 AND existing.`code` = 'BP002'
SET bp.`code` = 'BP002'
WHERE bp.`code` = 'BP-002'
  AND existing.`id` IS NULL;