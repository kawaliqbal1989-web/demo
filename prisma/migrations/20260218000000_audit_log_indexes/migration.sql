-- AddIndex
CREATE INDEX `AuditLog_userId_createdAt_idx` ON `AuditLog`(`userId`, `createdAt`);

-- AddIndex
CREATE INDEX `AuditLog_action_createdAt_idx` ON `AuditLog`(`action`, `createdAt`);
