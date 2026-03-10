import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import { toCsv } from "../utils/csv.js";

function parseISODateOnly(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeEnrollmentStatus(value) {
  const v = String(value || "").trim().toUpperCase();
  if (["ACTIVE", "INACTIVE", "TRANSFERRED", "ARCHIVED"].includes(v)) {
    return v;
  }
  return null;
}

const listEnrollments = asyncHandler(async (req, res) => {
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

  if (req.query.studentId) {
    where.studentId = String(req.query.studentId);
  }

  const status = normalizeEnrollmentStatus(req.query.status);
  if (status) {
    where.status = status;
  }

  const [total, items] = await Promise.all([
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where,
      take,
      skip,
      orderBy,
      include: {
        student: { select: { id: true, admissionNo: true, firstName: true, lastName: true, levelId: true } },
        batch: { select: { id: true, name: true } },
        assignedTeacher: { select: { id: true, username: true, email: true } },
        level: { select: { id: true, name: true, rank: true } }
      }
    })
  ]);

  return res.apiSuccess("Enrollments fetched", { items, total, limit, offset });
});

const createEnrollment = asyncHandler(async (req, res) => {
  const {
    studentId,
    batchId,
    assignedTeacherUserId,
    levelId,
    startDate,
    status
  } = req.body;

  if (!studentId || !batchId) {
    return res.apiError(400, "studentId and batchId are required", "VALIDATION_ERROR");
  }

  const normalizedStatus = normalizeEnrollmentStatus(status) || "ACTIVE";

  const actorCenterId = req.auth.role === "SUPERADMIN" ? null : req.auth.hierarchyNodeId;

  const batch = await prisma.batch.findFirst({
    where: { id: String(batchId), tenantId: req.auth.tenantId },
    select: { id: true, hierarchyNodeId: true }
  });

  if (!batch) {
    return res.apiError(404, "Batch not found", "BATCH_NOT_FOUND");
  }

  if (actorCenterId && batch.hierarchyNodeId !== actorCenterId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  const student = await prisma.student.findFirst({
    where: { id: String(studentId), tenantId: req.auth.tenantId },
    select: { id: true, hierarchyNodeId: true }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  if (student.hierarchyNodeId !== batch.hierarchyNodeId) {
    return res.apiError(400, "Student belongs to a different center", "STUDENT_CENTER_MISMATCH");
  }

  if (assignedTeacherUserId) {
    const teacher = await prisma.authUser.findFirst({
      where: {
        id: String(assignedTeacherUserId),
        tenantId: req.auth.tenantId,
        role: "TEACHER",
        hierarchyNodeId: batch.hierarchyNodeId,
        isActive: true
      },
      select: { id: true }
    });

    if (!teacher) {
      return res.apiError(400, "Invalid assignedTeacherUserId", "INVALID_TEACHER");
    }
  }

  // Prevent duplicate active enrollment for same student in the same batch (atomic)
  const created = await prisma.$transaction(async (tx) => {
    const existingActive = await tx.enrollment.findFirst({
      where: { tenantId: req.auth.tenantId, batchId: String(batchId), studentId: String(studentId), status: "ACTIVE" }
    });

    if (existingActive) {
      return { duplicate: true };
    }

    return tx.enrollment.create({
      data: {
        tenantId: req.auth.tenantId,
        hierarchyNodeId: batch.hierarchyNodeId,
        studentId: String(studentId),
        batchId: String(batchId),
        assignedTeacherUserId: assignedTeacherUserId ? String(assignedTeacherUserId) : null,
        levelId: levelId ? String(levelId) : null,
        startDate: startDate ? parseISODateOnly(startDate) : null,
        status: normalizedStatus
      },
      include: {
        student: { select: { id: true, admissionNo: true, firstName: true, lastName: true, levelId: true } },
        batch: { select: { id: true, name: true } },
        assignedTeacher: { select: { id: true, username: true, email: true } }
      }
    });
  });

  if (created.duplicate) {
    return res.apiError(409, "Student is already enrolled in this batch", "ENROLLMENT_EXISTS");
  }

  res.locals.entityId = created.id;
  return res.apiSuccess("Enrollment created", created, 201);
});

const updateEnrollment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { assignedTeacherUserId, status } = req.body;

  const enrollment = await prisma.enrollment.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true, hierarchyNodeId: true, batchId: true }
  });

  if (!enrollment) {
    return res.apiError(404, "Enrollment not found", "ENROLLMENT_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && enrollment.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  const normalizedStatus = status ? normalizeEnrollmentStatus(status) : null;

  if (assignedTeacherUserId) {
    const teacher = await prisma.authUser.findFirst({
      where: {
        id: String(assignedTeacherUserId),
        tenantId: req.auth.tenantId,
        role: "TEACHER",
        hierarchyNodeId: enrollment.hierarchyNodeId,
        isActive: true
      },
      select: { id: true }
    });

    if (!teacher) {
      return res.apiError(400, "Invalid assignedTeacherUserId", "INVALID_TEACHER");
    }
  }

  const updated = await prisma.enrollment.update({
    where: { id },
    data: {
      ...(assignedTeacherUserId !== undefined
        ? { assignedTeacherUserId: assignedTeacherUserId ? String(assignedTeacherUserId) : null }
        : {}),
      ...(normalizedStatus ? { status: normalizedStatus } : {})
    }
  });

  return res.apiSuccess("Enrollment updated", updated);
});

const exportEnrollmentsCsv = asyncHandler(async (req, res) => {
  const { take, skip, orderBy } = parsePagination(req.query);
  const safeTake = Math.min(take, 5000);

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

  const status = normalizeEnrollmentStatus(req.query.status);
  if (status) {
    where.status = status;
  }

  const data = await prisma.enrollment.findMany({
    where,
    orderBy,
    skip,
    take: safeTake,
    include: {
      student: { select: { admissionNo: true, firstName: true, lastName: true } },
      batch: { select: { name: true } },
      assignedTeacher: { select: { username: true, email: true } }
    }
  });

  const csv = toCsv({
    headers: [
      "enrollmentId",
      "batch",
      "studentAdmissionNo",
      "studentFirstName",
      "studentLastName",
      "status",
      "assignedTeacherUsername",
      "assignedTeacherEmail",
      "startDate",
      "createdAt"
    ],
    rows: data.map((e) => [
      e.id,
      e.batch?.name || "",
      e.student?.admissionNo || "",
      e.student?.firstName || "",
      e.student?.lastName || "",
      e.status,
      e.assignedTeacher?.username || "",
      e.assignedTeacher?.email || "",
      e.startDate ? e.startDate.toISOString().slice(0, 10) : "",
      e.createdAt?.toISOString?.() || String(e.createdAt)
    ])
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=enrollments.csv");
  return res.status(200).send(csv);
});

export { listEnrollments, createEnrollment, updateEnrollment, exportEnrollmentsCsv };
