-- Migration: Notification Automation Layer (Phase 8)
-- Adds priority, category, actionUrl, expiresAt to Notification
-- Adds NotificationPreference model for user opt-outs
-- Adds new NotificationType values for automation rules

-- Step 1: Add new enum values to NotificationType
ALTER TABLE `Notification` MODIFY COLUMN `type` ENUM(
  'PROMOTION_READY',
  'PROMOTION_CONFIRMED',
  'COMPETITION_STAGE_UPDATE',
  'ABUSE_FLAG_CREATED',
  'SYSTEM_BROADCAST',
  'EXAM_CYCLE_CREATED',
  'EXAM_ENROLLMENT_OPEN',
  'EXAM_ENROLLMENT_CLOSING_SOON',
  'EXAM_LIST_SUBMITTED',
  'EXAM_LIST_APPROVED',
  'EXAM_PRACTICE_STARTED',
  'EXAM_STARTING_TOMORROW',
  'EXAM_LIVE',
  'EXAM_LAST_DAY_REMINDER',
  'EXAM_RESULT_PUBLISHED',
  'EXAM_RESULT_UNPUBLISHED',
  -- New automation types
  'RISK_ALERT',
  'FEE_OVERDUE',
  'FEE_UPCOMING',
  'ATTENDANCE_DROP',
  'STALE_BATCH',
  'WORKFLOW_REMINDER',
  'HEALTH_SCORE_DROP',
  'TEACHER_OVERLOAD',
  'ADMISSION_MILESTONE',
  'DIGEST_DAILY',
  'DIGEST_WEEKLY'
) NOT NULL;

-- Step 2: Add new columns to Notification
ALTER TABLE `Notification` ADD COLUMN `priority` ENUM('CRITICAL', 'HIGH', 'NORMAL', 'LOW') NOT NULL DEFAULT 'NORMAL' AFTER `type`;
ALTER TABLE `Notification` ADD COLUMN `category` ENUM('WORKFLOW', 'RISK', 'FINANCE', 'ACADEMIC', 'OPERATIONS', 'SYSTEM') NOT NULL DEFAULT 'SYSTEM' AFTER `priority`;
ALTER TABLE `Notification` ADD COLUMN `actionUrl` VARCHAR(500) NULL AFTER `entityId`;
ALTER TABLE `Notification` ADD COLUMN `expiresAt` DATETIME(3) NULL AFTER `actionUrl`;

-- Step 3: Add index for priority filtering and expiry cleanup
CREATE INDEX `Notification_tenantId_recipientUserId_priority_idx` ON `Notification`(`tenantId`, `recipientUserId`, `priority`);
CREATE INDEX `Notification_expiresAt_idx` ON `Notification`(`expiresAt`);

-- Step 4: Create NotificationPreference model
CREATE TABLE `NotificationPreference` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `type` ENUM(
    'PROMOTION_READY', 'PROMOTION_CONFIRMED', 'COMPETITION_STAGE_UPDATE',
    'ABUSE_FLAG_CREATED', 'SYSTEM_BROADCAST',
    'EXAM_CYCLE_CREATED', 'EXAM_ENROLLMENT_OPEN', 'EXAM_ENROLLMENT_CLOSING_SOON',
    'EXAM_LIST_SUBMITTED', 'EXAM_LIST_APPROVED', 'EXAM_PRACTICE_STARTED',
    'EXAM_STARTING_TOMORROW', 'EXAM_LIVE', 'EXAM_LAST_DAY_REMINDER',
    'EXAM_RESULT_PUBLISHED', 'EXAM_RESULT_UNPUBLISHED',
    'RISK_ALERT', 'FEE_OVERDUE', 'FEE_UPCOMING', 'ATTENDANCE_DROP',
    'STALE_BATCH', 'WORKFLOW_REMINDER', 'HEALTH_SCORE_DROP',
    'TEACHER_OVERLOAD', 'ADMISSION_MILESTONE', 'DIGEST_DAILY', 'DIGEST_WEEKLY'
  ) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `NotificationPreference_tenantId_userId_type_key`(`tenantId`, `userId`, `type`),
  INDEX `NotificationPreference_tenantId_userId_idx`(`tenantId`, `userId`),

  CONSTRAINT `NotificationPreference_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `NotificationPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `AuthUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Verification
SELECT 'Migration complete: Notification automation schema applied' AS status;
