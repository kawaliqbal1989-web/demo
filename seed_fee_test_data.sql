-- Fee Management Test Data Seed
-- Run this script to populate test data for fee functionality

-- Variables (adjust these based on your database state)
SET @tenantId = 'tenant_default';
SET @schoolId = (SELECT id FROM HierarchyNode WHERE code = 'SCH-001' AND tenantId = @tenantId LIMIT 1);
SET @centerAuthId = (SELECT id FROM AuthUser WHERE email = 'center.manager@abacusweb.local' AND tenantId = @tenantId LIMIT 1);
SET @level1Id = (SELECT id FROM Level WHERE rank = 1 AND tenantId = @tenantId LIMIT 1);
SET @level2Id = (SELECT id FROM Level WHERE rank = 2 AND tenantId = @tenantId LIMIT 1);
SET @passwordHash = '$2a$12$1234567890123456789012.1234567890123456789012345678901234'; -- Pass@123

-- Create additional teachers
INSERT INTO AuthUser (id, tenantId, email, username, role, passwordHash, hierarchyNodeId, parentUserId, isActive, mustChangePassword, createdAt, updatedAt)
VALUES 
  (UUID(), @tenantId, 'teacher.two@abacusweb.local', 'TE002', 'TEACHER', @passwordHash, @schoolId, @centerAuthId, 1, 0, NOW(), NOW()),
  (UUID(), @tenantId, 'teacher.three@abacusweb.local', 'TE003', 'TEACHER', @passwordHash, @schoolId, @centerAuthId, 1, 0, NOW(), NOW())
ON DUPLICATE KEY UPDATE isActive = 1, updatedAt = NOW();

SET @teacher1Id = (SELECT id FROM AuthUser WHERE email = 'teacher.one@abacusweb.local' AND tenantId = @tenantId LIMIT 1);
SET @teacher2Id = (SELECT id FROM AuthUser WHERE email = 'teacher.two@abacusweb.local' AND tenantId = @tenantId LIMIT 1);
SET @teacher3Id = (SELECT id FROM AuthUser WHERE email = 'teacher.three@abacusweb.local' AND tenantId = @tenantId LIMIT 1);

-- Create teacher profiles
INSERT INTO TeacherProfile (authUserId, tenantId, hierarchyNodeId, fullName, status, isActive, createdAt, updatedAt)
VALUES
  (@teacher2Id, @tenantId, @schoolId, 'Teacher Two', 'ACTIVE', 1, NOW(), NOW()),
  (@teacher3Id, @tenantId, @schoolId, 'Teacher Three', 'ACTIVE', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE fullName = VALUES(fullName), status = 'ACTIVE', isActive = 1, updatedAt = NOW();

-- Create batches
INSERT INTO Batch (id, tenantId, code, name, hierarchyNodeId, assignedTeacherUserId, isActive, createdAt, updatedAt)
VALUES
  (UUID(), @tenantId, 'BATCH-L1-MORNING', 'Level 1 - Morning Batch', @schoolId, @teacher1Id, 1, NOW(), NOW()),
  (UUID(), @tenantId, 'BATCH-L1-EVENING', 'Level 1 - Evening Batch', @schoolId, @teacher2Id, 1, NOW(), NOW()),
  (UUID(), @tenantId, 'BATCH-L2-WEEKEND', 'Level 2 - Weekend Batch', @schoolId, @teacher3Id, 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE isActive = 1, updatedAt = NOW();

SET @batch1Id = (SELECT id FROM Batch WHERE code = 'BATCH-L1-MORNING' AND tenantId = @tenantId LIMIT 1);
SET @batch2Id = (SELECT id FROM Batch WHERE code = 'BATCH-L1-EVENING' AND tenantId = @tenantId LIMIT 1);
SET @batch3Id = (SELECT id FROM Batch WHERE code = 'BATCH-L2-WEEKEND' AND tenantId = @tenantId LIMIT 1);

-- Create students with fee information
INSERT INTO Student (id, tenantId, admissionNo, firstName, lastName, email, phonePrimary, guardianPhone, hierarchyNodeId, levelId, totalFeeAmount, admissionFeeAmount, feeConcessionAmount, isActive, createdAt, updatedAt)
VALUES
  (UUID(), @tenantId, 'ADM-1003', 'Riya', 'Gupta', 'riya@example.com', '+91-9876543210', '+91-9876543211', @schoolId, @level1Id, 12000, 2000, 0, 1, NOW(), NOW()),
  (UUID(), @tenantId, 'ADM-1004', 'Arjun', 'Patel', 'arjun@example.com', '+91-9876543220', '+91-9876543221', @schoolId, @level1Id, 12000, 2000, 1000, 1, NOW(), NOW()),
  (UUID(), @tenantId, 'ADM-1005', 'Ananya', 'Singh', 'ananya@example.com', '+91-9876543230', '+91-9876543231', @schoolId, @level1Id, 12000, 2000, 0, 1, NOW(), NOW()),
  (UUID(), @tenantId, 'ADM-1006', 'Vivaan', 'Kumar', 'vivaan@example.com', '+91-9876543240', '+91-9876543241', @schoolId, @level2Id, 15000, 3000, 500, 1, NOW(), NOW()),
  (UUID(), @tenantId, 'ADM-1007', 'Ishaan', 'Reddy', 'ishaan@example.com', '+91-9876543250', '+91-9876543251', @schoolId, @level2Id, 15000, 3000, 0, 1, NOW(), NOW()),
  (UUID(), @tenantId, 'ADM-1008', 'Saanvi', 'Mehta', 'saanvi@example.com', '+91-9876543260', '+91-9876543261', @schoolId, @level1Id, 12000, 2000, 2000, 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE 
  phonePrimary = VALUES(phonePrimary),
  guardianPhone = VALUES(guardianPhone),
  totalFeeAmount = VALUES(totalFeeAmount),
  admissionFeeAmount = VALUES(admissionFeeAmount),
  feeConcessionAmount = VALUES(feeConcessionAmount),
  isActive = 1,
  updatedAt = NOW();

-- Update existing students with phone numbers and fee amounts
UPDATE Student 
SET phonePrimary = '+91-9876543200', guardianPhone = '+91-9876543201', 
    totalFeeAmount = 12000, admissionFeeAmount = 2000, feeConcessionAmount = 0, 
    isActive = 1, updatedAt = NOW()
WHERE admissionNo = 'ADM-1001' AND tenantId = @tenantId;

UPDATE Student 
SET phonePrimary = '+91-9876543205', guardianPhone = '+91-9876543206', 
    totalFeeAmount = 15000, admissionFeeAmount = 3000, feeConcessionAmount = 1500, 
    isActive = 1, updatedAt = NOW()
WHERE admissionNo = 'ADM-1002' AND tenantId = @tenantId;

-- Get student IDs
SET @student1Id = (SELECT id FROM Student WHERE admissionNo = 'ADM-1001' AND tenantId = @tenantId LIMIT 1);
SET @student2Id = (SELECT id FROM Student WHERE admissionNo = 'ADM-1002' AND tenantId = @tenantId LIMIT 1);
SET @student3Id = (SELECT id FROM Student WHERE admissionNo = 'ADM-1003' AND tenantId = @tenantId LIMIT 1);
SET @student4Id = (SELECT id FROM Student WHERE admissionNo = 'ADM-1004' AND tenantId = @tenantId LIMIT 1);
SET @student5Id = (SELECT id FROM Student WHERE admissionNo = 'ADM-1005' AND tenantId = @tenantId LIMIT 1);
SET @student6Id = (SELECT id FROM Student WHERE admissionNo = 'ADM-1006' AND tenantId = @tenantId LIMIT 1);
SET @student7Id = (SELECT id FROM Student WHERE admissionNo = 'ADM-1007' AND tenantId = @tenantId LIMIT 1);
SET @student8Id = (SELECT id FROM Student WHERE admissionNo = 'ADM-1008' AND tenantId = @tenantId LIMIT 1);

-- Enroll students in batches
INSERT INTO BatchEnrollment (batchId, studentId, status, enrolledAt, createdAt, updatedAt)
VALUES
  (@batch1Id, @student1Id, 'ACTIVE', '2025-01-01', NOW(), NOW()),
  (@batch3Id, @student2Id, 'ACTIVE', '2025-01-01', NOW(), NOW()),
  (@batch1Id, @student3Id, 'ACTIVE', '2025-01-01', NOW(), NOW()),
  (@batch1Id, @student4Id, 'ACTIVE', '2025-01-01', NOW(), NOW()),
  (@batch2Id, @student5Id, 'ACTIVE', '2025-01-01', NOW(), NOW()),
  (@batch3Id, @student6Id, 'ACTIVE', '2025-01-01', NOW(), NOW()),
  (@batch3Id, @student7Id, 'ACTIVE', '2025-01-01', NOW(), NOW()),
  (@batch2Id, @student8Id, 'ACTIVE', '2025-01-01', NOW(), NOW())
ON DUPLICATE KEY UPDATE status = 'ACTIVE', updatedAt = NOW();

-- Create fee installments for all students (Jan-Dec 2025)
-- We'll create a stored procedure to handle this repetitively

DELIMITER $$

CREATE PROCEDURE IF NOT EXISTS CreateStudentInstallments(IN studentId VARCHAR(255), IN monthlyAmount DECIMAL(10,2))
BEGIN
  DECLARE i INT DEFAULT 1;
  DECLARE dueMonth VARCHAR(7);
  DECLARE monthName VARCHAR(20);
  
  WHILE i <= 12 DO
    SET dueMonth = CONCAT('2025-', LPAD(i, 2, '0'), '-10');
    SET monthName = CASE i
      WHEN 1 THEN 'January'
      WHEN 2 THEN 'February'
      WHEN 3 THEN 'March'
      WHEN 4 THEN 'April'
      WHEN 5 THEN 'May'
      WHEN 6 THEN 'June'
      WHEN 7 THEN 'July'
      WHEN 8 THEN 'August'
      WHEN 9 THEN 'September'
      WHEN 10 THEN 'October'
      WHEN 11 THEN 'November'
      WHEN 12 THEN 'December'
    END;
    
    INSERT INTO StudentFeeInstallment (id, tenantId, studentId, amount, dueDate, description, createdAt, updatedAt)
    VALUES (UUID(), @tenantId, studentId, monthlyAmount, dueMonth, CONCAT(monthName, ' 2025 Tuition'), NOW(), NOW())
    ON DUPLICATE KEY UPDATE amount = monthlyAmount, description = CONCAT(monthName, ' 2025 Tuition'), updatedAt = NOW();
    
    SET i = i + 1;
  END WHILE;
END$$

DELIMITER ;

-- Create installments for each student (850 per month for Level 1, 1000 for Level 2)
CALL CreateStudentInstallments(@student1Id, 850);
CALL CreateStudentInstallments(@student2Id, 875);
CALL CreateStudentInstallments(@student3Id, 850);
CALL CreateStudentInstallments(@student4Id, 750);
CALL CreateStudentInstallments(@student5Id, 850);
CALL CreateStudentInstallments(@student6Id, 958);
CALL CreateStudentInstallments(@student7Id, 1000);
CALL CreateStudentInstallments(@student8Id, 667);

-- Create payment transactions (some full, some partial)
-- Student 1: Paid Jan & Feb fully
SET @installment1Jan = (SELECT id FROM StudentFeeInstallment WHERE studentId = @student1Id AND dueDate = '2025-01-10' LIMIT 1);
SET @installment1Feb = (SELECT id FROM StudentFeeInstallment WHERE studentId = @student1Id AND dueDate = '2025-02-10' LIMIT 1);

INSERT INTO FinancialTransaction (id, tenantId, centerId, studentId, installmentId, type, grossAmount, netAmount, paymentMode, receivedAt, createdAt, updatedAt)
VALUES
  (UUID(), @tenantId, @schoolId, @student1Id, @installment1Jan, 'ENROLLMENT', 850, 850, 'CASH', '2025-01-15', '2025-01-15', NOW()),
  (UUID(), @tenantId, @schoolId, @student1Id, @installment1Feb, 'ENROLLMENT', 850, 850, 'UPI', '2025-02-15', '2025-02-15', NOW());

-- Student 2: Partial payment for Jan
SET @installment2Jan = (SELECT id FROM StudentFeeInstallment WHERE studentId = @student2Id AND dueDate = '2025-01-10' LIMIT 1);

INSERT INTO FinancialTransaction (id, tenantId, centerId, studentId, installmentId, type, grossAmount, netAmount, paymentMode, receivedAt, createdAt, updatedAt)
VALUES
  (UUID(), @tenantId, @schoolId, @student2Id, @installment2Jan, 'ENROLLMENT', 500, 500, 'CASH', '2025-01-20', '2025-01-20', NOW());

-- Student 3 (Riya): Paid Jan fully, partial Feb
SET @installment3Jan = (SELECT id FROM StudentFeeInstallment WHERE studentId = @student3Id AND dueDate = '2025-01-10' LIMIT 1);
SET @installment3Feb = (SELECT id FROM StudentFeeInstallment WHERE studentId = @student3Id AND dueDate = '2025-02-10' LIMIT 1);

INSERT INTO FinancialTransaction (id, tenantId, centerId, studentId, installmentId, type, grossAmount, netAmount, paymentMode, receivedAt, createdAt, updatedAt)
VALUES
  (UUID(), @tenantId, @schoolId, @student3Id, @installment3Jan, 'ENROLLMENT', 850, 850, 'UPI', '2025-01-12', '2025-01-12', NOW()),
  (UUID(), @tenantId, @schoolId, @student3Id, @installment3Feb, 'ENROLLMENT', 400, 400, 'CASH', '2025-02-18', '2025-02-18', NOW());

-- Student 4 (Arjun): Paid April & May
SET @installment4Apr = (SELECT id FROM StudentFeeInstallment WHERE studentId = @student4Id AND dueDate = '2025-04-10' LIMIT 1);
SET @installment4May = (SELECT id FROM StudentFeeInstallment WHERE studentId = @student4Id AND dueDate = '2025-05-10' LIMIT 1);

INSERT INTO FinancialTransaction (id, tenantId, centerId, studentId, installmentId, type, grossAmount, netAmount, paymentMode, receivedAt, createdAt, updatedAt)
VALUES
  (UUID(), @tenantId, @schoolId, @student4Id, @installment4Apr, 'ENROLLMENT', 750, 750, 'UPI', '2025-04-10', '2025-04-10', NOW()),
  (UUID(), @tenantId, @schoolId, @student4Id, @installment4May, 'ENROLLMENT', 750, 750, 'UPI', '2025-05-15', '2025-05-15', NOW());

-- Student 7 (Ishaan): fully paid annual amount in advance (PAID filter test)
INSERT INTO FinancialTransaction (id, tenantId, centerId, studentId, installmentId, type, grossAmount, netAmount, paymentMode, receivedAt, createdAt, updatedAt)
VALUES
  (UUID(), @tenantId, @schoolId, @student7Id, NULL, 'ENROLLMENT', 12000, 12000, 'ONLINE', '2025-01-05', '2025-01-05', NOW());

-- Clean up
DROP PROCEDURE IF EXISTS CreateStudentInstallments;

SELECT '✅ Fee test data seeded successfully!' AS Result;
SELECT COUNT(*) AS 'Total Students' FROM Student WHERE tenantId = @tenantId AND isActive = 1;
SELECT COUNT(*) AS 'Total Batches' FROM Batch WHERE tenantId = @tenantId AND isActive = 1;
SELECT COUNT(*) AS 'Total Installments' FROM StudentFeeInstallment WHERE tenantId = @tenantId;
SELECT COUNT(*) AS 'Total Payments' FROM FinancialTransaction WHERE tenantId = @tenantId AND studentId IS NOT NULL;
