import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admissionNo = process.env.ADMISSION_NO || "ST101";
  const teacherUsername = process.env.TEACHER_USERNAME || "T101";
  const courseCode = process.env.COURSE_CODE || "AB-L1";

  console.log(`Looking up student ${admissionNo}, teacher ${teacherUsername}, course ${courseCode}`);

  const student = await prisma.student.findFirst({ where: { admissionNo } });
  if (!student) {
    console.error("Student not found: ", admissionNo);
    process.exitCode = 2;
    return;
  }

  const teacher = await prisma.authUser.findFirst({ where: { username: teacherUsername, role: "TEACHER" } });
  if (!teacher) {
    console.warn("Teacher not found, proceeding without assigned teacher.");
  }

  // Try to find a batch with the course code in the name for the student's center
  let batch = await prisma.batch.findFirst({
    where: {
      hierarchyNodeId: student.hierarchyNodeId,
      name: { contains: courseCode }
    }
  });

  if (!batch) {
    console.warn(`No batch found with name containing ${courseCode} in student's center. Creating a new batch named ${courseCode}`);
    batch = await prisma.batch.create({
      data: {
        tenantId: student.tenantId,
        hierarchyNodeId: student.hierarchyNodeId,
        name: courseCode
      }
    });
  }

  // Prevent duplicate active enrollment for same batch and student
  const existing = await prisma.enrollment.findFirst({
    where: { tenantId: student.tenantId, studentId: student.id, batchId: batch.id, status: "ACTIVE" }
  });

  if (existing) {
    console.log("Student already has an active enrollment in this batch:", existing.id);
    process.exitCode = 0;
    return;
  }

  const created = await prisma.enrollment.create({
    data: {
      tenantId: student.tenantId,
      hierarchyNodeId: student.hierarchyNodeId,
      studentId: student.id,
      batchId: batch.id,
      assignedTeacherUserId: teacher ? teacher.id : null,
      status: "ACTIVE"
    },
    include: {
      student: { select: { admissionNo: true, firstName: true, lastName: true } },
      batch: { select: { name: true } },
      assignedTeacher: { select: { username: true, email: true } }
    }
  });

  console.log("Enrollment created:", JSON.stringify(created, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
