import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();

async function testAPI() {
  console.log("Testing API query...\n");

  const tenantId = "tenant_default";
  const centerId = await prisma.hierarchyNode.findFirst({
    where: { tenantId, code: "SCH-001" },
    select: { id: true }
  });

  if (!centerId) {
    console.log("❌ School not found");
    return;
  }

  // This is the EXACT query from the service
  const dataSql = `
    SELECT
      i.id,
      i.studentId,
      i.amount,
      i.dueDate,
      s.admissionNo,
      s.firstName,
      s.lastName,
      s.phonePrimary,
      s.guardianPhone,
      COALESCE(SUM(t.grossAmount), 0) AS paidAmount,
      MAX(t.receivedAt) AS lastPaymentDate,
      (SELECT b2.name FROM Enrollment e2 
       LEFT JOIN Batch b2 ON b2.id = e2.batchId 
       WHERE e2.studentId = s.id AND e2.status = 'ACTIVE' 
       LIMIT 1) AS batchName,
      (SELECT tp2.fullName FROM Enrollment e3
       LEFT JOIN Batch b3 ON b3.id = e3.batchId
       LEFT JOIN TeacherProfile tp2 ON tp2.authUserId = b3.primaryTeacherUserId
       WHERE e3.studentId = s.id AND e3.status = 'ACTIVE'
       LIMIT 1) AS teacherName
    FROM StudentFeeInstallment i
    JOIN Student s ON s.id = i.studentId
    LEFT JOIN FinancialTransaction t
      ON t.installmentId = i.id
      AND t.tenantId = i.tenantId
      AND t.centerId = ?
      AND t.type IN (?, ?)
    WHERE i.tenantId = ?
      AND s.tenantId = ?
      AND s.hierarchyNodeId = ?
      AND s.isActive = 1
    GROUP BY i.id, i.studentId, i.amount, i.dueDate, s.admissionNo, s.firstName, s.lastName, s.phonePrimary, s.guardianPhone, s.id
    HAVING (i.amount - COALESCE(SUM(t.grossAmount), 0)) > 0
    ORDER BY i.dueDate ASC, i.id ASC
    LIMIT ? OFFSET ?
  `;

  const rows = await prisma.$queryRawUnsafe(
    dataSql,
    centerId.id,
    "ENROLLMENT",
    "RENEWAL",
    tenantId,
    tenantId,
    centerId.id,
    500, // limit
    0 // offset
  );

  console.log(`Total rows returned: ${rows.length}\n`);

  if (rows.length > 0) {
    console.log("All pending installments:");
    rows.forEach((row, idx) => {
      const pending = Number(row.amount) - Number(row.paidAmount || 0);
      const dueDate = new Date(row.dueDate);
      const isOverdue = dueDate < new Date();
      const status = isOverdue ? "OVERDUE" : "PENDING";
      console.log(`  ${idx + 1}. ${row.firstName} ${row.lastName} (${row.admissionNo}) - Due: ${dueDate.toISOString().slice(0, 10)} - ₹${pending} - ${status} - Batch: ${row.batchName || "N/A"} - Teacher: ${row.teacherName || "N/A"}`);
    });
  }

  await prisma.$disconnect();
}

testAPI().catch(console.error);
