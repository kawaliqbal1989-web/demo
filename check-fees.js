import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkFees() {
  console.log("Checking fee data...\n");

  const tenantId = "tenant_default";
  const centerId = await prisma.hierarchyNode.findFirst({
    where: { tenantId, code: "SCH-001" },
    select: { id: true, name: true }
  });

  if (!centerId) {
    console.log("❌ School not found");
    return;
  }

  console.log(`✓ Center: ${centerId.name} (${centerId.id})\n`);

  // Count installments
  const installments2026 = await prisma.studentFeeInstallment.count({
    where: {
      tenantId,
      dueDate: {
        gte: new Date("2026-01-01"),
        lt: new Date("2027-01-01")
      }
    }
  });

  console.log(`Installments in 2026: ${installments2026}`);

  // Count pending installments
  const pendingInstallments = await prisma.$queryRawUnsafe(`
    SELECT 
      i.id,
      i.studentId,
      i.amount,
      i.dueDate,
      s.admissionNo,
      s.firstName,
      s.lastName,
      COALESCE(SUM(t.grossAmount), 0) AS paidAmount
    FROM StudentFeeInstallment i
    JOIN Student s ON s.id = i.studentId
    LEFT JOIN FinancialTransaction t
      ON t.installmentId = i.id
      AND t.tenantId = i.tenantId
      AND t.centerId = '${centerId.id}'
      AND t.type IN ('ENROLLMENT', 'RENEWAL')
    WHERE i.tenantId = '${tenantId}'
      AND s.tenantId = '${tenantId}'
      AND s.hierarchyNodeId = '${centerId.id}'
      AND s.isActive = 1
      AND YEAR(i.dueDate) = 2026
    GROUP BY i.id, i.studentId, i.amount, i.dueDate, s.admissionNo, s.firstName, s.lastName
    HAVING (i.amount - COALESCE(SUM(t.grossAmount), 0)) > 0
    LIMIT 10
  `);

  console.log(`\nPending installments found: ${pendingInstallments.length}`);
  
  if (pendingInstallments.length > 0) {
    console.log("\nSample pending installments:");
    pendingInstallments.forEach((item, idx) => {
      const pending = Number(item.amount) - Number(item.paidAmount || 0);
      const dueDate = new Date(item.dueDate);
      const isOverdue = dueDate < new Date();
      const status = isOverdue ? "OVERDUE" : "PENDING";
      console.log(`  ${idx + 1}. ${item.firstName} ${item.lastName} (${item.admissionNo}) - Due: ${item.dueDate.toISOString().slice(0, 10)} - Pending: ₹${pending} - ${status}`);
    });
  }

  // Check payments
  const payments = await prisma.financialTransaction.count({
    where: {
      tenantId,
      centerId: centerId.id,
      type: { in: ["ENROLLMENT", "RENEWAL"] },
      installmentId: { not: null }
    }
  });

  console.log(`\nPayments recorded: ${payments}`);

  // Check students
  const students = await prisma.student.findMany({
    where: {
      tenantId,
      hierarchyNodeId: centerId.id,
      isActive: true
    },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true
    }
  });

  console.log(`\nActive students: ${students.length}`);

  await prisma.$disconnect();
}

checkFees().catch(console.error);
