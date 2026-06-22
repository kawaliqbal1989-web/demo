import {
  bulkUpdateStudentStatus,
  bulkPromoteStudents,
  bulkTransferStudents,
  bulkUpdateFees,
  bulkAssignTeacher,
} from '../services/bulk-operations.service.js';

// ─── Bulk Status Change ─────────────────────────────────────
export async function handleBulkStatusChange(req, res) {
  try {
    const { studentIds, isActive } = req.body;
    if (!Array.isArray(studentIds) || !studentIds.length) {
      return res.status(400).json({ error: 'studentIds array required' });
    }
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive boolean required' });
    }
    const result = await bulkUpdateStudentStatus({
      tenantId: req.auth.tenantId,
      studentIds,
      isActive,
      performedByUserId: req.auth.userId,
      actorRole: req.auth.role,
      actorHierarchyNodeId: req.auth.hierarchyNodeId,
    });
    res.locals.auditMetadata = {
      bulkAction: 'status',
      selectedCount: studentIds.length,
      ...result,
    };
    res.json(result);
  } catch (err) {
    console.error('Bulk status change error:', err);
    res.status(err.statusCode || 500).json({ error: err.message, error_code: err.errorCode || 'BULK_STATUS_CHANGE_FAILED' });
  }
}

// ─── Bulk Level Promotion ───────────────────────────────────
export async function handleBulkPromote(req, res) {
  try {
    const { studentIds, newLevelId } = req.body;
    if (!Array.isArray(studentIds) || !studentIds.length) {
      return res.status(400).json({ error: 'studentIds array required' });
    }
    if (!newLevelId) {
      return res.status(400).json({ error: 'newLevelId required' });
    }
    const result = await bulkPromoteStudents({
      tenantId: req.auth.tenantId,
      studentIds,
      newLevelId,
      performedByUserId: req.auth.userId,
      actorRole: req.auth.role,
      actorHierarchyNodeId: req.auth.hierarchyNodeId,
    });
    res.locals.auditMetadata = {
      bulkAction: 'promote',
      selectedCount: studentIds.length,
      targetLevelId: newLevelId,
      ...result,
    };
    res.json(result);
  } catch (err) {
    console.error('Bulk promote error:', err);
    res.status(err.statusCode || 500).json({ error: err.message, error_code: err.errorCode || 'BULK_PROMOTE_FAILED' });
  }
}

// ─── Bulk Batch Transfer ────────────────────────────────────
export async function handleBulkTransfer(req, res) {
  try {
    const { studentIds, targetBatchId, targetTeacherUserId } = req.body;
    if (!Array.isArray(studentIds) || !studentIds.length) {
      return res.status(400).json({ error: 'studentIds array required' });
    }
    if (!targetBatchId) {
      return res.status(400).json({ error: 'targetBatchId required' });
    }
    const result = await bulkTransferStudents({
      tenantId: req.auth.tenantId,
      studentIds,
      targetBatchId,
      targetTeacherUserId: targetTeacherUserId || null,
      performedByUserId: req.auth.userId,
      actorRole: req.auth.role,
      actorHierarchyNodeId: req.auth.hierarchyNodeId,
    });
    res.locals.auditMetadata = {
      bulkAction: 'transfer',
      selectedCount: studentIds.length,
      targetBatchId,
      targetTeacherUserId: targetTeacherUserId || null,
      ...result,
    };
    res.json(result);
  } catch (err) {
    console.error('Bulk transfer error:', err);
    res.status(err.statusCode || 500).json({ error: err.message, error_code: err.errorCode || 'BULK_TRANSFER_FAILED' });
  }
}

// ─── Bulk Fee Update ────────────────────────────────────────
export async function handleBulkFeeUpdate(req, res) {
  try {
    const { studentIds, totalFeeAmount, admissionFeeAmount, feeConcessionAmount } = req.body;
    if (!Array.isArray(studentIds) || !studentIds.length) {
      return res.status(400).json({ error: 'studentIds array required' });
    }
    const result = await bulkUpdateFees({
      tenantId: req.auth.tenantId,
      studentIds,
      totalFeeAmount,
      admissionFeeAmount,
      feeConcessionAmount,
      performedByUserId: req.auth.userId,
      actorRole: req.auth.role,
      actorHierarchyNodeId: req.auth.hierarchyNodeId,
    });
    res.locals.auditMetadata = {
      bulkAction: 'fees',
      selectedCount: studentIds.length,
      ...result,
    };
    res.json(result);
  } catch (err) {
    console.error('Bulk fee update error:', err);
    res.status(err.statusCode || 500).json({ error: err.message, error_code: err.errorCode || 'BULK_FEE_UPDATE_FAILED' });
  }
}

// ─── Bulk Teacher Assignment ────────────────────────────────
export async function handleBulkAssignTeacher(req, res) {
  try {
    const { studentIds, teacherUserId } = req.body;
    if (!Array.isArray(studentIds) || !studentIds.length) {
      return res.status(400).json({ error: 'studentIds array required' });
    }
    if (!teacherUserId) {
      return res.status(400).json({ error: 'teacherUserId required' });
    }
    const result = await bulkAssignTeacher({
      tenantId: req.auth.tenantId,
      studentIds,
      teacherUserId,
      performedByUserId: req.auth.userId,
      actorRole: req.auth.role,
      actorHierarchyNodeId: req.auth.hierarchyNodeId,
    });
    res.locals.auditMetadata = {
      bulkAction: 'assign-teacher',
      selectedCount: studentIds.length,
      teacherUserId,
      ...result,
    };
    res.json(result);
  } catch (err) {
    console.error('Bulk assign teacher error:', err);
    res.status(err.statusCode || 500).json({ error: err.message, error_code: err.errorCode || 'BULK_ASSIGN_TEACHER_FAILED' });
  }
}
