-- Competition Phase 1: map existing QuestionBank rows into Competition Question Banks.
-- Additive only. This does not duplicate question content or alter existing QuestionBank rows.

CREATE TABLE `competitionquestionbankquestion` (
  `tenantId` VARCHAR(191) NOT NULL,
  `competitionQuestionBankId` VARCHAR(191) NOT NULL,
  `questionBankId` VARCHAR(191) NOT NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`competitionQuestionBankId`, `questionBankId`),
  INDEX `CompetitionQuestionBankQuestion_tenant_bank_sort_idx`
    (`tenantId`, `competitionQuestionBankId`, `sortOrder`),
  INDEX `CompetitionQuestionBankQuestion_questionId_idx` (`questionBankId`),

  CONSTRAINT `CompetitionQuestionBankQuestion_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `tenant` (`id`)
    ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT `CompetitionQuestionBankQuestion_bankId_fkey`
    FOREIGN KEY (`competitionQuestionBankId`) REFERENCES `competitionquestionbank` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CompetitionQuestionBankQuestion_questionId_fkey`
    FOREIGN KEY (`questionBankId`) REFERENCES `questionbank` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
