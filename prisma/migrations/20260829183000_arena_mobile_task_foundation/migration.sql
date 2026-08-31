-- Arena Mobile Companion V2.1
-- Secure one-time mobile task foundation.
-- No new status enum: lifecycle is derived from timestamps.

CREATE TABLE `arenamobiletask` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `activityKey` VARCHAR(191) NOT NULL,
    `mode` VARCHAR(191) NULL,
    `config` JSON NOT NULL,
    `handoffTokenHash` VARCHAR(191) NOT NULL,
    `claimTokenHash` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `claimedAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `submittedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `arenaActivitySessionId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `amt_handoff_token_uq`(`handoffTokenHash`),
    UNIQUE INDEX `amt_claim_token_uq`(`claimTokenHash`),
    UNIQUE INDEX `amt_session_uq`(`arenaActivitySessionId`),
    INDEX `amt_t_s_cr_i`(`tenantId`, `studentId`, `createdAt`),
    INDEX `amt_t_s_ex_i`(`tenantId`, `studentId`, `expiresAt`),
    INDEX `amt_expiry_i`(`expiresAt`),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `arenamobiletask`
    ADD CONSTRAINT `arenamobiletask_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `arenamobiletask`
    ADD CONSTRAINT `arenamobiletask_studentId_fkey`
    FOREIGN KEY (`studentId`) REFERENCES `student`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `arenamobiletask`
    ADD CONSTRAINT `arenamobiletask_arenaActivitySessionId_fkey`
    FOREIGN KEY (`arenaActivitySessionId`) REFERENCES `arenaactivitysession`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
