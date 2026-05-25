-- Add FEE_BATCH_OVERDUE notification type for teacher batch fee notifications
-- This allows teachers to receive automated notifications about overdue fees in their batches

BEGIN;

-- Add new notification type to the enum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FEE_BATCH_OVERDUE';

COMMIT;
