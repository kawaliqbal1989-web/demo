-- Add optional worksheet link for online mock-test attempts
-- Run this migration against the same database used by the backend.

ALTER TABLE MockTest
  ADD COLUMN worksheetId VARCHAR(191) NULL;

CREATE INDEX MockTest_worksheetId_idx ON MockTest(worksheetId);

ALTER TABLE MockTest
  ADD CONSTRAINT MockTest_worksheetId_fkey
  FOREIGN KEY (worksheetId) REFERENCES Worksheet(id)
  ON DELETE SET NULL
  ON UPDATE CASCADE;
