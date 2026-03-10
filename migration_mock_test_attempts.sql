-- Phase-2: Dedicated mock test online attempts
-- Run after `migration_mock_test_online_worksheet_link.sql`.

CREATE TABLE IF NOT EXISTS MockTestAttempt (
  id VARCHAR(191) NOT NULL,
  tenantId VARCHAR(191) NOT NULL,
  mockTestId VARCHAR(191) NOT NULL,
  studentId VARCHAR(191) NOT NULL,
  status ENUM('IN_PROGRESS','SUBMITTED','TIMED_OUT') NOT NULL DEFAULT 'IN_PROGRESS',
  startedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finalSubmittedAt DATETIME(3) NULL,
  completionTimeSeconds INT NULL,
  answersByQuestionId JSON NULL,
  correctCount INT NULL,
  totalQuestions INT NULL,
  percentage DECIMAL(5,2) NULL,
  marksAwarded INT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY MockTestAttempt_mockTestId_studentId_key (mockTestId, studentId),
  KEY MockTestAttempt_tenantId_studentId_idx (tenantId, studentId),
  KEY MockTestAttempt_tenantId_mockTestId_status_idx (tenantId, mockTestId, status)
);
