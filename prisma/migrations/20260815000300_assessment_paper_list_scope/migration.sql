-- Phase 3E D5.8.2: allow one shared executable worksheet to be allocated
-- independently to multiple approved Competition enrollment lists.

DROP INDEX `asp_t_ver_ws_uq` ON `assessmentpaper`;

CREATE UNIQUE INDEX `asp_t_ver_ws_list_uq`
  ON `assessmentpaper`(`tenantId`, `assessmentVersionId`, `worksheetId`, `sourceListId`);
