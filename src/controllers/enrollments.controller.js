import { Prisma } from "@prisma/client";
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

function normalizeStudentActiveFilter(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "ACTIVE") return true;
  if (normalized === "INACTIVE") return false;
  return null;
}

function normalizeFeeStatusFilter(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (["PAID", "PENDING", "OVERDUE", "NOT_SET"].includes(normalized)) {
    return normalized;
  }
  return null;
}

function normalizePendingInstallmentsFilter(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (["HAS_PENDING", "HAS_OVERDUE", "CLEAR"].includes(normalized)) {
    return normalized;
  }
  return null;
}

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function deriveFeeStatus(summary) {
  if ((summary?.overdueInstallmentsCount || 0) > 0) {
    return "OVERDUE";
  }
  if ((summary?.pendingInstallmentsCount || 0) > 0 || (summary?.pendingFeeAmount || 0) > 0) {
    return "PENDING";
  }
  if (summary?.totalFeeAmount == null) {
    return "NOT_SET";
  }
  return "PAID";
}

function matchesPendingInstallmentsFilter(summary, filter) {
  if (!filter) return true;
  const pendingCount = summary?.pendingInstallmentsCount || 0;
  const overdueCount = summary?.overdueInstallmentsCount || 0;
  if (filter === "HAS_PENDING") return pendingCount > 0;
  if (filter === "HAS_OVERDUE") return overdueCount > 0;
  if (filter === "CLEAR") return pendingCount === 0;
  return true;
}

function buildEnrollmentDatasetSummary({ studentRows = [], feeSummaries = new Map(), totalEnrollments = 0 } = {}) {
  const summary = {
    totalEnrollments,
    matchedStudents: studentRows.length,
    activeStudents: 0,
    inactiveStudents: 0,
    paidStudents: 0,
    pendingStudents: 0,
    overdueStudents: 0,
    notSetStudents: 0,
    pendingInstallments: 0,
    overdueInstallments: 0,
    pendingFeeAmount: 0
  };

  for (const row of studentRows) {
    if (row?.student?.isActive) {
      summary.activeStudents += 1;
    } else {
      summary.inactiveStudents += 1;
    }

    const feeSummary = feeSummaries.get(String(row.studentId));
    if (!feeSummary) {
      continue;
    }

    if (feeSummary.feeStatus === "PAID") summary.paidStudents += 1;
    if (feeSummary.feeStatus === "PENDING") summary.pendingStudents += 1;
    if (feeSummary.feeStatus === "OVERDUE") summary.overdueStudents += 1;
    if (feeSummary.feeStatus === "NOT_SET") summary.notSetStudents += 1;

    summary.pendingInstallments += feeSummary.pendingInstallmentsCount || 0;
    summary.overdueInstallments += feeSummary.overdueInstallmentsCount || 0;
    summary.pendingFeeAmount += feeSummary.pendingFeeAmount || 0;
  }

  summary.pendingFeeAmount = Math.round(summary.pendingFeeAmount * 100) / 100;
  return summary;
}

async function loadStudentFeeSummaries({ tenantId, centerId = null, studentId = "", studentIds = null, asOf = new Date() } = {}) {
  if (Array.isArray(studentIds) && studentIds.length === 0) {
    return new Map();
  }

  const conditions = [
    Prisma.sql`s.tenantId = ${tenantId}`
  ];

  if (centerId) {
    conditions.push(Prisma.sql`s.hierarchyNodeId = ${centerId}`);
  }

  if (studentId) {
    conditions.push(Prisma.sql`s.id = ${studentId}`);
  }

  if (Array.isArray(studentIds) && studentIds.length > 0) {
    conditions.push(Prisma.sql`s.id IN (${Prisma.join(studentIds)})`);
  }

  const whereSql = Prisma.join(conditions, " AND ");
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      s.id AS studentId,
      s.totalFeeAmount AS totalFeeAmount,
      COALESCE(SUM(
        CASE
          WHEN inst.id IS NOT NULL
            AND GREATEST(CAST(inst.amount AS DECIMAL(10, 2)) - COALESCE(paid.totalPaidAmount, 0), 0) > 0
          THEN 1 ELSE 0
        END
      ), 0) AS pendingInstallmentsCount,
      COALESCE(SUM(
        CASE
          WHEN inst.id IS NOT NULL
            AND inst.dueDate < ${asOf}
            AND GREATEST(CAST(inst.amount AS DECIMAL(10, 2)) - COALESCE(paid.totalPaidAmount, 0), 0) > 0
          THEN 1 ELSE 0
        END
      ), 0) AS overdueInstallmentsCount,
      COALESCE(SUM(
        CASE
          WHEN inst.id IS NOT NULL
          THEN GREATEST(CAST(inst.amount AS DECIMAL(10, 2)) - COALESCE(paid.totalPaidAmount, 0), 0)
          ELSE 0
        END
      ), 0) AS pendingFeeAmount
    FROM student s
    LEFT JOIN studentfeeinstallment inst
      ON inst.studentId = s.id
      AND inst.tenantId = ${tenantId}
    LEFT JOIN (
      SELECT installmentId, SUM(grossAmount) AS totalPaidAmount
      FROM financialtransaction
      WHERE tenantId = ${tenantId}
        AND installmentId IS NOT NULL
      GROUP BY installmentId
    ) paid ON paid.installmentId = inst.id
    WHERE ${whereSql}
    GROUP BY s.id, s.totalFeeAmount
  `);

  return new Map((rows || []).map((row) => {
    const summary = {
      totalFeeAmount: row?.totalFeeAmount == null ? null : toFiniteNumber(row.totalFeeAmount),
      pendingInstallmentsCount: toFiniteNumber(row?.pendingInstallmentsCount),
      overdueInstallmentsCount: toFiniteNumber(row?.overdueInstallmentsCount),
      pendingFeeAmount: Math.round(toFiniteNumber(row?.pendingFeeAmount) * 100) / 100
    };

    return [String(row.studentId), {
      ...summary,
      feeStatus: deriveFeeStatus(summary)
    }];
  }));
}

async function buildEnrollmentWhere(req) {
  const where = {
    tenantId: req.auth.tenantId
  };
  const studentWhere = {};

  const actorCenterId = req.auth.role !== "SUPERADMIN" ? req.auth.hierarchyNodeId : null;
  const centerId = actorCenterId || (req.query.centerId ? String(req.query.centerId) : null);
  if (centerId) {
    where.hierarchyNodeId = centerId;
  }

  if (req.query.batchId) {
    where.batchId = String(req.query.batchId);
  }

  const requestedStudentId = req.query.studentId ? String(req.query.studentId) : "";
  if (requestedStudentId) {
    where.studentId = requestedStudentId;
  }

  if (req.query.teacherUserId === "NONE") {
    where.assignedTeacherUserId = null;
  } else if (req.query.teacherUserId) {
    where.assignedTeacherUserId = String(req.query.teacherUserId);
  }

  if (req.query.levelId) {
    where.levelId = String(req.query.levelId);
  }

  const status = normalizeEnrollmentStatus(req.query.status);
  if (status) {
    where.status = status;
  }

  const q = String(req.query.q || "").trim();
  if (q) {
    studentWhere.OR = [
      { admissionNo: { contains: q } },
      { firstName: { contains: q } },
      { lastName: { contains: q } }
    ];
  }

  const studentActive = normalizeStudentActiveFilter(req.query.studentActive);
  if (studentActive !== null) {
    studentWhere.isActive = studentActive;
  }

  const from = parseISODateOnly(req.query.from);
  const to = parseISODateOnly(req.query.to);
  if (from || to) {
    where.createdAt = {};
    if (from) {
      where.createdAt.gte = from;
    }
    if (to) {
      where.createdAt.lt = addUtcDays(to, 1);
    }
  }

  if (Object.keys(studentWhere).length > 0) {
    where.student = {
      is: studentWhere
    };
  }

  const feeStatus = normalizeFeeStatusFilter(req.query.feeStatus);
  const pendingInstallments = normalizePendingInstallmentsFilter(req.query.pendingInstallments);
  if (feeStatus || pendingInstallments) {
    const summaries = await loadStudentFeeSummaries({
      tenantId: req.auth.tenantId,
      centerId,
      studentId: requestedStudentId
    });

    const matchingStudentIds = [];
    summaries.forEach((summary, studentId) => {
      if (feeStatus && summary.feeStatus !== feeStatus) {
        return;
      }
      if (!matchesPendingInstallmentsFilter(summary, pendingInstallments)) {
        return;
      }
      matchingStudentIds.push(studentId);
    });

    where.studentId = { in: matchingStudentIds };
  }

  return where;
}

const listEnrollments = asyncHandler(async (req, res) => {
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);
  const where = await buildEnrollmentWhere(req);

  const [total, items, matchedStudents] = await Promise.all([
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where,
      take,
      skip,
      orderBy,
      include: {
        student: { select: { id: true, admissionNo: true, firstName: true, lastName: true, levelId: true, isActive: true } },
        batch: { select: { id: true, name: true } },
        assignedTeacher: { select: { id: true, username: true, email: true, teacherProfile: { select: { fullName: true } } } },
        level: { select: { id: true, name: true, rank: true } }
      }
    }),
    prisma.enrollment.findMany({
      where,
      distinct: ["studentId"],
      select: {
        studentId: true,
        student: {
          select: {
            id: true,
            isActive: true
          }
        }
      }
    })
  ]);

  const feeSummaries = await loadStudentFeeSummaries({
    tenantId: req.auth.tenantId,
    studentIds: matchedStudents.map((item) => String(item.studentId))
  });
  const summary = buildEnrollmentDatasetSummary({ studentRows: matchedStudents, feeSummaries, totalEnrollments: total });

  const enrichedItems = items.map((item) => {
    const summary = feeSummaries.get(String(item.studentId));
    if (!summary) {
      return item;
    }

    return {
      ...item,
      student: {
        ...item.student,
        feeStatus: summary.feeStatus,
        pendingInstallmentsCount: summary.pendingInstallmentsCount,
        overdueInstallmentsCount: summary.overdueInstallmentsCount,
        pendingFeeAmount: summary.pendingFeeAmount
      }
    };
  });

  return res.apiSuccess("Enrollments fetched", { items: enrichedItems, total, limit, offset, summary });
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
      where: {
        tenantId: req.auth.tenantId,
        hierarchyNodeId: batch.hierarchyNodeId,
        studentId: String(studentId),
        status: "ACTIVE"
      }
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
    return res.apiError(409, "Student already has an active enrollment in this center", "ENROLLMENT_EXISTS");
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

const bulkUpdateEnrollments = asyncHandler(async (req, res) => {
  const enrollmentIds = Array.isArray(req.body?.enrollmentIds)
    ? req.body.enrollmentIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const normalizedStatus = req.body?.status ? normalizeEnrollmentStatus(req.body.status) : null;
  const hasAssignedTeacherField = Object.prototype.hasOwnProperty.call(req.body || {}, "assignedTeacherUserId");
  const rawAssignedTeacherUserId = hasAssignedTeacherField ? String(req.body.assignedTeacherUserId || "").trim() : undefined;

  if (!enrollmentIds.length) {
    return res.apiError(400, "enrollmentIds array is required", "VALIDATION_ERROR");
  }

  if (!normalizedStatus && !hasAssignedTeacherField) {
    return res.apiError(400, "Valid status or assignedTeacherUserId is required", "VALIDATION_ERROR");
  }

  const scopeWhere = {
    tenantId: req.auth.tenantId,
    id: { in: enrollmentIds }
  };

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId) {
    scopeWhere.hierarchyNodeId = req.auth.hierarchyNodeId;
  }

  const enrollments = await prisma.enrollment.findMany({
    where: scopeWhere,
    select: { id: true, status: true, hierarchyNodeId: true, assignedTeacherUserId: true }
  });

  let validatedTeacher = null;
  if (rawAssignedTeacherUserId) {
    validatedTeacher = await prisma.authUser.findFirst({
      where: {
        id: rawAssignedTeacherUserId,
        tenantId: req.auth.tenantId,
        role: "TEACHER",
        isActive: true
      },
      select: { id: true, hierarchyNodeId: true }
    });

    if (!validatedTeacher) {
      return res.apiError(400, "Invalid assignedTeacherUserId", "INVALID_TEACHER");
    }
  }

  const validIds = enrollments.map((item) => item.id);
  const invalidIds = enrollmentIds.filter((id) => !validIds.includes(id));
  const teacherScopeInvalidIds = validatedTeacher
    ? enrollments
      .filter((item) => item.hierarchyNodeId !== validatedTeacher.hierarchyNodeId)
      .map((item) => item.id)
    : [];
  const candidateEnrollments = enrollments.filter((item) => !teacherScopeInvalidIds.includes(item.id));
  const skippedIds = candidateEnrollments
    .filter((item) => {
      const statusMatches = !normalizedStatus || item.status === normalizedStatus;
      const teacherMatches = !hasAssignedTeacherField
        || item.assignedTeacherUserId === (rawAssignedTeacherUserId || null);
      return statusMatches && teacherMatches;
    })
    .map((item) => item.id);
  const updatableIds = candidateEnrollments
    .map((item) => item.id)
    .filter((id) => !skippedIds.includes(id));
  const combinedInvalidIds = [...new Set([...invalidIds, ...teacherScopeInvalidIds])];

  if (!updatableIds.length) {
    return res.apiSuccess("Enrollments updated", {
      updated: 0,
      skipped: skippedIds.length,
      invalid: combinedInvalidIds.length,
      updatedIds: [],
      skippedIds,
      invalidIds: combinedInvalidIds
    });
  }

  const result = await prisma.enrollment.updateMany({
    where: {
      tenantId: req.auth.tenantId,
      id: { in: updatableIds }
    },
    data: {
      ...(normalizedStatus ? { status: normalizedStatus } : {}),
      ...(hasAssignedTeacherField ? { assignedTeacherUserId: rawAssignedTeacherUserId || null } : {})
    }
  });

  return res.apiSuccess("Enrollments updated", {
    updated: result.count,
    skipped: skippedIds.length,
    invalid: combinedInvalidIds.length,
    updatedIds: updatableIds,
    skippedIds,
    invalidIds: combinedInvalidIds
  });
});

const exportEnrollmentsCsv = asyncHandler(async (req, res) => {
  const { take, skip, orderBy } = parsePagination(req.query);
  const safeTake = Math.min(take, 5000);
  const where = await buildEnrollmentWhere(req);

  const data = await prisma.enrollment.findMany({
    where,
    orderBy,
    skip,
    take: safeTake,
    include: {
      student: { select: { admissionNo: true, firstName: true, lastName: true } },
      batch: { select: { name: true } },
      assignedTeacher: { select: { username: true, email: true, teacherProfile: { select: { fullName: true } } } }
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
      "assignedTeacherName",
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
      e.assignedTeacher?.teacherProfile?.fullName || "",
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

export { listEnrollments, createEnrollment, updateEnrollment, bulkUpdateEnrollments, exportEnrollmentsCsv };
