import { prisma } from '../lib/prisma.js';

// ─── Bulk Student Status ────────────────────────────────────
export async function bulkUpdateStudentStatus({ tenantId, studentIds, isActive, performedByUserId }) {
  if (!studentIds?.length) return { updated: 0 };

  // Verify all students belong to this tenant
  const students = await prisma.student.findMany({
    where: { tenantId, id: { in: studentIds } },
    select: { id: true, isActive: true },
  });
  const validIds = students.map(s => s.id);
  const alreadyMatchIds = students.filter(s => s.isActive === isActive).map(s => s.id);
  const toUpdateIds = validIds.filter(id => !alreadyMatchIds.includes(id));

  if (!toUpdateIds.length) return { updated: 0, skipped: alreadyMatchIds.length, invalid: studentIds.length - validIds.length };

  const result = await prisma.student.updateMany({
    where: { tenantId, id: { in: toUpdateIds } },
    data: { isActive },
  });

  // Also deactivate enrollments when deactivating students
  if (!isActive) {
    await prisma.enrollment.updateMany({
      where: { tenantId, studentId: { in: toUpdateIds }, status: 'ACTIVE' },
      data: { status: 'INACTIVE' },
    });
  }

  return { updated: result.count, skipped: alreadyMatchIds.length, invalid: studentIds.length - validIds.length };
}

// ─── Bulk Level Promotion ───────────────────────────────────
export async function bulkPromoteStudents({ tenantId, studentIds, newLevelId, performedByUserId }) {
  if (!studentIds?.length) return { promoted: 0 };

  // Verify level exists
  const level = await prisma.level.findFirst({ where: { tenantId, id: newLevelId } });
  if (!level) throw new Error('Target level not found');

  const students = await prisma.student.findMany({
    where: { tenantId, id: { in: studentIds } },
    select: { id: true, levelId: true },
  });
  const validIds = students.map(s => s.id);
  const alreadySame = students.filter(s => s.levelId === newLevelId).map(s => s.id);
  const toPromoteIds = validIds.filter(id => !alreadySame.includes(id));

  if (!toPromoteIds.length) return { promoted: 0, skipped: alreadySame.length, invalid: studentIds.length - validIds.length };

  const result = await prisma.student.updateMany({
    where: { tenantId, id: { in: toPromoteIds } },
    data: { levelId: newLevelId },
  });

  return { promoted: result.count, skipped: alreadySame.length, invalid: studentIds.length - validIds.length };
}

// ─── Bulk Batch Transfer ────────────────────────────────────
export async function bulkTransferStudents({ tenantId, studentIds, targetBatchId, targetTeacherUserId, performedByUserId }) {
  if (!studentIds?.length) return { transferred: 0 };

  // Verify target batch exists and is active
  const batch = await prisma.batch.findFirst({ where: { tenantId, id: targetBatchId, isActive: true } });
  if (!batch) throw new Error('Target batch not found or inactive');

  // If teacher specified, verify they exist
  if (targetTeacherUserId) {
    const teacher = await prisma.authUser.findFirst({ where: { tenantId, id: targetTeacherUserId, role: 'TEACHER' } });
    if (!teacher) throw new Error('Target teacher not found');
  }

  // Find active enrollments for these students
  const enrollments = await prisma.enrollment.findMany({
    where: { tenantId, studentId: { in: studentIds }, status: 'ACTIVE' },
    select: { id: true, studentId: true, batchId: true },
  });

  const alreadyInBatch = enrollments.filter(e => e.batchId === targetBatchId).map(e => e.studentId);
  const toTransfer = enrollments.filter(e => e.batchId !== targetBatchId);

  if (!toTransfer.length) return { transferred: 0, skipped: alreadyInBatch.length };

  // Transaction: deactivate old enrollments + create new ones
  const results = await prisma.$transaction(async (tx) => {
    // Deactivate current enrollments
    await tx.enrollment.updateMany({
      where: { id: { in: toTransfer.map(e => e.id) } },
      data: { status: 'INACTIVE' },
    });

    // Create new enrollments in target batch
    const newEnrollments = toTransfer.map(e => ({
      tenantId,
      hierarchyNodeId: batch.hierarchyNodeId,
      studentId: e.studentId,
      batchId: targetBatchId,
      assignedTeacherUserId: targetTeacherUserId || null,
      status: 'ACTIVE',
      startDate: new Date(),
    }));

    await tx.enrollment.createMany({ data: newEnrollments });

    // Update students' currentTeacherUserId if teacher specified
    if (targetTeacherUserId) {
      await tx.student.updateMany({
        where: { tenantId, id: { in: toTransfer.map(e => e.studentId) } },
        data: { currentTeacherUserId: targetTeacherUserId },
      });
    }

    return toTransfer.length;
  });

  return { transferred: results, skipped: alreadyInBatch.length };
}

// ─── Bulk Fee Update ────────────────────────────────────────
export async function bulkUpdateFees({ tenantId, studentIds, totalFeeAmount, admissionFeeAmount, feeConcessionAmount, performedByUserId }) {
  if (!studentIds?.length) return { updated: 0 };

  const students = await prisma.student.findMany({
    where: { tenantId, id: { in: studentIds } },
    select: { id: true },
  });
  const validIds = students.map(s => s.id);

  if (!validIds.length) return { updated: 0, invalid: studentIds.length };

  const data = {};
  if (totalFeeAmount !== undefined) data.totalFeeAmount = totalFeeAmount;
  if (admissionFeeAmount !== undefined) data.admissionFeeAmount = admissionFeeAmount;
  if (feeConcessionAmount !== undefined) data.feeConcessionAmount = feeConcessionAmount;

  if (!Object.keys(data).length) return { updated: 0, error: 'No fee fields provided' };

  const result = await prisma.student.updateMany({
    where: { tenantId, id: { in: validIds } },
    data,
  });

  return { updated: result.count, invalid: studentIds.length - validIds.length };
}

// ─── Bulk Teacher Assignment ────────────────────────────────
export async function bulkAssignTeacher({ tenantId, studentIds, teacherUserId, performedByUserId }) {
  if (!studentIds?.length) return { assigned: 0 };

  const teacher = await prisma.authUser.findFirst({ where: { tenantId, id: teacherUserId, role: 'TEACHER' } });
  if (!teacher) throw new Error('Teacher not found');

  const students = await prisma.student.findMany({
    where: { tenantId, id: { in: studentIds } },
    select: { id: true },
  });
  const validIds = students.map(s => s.id);

  if (!validIds.length) return { assigned: 0, invalid: studentIds.length };

  const result = await prisma.$transaction(async (tx) => {
    // Update student records
    const updated = await tx.student.updateMany({
      where: { tenantId, id: { in: validIds } },
      data: { currentTeacherUserId: teacherUserId },
    });

    // Update active enrollments
    await tx.enrollment.updateMany({
      where: { tenantId, studentId: { in: validIds }, status: 'ACTIVE' },
      data: { assignedTeacherUserId: teacherUserId },
    });

    return updated.count;
  });

  return { assigned: result, invalid: studentIds.length - validIds.length };
}


