-- Phase 4: Intelligence Platform Foundation
-- Creates the Insight table and supporting indexes for the recommendation engine.

CREATE TABLE IF NOT EXISTS `Insight` (
  `id`           VARCHAR(191) NOT NULL,
  `tenantId`     VARCHAR(191) NOT NULL,
  `targetRole`   ENUM('SUPERADMIN','BP','FRANCHISE','CENTER','TEACHER','STUDENT') NOT NULL,
  `targetUserId` VARCHAR(191) NOT NULL,
  `category`     ENUM('RISK','PERFORMANCE','ATTENDANCE','FINANCIAL','PROMOTION','ENGAGEMENT','OPERATIONAL','COMPLIANCE') NOT NULL,
  `severity`     ENUM('INFO','SUCCESS','WARNING','CRITICAL') NOT NULL,
  `title`        VARCHAR(191) NOT NULL,
  `message`      TEXT NOT NULL,
  `actionLabel`  VARCHAR(191) NULL,
  `actionUrl`    VARCHAR(191) NULL,
  `entityType`   VARCHAR(191) NULL,
  `entityId`     VARCHAR(191) NULL,
  `metadata`     JSON NULL,
  `isDismissed`  BOOLEAN NOT NULL DEFAULT false,
  `isActioned`   BOOLEAN NOT NULL DEFAULT false,
  `expiresAt`    DATETIME(3) NULL,
  `createdAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  INDEX `Insight_tenantId_targetUserId_isDismissed_createdAt_idx` (`tenantId`, `targetUserId`, `isDismissed`, `createdAt`),
  INDEX `Insight_tenantId_targetRole_category_createdAt_idx` (`tenantId`, `targetRole`, `category`, `createdAt`),
  INDEX `Insight_tenantId_severity_createdAt_idx` (`tenantId`, `severity`, `createdAt`),
  INDEX `Insight_expiresAt_idx` (`expiresAt`),

  CONSTRAINT `Insight_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Insight_targetUserId_fkey` FOREIGN KEY (`targetUserId`) REFERENCES `AuthUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
