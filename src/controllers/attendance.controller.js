import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import { recordAudit } from "../utils/audit.js";
import { logger } from "../lib/logger.js";

function normalizeSessionStatus(value) {
  const v = String(value || "").trim().toUpperCase();
  if (["DRAFT", "PUBLISHED", "LOCKED", "CANCELLED"].includes(v)) {
    return v;
  }
  return null;
}

function normalizeEntryStatus(value) {
  const v = String(value || "").trim().toUpperCase();
  if (["PRESENT", "ABSENT", "LATE", "EXCUSED"].includes(v)) {
    return v;
  }
  return null;
}

function parseISODateOnly(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }

  // Store as UTC midnight to keep a stable date key.
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

async function loadCenterAttendanceConfig({ tenantId, centerHierarchyNodeId }) {
  if (!tenantId || !centerHierarchyNodeId) {
    return {
      editWindowDays: 3,
      defaultEntryStatus: "ABSENT",
      requirePublishBeforeReport: true,
      allowTeacherReopen: false
    };
  }

  const profile = await prisma.centerProfile.findFirst({
    where: {
      tenantId,
      authUser: {
        hierarchyNodeId: centerHierarchyNodeId
      }
    },
    select: {
      attendanceConfig: true
    }
  });

  const raw = profile?.attendanceConfig && typeof profile.attendanceConfig === "object" ? profile.attendanceConfig : {};

  const editWindowDays = Number.isFinite(Number(raw.editWindowDays)) ? Math.max(0, Number(raw.editWindowDays)) : 3;
  const defaultEntryStatus = normalizeEntryStatus(raw.defaultEntryStatus) || "ABSENT";
  const requirePublishBeforeReport = raw.requirePublishBeforeReport !== undefined ? Boolean(raw.requirePublishBeforeReport) : true;
  const allowTeacherReopen = Boolean(raw.allowTeacherReopen);

  return { editWindowDays, defaultEntryStatus, requirePublishBeforeReport, allowTeacherReopen };
}

async function ensureTeacherAssigned({ tenantId, teacherUserId, batchId }) {
  const assignment = await prisma.batchTeacherAssignment.findFirst({
    where: {
      tenantId,
      batchId,
      teacherUserId
    },
    select: { batchId: true }
  });

  if (assignment) {
    return true;
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      tenantId,
      batchId,
      status: "ACTIVE",
      assignedTeacherUserId: teacherUserId
    },
    select: { id: true }
  });

  return Boolean(enrollment);
}

async function listTeacherAssignedBatchIds({ tenantId, teacherUserId, centerHierarchyNodeId }) {
  const [assignments, enrollments] = await Promise.all([
    prisma.batchTeacherAssignment.findMany({
      where: { tenantId, teacherUserId },
      select: { batchId: true }
    }),
    prisma.enrollment.findMany({
      where: {
        tenantId,
        hierarchyNodeId: centerHierarchyNodeId,
        status: "ACTIVE",
        assignedTeacherUserId: teacherUserId
      },
      select: { batchId: true }
    })
  ]);

  return Array.from(
    new Set([
      ...assignments.map((row) => row.batchId),
      ...enrollments.map((row) => row.batchId)
    ])
  );
}

function isWithinEditWindow({ sessionDate, editWindowDays }) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - sessionDate.getTime()) / msPerDay);
  return diffDays <= editWindowDays;
}

const listAttendanceCorrections = asyncHandler(async (req, res) => {
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);

  const where = {
    tenantId: req.auth.tenantId
  };

  const actorCenterId = req.auth.role !== "SUPERADMIN" ? req.auth.hierarchyNodeId : null;
  const centerId = actorCenterId || (req.query.centerId ? String(req.query.centerId) : null);
  if (centerId) {
    where.session = { hierarchyNodeId: centerId };
  }

  const status = String(req.query.status || "").trim().toUpperCase();
  if (["PENDING", "APPROVED", "REJECTED", "APPLIED"].includes(status)) {
    where.status = status;
  }

  if (req.query.sessionId) {
    where.sessionId = String(req.query.sessionId);
  }

  const [total, items] = await Promise.all([
    prisma.attendanceCorrectionRequest.count({ where }),
    prisma.attendanceCorrectionRequest.findMany({
      where,
      take,
      skip,
      orderBy,
      include: {
        requestedBy: { select: { id: true, username: true, email: true, role: true } },
        reviewedBy: { select: { id: true, username: true, email: true, role: true } },
        session: {
          select: {
            id: true,
            date: true,
            status: true,
            batch: { select: { id: true, name: true } }
          }
        }
      }
    })
  ]);

  return res.apiSuccess("Attendance corrections fetched", { items, total, limit, offset });
});

const cancelAttendanceSession = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const session = await prisma.attendanceSession.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true, hierarchyNodeId: true, status: true }
  });

  if (!session) {
    return res.apiError(404, "Attendance session not found", "SESSION_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && session.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  if (req.auth.role === "TEACHER") {
    return res.apiError(403, "Teachers cannot cancel sessions", "ROLE_FORBIDDEN");
  }

  if (session.status === "CANCELLED") {
    return res.apiSuccess("Session already cancelled", session);
  }

  const updated = await prisma.attendanceSession.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date(), version: { increment: 1 } }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "ATTENDANCE_CANCEL",
    entityType: "ATTENDANCE_SESSION",
    entityId: id
  });

  return res.apiSuccess("Session cancelled", updated);
});

const reopenAttendanceSession = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || !String(reason).trim()) {
    return res.apiError(400, "reason is required", "VALIDATION_ERROR");
  }

  const session = await prisma.attendanceSession.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true, hierarchyNodeId: true, batchId: true, status: true, date: true }
  });

  if (!session) {
    return res.apiError(404, "Attendance session not found", "SESSION_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && session.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  const config = await loadCenterAttendanceConfig({ tenantId: req.auth.tenantId, centerHierarchyNodeId: session.hierarchyNodeId });
  if (req.auth.role === "TEACHER" && !config.allowTeacherReopen) {
    return res.apiError(403, "Teacher reopen not allowed", "REOPEN_FORBIDDEN");
  }

  if (!["LOCKED", "CANCELLED"].includes(session.status)) {
    return res.apiError(409, "Only LOCKED or CANCELLED sessions can be reopened", "INVALID_SESSION_STATUS");
  }

  // Reopen to PUBLISHED so it remains visible, but editable within edit window rules.
  const updated = await prisma.attendanceSession.update({
    where: { id },
    data: { status: "PUBLISHED", lockedAt: null, cancelledAt: null, version: { increment: 1 } }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "ATTENDANCE_REOPEN",
    entityType: "ATTENDANCE_SESSION",
    entityId: id,
    metadata: { reason: String(reason).trim() }
  });

  return res.apiSuccess("Session reopened", updated);
});

const listAttendanceSessions = asyncHandler(async (req, res) => {
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);

  const where = {
    tenantId: req.auth.tenantId
  };

  const actorCenterId = req.auth.role !== "SUPERADMIN" ? req.auth.hierarchyNodeId : null;
  const centerId = actorCenterId || (req.query.centerId ? String(req.query.centerId) : null);
  if (centerId) {
    where.hierarchyNodeId = centerId;
  }

  if (req.query.batchId) {
    where.batchId = String(req.query.batchId);
  }

  const status = normalizeSessionStatus(req.query.status);
  if (status) {
    where.status = status;
  }

  const from = req.query.from ? parseISODateOnly(req.query.from) : null;
  const to = req.query.to ? parseISODateOnly(req.query.to) : null;
  if (from || to) {
    where.date = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {})
    };
  }

  if (req.auth.role === "TEACHER") {
    if (where.batchId) {
      const allowed = await ensureTeacherAssigned({
        tenantId: req.auth.tenantId,
        teacherUserId: req.auth.userId,
        batchId: where.batchId
      });

      if (!allowed) {
        return res.apiError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
      }
    } else {
      const assignedBatchIds = await listTeacherAssignedBatchIds({
        tenantId: req.auth.tenantId,
        teacherUserId: req.auth.userId,
        centerHierarchyNodeId: req.auth.hierarchyNodeId
      });

      if (!assignedBatchIds.length) {
        return res.apiSuccess("Attendance sessions fetched", { items: [], total: 0, limit, offset });
      }

      where.batchId = { in: assignedBatchIds };
    }
  }

  const [total, items] = await Promise.all([
    prisma.attendanceSession.count({ where }),
    prisma.attendanceSession.findMany({
      where,
      take,
      skip,
      orderBy,
      include: {
        batch: { select: { id: true, name: true } }
      }
    })
  ]);

  return res.apiSuccess("Attendance sessions fetched", { items, total, limit, offset });
});

const createAttendanceSession = asyncHandler(async (req, res) => {
  const { batchId, date, centerId } = req.body;

  if (!batchId || !date) {
    return res.apiError(400, "batchId and date are required", "VALIDATION_ERROR");
  }

  const sessionDate = parseISODateOnly(date);
  if (!sessionDate) {
    return res.apiError(400, "date must be YYYY-MM-DD", "VALIDATION_ERROR");
  }

  const batch = await prisma.batch.findFirst({
    where: { id: String(batchId), tenantId: req.auth.tenantId },
    select: { id: true, hierarchyNodeId: true }
  });

  if (!batch) {
    return res.apiError(404, "Batch not found", "BATCH_NOT_FOUND");
  }

  const hierarchyNodeId = req.auth.role === "SUPERADMIN" ? (centerId ? String(centerId) : batch.hierarchyNodeId) : req.auth.hierarchyNodeId;
  if (!hierarchyNodeId) {
    return res.apiError(400, "center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  if (hierarchyNodeId !== batch.hierarchyNodeId) {
    return res.apiError(403, "Batch outside center scope", "HIERARCHY_SCOPE_DENIED");
  }

  if (req.auth.role === "TEACHER") {
    const allowed = await ensureTeacherAssigned({
      tenantId: req.auth.tenantId,
      teacherUserId: req.auth.userId,
      batchId: batch.id
    });

    if (!allowed) {
      return res.apiError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
    }
  }

  const config = await loadCenterAttendanceConfig({ tenantId: req.auth.tenantId, centerHierarchyNodeId: hierarchyNodeId });

  // Support server-side idempotency via `Idempotency-Key` header or body field `idempotencyKey`.
  const idempotencyKeyHeader = (req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || req.body.idempotencyKey || "");
  const idemKey = String(idempotencyKeyHeader || "").trim();

  // Helper to perform the create logic inside a transaction (used both for normal and idempotent flows)
  const performCreate = async (tx) => {
    const existing = await tx.attendanceSession.findFirst({
      where: {
        tenantId: req.auth.tenantId,
        batchId: batch.id,
        date: sessionDate
      },
      select: { id: true }
    });

    if (existing) {
      const error = new Error("Attendance session already exists for this batch and date");
      error.statusCode = 409;
      error.errorCode = "SESSION_ALREADY_EXISTS";
      throw error;
    }

    const session = await tx.attendanceSession.create({
      data: {
        tenantId: req.auth.tenantId,
        hierarchyNodeId,
        batchId: batch.id,
        date: sessionDate,
        status: "DRAFT",
        createdByUserId: req.auth.userId || null
      }
    });

    const enrollments = await tx.enrollment.findMany({
      where: {
        tenantId: req.auth.tenantId,
        batchId: batch.id,
        hierarchyNodeId,
        status: "ACTIVE",
        ...(req.auth.role === "TEACHER" ? { assignedTeacherUserId: req.auth.userId } : {})
      },
      select: { studentId: true }
    });

    if (enrollments.length) {
      await tx.attendanceEntry.createMany({
        data: enrollments.map((e) => ({
          tenantId: req.auth.tenantId,
          sessionId: session.id,
          studentId: e.studentId,
          status: config.defaultEntryStatus
        }))
      });
    }

    return session;
  };

  if (!idemKey) {
    // No idempotency key provided — perform the normal create transaction.
    const created = await prisma.$transaction(async (tx) => performCreate(tx));
    res.locals.entityId = created.id;
    return res.apiSuccess("Attendance session created", created, 201);
  }

  // Idempotency key provided. Try to claim the key to serialize creation.
  let marker = null;
  try {
    marker = await prisma.idempotencyKey.create({
      data: {
        tenantId: req.auth.tenantId,
        key: idemKey,
        method: "POST",
        path: "/teacher/attendance/sessions"
      }
    });
  } catch (e) {
    // Unique constraint violation means another request claimed this key.
    if (e.code === "P2002") {
      // Fetch existing marker
      const existingMarker = await prisma.idempotencyKey.findFirst({
        where: { tenantId: req.auth.tenantId, key: idemKey, method: "POST", path: "/teacher/attendance/sessions" }
      });

      // If another process already completed creation, return the recorded session.
      if (existingMarker?.responseEntityId) {
        const session = await prisma.attendanceSession.findFirst({ where: { id: existingMarker.responseEntityId, tenantId: req.auth.tenantId } });
        if (session) {
          res.locals.entityId = session.id;
          return res.apiSuccess("Attendance session (idempotent)", session);
        }
      }

      // Otherwise, wait briefly for the other worker to finish (poll for up to 1s)
      const maxWait = 1000;
      let waited = 0;
      while (waited < maxWait) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 100));
        waited += 100;
        const polled = await prisma.idempotencyKey.findFirst({ where: { tenantId: req.auth.tenantId, key: idemKey, method: "POST", path: "/teacher/attendance/sessions" } });
        if (polled?.responseEntityId) {
          const session = await prisma.attendanceSession.findFirst({ where: { id: polled.responseEntityId, tenantId: req.auth.tenantId } });
          if (session) {
            res.locals.entityId = session.id;
            return res.apiSuccess("Attendance session (idempotent)", session);
          }
        }
      }

      // If still no response, treat as conflict to preserve previous behavior.
      const error = new Error("Attendance session already exists for this batch and date");
      error.statusCode = 409;
      error.errorCode = "SESSION_ALREADY_EXISTS";
      throw error;
    }

    throw e;
  }

  // We successfully created the marker — perform creation and then update marker with result.
  try {
    const created = await prisma.$transaction(async (tx) => performCreate(tx));

    // Persist the created session id for idempotent lookups.
    await prisma.idempotencyKey.update({ where: { id: marker.id }, data: { responseEntityId: created.id, responseStatus: 201 } });

    res.locals.entityId = created.id;
    return res.apiSuccess("Attendance session created", created, 201);
  } catch (e) {
    // Update marker to reflect failure so subsequent callers don't wait forever.
    try {
      await prisma.idempotencyKey.update({ where: { id: marker.id }, data: { responseStatus: e?.statusCode || 500, responseBody: { message: e?.message || "error" } } });
    } catch (u) {
      logger.warn("idempotency_key_update_failed", { markerId: marker.id, error: u?.message });
    }
    throw e;
  }
});

const getAttendanceSession = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const session = await prisma.attendanceSession.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId
    },
    include: {
      batch: { select: { id: true, name: true } },
      entries: {
        include: {
          student: { select: { id: true, admissionNo: true, firstName: true, lastName: true } },
          markedBy: { select: { id: true, username: true } }
        },
        orderBy: [{ student: { admissionNo: "asc" } }]
      }
    }
  });

  if (!session) {
    return res.apiError(404, "Attendance session not found", "SESSION_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && session.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  if (req.auth.role === "TEACHER") {
    const allowed = await ensureTeacherAssigned({
      tenantId: req.auth.tenantId,
      teacherUserId: req.auth.userId,
      batchId: session.batchId
    });

    if (!allowed) {
      return res.apiError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
    }
  }

  return res.apiSuccess("Attendance session fetched", session);
});

const updateAttendanceEntries = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { entries, version, reason, note } = req.body;

  const session = await prisma.attendanceSession.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true, tenantId: true, hierarchyNodeId: true, batchId: true, date: true, status: true, version: true }
  });

  if (!session) {
    return res.apiError(404, "Attendance session not found", "SESSION_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && session.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  if (req.auth.role === "TEACHER") {
    const allowed = await ensureTeacherAssigned({
      tenantId: req.auth.tenantId,
      teacherUserId: req.auth.userId,
      batchId: session.batchId
    });

    if (!allowed) {
      return res.apiError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
    }
  }

  if (!["DRAFT", "PUBLISHED"].includes(session.status)) {
    return res.apiError(409, `Session is ${session.status} and cannot be edited`, "SESSION_NOT_EDITABLE");
  }

  const config = await loadCenterAttendanceConfig({ tenantId: req.auth.tenantId, centerHierarchyNodeId: session.hierarchyNodeId });
  if (session.status === "PUBLISHED" && !isWithinEditWindow({ sessionDate: session.date, editWindowDays: config.editWindowDays })) {
    return res.apiError(403, "Edit window has closed; submit a correction request", "EDIT_WINDOW_CLOSED");
  }

  if (version !== undefined && Number(version) !== session.version) {
    return res.apiError(409, "Version conflict", "VERSION_CONFLICT", {
      currentVersion: session.version
    });
  }

  if (!Array.isArray(entries) || !entries.length) {
    return res.apiError(400, "entries array is required", "VALIDATION_ERROR");
  }

  const normalized = entries
    .map((e) => ({
      studentId: e?.studentId ? String(e.studentId) : "",
      status: normalizeEntryStatus(e?.status),
      note: e?.note !== undefined ? String(e.note || "") : undefined
    }))
    .filter((e) => e.studentId && e.status);

  if (!normalized.length) {
    return res.apiError(400, "No valid entries", "VALIDATION_ERROR");
  }

  const existing = await prisma.attendanceEntry.findMany({
    where: {
      tenantId: req.auth.tenantId,
      sessionId: session.id,
      studentId: { in: normalized.map((e) => e.studentId) }
    },
    select: { studentId: true, status: true, note: true }
  });

  const byStudentId = new Map(existing.map((e) => [e.studentId, e]));
  const conflicts = [];
  const updates = [];

  for (const entry of normalized) {
    const current = byStudentId.get(entry.studentId);
    if (!current) {
      conflicts.push({ studentId: entry.studentId, reason: "NOT_IN_ROSTER" });
      continue;
    }

    const nextNote = entry.note !== undefined ? entry.note : current.note;
    if (current.status === entry.status && current.note === nextNote) {
      continue;
    }

    updates.push({
      studentId: entry.studentId,
      before: current,
      after: { status: entry.status, note: nextNote }
    });
  }

  if (!updates.length) {
    return res.apiSuccess("No updates applied", { updatedCount: 0, conflicts, version: session.version });
  }

  const markedAt = new Date();
  const operations = updates.map((u) =>
    prisma.attendanceEntry.update({
      where: {
        sessionId_studentId: { sessionId: session.id, studentId: u.studentId }
      },
      data: {
        status: u.after.status,
        note: u.after.note,
        markedAt,
        markedByUserId: req.auth.userId || null
      }
    })
  );

  operations.push(
    prisma.attendanceSession.update({
      where: { id: session.id },
      data: { version: { increment: 1 } },
      select: { id: true, version: true }
    })
  );

  const result = await prisma.$transaction(operations);
  const sessionResult = result[result.length - 1];

  // Audit: store before/after diffs in metadata.
  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "ATTENDANCE_UPDATE_ENTRIES",
    entityType: "ATTENDANCE_SESSION",
    entityId: session.id,
    metadata: {
      reason: reason ? String(reason) : null,
      note: note ? String(note) : null,
      updatedCount: updates.length,
      conflictsCount: conflicts.length,
      changes: updates.map((u) => ({
        studentId: u.studentId,
        before: u.before,
        after: u.after
      }))
    }
  });

  return res.apiSuccess("Attendance updated", {
    sessionId: session.id,
    updatedCount: updates.length,
    conflicts,
    version: sessionResult.version
  });
});

const publishAttendanceSession = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const session = await prisma.attendanceSession.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true, hierarchyNodeId: true, status: true }
  });

  if (!session) {
    return res.apiError(404, "Attendance session not found", "SESSION_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && session.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  if (session.status !== "DRAFT") {
    return res.apiError(409, "Only DRAFT sessions can be published", "INVALID_SESSION_STATUS");
  }

  const updated = await prisma.attendanceSession.update({
    where: { id },
    data: { status: "PUBLISHED", publishedAt: new Date(), version: { increment: 1 } }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "ATTENDANCE_PUBLISH",
    entityType: "ATTENDANCE_SESSION",
    entityId: id
  });

  return res.apiSuccess("Session published", updated);
});

const lockAttendanceSession = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const session = await prisma.attendanceSession.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true, hierarchyNodeId: true, status: true }
  });

  if (!session) {
    return res.apiError(404, "Attendance session not found", "SESSION_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && session.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  if (req.auth.role === "TEACHER") {
    return res.apiError(403, "Teachers cannot lock sessions", "ROLE_FORBIDDEN");
  }

  if (session.status !== "PUBLISHED") {
    return res.apiError(409, "Only PUBLISHED sessions can be locked", "INVALID_SESSION_STATUS");
  }

  const updated = await prisma.attendanceSession.update({
    where: { id },
    data: { status: "LOCKED", lockedAt: new Date(), version: { increment: 1 } }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "ATTENDANCE_LOCK",
    entityType: "ATTENDANCE_SESSION",
    entityId: id
  });

  return res.apiSuccess("Session locked", updated);
});

const createAttendanceCorrectionRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { entries, reason } = req.body;

  if (!reason || !String(reason).trim()) {
    return res.apiError(400, "reason is required", "VALIDATION_ERROR");
  }

  if (!Array.isArray(entries) || !entries.length) {
    return res.apiError(400, "entries array is required", "VALIDATION_ERROR");
  }

  const session = await prisma.attendanceSession.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true, hierarchyNodeId: true, batchId: true }
  });

  if (!session) {
    return res.apiError(404, "Attendance session not found", "SESSION_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && session.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  if (req.auth.role === "TEACHER") {
    const allowed = await ensureTeacherAssigned({
      tenantId: req.auth.tenantId,
      teacherUserId: req.auth.userId,
      batchId: session.batchId
    });

    if (!allowed) {
      return res.apiError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
    }
  }

  const created = await prisma.attendanceCorrectionRequest.create({
    data: {
      tenantId: req.auth.tenantId,
      sessionId: session.id,
      requestedByUserId: req.auth.userId,
      reason: String(reason).trim(),
      requestedChanges: {
        entries
      }
    }
  });

  res.locals.entityId = created.id;
  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "ATTENDANCE_CORRECTION_REQUEST",
    entityType: "ATTENDANCE_SESSION",
    entityId: session.id,
    metadata: {
      requestId: created.id,
      reason: String(reason).trim()
    }
  });

  return res.apiSuccess("Correction requested", created, 201);
});

const reviewAttendanceCorrectionRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const { action } = req.body;

  const normalizedAction = String(action || "").trim().toUpperCase();
  if (!["APPROVE", "REJECT"].includes(normalizedAction)) {
    return res.apiError(400, "action must be APPROVE or REJECT", "VALIDATION_ERROR");
  }

  const request = await prisma.attendanceCorrectionRequest.findFirst({
    where: { id: requestId, tenantId: req.auth.tenantId },
    include: {
      session: { select: { id: true, hierarchyNodeId: true, batchId: true, status: true, version: true } }
    }
  });

  if (!request) {
    return res.apiError(404, "Correction request not found", "CORRECTION_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && request.session.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  if (req.auth.role === "TEACHER") {
    return res.apiError(403, "Teachers cannot review corrections", "ROLE_FORBIDDEN");
  }

  if (request.status !== "PENDING") {
    return res.apiError(409, "Request already reviewed", "CORRECTION_ALREADY_REVIEWED");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const reviewed = await tx.attendanceCorrectionRequest.update({
      where: { id: request.id },
      data: {
        status: normalizedAction === "APPROVE" ? "APPROVED" : "REJECTED",
        reviewedByUserId: req.auth.userId,
        reviewedAt: new Date()
      }
    });

    if (normalizedAction !== "APPROVE") {
      return reviewed;
    }

    // Apply changes immediately (APPLIED).
    const requestedEntries = Array.isArray(request.requestedChanges?.entries) ? request.requestedChanges.entries : [];
    const normalizedEntries = requestedEntries
      .map((e) => ({
        studentId: e?.studentId ? String(e.studentId) : "",
        status: normalizeEntryStatus(e?.status),
        note: e?.note !== undefined ? String(e.note || "") : undefined
      }))
      .filter((e) => e.studentId && e.status);

    const existing = await tx.attendanceEntry.findMany({
      where: {
        tenantId: req.auth.tenantId,
        sessionId: request.sessionId,
        studentId: { in: normalizedEntries.map((e) => e.studentId) }
      },
      select: { studentId: true, status: true, note: true }
    });

    const byStudentId = new Map(existing.map((e) => [e.studentId, e]));
    const diffs = [];
    const markedAt = new Date();
    const operations = [];

    for (const entry of normalizedEntries) {
      const current = byStudentId.get(entry.studentId);
      if (!current) {
        continue;
      }

      const nextNote = entry.note !== undefined ? entry.note : current.note;
      if (current.status === entry.status && current.note === nextNote) {
        continue;
      }

      operations.push(
        tx.attendanceEntry.update({
          where: { sessionId_studentId: { sessionId: request.sessionId, studentId: entry.studentId } },
          data: {
            status: entry.status,
            note: nextNote,
            markedAt,
            markedByUserId: req.auth.userId
          }
        })
      );

      diffs.push({
        studentId: entry.studentId,
        before: current,
        after: { status: entry.status, note: nextNote }
      });
    }

    if (operations.length) {
      await Promise.all(operations);
    }

    await tx.attendanceSession.update({
      where: { id: request.sessionId },
      data: { version: { increment: 1 } }
    });

    const applied = await tx.attendanceCorrectionRequest.update({
      where: { id: request.id },
      data: { status: "APPLIED" }
    });

    return { applied, diffs };
  });

  if (updated?.diffs?.length) {
    await recordAudit({
      tenantId: req.auth.tenantId,
      userId: req.auth.userId,
      role: req.auth.role,
      action: "ATTENDANCE_CORRECTION_APPLIED",
      entityType: "ATTENDANCE_SESSION",
      entityId: request.sessionId,
      metadata: {
        requestId: request.id,
        diffs: updated.diffs
      }
    });
  }

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: normalizedAction === "APPROVE" ? "ATTENDANCE_CORRECTION_APPROVED" : "ATTENDANCE_CORRECTION_REJECTED",
    entityType: "ATTENDANCE_SESSION",
    entityId: request.sessionId,
    metadata: {
      requestId: request.id
    }
  });

  return res.apiSuccess("Correction request reviewed", updated.applied);
});

export {
  listAttendanceSessions,
  listAttendanceCorrections,
  createAttendanceSession,
  getAttendanceSession,
  updateAttendanceEntries,
  publishAttendanceSession,
  lockAttendanceSession,
  cancelAttendanceSession,
  reopenAttendanceSession,
  createAttendanceCorrectionRequest,
  reviewAttendanceCorrectionRequest
};
