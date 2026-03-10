ALTER TABLE Level
  ADD COLUMN defaultTotalFeeAmount DECIMAL(10, 2) NULL,
  ADD COLUMN defaultAdmissionFeeAmount DECIMAL(10, 2) NULL;

ALTER TABLE Student
  ADD COLUMN feeConcessionAmount DECIMAL(10, 2) NULL DEFAULT 0.00;