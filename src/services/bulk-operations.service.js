import { prisma } from '../lib/prisma.js';

function makeBulkError(message, statusCode = 400, errorCode = 'BULK_OPERATION_INVALID') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}

function buildScopedStudentWhere({ tenantId, studentIds, actorRole, actorHierarchyNodeId }) {
  return {
    tenantId,
    id: { in: studentIds },
    ...(actorRole !== 'SUPERADMIN' && actorHierarchyNodeId ? { hierarchyNodeId: actorHierarchyNodeId } : {})
  };
}

function normalizeNumericFee(value, fieldName) {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw makeBulkError(`${fieldName} must be a non-negative number`, 400, 'INVALID_FEE_VALUE');
  }
  return n;
}

// ─── Bulk Student Status ────────────────────────────────────
export async function bulkUpdateStudentStatus({ tenantId, studentIds, isActive, performedByUserId, actorRole, actorHierarchyNodeId }) {
  if (!studentIds?.length) return { updated: 0 };

  const scopedWhere = buildScopedStudentWhere({
    tenantId,
    studentIds,
    actorRole,
    actorHierarchyNodeId
  });

  const students = await prisma.student.findMany({
    where: scopedWhere,
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
export async function bulkPromoteStudents({ tenantId, studentIds, newLevelId, performedByUserId, actorRole, actorHierarchyNodeId }) {
  if (!studentIds?.length) return { promoted: 0 };

  // Verify level exists
  const level = await prisma.level.findFirst({ where: { tenantId, id: newLevelId } });
  if (!level) throw makeBulkError('Target level not found', 404, 'LEVEL_NOT_FOUND');

  const scopedWhere = buildScopedStudentWhere({
    tenantId,
    studentIds,
    actorRole,
    actorHierarchyNodeId
  });

  const students = await prisma.student.findMany({
    where: scopedWhere,
    select: { id: true, levelId: true },
  });

  const validIds = students.map(s => s.id);
  const alreadySame = students.filter(s => s.levelId === newLevelId).map(s => s.id);
  const toPromoteIds = validIds.filter(id => !alreadySame.includes(id));

  if (!toPromoteIds.length) return { promoted: 0, skipped: alreadySame.length, invalid: studentIds.length - validIds.length };

  const result = await prisma.$transaction(async (tx) => {
    const updatedStudents = await tx.student.updateMany({
      where: { tenantId, id: { in: toPromoteIds } },
      data: { levelId: newLevelId },
    });

    // Keep effective level in sync for students with active enrollments.
    await tx.enrollment.updateMany({
      where: {
        tenantId,
        studentId: { in: toPromoteIds },
        status: 'ACTIVE'
      },
      data: {
        levelId: newLevelId
      }
    });

    return updatedStudents.count;
  });

  return { promoted: result, skipped: alreadySame.length, invalid: studentIds.length - validIds.length };
}

// ─── Bulk Batch Transfer ────────────────────────────────────
export async function bulkTransferStudents({ tenantId, studentIds, targetBatchId, targetTeacherUserId, performedByUserId, actorRole, actorHierarchyNodeId }) {
  if (!studentIds?.length) return { transferred: 0 };

  // Verify target batch exists and is active
  const batch = await prisma.batch.findFirst({
    where: {
      tenantId,
      id: targetBatchId,
      isActive: true,
      ...(actorRole !== 'SUPERADMIN' && actorHierarchyNodeId ? { hierarchyNodeId: actorHierarchyNodeId } : {})
    },
    include: {
      teacherAssignments: {
        select: { teacherUserId: true }
      }
    }
  });
  if (!batch) throw makeBulkError('Target batch not found or inactive', 404, 'TARGET_BATCH_NOT_FOUND');

  // If teacher specified, verify they exist
  if (targetTeacherUserId) {
    const teacher = await prisma.authUser.findFirst({
      where: {
        tenantId,
        id: targetTeacherUserId,
        role: 'TEACHER',
        hierarchyNodeId: batch.hierarchyNodeId,
        isActive: true
      }
    });
    if (!teacher) throw makeBulkError('Target teacher not found', 404, 'TARGET_TEACHER_NOT_FOUND');
  }

  const scopedWhere = buildScopedStudentWhere({
    tenantId,
    studentIds,
    actorRole,
    actorHierarchyNodeId
  });

  const scopedStudents = await prisma.student.findMany({
    where: scopedWhere,
    select: {
      id: true,
      isActive: true
    }
  });

  const scopedStudentIds = new Set(scopedStudents.map((s) => s.id));
  const inactiveStudentIds = scopedStudents.filter((s) => !s.isActive).map((s) => s.id);

  // Find active enrollments for these students
  const enrollments = await prisma.enrollment.findMany({
    where: { tenantId, studentId: { in: Array.from(scopedStudentIds) }, status: 'ACTIVE' },
    select: {
      id: true,
      studentId: true,
      batchId: true,
      levelId: true,
      assignedTeacherUserId: true,
      student: {
        select: {
          hierarchyNodeId: true,
          levelId: true
        }
      }
    },
  });

  const batchTeacherIds = batch.teacherAssignments.map((assignment) => assignment.teacherUserId);
  const alreadyInBatch = enrollments.filter(e => e.batchId === targetBatchId).map(e => e.studentId);
  const invalid = enrollments.filter((enrollment) => enrollment.student?.hierarchyNodeId !== batch.hierarchyNodeId);
  const noActiveEnrollmentIds = Array.from(scopedStudentIds).filter(
    (id) => !enrollments.some((enrollment) => enrollment.studentId === id)
  );
  const toTransfer = enrollments.filter((enrollment) => {
    if (enrollment.batchId === targetBatchId) return false;
    return enrollment.student?.hierarchyNodeId === batch.hierarchyNodeId;
  });

  if (!toTransfer.length) {
    return {
      transferred: 0,
      skipped: alreadyInBatch.length,
      invalid: invalid.length + noActiveEnrollmentIds.length + inactiveStudentIds.length + (studentIds.length - scopedStudentIds.size)
    };
  }

  // Transaction: deactivate old enrollments + create new ones
  const results = await prisma.$transaction(async (tx) => {
    // Deactivate current enrollments
    await tx.enrollment.updateMany({
      where: { id: { in: toTransfer.map(e => e.id) } },
      data: { status: 'INACTIVE' },
    });

    // Create new enrollments in target batch
    const newEnrollments = toTransfer.map((enrollment) => {
      const fallbackTeacherUserId = batchTeacherIds.includes(enrollment.assignedTeacherUserId)
        ? enrollment.assignedTeacherUserId
        : (batchTeacherIds[0] || null);
      const resolvedTeacherUserId = targetTeacherUserId || fallbackTeacherUserId;
      const resolvedLevelId = enrollment.levelId || enrollment.student?.levelId || null;

      return {
        tenantId,
        hierarchyNodeId: batch.hierarchyNodeId,
        studentId: enrollment.studentId,
        batchId: targetBatchId,
        assignedTeacherUserId: resolvedTeacherUserId,
        levelId: resolvedLevelId,
        status: 'ACTIVE',
        startDate: new Date(),
      };
    });

    await tx.enrollment.createMany({ data: newEnrollments });

    for (const enrollment of newEnrollments) {
      await tx.student.update({
        where: { id: enrollment.studentId },
        data: {
          currentTeacherUserId: enrollment.assignedTeacherUserId,
          ...(enrollment.levelId ? { levelId: enrollment.levelId } : {})
        },
      });
    }

    return toTransfer.length;
  });

  return {
    transferred: results,
    skipped: alreadyInBatch.length,
    invalid: invalid.length + noActiveEnrollmentIds.length + inactiveStudentIds.length + (studentIds.length - scopedStudentIds.size)
  };
}

// ─── Bulk Fee Update ────────────────────────────────────────
export async function bulkUpdateFees({ tenantId, studentIds, totalFeeAmount, admissionFeeAmount, feeConcessionAmount, performedByUserId, actorRole, actorHierarchyNodeId }) {
  if (!studentIds?.length) return { updated: 0 };

  const scopedWhere = buildScopedStudentWhere({
    tenantId,
    studentIds,
    actorRole,
    actorHierarchyNodeId
  });

  const students = await prisma.student.findMany({
    where: scopedWhere,
    select: { id: true },
  });
  const validIds = students.map(s => s.id);

  if (!validIds.length) return { updated: 0, invalid: studentIds.length };

  const data = {};
  if (totalFeeAmount !== undefined) data.totalFeeAmount = normalizeNumericFee(totalFeeAmount, 'totalFeeAmount');
  if (admissionFeeAmount !== undefined) data.admissionFeeAmount = normalizeNumericFee(admissionFeeAmount, 'admissionFeeAmount');
  if (feeConcessionAmount !== undefined) data.feeConcessionAmount = normalizeNumericFee(feeConcessionAmount, 'feeConcessionAmount');

  if (!Object.keys(data).length) throw makeBulkError('No fee fields provided', 400, 'NO_FEE_FIELDS_PROVIDED');

  const result = await prisma.student.updateMany({
    where: { tenantId, id: { in: validIds } },
    data,
  });

  return { updated: result.count, invalid: studentIds.length - validIds.length };
}

// ─── Bulk Teacher Assignment ────────────────────────────────
export async function bulkAssignTeacher({ tenantId, studentIds, teacherUserId, performedByUserId, actorRole, actorHierarchyNodeId }) {
  if (!studentIds?.length) return { assigned: 0 };

  const teacher = await prisma.authUser.findFirst({
    where: {
      tenantId,
      id: teacherUserId,
      role: 'TEACHER',
      isActive: true,
      ...(actorRole !== 'SUPERADMIN' && actorHierarchyNodeId ? { hierarchyNodeId: actorHierarchyNodeId } : {})
    }
  });
  if (!teacher) throw makeBulkError('Teacher not found', 404, 'TEACHER_NOT_FOUND');

  const scopedWhere = buildScopedStudentWhere({
    tenantId,
    studentIds,
    actorRole,
    actorHierarchyNodeId
  });

  const students = await prisma.student.findMany({
    where: scopedWhere,
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


