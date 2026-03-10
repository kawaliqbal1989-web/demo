-- CreateTable
CREATE TABLE `Tenant` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Tenant_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuthUser` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPERADMIN', 'BP', 'FRANCHISE', 'CENTER', 'TEACHER', 'STUDENT') NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `failedAttempts` INTEGER NOT NULL DEFAULT 0,
    `lockUntil` DATETIME(3) NULL,
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `tenantId` VARCHAR(191) NOT NULL,
    `parentUserId` VARCHAR(191) NULL,
    `hierarchyNodeId` VARCHAR(191) NULL,
    `studentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AuthUser_studentId_key`(`studentId`),
    INDEX `AuthUser_tenantId_idx`(`tenantId`),
    INDEX `AuthUser_username_idx`(`username`),
    INDEX `AuthUser_tenantId_role_idx`(`tenantId`, `role`),
    INDEX `AuthUser_parentUserId_idx`(`parentUserId`),
    INDEX `AuthUser_role_idx`(`role`),
    INDEX `AuthUser_hierarchyNodeId_idx`(`hierarchyNodeId`),
    INDEX `AuthUser_tenantId_createdAt_id_idx`(`tenantId`, `createdAt`, `id`),
    INDEX `AuthUser_tenantId_role_createdAt_idx`(`tenantId`, `role`, `createdAt`),
    UNIQUE INDEX `AuthUser_tenantId_email_key`(`tenantId`, `email`),
    UNIQUE INDEX `AuthUser_tenantId_username_key`(`tenantId`, `username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserSequence` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPERADMIN', 'BP', 'FRANCHISE', 'CENTER', 'TEACHER', 'STUDENT') NOT NULL,
    `nextValue` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserSequence_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `UserSequence_tenantId_role_key`(`tenantId`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `recipientUserId` VARCHAR(191) NOT NULL,
    `type` ENUM('PROMOTION_READY', 'PROMOTION_CONFIRMED', 'COMPETITION_STAGE_UPDATE', 'ABUSE_FLAG_CREATED', 'SYSTEM_BROADCAST') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NULL,
    `entityId` VARCHAR(191) NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_tenantId_recipientUserId_isRead_idx`(`tenantId`, `recipientUserId`, `isRead`),
    INDEX `Notification_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Superadmin` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `authUserId` VARCHAR(191) NULL,
    `email` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Superadmin_authUserId_key`(`authUserId`),
    INDEX `Superadmin_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `Superadmin_tenantId_email_key`(`tenantId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HierarchyNode` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `type` ENUM('COUNTRY', 'REGION', 'DISTRICT', 'SCHOOL', 'BRANCH') NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HierarchyNode_tenantId_type_idx`(`tenantId`, `type`),
    INDEX `HierarchyNode_parentId_idx`(`parentId`),
    INDEX `HierarchyNode_tenantId_createdAt_id_idx`(`tenantId`, `createdAt`, `id`),
    UNIQUE INDEX `HierarchyNode_tenantId_code_key`(`tenantId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Level` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `rank` INTEGER NOT NULL,
    `description` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Level_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `Level_tenantId_name_key`(`tenantId`, `name`),
    UNIQUE INDEX `Level_tenantId_rank_key`(`tenantId`, `rank`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LevelRule` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `levelId` VARCHAR(191) NOT NULL,
    `minPracticeAverage` DECIMAL(5, 2) NULL,
    `minExamScore` DECIMAL(5, 2) NULL,
    `minAccuracy` DECIMAL(5, 2) NULL,
    `maxAttemptsAllowed` INTEGER NULL,
    `minConsistencyScore` DECIMAL(5, 2) NULL,
    `allowTeacherOverride` BOOLEAN NOT NULL DEFAULT false,
    `minDigits` INTEGER NULL,
    `maxDigits` INTEGER NULL,
    `operations` JSON NULL,
    `totalQuestions` INTEGER NULL,
    `passThreshold` DECIMAL(5, 2) NULL,
    `allowNegativeResult` BOOLEAN NULL DEFAULT false,
    `maxCarryOver` INTEGER NULL,
    `timeLimitSeconds` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LevelRule_tenantId_idx`(`tenantId`),
    INDEX `LevelRule_levelId_idx`(`levelId`),
    UNIQUE INDEX `LevelRule_tenantId_levelId_key`(`tenantId`, `levelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Student` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `admissionNo` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `hierarchyNodeId` VARCHAR(191) NOT NULL,
    `levelId` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Student_tenantId_hierarchyNodeId_idx`(`tenantId`, `hierarchyNodeId`),
    INDEX `Student_tenantId_levelId_idx`(`tenantId`, `levelId`),
    INDEX `Student_tenantId_createdAt_id_idx`(`tenantId`, `createdAt`, `id`),
    UNIQUE INDEX `Student_tenantId_admissionNo_key`(`tenantId`, `admissionNo`),
    UNIQUE INDEX `Student_tenantId_email_key`(`tenantId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AbuseFlag` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `flagType` ENUM('RAPID_SUBMISSION', 'PERFECT_STREAK', 'TIME_ANOMALY', 'COMPETITION_SPIKE') NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,
    `resolvedByUserId` VARCHAR(191) NULL,

    INDEX `AbuseFlag_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    INDEX `AbuseFlag_tenantId_flagType_idx`(`tenantId`, `flagType`),
    INDEX `AbuseFlag_studentId_idx`(`studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentLevelCompletion` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `levelId` VARCHAR(191) NOT NULL,
    `completedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StudentLevelCompletion_tenantId_studentId_idx`(`tenantId`, `studentId`),
    INDEX `StudentLevelCompletion_tenantId_levelId_idx`(`tenantId`, `levelId`),
    UNIQUE INDEX `StudentLevelCompletion_tenantId_studentId_levelId_key`(`tenantId`, `studentId`, `levelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentLevelProgressionHistory` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `fromLevelId` VARCHAR(191) NOT NULL,
    `toLevelId` VARCHAR(191) NOT NULL,
    `score` DECIMAL(5, 2) NULL,
    `passed` BOOLEAN NOT NULL,
    `promotedByUserId` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StudentLevelProgressionHistory_tenantId_studentId_createdAt_idx`(`tenantId`, `studentId`, `createdAt`),
    INDEX `StudentLevelProgressionHistory_tenantId_fromLevelId_idx`(`tenantId`, `fromLevelId`),
    INDEX `StudentLevelProgressionHistory_tenantId_toLevelId_idx`(`tenantId`, `toLevelId`),
    UNIQUE INDEX `StudentLevelProgressionHistory_tenantId_studentId_fromLevelI_key`(`tenantId`, `studentId`, `fromLevelId`, `toLevelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Worksheet` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `difficulty` ENUM('EASY', 'MEDIUM', 'HARD') NOT NULL DEFAULT 'MEDIUM',
    `levelId` VARCHAR(191) NOT NULL,
    `createdByUserId` VARCHAR(191) NOT NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `generationMode` ENUM('PRACTICE', 'EXAM') NULL,
    `generationSeed` VARCHAR(191) NULL,
    `generatedAt` DATETIME(3) NULL,
    `timeLimitSeconds` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `templateId` VARCHAR(191) NULL,

    INDEX `Worksheet_tenantId_idx`(`tenantId`),
    INDEX `Worksheet_levelId_idx`(`levelId`),
    INDEX `Worksheet_createdByUserId_idx`(`createdByUserId`),
    INDEX `Worksheet_templateId_idx`(`templateId`),
    INDEX `Worksheet_tenantId_createdAt_id_idx`(`tenantId`, `createdAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorksheetSubmission` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `worksheetId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `score` DECIMAL(5, 2) NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('PENDING', 'REVIEWED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `correctCount` INTEGER NULL,
    `totalQuestions` INTEGER NULL,
    `completionTimeSeconds` INTEGER NULL,
    `submittedAnswers` JSON NULL,
    `finalSubmittedAt` DATETIME(3) NULL,
    `passed` BOOLEAN NULL,
    `evaluationHash` VARCHAR(191) NULL,
    `remarks` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WorksheetSubmission_tenantId_studentId_idx`(`tenantId`, `studentId`),
    INDEX `WorksheetSubmission_tenantId_createdAt_id_idx`(`tenantId`, `createdAt`, `id`),
    INDEX `WorksheetSubmission_tenantId_studentId_createdAt_idx`(`tenantId`, `studentId`, `createdAt`),
    UNIQUE INDEX `WorksheetSubmission_worksheetId_studentId_key`(`worksheetId`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorksheetQuestion` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `worksheetId` VARCHAR(191) NOT NULL,
    `questionBankId` VARCHAR(191) NULL,
    `questionNumber` INTEGER NOT NULL,
    `operands` JSON NOT NULL,
    `operation` VARCHAR(191) NOT NULL,
    `correctAnswer` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WorksheetQuestion_tenantId_worksheetId_idx`(`tenantId`, `worksheetId`),
    INDEX `WorksheetQuestion_questionBankId_idx`(`questionBankId`),
    UNIQUE INDEX `WorksheetQuestion_worksheetId_questionNumber_key`(`worksheetId`, `questionNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorksheetTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `levelId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `totalQuestions` INTEGER NOT NULL,
    `easyCount` INTEGER NOT NULL,
    `mediumCount` INTEGER NOT NULL,
    `hardCount` INTEGER NOT NULL,
    `timeLimitSeconds` INTEGER NOT NULL DEFAULT 600,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WorksheetTemplate_tenantId_isActive_idx`(`tenantId`, `isActive`),
    UNIQUE INDEX `WorksheetTemplate_tenantId_levelId_key`(`tenantId`, `levelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuestionBank` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `levelId` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NULL,
    `difficulty` ENUM('EASY', 'MEDIUM', 'HARD') NOT NULL,
    `prompt` VARCHAR(191) NOT NULL,
    `operands` JSON NOT NULL,
    `operation` VARCHAR(191) NOT NULL,
    `correctAnswer` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `QuestionBank_tenantId_levelId_difficulty_isActive_idx`(`tenantId`, `levelId`, `difficulty`, `isActive`),
    INDEX `QuestionBank_templateId_idx`(`templateId`),
    UNIQUE INDEX `QuestionBank_tenantId_levelId_prompt_key`(`tenantId`, `levelId`, `prompt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Competition` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `status` ENUM('DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `workflowStage` ENUM('CENTER_REVIEW', 'FRANCHISE_REVIEW', 'BP_REVIEW', 'SUPERADMIN_APPROVAL', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'CENTER_REVIEW',
    `rejectedAt` DATETIME(3) NULL,
    `rejectedByUserId` VARCHAR(191) NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `hierarchyNodeId` VARCHAR(191) NOT NULL,
    `levelId` VARCHAR(191) NOT NULL,
    `createdByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Competition_tenantId_hierarchyNodeId_idx`(`tenantId`, `hierarchyNodeId`),
    INDEX `Competition_tenantId_levelId_idx`(`tenantId`, `levelId`),
    INDEX `Competition_status_idx`(`status`),
    INDEX `Competition_workflowStage_idx`(`workflowStage`),
    INDEX `Competition_tenantId_rejectedAt_idx`(`tenantId`, `rejectedAt`),
    INDEX `Competition_rejectedByUserId_idx`(`rejectedByUserId`),
    INDEX `Competition_tenantId_createdAt_id_idx`(`tenantId`, `createdAt`, `id`),
    INDEX `Competition_tenantId_workflowStage_createdAt_idx`(`tenantId`, `workflowStage`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompetitionStageTransition` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `competitionId` VARCHAR(191) NOT NULL,
    `fromStage` ENUM('CENTER_REVIEW', 'FRANCHISE_REVIEW', 'BP_REVIEW', 'SUPERADMIN_APPROVAL', 'APPROVED', 'REJECTED') NOT NULL,
    `toStage` ENUM('CENTER_REVIEW', 'FRANCHISE_REVIEW', 'BP_REVIEW', 'SUPERADMIN_APPROVAL', 'APPROVED', 'REJECTED') NOT NULL,
    `action` ENUM('FORWARD', 'REJECT') NOT NULL,
    `reason` VARCHAR(191) NULL,
    `actedByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CompetitionStageTransition_tenantId_competitionId_createdAt_idx`(`tenantId`, `competitionId`, `createdAt`),
    INDEX `CompetitionStageTransition_competitionId_createdAt_idx`(`competitionId`, `createdAt`),
    INDEX `CompetitionStageTransition_actedByUserId_idx`(`actedByUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompetitionWorksheet` (
    `competitionId` VARCHAR(191) NOT NULL,
    `worksheetId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CompetitionWorksheet_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`competitionId`, `worksheetId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompetitionEnrollment` (
    `competitionId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `enrolledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `rank` INTEGER NULL,
    `totalScore` DECIMAL(6, 2) NULL,

    INDEX `CompetitionEnrollment_tenantId_studentId_idx`(`tenantId`, `studentId`),
    INDEX `CompetitionEnrollment_tenantId_studentId_isActive_idx`(`tenantId`, `studentId`, `isActive`),
    PRIMARY KEY (`competitionId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` VARCHAR(191) NOT NULL,
    `tokenId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `replacedByTokenId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,

    UNIQUE INDEX `RefreshToken_tokenId_key`(`tokenId`),
    INDEX `RefreshToken_userId_idx`(`userId`),
    INDEX `RefreshToken_tenantId_idx`(`tenantId`),
    INDEX `RefreshToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `role` ENUM('SUPERADMIN', 'BP', 'FRANCHISE', 'CENTER', 'TEACHER', 'STUDENT') NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    INDEX `AuditLog_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `AuditLog_action_createdAt_idx`(`action`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BusinessPartner` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `logoPath` VARCHAR(191) NULL,
    `logoUrl` VARCHAR(191) NULL,
    `primaryPhone` VARCHAR(191) NULL,
    `alternatePhone` VARCHAR(191) NULL,
    `contactEmail` VARCHAR(191) NULL,
    `supportEmail` VARCHAR(191) NULL,
    `whatsappEnabled` BOOLEAN NOT NULL DEFAULT false,
    `businessType` ENUM('INDIVIDUAL', 'COMPANY') NULL,
    `gstNumber` VARCHAR(191) NULL,
    `panNumber` VARCHAR(191) NULL,
    `onboardingDate` DATETIME(3) NULL,
    `primaryBrandColor` VARCHAR(191) NULL,
    `secondaryBrandColor` VARCHAR(191) NULL,
    `websiteUrl` VARCHAR(191) NULL,
    `facebookUrl` VARCHAR(191) NULL,
    `instagramUrl` VARCHAR(191) NULL,
    `youtubeUrl` VARCHAR(191) NULL,
    `accessMode` ENUM('ALL', 'SELECTIVE') NOT NULL DEFAULT 'ALL',
    `legacyLoginEnabled` BOOLEAN NOT NULL DEFAULT false,
    `legacyUsername` VARCHAR(191) NULL,
    `legacyPasswordHash` VARCHAR(191) NULL,
    `hierarchyNodeId` VARCHAR(191) NULL,
    `subscriptionStatus` ENUM('ACTIVE', 'SUSPENDED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    `subscriptionExpiresAt` DATETIME(3) NULL,
    `gracePeriodUntil` DATETIME(3) NULL,
    `centerSharePercent` INTEGER NOT NULL DEFAULT 0,
    `franchiseSharePercent` INTEGER NOT NULL DEFAULT 0,
    `bpSharePercent` INTEGER NOT NULL DEFAULT 0,
    `platformSharePercent` INTEGER NOT NULL DEFAULT 100,
    `createdByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BusinessPartner_tenantId_idx`(`tenantId`),
    INDEX `BusinessPartner_hierarchyNodeId_idx`(`hierarchyNodeId`),
    INDEX `BusinessPartner_tenantId_subscriptionStatus_subscriptionExpi_idx`(`tenantId`, `subscriptionStatus`, `subscriptionExpiresAt`),
    INDEX `BusinessPartner_tenantId_status_isActive_idx`(`tenantId`, `status`, `isActive`),
    UNIQUE INDEX `BusinessPartner_tenantId_code_key`(`tenantId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BusinessPartnerAddress` (
    `id` VARCHAR(191) NOT NULL,
    `businessPartnerId` VARCHAR(191) NOT NULL,
    `addressLine1` VARCHAR(191) NOT NULL,
    `addressLine2` VARCHAR(191) NULL,
    `city` VARCHAR(191) NOT NULL,
    `district` VARCHAR(191) NULL,
    `state` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NOT NULL DEFAULT 'India',
    `pincode` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BusinessPartnerAddress_businessPartnerId_key`(`businessPartnerId`),
    INDEX `BusinessPartnerAddress_city_idx`(`city`),
    INDEX `BusinessPartnerAddress_state_idx`(`state`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerOperationalState` (
    `id` VARCHAR(191) NOT NULL,
    `businessPartnerId` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PartnerOperationalState_state_idx`(`state`),
    UNIQUE INDEX `PartnerOperationalState_businessPartnerId_state_key`(`businessPartnerId`, `state`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerOperationalDistrict` (
    `id` VARCHAR(191) NOT NULL,
    `businessPartnerId` VARCHAR(191) NOT NULL,
    `district` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PartnerOperationalDistrict_district_idx`(`district`),
    UNIQUE INDEX `PartnerOperationalDistrict_businessPartnerId_district_key`(`businessPartnerId`, `district`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerOperationalCity` (
    `id` VARCHAR(191) NOT NULL,
    `businessPartnerId` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `district` VARCHAR(191) NULL,
    `state` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PartnerOperationalCity_city_idx`(`city`),
    UNIQUE INDEX `PartnerOperationalCity_businessPartnerId_city_key`(`businessPartnerId`, `city`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerLegacyProgram` (
    `id` VARCHAR(191) NOT NULL,
    `businessPartnerId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PartnerLegacyProgram_businessPartnerId_idx`(`businessPartnerId`),
    UNIQUE INDEX `PartnerLegacyProgram_businessPartnerId_name_key`(`businessPartnerId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Course` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Course_tenantId_isActive_idx`(`tenantId`, `isActive`),
    UNIQUE INDEX `Course_tenantId_code_key`(`tenantId`, `code`),
    UNIQUE INDEX `Course_tenantId_name_key`(`tenantId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerCourseAccess` (
    `id` VARCHAR(191) NOT NULL,
    `businessPartnerId` VARCHAR(191) NOT NULL,
    `courseId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PartnerCourseAccess_courseId_idx`(`courseId`),
    UNIQUE INDEX `PartnerCourseAccess_businessPartnerId_courseId_key`(`businessPartnerId`, `courseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Margin` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `businessPartnerId` VARCHAR(191) NOT NULL,
    `marginPercent` DECIMAL(5, 2) NOT NULL,
    `effectiveFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Margin_tenantId_businessPartnerId_isActive_idx`(`tenantId`, `businessPartnerId`, `isActive`),
    INDEX `Margin_businessPartnerId_effectiveFrom_idx`(`businessPartnerId`, `effectiveFrom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Settlement` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `businessPartnerId` VARCHAR(191) NOT NULL,
    `periodYear` INTEGER NOT NULL,
    `periodMonth` INTEGER NOT NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `grossAmount` DECIMAL(10, 2) NOT NULL,
    `partnerEarnings` DECIMAL(10, 2) NOT NULL,
    `platformEarnings` DECIMAL(10, 2) NOT NULL,
    `status` ENUM('PENDING', 'PAID') NOT NULL DEFAULT 'PENDING',
    `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Settlement_tenantId_periodYear_periodMonth_idx`(`tenantId`, `periodYear`, `periodMonth`),
    INDEX `Settlement_tenantId_status_generatedAt_idx`(`tenantId`, `status`, `generatedAt`),
    UNIQUE INDEX `Settlement_businessPartnerId_periodYear_periodMonth_key`(`businessPartnerId`, `periodYear`, `periodMonth`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancialTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `businessPartnerId` VARCHAR(191) NULL,
    `studentId` VARCHAR(191) NULL,
    `centerId` VARCHAR(191) NOT NULL,
    `franchiseId` VARCHAR(191) NULL,
    `settlementId` VARCHAR(191) NULL,
    `type` ENUM('ENROLLMENT', 'RENEWAL', 'COMPETITION', 'ADJUSTMENT') NOT NULL,
    `grossAmount` DECIMAL(10, 2) NOT NULL,
    `centerShare` DECIMAL(10, 2) NOT NULL,
    `franchiseShare` DECIMAL(10, 2) NOT NULL,
    `bpShare` DECIMAL(10, 2) NOT NULL,
    `platformShare` DECIMAL(10, 2) NOT NULL,
    `createdByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FinancialTransaction_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    INDEX `FinancialTransaction_tenantId_type_createdAt_idx`(`tenantId`, `type`, `createdAt`),
    INDEX `FinancialTransaction_studentId_createdAt_idx`(`studentId`, `createdAt`),
    INDEX `FinancialTransaction_settlementId_idx`(`settlementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AuthUser` ADD CONSTRAINT `AuthUser_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuthUser` ADD CONSTRAINT `AuthUser_parentUserId_fkey` FOREIGN KEY (`parentUserId`) REFERENCES `AuthUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuthUser` ADD CONSTRAINT `AuthUser_hierarchyNodeId_fkey` FOREIGN KEY (`hierarchyNodeId`) REFERENCES `HierarchyNode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuthUser` ADD CONSTRAINT `AuthUser_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserSequence` ADD CONSTRAINT `UserSequence_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_recipientUserId_fkey` FOREIGN KEY (`recipientUserId`) REFERENCES `AuthUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Superadmin` ADD CONSTRAINT `Superadmin_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Superadmin` ADD CONSTRAINT `Superadmin_authUserId_fkey` FOREIGN KEY (`authUserId`) REFERENCES `AuthUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HierarchyNode` ADD CONSTRAINT `HierarchyNode_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HierarchyNode` ADD CONSTRAINT `HierarchyNode_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `HierarchyNode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Level` ADD CONSTRAINT `Level_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LevelRule` ADD CONSTRAINT `LevelRule_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LevelRule` ADD CONSTRAINT `LevelRule_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_hierarchyNodeId_fkey` FOREIGN KEY (`hierarchyNodeId`) REFERENCES `HierarchyNode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AbuseFlag` ADD CONSTRAINT `AbuseFlag_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AbuseFlag` ADD CONSTRAINT `AbuseFlag_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AbuseFlag` ADD CONSTRAINT `AbuseFlag_resolvedByUserId_fkey` FOREIGN KEY (`resolvedByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentLevelCompletion` ADD CONSTRAINT `StudentLevelCompletion_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentLevelCompletion` ADD CONSTRAINT `StudentLevelCompletion_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentLevelCompletion` ADD CONSTRAINT `StudentLevelCompletion_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentLevelProgressionHistory` ADD CONSTRAINT `StudentLevelProgressionHistory_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentLevelProgressionHistory` ADD CONSTRAINT `StudentLevelProgressionHistory_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentLevelProgressionHistory` ADD CONSTRAINT `StudentLevelProgressionHistory_fromLevelId_fkey` FOREIGN KEY (`fromLevelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentLevelProgressionHistory` ADD CONSTRAINT `StudentLevelProgressionHistory_toLevelId_fkey` FOREIGN KEY (`toLevelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentLevelProgressionHistory` ADD CONSTRAINT `StudentLevelProgressionHistory_promotedByUserId_fkey` FOREIGN KEY (`promotedByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Worksheet` ADD CONSTRAINT `Worksheet_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Worksheet` ADD CONSTRAINT `Worksheet_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Worksheet` ADD CONSTRAINT `Worksheet_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Worksheet` ADD CONSTRAINT `Worksheet_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `WorksheetTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorksheetSubmission` ADD CONSTRAINT `WorksheetSubmission_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorksheetSubmission` ADD CONSTRAINT `WorksheetSubmission_worksheetId_fkey` FOREIGN KEY (`worksheetId`) REFERENCES `Worksheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorksheetSubmission` ADD CONSTRAINT `WorksheetSubmission_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorksheetQuestion` ADD CONSTRAINT `WorksheetQuestion_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorksheetQuestion` ADD CONSTRAINT `WorksheetQuestion_worksheetId_fkey` FOREIGN KEY (`worksheetId`) REFERENCES `Worksheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorksheetQuestion` ADD CONSTRAINT `WorksheetQuestion_questionBankId_fkey` FOREIGN KEY (`questionBankId`) REFERENCES `QuestionBank`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorksheetTemplate` ADD CONSTRAINT `WorksheetTemplate_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorksheetTemplate` ADD CONSTRAINT `WorksheetTemplate_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionBank` ADD CONSTRAINT `QuestionBank_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionBank` ADD CONSTRAINT `QuestionBank_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionBank` ADD CONSTRAINT `QuestionBank_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `WorksheetTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Competition` ADD CONSTRAINT `Competition_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Competition` ADD CONSTRAINT `Competition_hierarchyNodeId_fkey` FOREIGN KEY (`hierarchyNodeId`) REFERENCES `HierarchyNode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Competition` ADD CONSTRAINT `Competition_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Competition` ADD CONSTRAINT `Competition_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Competition` ADD CONSTRAINT `Competition_rejectedByUserId_fkey` FOREIGN KEY (`rejectedByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompetitionStageTransition` ADD CONSTRAINT `CompetitionStageTransition_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompetitionStageTransition` ADD CONSTRAINT `CompetitionStageTransition_competitionId_fkey` FOREIGN KEY (`competitionId`) REFERENCES `Competition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompetitionStageTransition` ADD CONSTRAINT `CompetitionStageTransition_actedByUserId_fkey` FOREIGN KEY (`actedByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompetitionWorksheet` ADD CONSTRAINT `CompetitionWorksheet_competitionId_fkey` FOREIGN KEY (`competitionId`) REFERENCES `Competition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompetitionWorksheet` ADD CONSTRAINT `CompetitionWorksheet_worksheetId_fkey` FOREIGN KEY (`worksheetId`) REFERENCES `Worksheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompetitionWorksheet` ADD CONSTRAINT `CompetitionWorksheet_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompetitionEnrollment` ADD CONSTRAINT `CompetitionEnrollment_competitionId_fkey` FOREIGN KEY (`competitionId`) REFERENCES `Competition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompetitionEnrollment` ADD CONSTRAINT `CompetitionEnrollment_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompetitionEnrollment` ADD CONSTRAINT `CompetitionEnrollment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `AuthUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `AuthUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BusinessPartner` ADD CONSTRAINT `BusinessPartner_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BusinessPartner` ADD CONSTRAINT `BusinessPartner_hierarchyNodeId_fkey` FOREIGN KEY (`hierarchyNodeId`) REFERENCES `HierarchyNode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BusinessPartner` ADD CONSTRAINT `BusinessPartner_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BusinessPartnerAddress` ADD CONSTRAINT `BusinessPartnerAddress_businessPartnerId_fkey` FOREIGN KEY (`businessPartnerId`) REFERENCES `BusinessPartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerOperationalState` ADD CONSTRAINT `PartnerOperationalState_businessPartnerId_fkey` FOREIGN KEY (`businessPartnerId`) REFERENCES `BusinessPartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerOperationalDistrict` ADD CONSTRAINT `PartnerOperationalDistrict_businessPartnerId_fkey` FOREIGN KEY (`businessPartnerId`) REFERENCES `BusinessPartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerOperationalCity` ADD CONSTRAINT `PartnerOperationalCity_businessPartnerId_fkey` FOREIGN KEY (`businessPartnerId`) REFERENCES `BusinessPartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerLegacyProgram` ADD CONSTRAINT `PartnerLegacyProgram_businessPartnerId_fkey` FOREIGN KEY (`businessPartnerId`) REFERENCES `BusinessPartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Course` ADD CONSTRAINT `Course_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerCourseAccess` ADD CONSTRAINT `PartnerCourseAccess_businessPartnerId_fkey` FOREIGN KEY (`businessPartnerId`) REFERENCES `BusinessPartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerCourseAccess` ADD CONSTRAINT `PartnerCourseAccess_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Margin` ADD CONSTRAINT `Margin_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Margin` ADD CONSTRAINT `Margin_businessPartnerId_fkey` FOREIGN KEY (`businessPartnerId`) REFERENCES `BusinessPartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Settlement` ADD CONSTRAINT `Settlement_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Settlement` ADD CONSTRAINT `Settlement_businessPartnerId_fkey` FOREIGN KEY (`businessPartnerId`) REFERENCES `BusinessPartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialTransaction` ADD CONSTRAINT `FinancialTransaction_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialTransaction` ADD CONSTRAINT `FinancialTransaction_businessPartnerId_fkey` FOREIGN KEY (`businessPartnerId`) REFERENCES `BusinessPartner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialTransaction` ADD CONSTRAINT `FinancialTransaction_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialTransaction` ADD CONSTRAINT `FinancialTransaction_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `HierarchyNode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialTransaction` ADD CONSTRAINT `FinancialTransaction_franchiseId_fkey` FOREIGN KEY (`franchiseId`) REFERENCES `HierarchyNode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialTransaction` ADD CONSTRAINT `FinancialTransaction_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialTransaction` ADD CONSTRAINT `FinancialTransaction_settlementId_fkey` FOREIGN KEY (`settlementId`) REFERENCES `Settlement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

