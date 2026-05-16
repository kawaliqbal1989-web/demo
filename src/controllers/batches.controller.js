import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  batchStatusToIsActive,
  normalizeBatchModality,
  normalizeBatchStatus,
  normalizeTags,
  parseBatchCatalogQuery
} from "../utils/batch-catalog-query.js";
import { listBatchCatalog } from "../services/batch-catalog.service.js";
import {
  createBatchScheduleSlots,
  normalizeScheduleSlots,
  serializeLegacySchedule,
  summarizeScheduleSlots,
  updateBatchScheduleSlots
} from "../services/batch-schedule.service.js";
import { getBatchConflictWarnings } from "../services/batch-conflict.service.js";

async function ensureLevel({ tenantId, levelId }) {
  if (!levelId) {
    return null;
  }

  const level = await prisma.level.findFirst({
    where: {
      tenantId,
      id: String(levelId)
    },
    select: { id: true }
  });

  if (!level) {
    throw new Error("LEVEL_NOT_FOUND");
  }

  return level.id;
}

async function ensurePrimaryTeacher({ tenantId, hierarchyNodeId, primaryTeacherUserId }) {
  if (!primaryTeacherUserId) {
    return null;
  }

  const teacher = await prisma.authUser.findFirst({
    where: {
      tenantId,
      id: String(primaryTeacherUserId),
      role: "TEACHER",
      hierarchyNodeId,
      isActive: true
    },
    select: { id: true }
  });

  if (!teacher) {
    throw new Error("INVALID_PRIMARY_TEACHER");
  }

  return teacher.id;
}

async function loadBatchView({ tenantId, batchId }) {
  const [batch, currentStudents] = await Promise.all([
    prisma.batch.findFirst({
      where: {
        tenantId,
        id: batchId
      },
      include: {
        level: {
          select: {
            id: true,
            name: true,
            rank: true
          }
        },
        scheduleSlots: {
          orderBy: [
            { dayOfWeek: "asc" },
            { startTime: "asc" },
            { endTime: "asc" }
          ]
        },
        teacherAssignments: {
          select: {
            teacher: {
              select: {
                id: true,
                username: true,
                email: true,
                isActive: true
              }
            }
          }
        }
      }
    }),
    prisma.enrollment.count({
      where: {
        tenantId,
        batchId,
        status: "ACTIVE"
      }
    })
  ]);

  if (!batch) {
    return null;
  }

  return {
    ...batch,
    currentStudents,
    capacityDisplay: batch.maxStudents ? `${currentStudents} / ${batch.maxStudents}` : `${currentStudents}`,
    scheduleSummary: summarizeScheduleSlots(batch.scheduleSlots || [])
  };
}

function normalizeBatchPayload(reqBody = {}) {
  const normalizedStatus = reqBody.status === undefined ? undefined : normalizeBatchStatus(reqBody.status);
  if (reqBody.status !== undefined && !normalizedStatus) {
    throw new Error("INVALID_BATCH_STATUS");
  }

  const normalizedModality = reqBody.modality === undefined && reqBody.mode === undefined
    ? undefined
    : normalizeBatchModality(reqBody.modality || reqBody.mode);
  if ((reqBody.modality !== undefined || reqBody.mode !== undefined) && !normalizedModality) {
    throw new Error("INVALID_BATCH_MODALITY");
  }

  return {
    name: reqBody.name === undefined ? undefined : String(reqBody.name || "").trim(),
    status: normalizedStatus,
    modality: normalizedModality,
    levelId: reqBody.levelId ? String(reqBody.levelId).trim() : null,
    primaryTeacherUserId: reqBody.primaryTeacherUserId ? String(reqBody.primaryTeacherUserId).trim() : null,
    maxStudents: reqBody.maxStudents === undefined || reqBody.maxStudents === null || reqBody.maxStudents === ""
      ? null
      : Math.max(0, Number.parseInt(String(reqBody.maxStudents), 10)),
    durationMinutes: reqBody.durationMinutes === undefined || reqBody.durationMinutes === null || reqBody.durationMinutes === ""
      ? null
      : Math.max(0, Number.parseInt(String(reqBody.durationMinutes), 10)),
    tags: normalizeTags(reqBody.tags),
    notes: reqBody.notes === undefined ? undefined : (reqBody.notes ? String(reqBody.notes) : null),
    schedule: reqBody.schedule,
    scheduleSlots: reqBody.scheduleSlots
  };
}

const listBatches = asyncHandler(async (req, res) => {
  const query = parseBatchCatalogQuery(req.query);
  const result = await listBatchCatalog({
    tenantId: req.auth.tenantId,
    actor: req.auth,
    query
  });

  return res.apiSuccess("Batches fetched", {
    items: result.items,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    page: result.page,
    pageSize: result.pageSize
  });
});

const createBatch = asyncHandler(async (req, res) => {
  const { centerId } = req.body;
  const payload = normalizeBatchPayload(req.body);

  const hierarchyNodeId = req.auth.role === "SUPERADMIN" ? (centerId ? String(centerId) : null) : req.auth.hierarchyNodeId;
  if (!hierarchyNodeId) {
    return res.apiError(400, "centerId is required", "VALIDATION_ERROR");
  }

  if (!payload.name) {
    return res.apiError(400, "name is required", "VALIDATION_ERROR");
  }

  let resolvedLevelId = null;
  let resolvedPrimaryTeacherUserId = null;
  let normalizedScheduleSlots = [];

  try {
    resolvedLevelId = await ensureLevel({ tenantId: req.auth.tenantId, levelId: payload.levelId });
    resolvedPrimaryTeacherUserId = await ensurePrimaryTeacher({
      tenantId: req.auth.tenantId,
      hierarchyNodeId,
      primaryTeacherUserId: payload.primaryTeacherUserId
    });
    normalizedScheduleSlots = payload.scheduleSlots === undefined ? [] : normalizeScheduleSlots(payload.scheduleSlots);
  } catch (error) {
    const code = String(error?.message || "");
    if (code === "LEVEL_NOT_FOUND") {
      return res.apiError(400, "levelId is invalid", "VALIDATION_ERROR");
    }
    if (code === "INVALID_PRIMARY_TEACHER") {
      return res.apiError(400, "primaryTeacherUserId is invalid for this center", "VALIDATION_ERROR");
    }
    throw error;
  }

  const normalizedStatus = payload.status || "ACTIVE";
  const conflictWarnings = normalizedScheduleSlots.length
    ? await getBatchConflictWarnings({
        tenantId: req.auth.tenantId,
        hierarchyNodeId,
        teacherUserIds: resolvedPrimaryTeacherUserId ? [resolvedPrimaryTeacherUserId] : [],
        scheduleSlots: normalizedScheduleSlots
      })
    : [];

  const created = await prisma.$transaction(async (tx) => {
    const batch = await tx.batch.create({
      data: {
        tenantId: req.auth.tenantId,
        hierarchyNodeId,
        name: payload.name,
        modality: payload.modality,
        levelId: resolvedLevelId,
        primaryTeacherUserId: resolvedPrimaryTeacherUserId,
        maxStudents: payload.maxStudents,
        durationMinutes: payload.durationMinutes,
        schedule: payload.scheduleSlots !== undefined
          ? serializeLegacySchedule(normalizedScheduleSlots)
          : (payload.schedule && typeof payload.schedule === "object" ? payload.schedule : undefined),
        tags: payload.tags,
        notes: payload.notes,
        status: normalizedStatus,
        isActive: batchStatusToIsActive(normalizedStatus),
        archivedAt: normalizedStatus === "ARCHIVED" ? new Date() : null,
        archivedByUserId: normalizedStatus === "ARCHIVED" ? req.auth.userId : null
      }
    });

    if (resolvedPrimaryTeacherUserId) {
      await tx.batchTeacherAssignment.createMany({
        data: [{
          tenantId: req.auth.tenantId,
          batchId: batch.id,
          teacherUserId: resolvedPrimaryTeacherUserId
        }],
        skipDuplicates: true
      });
    }

    if (payload.scheduleSlots !== undefined) {
      await createBatchScheduleSlots({
        db: tx,
        tenantId: req.auth.tenantId,
        batchId: batch.id,
        scheduleSlots: normalizedScheduleSlots
      });
    }

    return batch;
  });

  const responsePayload = await loadBatchView({ tenantId: req.auth.tenantId, batchId: created.id });

  res.locals.entityId = created.id;
  return res.apiSuccess("Batch created", {
    ...responsePayload,
    scheduleWarnings: conflictWarnings
  }, 201);
});

const updateBatch = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = normalizeBatchPayload(req.body);

  const batch = await prisma.batch.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: {
      id: true,
      hierarchyNodeId: true,
      primaryTeacherUserId: true
    }
  });

  if (!batch) {
    return res.apiError(404, "Batch not found", "BATCH_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && batch.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  let resolvedLevelId = undefined;
  let resolvedPrimaryTeacherUserId = undefined;
  let normalizedScheduleSlots = undefined;

  try {
    resolvedLevelId = payload.levelId === undefined
      ? undefined
      : await ensureLevel({ tenantId: req.auth.tenantId, levelId: payload.levelId });
    resolvedPrimaryTeacherUserId = payload.primaryTeacherUserId === undefined
      ? undefined
      : await ensurePrimaryTeacher({
          tenantId: req.auth.tenantId,
          hierarchyNodeId: batch.hierarchyNodeId,
          primaryTeacherUserId: payload.primaryTeacherUserId
        });
    normalizedScheduleSlots = payload.scheduleSlots === undefined ? undefined : normalizeScheduleSlots(payload.scheduleSlots);
  } catch (error) {
    const code = String(error?.message || "");
    if (code === "LEVEL_NOT_FOUND") {
      return res.apiError(400, "levelId is invalid", "VALIDATION_ERROR");
    }
    if (code === "INVALID_PRIMARY_TEACHER") {
      return res.apiError(400, "primaryTeacherUserId is invalid for this center", "VALIDATION_ERROR");
    }
    throw error;
  }

  const nextPrimaryTeacherUserId = resolvedPrimaryTeacherUserId === undefined
    ? batch.primaryTeacherUserId
    : resolvedPrimaryTeacherUserId;
  const conflictWarnings = normalizedScheduleSlots && normalizedScheduleSlots.length
    ? await getBatchConflictWarnings({
        tenantId: req.auth.tenantId,
        hierarchyNodeId: batch.hierarchyNodeId,
        teacherUserIds: nextPrimaryTeacherUserId ? [nextPrimaryTeacherUserId] : [],
        scheduleSlots: normalizedScheduleSlots,
        excludeBatchId: id
      })
    : [];

  await prisma.$transaction(async (tx) => {
    const nextStatus = payload.status;
    const archivedState = nextStatus === undefined
      ? {}
      : nextStatus === "ARCHIVED"
        ? {
            archivedAt: new Date(),
            archivedByUserId: req.auth.userId
          }
        : {
            archivedAt: null,
            archivedByUserId: null
          };

    await tx.batch.update({
      where: { id },
      data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.modality !== undefined ? { modality: payload.modality } : {}),
        ...(resolvedLevelId !== undefined ? { levelId: resolvedLevelId } : {}),
        ...(resolvedPrimaryTeacherUserId !== undefined ? { primaryTeacherUserId: resolvedPrimaryTeacherUserId } : {}),
        ...(payload.maxStudents !== undefined ? { maxStudents: payload.maxStudents } : {}),
        ...(payload.durationMinutes !== undefined ? { durationMinutes: payload.durationMinutes } : {}),
        ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
        ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
        ...(payload.schedule !== undefined
          ? { schedule: payload.schedule && typeof payload.schedule === "object" ? payload.schedule : null }
          : {}),
        ...(normalizedScheduleSlots !== undefined ? { schedule: serializeLegacySchedule(normalizedScheduleSlots) } : {}),
        ...(nextStatus ? { status: nextStatus, isActive: batchStatusToIsActive(nextStatus), ...archivedState } : {})
      }
    });

    if (resolvedPrimaryTeacherUserId) {
      await tx.batchTeacherAssignment.createMany({
        data: [{
          tenantId: req.auth.tenantId,
          batchId: id,
          teacherUserId: resolvedPrimaryTeacherUserId
        }],
        skipDuplicates: true
      });
    }

    if (normalizedScheduleSlots !== undefined) {
      await updateBatchScheduleSlots({
        db: tx,
        tenantId: req.auth.tenantId,
        batchId: id,
        scheduleSlots: normalizedScheduleSlots
      });
    }
  });

  const updated = await loadBatchView({ tenantId: req.auth.tenantId, batchId: id });
  return res.apiSuccess("Batch updated", {
    ...updated,
    scheduleWarnings: conflictWarnings
  });
});

const setBatchTeachers = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { teacherUserIds } = req.body;

  const batch = await prisma.batch.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true, tenantId: true, hierarchyNodeId: true, primaryTeacherUserId: true }
  });

  if (!batch) {
    return res.apiError(404, "Batch not found", "BATCH_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && batch.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  const ids = Array.isArray(teacherUserIds)
    ? teacherUserIds.map((t) => String(t)).filter(Boolean)
    : [];

  // Validate teachers belong to same center.
  if (ids.length) {
    const teachers = await prisma.authUser.findMany({
      where: {
        tenantId: req.auth.tenantId,
        id: { in: ids },
        role: "TEACHER",
        hierarchyNodeId: batch.hierarchyNodeId,
        isActive: true
      },
      select: { id: true }
    });

    if (teachers.length !== ids.length) {
      return res.apiError(400, "One or more teachers are invalid for this center", "INVALID_TEACHER_ASSIGNMENT");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.batchTeacherAssignment.deleteMany({
      where: {
        batchId: batch.id,
        tenantId: req.auth.tenantId,
        ...(ids.length ? { teacherUserId: { notIn: ids } } : {})
      }
    });

    if (!ids.length) {
      await tx.batchTeacherAssignment.deleteMany({
        where: {
          batchId: batch.id,
          tenantId: req.auth.tenantId
        }
      });
      await tx.batch.update({
        where: { id: batch.id },
        data: {
          primaryTeacherUserId: null
        }
      });
      return;
    }

    await tx.batchTeacherAssignment.createMany({
      data: ids.map((teacherId) => ({
        tenantId: req.auth.tenantId,
        batchId: batch.id,
        teacherUserId: teacherId
      })),
      skipDuplicates: true
    });

    const nextPrimaryTeacherUserId = ids.includes(batch.primaryTeacherUserId)
      ? batch.primaryTeacherUserId
      : ids[0];

    await tx.batch.update({
      where: { id: batch.id },
      data: {
        primaryTeacherUserId: nextPrimaryTeacherUserId || null
      }
    });
  });

  const updated = await loadBatchView({ tenantId: req.auth.tenantId, batchId: batch.id });

  return res.apiSuccess("Batch teachers updated", updated);
});

export { listBatches, createBatch, updateBatch, setBatchTeachers };
