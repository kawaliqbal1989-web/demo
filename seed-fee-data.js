import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();

async function seedFeeData() {
  console.log("Starting fee data seed...");

  const tenantId = "tenant_default";

  // Get existing IDs
  const school = await prisma.hierarchyNode.findFirst({
    where: { code: "SCH-001", tenantId }
  });
  
  const centerAuth = await prisma.authUser.findFirst({
    where: { email: "center.manager@abacusweb.local", tenantId }
  });
  
  const level1 = await prisma.level.findFirst({
    where: { rank: 1, tenantId }
  });
  
  const level2 = await prisma.level.findFirst({
    where: { rank: 2, tenantId }
  });

  if (!school || !centerAuth || !level1 || !level2) {
    throw new Error("Missing required base data. Run main seed first.");
  }

  console.log("✓ Base data found");

  // Create additional teachers
  const teacher2 = await prisma.authUser.upsert({
    where: { tenantId_email: { tenantId, email: "teacher.two@abacusweb.local" } },
    update: { isActive: true },
    create: {
      tenantId,
      email: "teacher.two@abacusweb.local",
      username: "TE002",
      role: "TEACHER",
      passwordHash: await import("bcryptjs").then(bcrypt => bcrypt.hashSync("Pass@123", 12)),
      hierarchyNodeId: school.id,
      parentUserId: centerAuth.id,
      isActive: true
    }
  });

  const teacher3 = await prisma.authUser.upsert({
    where: { tenantId_email: { tenantId, email: "teacher.three@abacusweb.local" } },
    update: { isActive: true },
    create: {
      tenantId,
      email: "teacher.three@abacusweb.local",
      username: "TE003",
      role: "TEACHER",
      passwordHash: await import("bcryptjs").then(bcrypt => bcrypt.hashSync("Pass@123", 12)),
      hierarchyNodeId: school.id,
      parentUserId: centerAuth.id,
      isActive: true
    }
  });

  console.log("✓ Teachers created");

  // Get teacher 1
  const teacher1 = await prisma.authUser.findFirst({
    where: { email: "teacher.one@abacusweb.local", tenantId }
  });

  // Create teacher profiles
  await prisma.teacherProfile.upsert({
    where: { authUserId: teacher2.id },
    update: { fullName: "Teacher Two", status: "ACTIVE", isActive: true },
    create: {
      tenantId,
      hierarchyNodeId: school.id,
      authUserId: teacher2.id,
      fullName: "Teacher Two",
      status: "ACTIVE",
      isActive: true
    }
  });

  await prisma.teacherProfile.upsert({
    where: { authUserId: teacher3.id },
    update: { fullName: "Teacher Three", status: "ACTIVE", isActive: true },
    create: {
      tenantId,
      hierarchyNodeId: school.id,
      authUserId: teacher3.id,
      fullName: "Teacher Three",
      status: "ACTIVE",
      isActive: true
    }
  });

  console.log("✓ Teacher profiles created");

  // Create batches
  const batch1 = await prisma.batch.upsert({
    where: { tenantId_hierarchyNodeId_name: { tenantId, hierarchyNodeId: school.id, name: "Level 1 - Morning Batch" } },
    update: { isActive: true },
    create: {
      tenantId,
      name: "Level 1 - Morning Batch",
      hierarchyNodeId: school.id,
      primaryTeacherUserId: teacher1.id,
      isActive: true
    }
  });

  const batch2 = await prisma.batch.upsert({
    where: { tenantId_hierarchyNodeId_name: { tenantId, hierarchyNodeId: school.id, name: "Level 1 - Evening Batch" } },
    update: { isActive: true },
    create: {
      tenantId,
      name: "Level 1 - Evening Batch",
      hierarchyNodeId: school.id,
      primaryTeacherUserId: teacher2.id,
      isActive: true
    }
  });

  const batch3 = await prisma.batch.upsert({
    where: { tenantId_hierarchyNodeId_name: { tenantId, hierarchyNodeId: school.id, name: "Level 2 - Weekend Batch" } },
    update: { isActive: true },
    create: {
      tenantId,
      name: "Level 2 - Weekend Batch",
      hierarchyNodeId: school.id,
      primaryTeacherUserId: teacher3.id,
      isActive: true
    }
  });

  console.log("✓ Batches created");

  // Create students
  const studentsData = [
    { admissionNo: "ADM-1003", firstName: "Riya", lastName: "Gupta", phone: "+91-9876543210", guardianPhone: "+91-9876543211", levelId: level1.id, totalFee: 12000, admissionFee: 2000, concession: 0, batchId: batch1.id },
    { admissionNo: "ADM-1004", firstName: "Arjun", lastName: "Patel", phone: "+91-9876543220", guardianPhone: "+91-9876543221", levelId: level1.id, totalFee: 12000, admissionFee: 2000, concession: 1000, batchId: batch1.id },
    { admissionNo: "ADM-1005", firstName: "Ananya", lastName: "Singh", phone: "+91-9876543230", guardianPhone: "+91-9876543231", levelId: level1.id, totalFee: 12000, admissionFee: 2000, concession: 0, batchId: batch2.id },
    { admissionNo: "ADM-1006", firstName: "Vivaan", lastName: "Kumar", phone: "+91-9876543240", guardianPhone: "+91-9876543241", levelId: level2.id, totalFee: 15000, admissionFee: 3000, concession: 500, batchId: batch3.id },
    { admissionNo: "ADM-1007", firstName: "Ishaan", lastName: "Reddy", phone: "+91-9876543250", guardianPhone: "+91-9876543251", levelId: level2.id, totalFee: 15000, admissionFee: 3000, concession: 0, batchId: batch3.id },
    { admissionNo: "ADM-1008", firstName: "Saanvi", lastName: "Mehta", phone: "+91-9876543260", guardianPhone: "+91-9876543261", levelId: level1.id, totalFee: 12000, admissionFee: 2000, concession: 2000, batchId: batch2.id }
  ];

  const students = [];
  for (const data of studentsData) {
    const student = await prisma.student.upsert({
      where: { tenantId_admissionNo: { tenantId, admissionNo: data.admissionNo } },
      update: {
        phonePrimary: data.phone,
        guardianPhone: data.guardianPhone,
        totalFeeAmount: data.totalFee,
        admissionFeeAmount: data.admissionFee,
        feeConcessionAmount: data.concession,
        isActive: true
      },
      create: {
        tenantId,
        admissionNo: data.admissionNo,
        firstName: data.firstName,
        lastName: data.lastName,
        email: `${data.firstName.toLowerCase()}@example.com`,
        phonePrimary: data.phone,
        guardianPhone: data.guardianPhone,
        hierarchyNodeId: school.id,
        levelId: data.levelId,
        totalFeeAmount: data.totalFee,
        admissionFeeAmount: data.admissionFee,
        feeConcessionAmount: data.concession,
        isActive: true
      }
    });
    students.push({ ...student, batchId: data.batchId });
  }

  // Update existing students
  await prisma.student.updateMany({
    where: { admissionNo: "ADM-1001", tenantId },
    data: {
      phonePrimary: "+91-9876543200",
      guardianPhone: "+91-9876543201",
      totalFeeAmount: 12000,
      admissionFeeAmount: 2000,
      feeConcessionAmount: 0,
      isActive: true
    }
  });

  await prisma.student.updateMany({
    where: { admissionNo: "ADM-1002", tenantId },
    data: {
      phonePrimary: "+91-9876543205",
      guardianPhone: "+91-9876543206",
      totalFeeAmount: 15000,
      admissionFeeAmount: 3000,
      feeConcessionAmount: 1500,
      isActive: true
    }
  });

  const student1 = await prisma.student.findFirst({ where: { admissionNo: "ADM-1001", tenantId } });
  const student2 = await prisma.student.findFirst({ where: { admissionNo: "ADM-1002", tenantId } });

  console.log("✓ Students created/updated");

  // Enroll students in batches
  const allStudents = [
    { id: student1.id, batchId: batch1.id },
    { id: student2.id, batchId: batch3.id },
    ...students.map(s => ({ id: s.id, batchId: s.batchId }))
  ];

  for (const { id, batchId } of allStudents) {
    const existingEnrollment = await prisma.enrollment.findFirst({
      where: { studentId: id, batchId, tenantId }
    });
    
    if (!existingEnrollment) {
      await prisma.enrollment.create({
        data: {
          tenantId,
          hierarchyNodeId: school.id,
          studentId: id,
          batchId,
          status: "ACTIVE",
          startDate: new Date("2025-01-01")
        }
      });
    } else {
      await prisma.enrollment.update({
        where: { id: existingEnrollment.id },
        data: { status: "ACTIVE" }
      });
    }
  }

  console.log("✓ Batch enrollments created");

  // Create fee installments for 2026 (current year for better testing)
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  for (const studentData of allStudents) {
    const student = await prisma.student.findUnique({ where: { id: studentData.id } });
    const tuitionFee = (student.totalFeeAmount || 12000) - (student.admissionFeeAmount || 2000) - (student.feeConcessionAmount || 0);
    const monthlyInstallment = Math.round(tuitionFee / 12);

    for (let month = 1; month <= 12; month++) {
      const dueDate = new Date(`2026-${String(month).padStart(2, "0")}-10`);
      
      const existing = await prisma.studentFeeInstallment.findFirst({
        where: {
          tenantId,
          studentId: studentData.id,
          dueDate
        }
      });
      
      if (!existing) {
        await prisma.studentFeeInstallment.create({
          data: {
            tenantId,
            studentId: studentData.id,
            amount: monthlyInstallment,
            dueDate
          }
        });
      }
    }
  }

  console.log("✓ Fee installments created");

  // Create varied payment patterns for realistic testing
  const paymentsData = [
    // Student 1 (Aarav): Paid Jan, Feb, Mar fully - NO OVERDUE
    { studentId: student1.id, month: 1, amount: 850, date: new Date("2026-01-15"), mode: "CASH" },
    { studentId: student1.id, month: 2, amount: 850, date: new Date("2026-02-15"), mode: "ONLINE" },
    { studentId: student1.id, month: 3, amount: 850, date: new Date("2026-03-15"), mode: "GPAY" },
    
    // Student 2 (Diya): Paid Jan only, Feb-Apr OVERDUE
    { studentId: student2.id, month: 1, amount: 1083, date: new Date("2026-01-20"), mode: "CASH" },
    
    // Student 3 (Riya - students[0]): Partial payments, some overdue
    { studentId: students[0].id, month: 1, amount: 850, date: new Date("2026-01-12"), mode: "GPAY" },
    { studentId: students[0].id, month: 2, amount: 400, date: new Date("2026-02-18"), mode: "CASH" },
    { studentId: students[0].id, month: 3, amount: 850, date: new Date("2026-03-20"), mode: "ONLINE" },
    
    // Student 4 (Arjun - students[1]): No payments - ALL OVERDUE (Jan-Apr)
    // (no payments for this student)
    
    // Student 5 (Ananya - students[2]): Paid Jan, Feb fully
    { studentId: students[2].id, month: 1, amount: 850, date: new Date("2026-01-18"), mode: "CASH" },
    { studentId: students[2].id, month: 2, amount: 850, date: new Date("2026-02-20"), mode: "PAYTM" },
    
    // Student 6 (Vivaan - students[3]): Partial payment for Jan, Feb-Apr overdue
    { studentId: students[3].id, month: 1, amount: 600, date: new Date("2026-01-25"), mode: "CASH" },
    
    // Student 7 (Ishaan - students[4]): Fully paid all 12 months (PAID filter test)
    { studentId: students[4].id, month: 1, amount: 1083, date: new Date("2026-01-10"), mode: "ONLINE" },
    { studentId: students[4].id, month: 2, amount: 1083, date: new Date("2026-02-10"), mode: "ONLINE" },
    { studentId: students[4].id, month: 3, amount: 1083, date: new Date("2026-03-10"), mode: "ONLINE" },
    { studentId: students[4].id, month: 4, amount: 1083, date: new Date("2026-04-10"), mode: "ONLINE" },
    { studentId: students[4].id, month: 5, amount: 1083, date: new Date("2026-05-10"), mode: "ONLINE" },
    { studentId: students[4].id, month: 6, amount: 1083, date: new Date("2026-06-10"), mode: "ONLINE" },
    { studentId: students[4].id, month: 7, amount: 1083, date: new Date("2026-07-10"), mode: "ONLINE" },
    { studentId: students[4].id, month: 8, amount: 1083, date: new Date("2026-08-10"), mode: "ONLINE" },
    { studentId: students[4].id, month: 9, amount: 1083, date: new Date("2026-09-10"), mode: "ONLINE" },
    { studentId: students[4].id, month: 10, amount: 1083, date: new Date("2026-10-10"), mode: "ONLINE" },
    { studentId: students[4].id, month: 11, amount: 1083, date: new Date("2026-11-10"), mode: "ONLINE" },
    { studentId: students[4].id, month: 12, amount: 1083, date: new Date("2026-12-10"), mode: "ONLINE" },
    
    // Student 8 (Saanvi - students[5]): No payments - ALL OVERDUE
    // (no payments for this student)
  ];

  for (const payment of paymentsData) {
    const installment = await prisma.studentFeeInstallment.findFirst({
      where: {
        tenantId,
        studentId: payment.studentId,
        dueDate: new Date(`2026-${String(payment.month).padStart(2, "0")}-10`)
      }
    });

    if (installment) {
      await prisma.financialTransaction.create({
        data: {
          tenantId,
          centerId: school.id,
          studentId: payment.studentId,
          installmentId: installment.id,
          type: "ENROLLMENT",
          grossAmount: payment.amount,
          centerShare: payment.amount,
          franchiseShare: 0,
          bpShare: 0,
          platformShare: 0,
          paymentMode: payment.mode,
          receivedAt: payment.date,
          createdAt: payment.date,
          createdByUserId: centerAuth.id
        }
      });
    }
  }

  console.log("✓ Payment transactions created");

  // Summary
  const studentCount = await prisma.student.count({ where: { tenantId, isActive: true } });
  const batchCount = await prisma.batch.count({ where: { tenantId, isActive: true } });
  const installmentCount = await prisma.studentFeeInstallment.count({ where: { tenantId } });
  const paymentCount = await prisma.financialTransaction.count({ where: { tenantId, studentId: { not: null } } });

  console.log("\n========== SEED SUMMARY ==========");
  console.log(`Total Students: ${studentCount}`);
  console.log(`Total Batches: ${batchCount}`);
  console.log(`Total Installments (2026): ${installmentCount}`);
  console.log(`Total Payments: ${paymentCount}`);
  console.log("\n📞 Calling List Test Scenarios:");
  console.log("  • Student 1 (Aarav): Paid Jan-Mar ✅ (Apr pending, not overdue yet)");
  console.log("  • Student 2 (Diya): Paid Jan only (Feb-Apr OVERDUE)");
  console.log("  • Student 3 (Riya): Partial Feb payment (Feb partial, Mar-Apr OVERDUE)");
  console.log("  • Student 4 (Arjun): NO PAYMENTS (Jan-Apr ALL OVERDUE)");
  console.log("  • Student 5 (Ananya): Paid Jan-Feb ✅ (Mar-Apr OVERDUE)");
  console.log("  • Student 6 (Vivaan): Partial Jan payment (Jan partial, Feb-Apr OVERDUE)");
  console.log("  • Student 7 (Ishaan): Paid all Jan-Dec ✅ (PAID filter test)");
  console.log("  • Student 8 (Saanvi): NO PAYMENTS (Jan-Apr ALL OVERDUE)");
  console.log("==================================\n");
  console.log("✅ Fee test data seeded successfully!");
  console.log("💡 Tip: View 'Calling List' to see students with overdue/pending fees");
}

seedFeeData()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("❌ Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
