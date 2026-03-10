-- CreateTable
CREATE TABLE `AiPlaygroundLog` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `toolName` VARCHAR(191) NOT NULL,
    `prompt` TEXT NOT NULL,
    `response` TEXT NOT NULL,
    `tokensUsed` INTEGER NOT NULL DEFAULT 0,
    `durationMs` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AiPlaygroundLog_tenantId_studentId_createdAt_idx`(`tenantId`, `studentId`, `createdAt`),
    INDEX `AiPlaygroundLog_tenantId_toolName_createdAt_idx`(`tenantId`, `toolName`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AiPlaygroundLog` ADD CONSTRAINT `AiPlaygroundLog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiPlaygroundLog` ADD CONSTRAINT `AiPlaygroundLog_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
