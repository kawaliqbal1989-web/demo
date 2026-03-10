import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";

function normalizeBatchStatus(value) {
  const v = String(value || "").trim().toUpperCase();
  if (["ACTIVE", "INACTIVE", "ARCHIVED"].includes(v)) {
    return v;
  }
  return null;
}

const listBatches = asyncHandler(async (req, res) => {
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);

  const requestedCenterId = req.query.centerId ? String(req.query.centerId) : null;
  const actorCenterId = req.auth.role !== "SUPERADMIN" ? req.auth.hierarchyNodeId : null;
  const centerId = actorCenterId || requestedCenterId;

  const where = {
    tenantId: req.auth.tenantId,
    ...(centerId ? { hierarchyNodeId: centerId } : {})
  };

  const assignedOnlyRaw = req.query.assignedOnly;
  const assignedOnly = req.auth.role === "TEACHER"
    ? !(assignedOnlyRaw === "false" || assignedOnlyRaw === "0")
    : (assignedOnlyRaw === "true" || assignedOnlyRaw === "1");

  const finalWhere = assignedOnly && req.auth.role === "TEACHER"
    ? {
        ...where,
        teacherAssignments: {
          some: {
            teacherUserId: req.auth.userId
          }
        }
      }
    : where;

  const status = normalizeBatchStatus(req.query.status);
  if (status) {
    where.status = status;
  }

  const q = req.query.q ? String(req.query.q).trim() : "";
  if (q) {
    where.name = { contains: q };
  }

  const [total, items] = await Promise.all([
    prisma.batch.count({ where: finalWhere }),
    prisma.batch.findMany({
      where: finalWhere,
      take,
      skip,
      orderBy,
      include: {
        teacherAssignments: {
          select: {
            teacher: { select: { id: true, username: true, email: true, isActive: true } }
          }
        }
      }
    })
  ]);

  return res.apiSuccess("Batches fetched", {
    items,
    total,
    limit,
    offset
  });
});

const createBatch = asyncHandler(async (req, res) => {
  const { name, schedule, status, centerId } = req.body;

  const hierarchyNodeId = req.auth.role === "SUPERADMIN" ? (centerId ? String(centerId) : null) : req.auth.hierarchyNodeId;
  if (!hierarchyNodeId) {
    return res.apiError(400, "centerId is required", "VALIDATION_ERROR");
  }

  if (!name || !String(name).trim()) {
    return res.apiError(400, "name is required", "VALIDATION_ERROR");
  }

  const normalizedStatus = normalizeBatchStatus(status) || "ACTIVE";

  const created = await prisma.batch.create({
    data: {
      tenantId: req.auth.tenantId,
      hierarchyNodeId,
      name: String(name).trim(),
      schedule: schedule && typeof schedule === "object" ? schedule : undefined,
      status: normalizedStatus,
      isActive: normalizedStatus === "ACTIVE"
    }
  });

  res.locals.entityId = created.id;
  return res.apiSuccess("Batch created", created, 201);
});

const updateBatch = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, schedule, status } = req.body;

  const batch = await prisma.batch.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true, hierarchyNodeId: true }
  });

  if (!batch) {
    return res.apiError(404, "Batch not found", "BATCH_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && batch.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  const normalizedStatus = status ? normalizeBatchStatus(status) : null;

  const updated = await prisma.batch.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(schedule !== undefined ? { schedule: schedule && typeof schedule === "object" ? schedule : null } : {}),
      ...(normalizedStatus ? { status: normalizedStatus, isActive: normalizedStatus === "ACTIVE" } : {})
    }
  });

  return res.apiSuccess("Batch updated", updated);
});

const setBatchTeachers = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { teacherUserIds } = req.body;

  const batch = await prisma.batch.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true, tenantId: true, hierarchyNodeId: true }
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
      return;
    }

    for (const teacherId of ids) {
      await tx.batchTeacherAssignment.upsert({
        where: { batchId_teacherUserId: { batchId: batch.id, teacherUserId: teacherId } },
        update: {},
        create: {
          tenantId: req.auth.tenantId,
          batchId: batch.id,
          teacherUserId: teacherId
        }
      });
    }
  });

  const updated = await prisma.batch.findUnique({
    where: { id: batch.id },
    include: {
      teacherAssignments: {
        select: {
          teacher: { select: { id: true, username: true, email: true, isActive: true } }
        }
      }
    }
  });

  return res.apiSuccess("Batch teachers updated", updated);
});

export { listBatches, createBatch, updateBatch, setBatchTeachers };
