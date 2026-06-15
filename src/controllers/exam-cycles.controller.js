import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import { createBulkNotification } from "../services/notification.service.js";
import { resolveBusinessPartnerHierarchyNodeIds } from "../services/business-partner-cascade.service.js";
import { generateExamCode } from "../services/exam-code.service.js";
import { resolveActorExamScope } from "../services/exam-scope.service.js";
import { forwardEnrollmentList, rejectEnrollmentList, approveEnrollmentList } from "../services/exam-workflow.service.js";
import { recordAudit } from "../utils/audit.js";
import { assignSelectedExamWorksheets } from "../services/exam-worksheets.service.js";
import {
  generateQuestionSet,
  getConfig,
  getExamCycleLevels,
  getLevelQuestionBanks,
  getLevelWorksheets,
  saveConfig,
  validateConfig
} from "../services/assessmentConfig.service.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { generateUsername } from "../utils/username-generator.js";
import { getEnrollmentCounts } from "./exam-late-enrollment.controller.js";

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[\n\r",]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv({ headers, rows }) {
  const headerLine = headers.map((h) => csvEscape(h.label)).join(",");
  const lines = [headerLine];

  for (const row of rows) {
    const line = headers.map((h) => csvEscape(row[h.key])).join(",");
    lines.push(line);
  }

  return `${lines.join("\n")}\n`;
}

function parseDateTime(value, field) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const error = new Error(`${field} is invalid`);
    error.statusCode = 400;
    error.errorCode = "VALIDATION_ERROR";
    throw error;
  }
  return d;
}

function assertDateOrder(a, b, message) {
  if (a.getTime() > b.getTime()) {
    const error = new Error(message);
    error.statusCode = 400;
    error.errorCode = "VALIDATION_ERROR";
    throw error;
  }
}

function buildLifecycleFilterWhere(filter) {
  const now = new Date();
  const normalized = String(filter || "DEFAULT").trim().toUpperCase();

  if (normalized === "ALL") {
    return {};
  }

  if (normalized === "ARCHIVED") {
    return { isArchived: true };
  }

  if (normalized === "COMPLETED") {
    return {
      isArchived: false,
      OR: [
        { examEndsAt: { lt: now } },
        { resultStatus: { in: ["LOCKED", "PUBLISHED"] } }
      ]
    };
  }

  return {
    ...(normalized === "ACTIVE" ? { examEndsAt: { gte: now } } : {}),
    isArchived: false
  };
}

async function getExamCycleById({ tenantId, examCycleId }) {
  const cycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId },
    select: {
      id: true,
      code: true,
      name: true,
      isArchived: true,
      resultStatus: true,
      enrollmentStartAt: true,
      enrollmentEndAt: true,
      examStartsAt: true,
      examEndsAt: true,
      resultPublishedAt: true
    }
  });

  if (!cycle) {
    const error = new Error("Exam cycle not found");
    error.statusCode = 404;
    error.errorCode = "EXAM_CYCLE_NOT_FOUND";
    throw error;
  }

  return cycle;
}

async function assertExamCycleOperational({ tenantId, examCycleId }) {
  const cycle = await getExamCycleById({ tenantId, examCycleId });
  if (cycle.isArchived) {
    const error = new Error("Exam cycle is archived and unavailable for active workflows");
    error.statusCode = 409;
    error.errorCode = "EXAM_CYCLE_ARCHIVED";
    throw error;
  }
  return cycle;
}

async function verifySuperadminPasswordOrThrow({ tenantId, userId, password }) {
  const actor = await prisma.authUser.findFirst({
    where: {
      id: userId,
      tenantId,
      role: "SUPERADMIN",
      isActive: true
    },
    select: { id: true, passwordHash: true, username: true }
  });

  if (!actor) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    error.errorCode = "ROLE_FORBIDDEN";
    throw error;
  }

  const validPassword = await verifyPassword(password, actor.passwordHash);
  if (!validPassword) {
    const error = new Error("Invalid password");
    error.statusCode = 401;
    error.errorCode = "INVALID_PASSWORD";
    throw error;
  }

  return actor;
}

const listExamCycles = asyncHandler(async (req, res) => {
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);
  const lifecycleFilter = req.query?.filter || req.query?.lifecycle || "DEFAULT";

  const scope = await resolveActorExamScope({ tenantId: req.auth.tenantId, actor: req.auth });

  const where = {
    tenantId: req.auth.tenantId,
    ...buildLifecycleFilterWhere(lifecycleFilter),
    ...(scope.businessPartnerId ? { businessPartnerId: scope.businessPartnerId } : {})
  };

  const [items, total] = await Promise.all([
    prisma.examCycle.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        businessPartner: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, email: true, role: true } }
      }
    }),
    prisma.examCycle.count({ where })
  ]);

  const itemsWithCounts = await Promise.all(
    items.map(async (item) => {
      const counts = await getEnrollmentCounts({
        tenantId: req.auth.tenantId,
        examCycleId: item.id
      });
      return {
        ...item,
        enrollmentCounts: counts
      };
    })
  );

  return res.apiSuccess("Exam cycles fetched", {
    items: itemsWithCounts,
    total,
    limit,
    offset,
    filter: String(lifecycleFilter || "DEFAULT").toUpperCase()
  });
});

const createExamCycle = asyncHandler(async (req, res) => {
  const {
    businessPartnerId,
    name,
    enrollmentStartAt,
    enrollmentEndAt,
    practiceStartAt,
    examStartsAt,
    examEndsAt,
    examDurationMinutes,
    attemptLimit,
    resultPublishAt
  } = req.body;

  if (!businessPartnerId || !name) {
    return res.apiError(400, "businessPartnerId and name are required", "VALIDATION_ERROR");
  }

  const enrollmentStart = parseDateTime(enrollmentStartAt, "enrollmentStartAt");
  const enrollmentEnd = parseDateTime(enrollmentEndAt, "enrollmentEndAt");
  const practiceStart = parseDateTime(practiceStartAt, "practiceStartAt");
  const examStart = parseDateTime(examStartsAt, "examStartsAt");
  const examEnd = parseDateTime(examEndsAt, "examEndsAt");

  if (!enrollmentStart || !enrollmentEnd || !practiceStart || !examStart || !examEnd) {
    return res.apiError(400, "All date fields are required", "VALIDATION_ERROR");
  }

  assertDateOrder(enrollmentStart, enrollmentEnd, "Enrollment start must be before enrollment end");
  assertDateOrder(practiceStart, examStart, "Practice start must be before exam start");
  assertDateOrder(examStart, examEnd, "Exam start must be before exam end");

  const duration = Number(examDurationMinutes);
  if (!Number.isInteger(duration) || duration <= 0 || duration > 600) {
    return res.apiError(400, "examDurationMinutes must be a positive integer (<=600)", "VALIDATION_ERROR");
  }

  const limit = attemptLimit === undefined || attemptLimit === null ? 1 : Number(attemptLimit);
  if (!Number.isInteger(limit) || limit !== 1) {
    return res.apiError(400, "attemptLimit must be 1", "VALIDATION_ERROR");
  }

  const publishAt = resultPublishAt ? parseDateTime(resultPublishAt, "resultPublishAt") : null;

  const bp = await prisma.businessPartner.findFirst({
    where: { id: String(businessPartnerId), tenantId: req.auth.tenantId },
    select: { id: true, hierarchyNodeId: true, contactEmail: true }
  });

  if (!bp) {
    return res.apiError(404, "Business partner not found", "BUSINESS_PARTNER_NOT_FOUND");
  }

  let code = generateExamCode("EX");

  const created = await prisma.$transaction(async (tx) => {
    // Retry on rare collisions
    let cycle;
    for (let i = 0; i < 3; i += 1) {
      try {
        cycle = await tx.examCycle.create({
          data: {
            tenantId: req.auth.tenantId,
            businessPartnerId: bp.id,
            name: String(name).trim(),
            code,
            enrollmentStartAt: enrollmentStart,
            enrollmentEndAt: enrollmentEnd,
            practiceStartAt: practiceStart,
            examStartsAt: examStart,
            examEndsAt: examEnd,
            examDurationMinutes: duration,
            attemptLimit: 1,
            resultPublishAt: publishAt,
            createdByUserId: req.auth.userId,
            resultStatus: "DRAFT"
          }
        });
        break;
      } catch (err) {
        if (err?.code === "P2002") {
          code = generateExamCode("EX");
          continue;
        }
        throw err;
      }
    }

    if (!cycle) {
      const error = new Error("Unable to generate unique exam code");
      error.statusCode = 409;
      error.errorCode = "EXAM_CODE_CONFLICT";
      throw error;
    }

    if (!cycle) {
      return null;
    }

    return cycle;
  });

  if (!created) {
    const error = new Error("Unable to generate unique exam code");
    error.statusCode = 409;
    error.errorCode = "EXAM_CODE_CONFLICT";
    throw error;
  }

  res.locals.entityId = created.id;

  // Notify hierarchy under the selected business partner.
  void (async () => {
    try {
      const nodeIds = bp.hierarchyNodeId
        ? await resolveBusinessPartnerHierarchyNodeIds({
            tenantId: req.auth.tenantId,
            businessPartnerId: bp.id
          })
        : [];

      const recipients = await prisma.authUser.findMany({
        where: {
          tenantId: req.auth.tenantId,
          isActive: true,
          role: { in: ["BP", "FRANCHISE", "CENTER", "TEACHER"] },
          ...(nodeIds.length ? { hierarchyNodeId: { in: nodeIds } } : {})
        },
        select: { id: true },
        take: 500
      });

      await createBulkNotification(
        recipients.map((r) => ({
          tenantId: req.auth.tenantId,
          recipientUserId: r.id,
          type: "EXAM_CYCLE_CREATED",
          title: "New Exam Cycle",
          message: `Exam cycle created: ${created.name} (${created.code})`,
          entityType: "EXAM_CYCLE",
          entityId: created.id
        }))
      );
    } catch {
      return;
    }
  })();

  return res.apiSuccess("Exam cycle created", created, 201);
});

function withinEnrollmentWindow(examCycle, now = new Date()) {
  return now.getTime() >= new Date(examCycle.enrollmentStartAt).getTime() && now.getTime() <= new Date(examCycle.enrollmentEndAt).getTime();
}

async function loadExamCycleDeleteImpact({ tenantId, examCycleId }) {
  const examCycle = await getExamCycleById({ tenantId, examCycleId });

  const [listCount, approvedListCount, entryCount, worksheetCount, submissionCount, questionSetCount, tempStudentCount] = await Promise.all([
    prisma.examEnrollmentList.count({
      where: { tenantId, examCycleId }
    }),
    prisma.examEnrollmentList.count({
      where: { tenantId, examCycleId, status: "APPROVED" }
    }),
    prisma.examEnrollmentEntry.count({
      where: { tenantId, examCycleId }
    }),
    prisma.worksheet.count({
      where: { tenantId, examCycleId }
    }),
    prisma.worksheetSubmission.count({
      where: {
        tenantId,
        worksheet: {
          is: { examCycleId }
        }
      }
    }),
    prisma.examGeneratedQuestionSet.count({
      where: { tenantId, examCycleId }
    }),
    prisma.student.count({
      where: {
        tenantId,
        temporaryExamCycleId: examCycleId,
        isTemporaryExam: true
      }
    })
  ]);

  const now = new Date();
  const hasStarted = new Date(examCycle.examStartsAt).getTime() <= now.getTime();
  const hasApprovedLists = approvedListCount > 0;
  const isPublished = examCycle.resultStatus === "PUBLISHED";
  const hasSubmissions = submissionCount > 0;

  const blockers = [];
  if (hasApprovedLists) {
    blockers.push("Approved enrollment lists exist. Delete is blocked.");
  }

  const warnings = [];
  if (hasStarted) {
    warnings.push("Exam has started or ended. Delete will remove scheduling context.");
  }
  if (isPublished) {
    warnings.push("Results are published. Delete remains allowed but fully destructive.");
  }
  if (hasSubmissions) {
    warnings.push("Worksheet submissions exist and will lose exam-cycle linkage.");
  }
  if (examCycle.isArchived) {
    warnings.push("Cycle is already archived.");
  }

  return {
    examCycle,
    summary: {
      listCount,
      approvedListCount,
      entryCount,
      worksheetCount,
      submissionCount,
      questionSetCount,
      tempStudentCount
    },
    flags: {
      hasApprovedLists,
      hasStarted,
      isPublished,
      hasSubmissions,
      isArchived: examCycle.isArchived,
      canDelete: !hasApprovedLists,
      requiresPasswordConfirmation: true
    },
    blockers,
    warnings
  };
}

async function loadExamCycleArchiveImpact({ tenantId, examCycleId }) {
  const examCycle = await getExamCycleById({ tenantId, examCycleId });

  const [enrollmentCount, approvedEnrollmentCount, worksheetCount, resultCount, tempStudentCount, studentIds] = await Promise.all([
    prisma.examEnrollmentEntry.count({
      where: { tenantId, examCycleId }
    }),
    prisma.examEnrollmentList.count({
      where: { tenantId, examCycleId, status: "APPROVED" }
    }),
    prisma.worksheet.count({
      where: { tenantId, examCycleId }
    }),
    prisma.worksheetSubmission.count({
      where: {
        tenantId,
        worksheet: {
          is: { examCycleId }
        }
      }
    }),
    prisma.student.count({
      where: {
        tenantId,
        temporaryExamCycleId: examCycleId,
        isTemporaryExam: true
      }
    }),
    prisma.examEnrollmentEntry.findMany({
      where: { tenantId, examCycleId },
      select: { studentId: true }
    })
  ]);

  const uniqueStudentIds = Array.from(new Set(studentIds.map((entry) => entry.studentId).filter(Boolean)));

  const certificateCount = uniqueStudentIds.length
    ? await prisma.certificate.count({
        where: {
          tenantId,
          studentId: { in: uniqueStudentIds }
        }
      })
    : 0;

  const activeDependencies = {
    hasApprovedEnrollment: approvedEnrollmentCount > 0,
    hasResults: resultCount > 0,
    hasWorksheets: worksheetCount > 0,
    hasCertificates: certificateCount > 0,
    hasTemporaryStudents: tempStudentCount > 0,
    isPublished: examCycle.resultStatus === "PUBLISHED"
  };

  const warnings = [];
  if (activeDependencies.hasApprovedEnrollment) {
    warnings.push("Approved enrollment lists exist; archive is recommended before delete.");
  }
  if (activeDependencies.hasResults) {
    warnings.push("Result submissions exist and will remain in historical reports.");
  }
  if (activeDependencies.hasCertificates) {
    warnings.push("Certificates are linked to participating students and remain preserved.");
  }
  if (examCycle.isArchived) {
    warnings.push("Cycle is already archived.");
  }

  return {
    examCycle,
    summary: {
      enrollmentCount,
      approvedEnrollmentCount,
      resultCount,
      worksheetCount,
      certificateCount,
      tempStudentCount
    },
    activeDependencies,
    warnings
  };
}

async function resolveTeacherCenterNodeId({ tenantId, teacherUserId, requestedNodeId }) {
  if (requestedNodeId) {
    return requestedNodeId;
  }

  const teacherUser = await prisma.authUser.findFirst({
    where: { id: teacherUserId, tenantId },
    select: { hierarchyNodeId: true }
  });

  if (teacherUser?.hierarchyNodeId) {
    return teacherUser.hierarchyNodeId;
  }

  const recentEnrollment = await prisma.enrollment.findFirst({
    where: {
      tenantId,
      assignedTeacherUserId: teacherUserId,
      hierarchyNodeId: { not: null }
    },
    orderBy: { createdAt: "desc" },
    select: { hierarchyNodeId: true }
  });

  return recentEnrollment?.hierarchyNodeId || null;
}

async function getOrCreateTeacherList({ tenantId, examCycleId, teacherUserId, centerNodeId }) {
  const scopeKey = `TEACHER:${teacherUserId}`;

  let list = await prisma.examEnrollmentList.findFirst({
    where: { tenantId, examCycleId, scopeKey },
    select: { id: true, status: true, locked: true }
  });

  if (list) return list;

  list = await prisma.examEnrollmentList.create({
    data: {
      tenantId,
      examCycleId,
      type: "TEACHER",
      scopeKey,
      hierarchyNodeId: centerNodeId,
      teacherUserId,
      status: "DRAFT",
      locked: false,
      createdByUserId: teacherUserId
    },
    select: { id: true, status: true, locked: true }
  });

  return list;
}

const getTeacherList = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const centerNodeId = await resolveTeacherCenterNodeId({
    tenantId: req.auth.tenantId,
    teacherUserId: req.auth.userId,
    requestedNodeId: req.auth.hierarchyNodeId
  });

  if (!centerNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const list = await getOrCreateTeacherList({
    tenantId: req.auth.tenantId,
    examCycleId,
    teacherUserId: req.auth.userId,
    centerNodeId
  });

  const full = await prisma.examEnrollmentList.findFirst({
    where: { id: list.id, tenantId: req.auth.tenantId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          entry: {
            include: {
              student: { select: { id: true, admissionNo: true, firstName: true, lastName: true, isActive: true, levelId: true } },
              enrolledLevel: { select: { id: true, name: true, rank: true } }
            }
          }
        }
      }
    }
  });

  return res.apiSuccess("Teacher enrollment list", full);
});

const teacherEnrollStudents = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const studentIds = Array.isArray(req.body?.studentIds) ? req.body.studentIds.map(String) : null;

  if (!studentIds || !studentIds.length) {
    return res.apiError(400, "studentIds[] is required", "VALIDATION_ERROR");
  }

  const centerNodeId = await resolveTeacherCenterNodeId({
    tenantId: req.auth.tenantId,
    teacherUserId: req.auth.userId,
    requestedNodeId: req.auth.hierarchyNodeId
  });

  if (!centerNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: {
      id: true,
      enrollmentStartAt: true,
      enrollmentEndAt: true
    }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  if (!withinEnrollmentWindow(examCycle)) {
    return res.apiError(409, "Enrollment window is closed", "ENROLLMENT_WINDOW_CLOSED");
  }

  const list = await getOrCreateTeacherList({
    tenantId: req.auth.tenantId,
    examCycleId,
    teacherUserId: req.auth.userId,
    centerNodeId
  });

  if (list.locked && list.status === "SUBMITTED_TO_CENTER") {
    return res.apiError(409, "List is submitted and locked", "LIST_LOCKED");
  }

  const activeEnrollments = await prisma.enrollment.findMany({
    where: {
      tenantId: req.auth.tenantId,
      hierarchyNodeId: centerNodeId,
      status: "ACTIVE",
      assignedTeacherUserId: req.auth.userId,
      studentId: { in: studentIds }
    },
    select: {
      studentId: true,
      levelId: true,
      student: { select: { id: true, isActive: true } }
    }
  });

  const allowedByStudentId = new Map();
  for (const enrollment of activeEnrollments) {
    if (!enrollment?.student?.isActive) continue;
    if (!enrollment?.studentId) continue;
    if (!enrollment?.levelId) {
      return res.apiError(409, "Active enrollment level is missing for one or more students", "ENROLLMENT_LEVEL_MISSING");
    }

    if (!allowedByStudentId.has(enrollment.studentId)) {
      allowedByStudentId.set(enrollment.studentId, enrollment);
    }
  }

  for (const sid of studentIds) {
    if (!allowedByStudentId.has(sid)) {
      return res.apiError(403, "One or more students are not assigned/active under this teacher", "TEACHER_STUDENT_FORBIDDEN");
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const sid of studentIds) {
      const enrollment = allowedByStudentId.get(sid);

      const existing = await tx.examEnrollmentEntry.findUnique({
        where: {
          tenantId_examCycleId_studentId: {
            tenantId: req.auth.tenantId,
            examCycleId,
            studentId: sid
          }
        },
        select: { id: true, isTemporary: true, sourceTeacherUserId: true }
      });

      if (existing && !existing.isTemporary && existing.sourceTeacherUserId && existing.sourceTeacherUserId !== req.auth.userId) {
        const error = new Error("Student already enrolled in this exam cycle");
        error.statusCode = 409;
        error.errorCode = "DUPLICATE_ENROLLMENT";
        throw error;
      }

      const entry = await tx.examEnrollmentEntry.upsert({
        where: {
          tenantId_examCycleId_studentId: {
            tenantId: req.auth.tenantId,
            examCycleId,
            studentId: sid
          }
        },
        create: {
          tenantId: req.auth.tenantId,
          examCycleId,
          studentId: sid,
          enrolledLevelId: enrollment.levelId,
          isTemporary: false,
          sourceTeacherUserId: req.auth.userId,
          createdByUserId: req.auth.userId
        },
        update: {},
        select: { id: true }
      });

      await tx.examEnrollmentListItem.create({
        data: {
          tenantId: req.auth.tenantId,
          listId: list.id,
          entryId: entry.id
        }
      }).catch((err) => {
        if (err?.code === "P2002") {
          return null;
        }
        throw err;
      });
    }
  });

  const updated = await prisma.examEnrollmentList.findFirst({
    where: { id: list.id },
    include: {
      items: { include: { entry: true } }
    }
  });

  return res.apiSuccess("Students enrolled", updated, 201);
});

const submitTeacherListToCenter = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });

  const centerNodeId = await resolveTeacherCenterNodeId({
    tenantId: req.auth.tenantId,
    teacherUserId: req.auth.userId,
    requestedNodeId: req.auth.hierarchyNodeId
  });

  if (!centerNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: {
      id: true,
      enrollmentStartAt: true,
      enrollmentEndAt: true
    }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  if (!withinEnrollmentWindow(examCycle)) {
    return res.apiError(409, "Enrollment window is closed", "ENROLLMENT_WINDOW_CLOSED");
  }

  const list = await getOrCreateTeacherList({
    tenantId: req.auth.tenantId,
    examCycleId,
    teacherUserId: req.auth.userId,
    centerNodeId
  });

  const entriesCount = await prisma.examEnrollmentListItem.count({
    where: { tenantId: req.auth.tenantId, listId: list.id }
  });

  if (entriesCount === 0) {
    return res.apiError(409, "Cannot submit an empty list", "EXAM_LIST_EMPTY");
  }

  const now = new Date();

  const updated = await prisma.examEnrollmentList.update({
    where: { id: list.id },
    data: {
      status: "SUBMITTED_TO_CENTER",
      locked: true,
      submittedAt: now,
      rejectedAt: null,
      rejectedByUserId: null,
      rejectedRemark: null
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_TEACHER_LIST_SUBMIT",
    entityType: "EXAM_ENROLLMENT_LIST",
    entityId: updated.id,
    metadata: { examCycleId }
  });

  // Notify center user(s) on same node.
  void (async () => {
    try {
      const centers = await prisma.authUser.findMany({
        where: {
          tenantId: req.auth.tenantId,
          isActive: true,
          role: "CENTER",
          hierarchyNodeId: centerNodeId
        },
        select: { id: true },
        take: 500
      });

      await createBulkNotification(
        centers.map((c) => ({
          tenantId: req.auth.tenantId,
          recipientUserId: c.id,
          type: "EXAM_LIST_SUBMITTED",
          title: "Exam Enrollment List Submitted",
          message: "A teacher submitted an exam enrollment list for your center.",
          entityType: "EXAM_ENROLLMENT_LIST",
          entityId: updated.id
        }))
      );
    } catch {
      return;
    }
  })();

  return res.apiSuccess("Teacher list submitted to center", updated);
});

async function getOrCreateCenterCombinedList({ tenantId, examCycleId, centerNodeId, actorUserId }) {
  const scopeKey = `CENTER:${centerNodeId}`;

  // MySQL upsert is not fully atomic under concurrency in Prisma; handle races explicitly.
  try {
    return await prisma.examEnrollmentList.create({
      data: {
        tenantId,
        examCycleId,
        type: "CENTER_COMBINED",
        scopeKey,
        hierarchyNodeId: centerNodeId,
        teacherUserId: null,
        status: "DRAFT",
        locked: false,
        createdByUserId: actorUserId
      },
      select: { id: true, status: true, locked: true }
    });
  } catch (error) {
    // Prisma unique constraint violation
    if (error && typeof error === "object" && error.code === "P2002") {
      const existing = await prisma.examEnrollmentList.findFirst({
        where: { tenantId, examCycleId, scopeKey },
        select: { id: true, status: true, locked: true }
      });
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}

const centerPrepareCombinedList = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const centerNodeId = req.auth.hierarchyNodeId;

  if (!centerNodeId) {
    return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const combined = await getOrCreateCenterCombinedList({
    tenantId: req.auth.tenantId,
    examCycleId,
    centerNodeId,
    actorUserId: req.auth.userId
  });

  // If list is already submitted/locked, allow viewing it in read-only mode.
  // (Selection edits are blocked by the PATCH endpoint.)
  if (combined.locked && combined.status !== "REJECTED") {
    const [fullLocked, lockedTeacherLists] = await Promise.all([
      prisma.examEnrollmentList.findFirst({
        where: { id: combined.id },
        include: {
          items: {
            orderBy: { createdAt: "asc" },
            include: {
              entry: {
                include: {
                  student: { select: { id: true, admissionNo: true, firstName: true, lastName: true, isTemporaryExam: true } },
                  enrolledLevel: { select: { id: true, name: true, rank: true } },
                  sourceTeacherUser: {
                    select: {
                      id: true,
                      username: true,
                      teacherProfile: { select: { fullName: true } }
                    }
                  }
                }
              }
            }
          }
        }
      }),
      prisma.examEnrollmentList.findMany({
        where: {
          tenantId: req.auth.tenantId,
          examCycleId,
          type: "TEACHER",
          hierarchyNodeId: centerNodeId
        },
        select: {
          id: true,
          teacherUserId: true,
          status: true,
          submittedAt: true,
          teacherUser: {
            select: {
              id: true,
              username: true,
              teacherProfile: { select: { fullName: true } }
            }
          },
          _count: { select: { items: true } }
        },
        orderBy: { submittedAt: "desc" }
      })
    ]);

    return res.apiSuccess("Combined list is locked", { ...fullLocked, teacherLists: lockedTeacherLists });
  }

  const teacherLists = await prisma.examEnrollmentList.findMany({
    where: {
      tenantId: req.auth.tenantId,
      examCycleId,
      type: "TEACHER",
      hierarchyNodeId: centerNodeId,
      status: "SUBMITTED_TO_CENTER",
      locked: true
    },
    select: {
      id: true,
      teacherUserId: true,
      status: true,
      submittedAt: true,
      teacherUser: {
        select: {
          id: true,
          username: true,
          teacherProfile: { select: { fullName: true } }
        }
      },
      _count: { select: { items: true } }
    },
    orderBy: { submittedAt: "desc" }
  });

  const teacherListIds = teacherLists.map((l) => l.id);
  const teacherItems = teacherListIds.length
    ? await prisma.examEnrollmentListItem.findMany({
        where: {
          tenantId: req.auth.tenantId,
          listId: { in: teacherListIds }
        },
        select: { entryId: true }
      })
    : [];

  const teacherEntryIds = Array.from(new Set(teacherItems.map((i) => i.entryId).filter(Boolean)));

  // Remove stale teacher-sourced entries (keep temp entries).
  await prisma.examEnrollmentListItem.deleteMany({
    where: {
      tenantId: req.auth.tenantId,
      listId: combined.id,
      entry: { is: { isTemporary: false } },
      ...(teacherEntryIds.length ? { entryId: { notIn: teacherEntryIds } } : {})
    }
  });

  // Add missing teacher entries without touching existing ones (preserves included flags).
  if (teacherEntryIds.length) {
    await prisma.examEnrollmentListItem.createMany({
      data: teacherEntryIds.map((entryId) => ({
        tenantId: req.auth.tenantId,
        listId: combined.id,
        entryId
      })),
      skipDuplicates: true
    });
  }

  const full = await prisma.examEnrollmentList.findFirst({
    where: { id: combined.id },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          entry: {
            include: {
              student: { select: { id: true, admissionNo: true, firstName: true, lastName: true, isTemporaryExam: true } },
              enrolledLevel: { select: { id: true, name: true, rank: true } },
              sourceTeacherUser: {
                select: {
                  id: true,
                  username: true,
                  teacherProfile: { select: { fullName: true } }
                }
              }
            }
          }
        }
      }
    }
  });

  // Also include all teacher lists (not just SUBMITTED_TO_CENTER) for the reject UI
  const allTeacherLists = await prisma.examEnrollmentList.findMany({
    where: {
      tenantId: req.auth.tenantId,
      examCycleId,
      type: "TEACHER",
      hierarchyNodeId: centerNodeId
    },
    select: {
      id: true,
      teacherUserId: true,
      status: true,
      submittedAt: true,
      teacherUser: {
        select: {
          id: true,
          username: true,
          teacherProfile: { select: { fullName: true } }
        }
      },
      _count: { select: { items: true } }
    },
    orderBy: { submittedAt: "desc" }
  });

  return res.apiSuccess("Combined list prepared", { ...full, teacherLists: allTeacherLists });
});

const centerSubmitCombinedListToFranchise = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const centerNodeId = req.auth.hierarchyNodeId;

  if (!centerNodeId) {
    return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: { id: true, enrollmentStartAt: true, enrollmentEndAt: true }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  if (!withinEnrollmentWindow(examCycle)) {
    return res.apiError(409, "Enrollment window is closed", "ENROLLMENT_WINDOW_CLOSED");
  }

  const combined = await getOrCreateCenterCombinedList({
    tenantId: req.auth.tenantId,
    examCycleId,
    centerNodeId,
    actorUserId: req.auth.userId
  });

  if (combined.locked && combined.status !== "REJECTED") {
    return res.apiError(409, "Combined list is locked", "LIST_LOCKED");
  }

  const entriesCount = await prisma.examEnrollmentListItem.count({
    where: { tenantId: req.auth.tenantId, listId: combined.id, included: true }
  });

  if (entriesCount === 0) {
    return res.apiError(409, "Cannot submit an empty list", "EXAM_LIST_EMPTY");
  }

  // Ensure combined list is in DRAFT or REJECTED before submitting.
  const now = new Date();

  const updated = await prisma.examEnrollmentList.update({
    where: { id: combined.id },
    data: {
      status: "SUBMITTED_TO_FRANCHISE",
      locked: true,
      submittedAt: combined.status === "DRAFT" ? now : undefined,
      forwardedAt: now,
      rejectedAt: null,
      rejectedByUserId: null,
      rejectedRemark: null
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_CENTER_LIST_SUBMIT",
    entityType: "EXAM_ENROLLMENT_LIST",
    entityId: updated.id,
    metadata: { examCycleId }
  });

  return res.apiSuccess("Combined list submitted to franchise", updated);
});

const centerSetCombinedListItemIncluded = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const entryId = String(req.params.entryId);
  const centerNodeId = req.auth.hierarchyNodeId;
  const included = Boolean(req.body?.included);

  if (!centerNodeId) {
    return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const combined = await getOrCreateCenterCombinedList({
    tenantId: req.auth.tenantId,
    examCycleId,
    centerNodeId,
    actorUserId: req.auth.userId
  });

  if (combined.locked && combined.status !== "REJECTED") {
    return res.apiError(409, "Combined list is locked", "LIST_LOCKED");
  }

  const item = await prisma.examEnrollmentListItem.findFirst({
    where: {
      tenantId: req.auth.tenantId,
      listId: combined.id,
      entryId
    },
    select: { listId: true, entryId: true, included: true }
  });

  if (!item) {
    return res.apiError(404, "Entry is not in combined list. Refresh combined list first.", "EXAM_LIST_ITEM_NOT_FOUND");
  }

  const updated = await prisma.examEnrollmentListItem.update({
    where: { listId_entryId: { listId: combined.id, entryId } },
    data: { included },
    select: { listId: true, entryId: true, included: true }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: included ? "EXAM_CENTER_LIST_ITEM_INCLUDE" : "EXAM_CENTER_LIST_ITEM_EXCLUDE",
    entityType: "EXAM_ENROLLMENT_LIST",
    entityId: combined.id,
    metadata: { examCycleId, entryId, included }
  });

  return res.apiSuccess("Selection updated", updated);
});

const centerRejectTeacherList = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const listId = String(req.params.listId);
  const remark = req.body?.remark;

  const list = await prisma.examEnrollmentList.findFirst({
    where: {
      id: listId,
      tenantId: req.auth.tenantId,
      examCycleId,
      type: "TEACHER",
      hierarchyNodeId: req.auth.hierarchyNodeId
    },
    select: { id: true, status: true }
  });

  if (!list) {
    return res.apiError(404, "Teacher list not found", "EXAM_LIST_NOT_FOUND");
  }

  const updated = await rejectEnrollmentList({
    tenantId: req.auth.tenantId,
    listId,
    actorUserId: req.auth.userId,
    actorRole: "CENTER",
    remark
  });

  return res.apiSuccess("Teacher list rejected", updated.list);
});

const exportEnrollmentListCsv = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const listId = String(req.params.listId);

  const list = await prisma.examEnrollmentList.findFirst({
    where: { id: listId, tenantId: req.auth.tenantId, examCycleId },
    select: {
      id: true,
      type: true,
      status: true,
      hierarchyNodeId: true,
      teacherUserId: true,
      scopeKey: true,
      examCycle: { select: { code: true, name: true } },
      centerNode: { select: { code: true, name: true } }
    }
  });

  if (!list) {
    return res.apiError(404, "Enrollment list not found", "EXAM_LIST_NOT_FOUND");
  }

  // Scope enforcement
  if (req.auth.role === "TEACHER") {
    if (list.type !== "TEACHER" || list.teacherUserId !== req.auth.userId) {
      return res.apiError(403, "Forbidden", "HIERARCHY_SCOPE_DENIED");
    }
  } else if (req.auth.role === "CENTER") {
    if (!req.auth.hierarchyNodeId || list.hierarchyNodeId !== req.auth.hierarchyNodeId) {
      return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
    }
  } else if (req.auth.role === "FRANCHISE" || req.auth.role === "BP") {
    const scope = await resolveActorExamScope({ tenantId: req.auth.tenantId, actor: req.auth });
    if (scope.hierarchyNodeIds.length && !scope.hierarchyNodeIds.includes(list.hierarchyNodeId)) {
      return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
    }
  } else if (req.auth.role !== "SUPERADMIN") {
    return res.apiError(403, "Forbidden", "ROLE_FORBIDDEN");
  }

  const full = await prisma.examEnrollmentList.findFirst({
    where: { id: list.id, tenantId: req.auth.tenantId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        ...(list.type === "CENTER_COMBINED" ? { where: { included: true } } : {}),
        include: {
          entry: {
            include: {
              student: { select: { admissionNo: true, firstName: true, lastName: true, isTemporaryExam: true } },
              enrolledLevel: { select: { name: true, rank: true } }
              ,
              sourceTeacherUser: {
                select: {
                  username: true,
                  teacherProfile: { select: { fullName: true } }
                }
              }
            }
          }
        }
      }
    }
  });

  const headers = [
    { key: "examCode", label: "Exam Code" },
    { key: "examName", label: "Exam Name" },
    { key: "listType", label: "List Type" },
    { key: "listStatus", label: "List Status" },
    { key: "centerCode", label: "Center Code" },
    { key: "centerName", label: "Center Name" },
    { key: "teacherCode", label: "Teacher Code" },
    { key: "teacherName", label: "Teacher Name" },
    { key: "studentCode", label: "Student Code" },
    { key: "studentName", label: "Student Name" },
    { key: "temporary", label: "Temporary" },
    { key: "level", label: "Level" }
  ];

  const rows = (full?.items || []).map((item) => {
    const s = item?.entry?.student;
    const lvl = item?.entry?.enrolledLevel;
    const t = item?.entry?.sourceTeacherUser;
    const teacherCode = t?.username || "";
    const teacherName = t?.teacherProfile?.fullName || teacherCode;
    return {
      examCode: list.examCycle?.code || "",
      examName: list.examCycle?.name || "",
      listType: list.type,
      listStatus: list.status,
      centerCode: list.centerNode?.code || "",
      centerName: list.centerNode?.name || "",
      teacherCode,
      teacherName,
      studentCode: s?.admissionNo || "",
      studentName: s ? `${s.firstName} ${s.lastName}`.trim() : "",
      temporary: s?.isTemporaryExam ? "YES" : "NO",
      level: lvl ? `${lvl.name} (${lvl.rank})` : ""
    };
  });

  const csv = toCsv({ headers, rows });
  const filename = `exam_enrollment_${list.examCycle?.code || examCycleId}_${list.type}_${list.id}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
});

async function buildExamResultsPayload({ tenantId, actor, examCycleId }) {
  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId },
    select: { id: true, resultStatus: true }
  });

  if (!examCycle) {
    const error = new Error("Exam cycle not found");
    error.statusCode = 404;
    error.errorCode = "EXAM_CYCLE_NOT_FOUND";
    throw error;
  }

  const scope = await resolveActorExamScope({ tenantId, actor });

  if (actor.role !== "SUPERADMIN" && examCycle.resultStatus !== "PUBLISHED") {
    const error = new Error("Results are not published");
    error.statusCode = 403;
    error.errorCode = "RESULTS_NOT_PUBLISHED";
    throw error;
  }

  const approvedCombinedLists = await prisma.examEnrollmentList.findMany({
    where: {
      tenantId,
      examCycleId,
      type: "CENTER_COMBINED",
      status: "APPROVED"
    },
    select: { id: true }
  });

  const listIds = approvedCombinedLists.map((l) => l.id);

  const itemWhere = {
    tenantId,
    listId: { in: listIds },
    included: true
  };

  if (actor.role === "CENTER" || actor.role === "TEACHER") {
    itemWhere.entry = { is: { student: { is: { hierarchyNodeId: actor.hierarchyNodeId } } } };
  } else if (actor.role === "FRANCHISE" || actor.role === "BP") {
    const nodeIds = scope.hierarchyNodeIds;
    if (nodeIds.length) {
      itemWhere.entry = { is: { student: { is: { hierarchyNodeId: { in: nodeIds } } } } };
    }
  }

  if (actor.role === "TEACHER") {
    itemWhere.entry = { is: { ...(itemWhere.entry?.is || {}), sourceTeacherUserId: actor.userId } };
  }

  const items = listIds.length
    ? await prisma.examEnrollmentListItem.findMany({
        where: itemWhere,
        select: {
          entry: {
            select: {
              studentId: true,
              student: { select: { admissionNo: true, firstName: true, lastName: true, hierarchyNodeId: true } }
            }
          }
        }
      })
    : [];

  const entries = items.map((i) => i.entry);
  const studentIds = entries.map((e) => e.studentId);

  const submissions = studentIds.length
    ? await prisma.worksheetSubmission.findMany({
        where: {
          tenantId,
          studentId: { in: studentIds },
          worksheet: {
            is: {
              examCycleId,
              generationMode: "EXAM"
            }
          }
        },
        select: {
          studentId: true,
          score: true,
          correctCount: true,
          totalQuestions: true,
          completionTimeSeconds: true,
          finalSubmittedAt: true,
          worksheet: { select: { id: true } }
        }
      })
    : [];

  const byStudent = new Map();
  for (const s of submissions) {
    byStudent.set(s.studentId, s);
  }

  const results = entries.map((e) => {
    const sub = byStudent.get(e.studentId);
    return {
      studentId: e.studentId,
      admissionNo: e.student.admissionNo,
      studentName: `${e.student.firstName} ${e.student.lastName}`.trim(),
      hierarchyNodeId: e.student.hierarchyNodeId,
      score: sub?.score ?? null,
      correctCount: sub?.correctCount ?? null,
      totalQuestions: sub?.totalQuestions ?? null,
      completionTimeSeconds: sub?.completionTimeSeconds ?? null,
      submittedAt: sub?.finalSubmittedAt ?? null,
      worksheetId: sub?.worksheet?.id ?? null
    };
  });

  return { status: examCycle.resultStatus, results };
}

async function buildExamResultReviewSummary({ tenantId, examCycleId, actor }) {
  const [examCycle, payload, enrollmentLevels, levelRules] = await Promise.all([
    prisma.examCycle.findFirst({
      where: { id: examCycleId, tenantId },
      select: {
        id: true,
        code: true,
        name: true,
        resultStatus: true,
        resultPublishedAt: true,
        resultPublishedByUserId: true,
        examStartsAt: true,
        examEndsAt: true,
        businessPartnerId: true
      }
    }),
    buildExamResultsPayload({
      tenantId,
      actor,
      examCycleId
    }),
    prisma.examEnrollmentEntry.findMany({
      where: { tenantId, examCycleId },
      select: {
        studentId: true,
        enrolledLevelId: true,
        enrolledLevel: { select: { id: true, name: true, rank: true } }
      }
    }),
    prisma.levelRule.findMany({
      where: { tenantId },
      select: { levelId: true, passThreshold: true }
    })
  ]);

  if (!examCycle) {
    const error = new Error("Exam cycle not found");
    error.statusCode = 404;
    error.errorCode = "EXAM_CYCLE_NOT_FOUND";
    throw error;
  }

  const levelByStudentId = new Map();
  const levelMetaById = new Map();
  for (const entry of enrollmentLevels) {
    levelByStudentId.set(entry.studentId, entry.enrolledLevelId);
    if (entry.enrolledLevel?.id) {
      levelMetaById.set(entry.enrolledLevel.id, {
        levelId: entry.enrolledLevel.id,
        levelName: entry.enrolledLevel.name,
        levelRank: entry.enrolledLevel.rank
      });
    }
  }

  const passThresholdByLevelId = new Map();
  for (const rule of levelRules) {
    const threshold = Number(rule?.passThreshold);
    passThresholdByLevelId.set(rule.levelId, Number.isFinite(threshold) ? threshold : 85);
  }

  const results = payload.results || [];
  const appeared = results.filter((row) => row.score !== null && row.score !== undefined);
  const absentCount = results.length - appeared.length;
  const totalScore = appeared.reduce((sum, row) => sum + Number(row.score || 0), 0);
  const avgScore = appeared.length ? Number((totalScore / appeared.length).toFixed(2)) : 0;

  let passCount = 0;
  let failCount = 0;

  const levelWiseMap = new Map();
  for (const row of results) {
    const levelId = levelByStudentId.get(row.studentId) || "UNASSIGNED";
    const levelMeta = levelMetaById.get(levelId) || {
      levelId,
      levelName: "Unassigned",
      levelRank: null
    };

    if (!levelWiseMap.has(levelId)) {
      levelWiseMap.set(levelId, {
        levelId: levelMeta.levelId,
        levelName: levelMeta.levelName,
        levelRank: levelMeta.levelRank,
        total: 0,
        appeared: 0,
        absent: 0,
        pass: 0,
        fail: 0,
        totalScore: 0
      });
    }

    const bucket = levelWiseMap.get(levelId);
    bucket.total += 1;

    if (row.score === null || row.score === undefined) {
      bucket.absent += 1;
      continue;
    }

    const numericScore = Number(row.score || 0);
    const threshold = passThresholdByLevelId.get(levelId) ?? 85;
    const passed = numericScore >= threshold;

    bucket.appeared += 1;
    bucket.totalScore += numericScore;
    if (passed) {
      bucket.pass += 1;
      passCount += 1;
    } else {
      bucket.fail += 1;
      failCount += 1;
    }
  }

  const levelWise = Array.from(levelWiseMap.values())
    .map((bucket) => ({
      levelId: bucket.levelId,
      levelName: bucket.levelName,
      levelRank: bucket.levelRank,
      total: bucket.total,
      appeared: bucket.appeared,
      absent: bucket.absent,
      pass: bucket.pass,
      fail: bucket.fail,
      avgScore: bucket.appeared ? Number((bucket.totalScore / bucket.appeared).toFixed(2)) : 0
    }))
    .sort((a, b) => {
      const rankA = Number(a.levelRank ?? Number.MAX_SAFE_INTEGER);
      const rankB = Number(b.levelRank ?? Number.MAX_SAFE_INTEGER);
      if (rankA !== rankB) return rankA - rankB;
      return String(a.levelName || "").localeCompare(String(b.levelName || ""));
    });

  const topPerformers = appeared
    .map((row) => ({
      studentId: row.studentId,
      admissionNo: row.admissionNo,
      studentName: row.studentName,
      score: Number(row.score || 0),
      levelId: levelByStudentId.get(row.studentId) || null,
      levelName: levelMetaById.get(levelByStudentId.get(row.studentId))?.levelName || null
    }))
    .sort((a, b) => b.score - a.score || String(a.studentName || "").localeCompare(String(b.studentName || "")))
    .slice(0, 10);

  return {
    examCycle,
    publication: {
      status: payload.status,
      canPublish: payload.status === "READY_FOR_REVIEW" || payload.status === "LOCKED",
      canUnpublish: payload.status === "PUBLISHED",
      resultPublishedAt: examCycle.resultPublishedAt,
      resultPublishedByUserId: examCycle.resultPublishedByUserId
    },
    summary: {
      totalCandidates: results.length,
      appearedCount: appeared.length,
      absentCount,
      passCount,
      failCount,
      avgScore
    },
    topPerformers,
    levelWise,
    rows: results
  };
}

const listExamResultsControlCenter = asyncHandler(async (req, res) => {
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);
  const statusFilter = String(req.query?.status || "ALL").trim().toUpperCase();
  const q = String(req.query?.q || "").trim();

  const where = {
    tenantId: req.auth.tenantId,
    ...(statusFilter && statusFilter !== "ALL" ? { resultStatus: statusFilter } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q } },
            { name: { contains: q } }
          ]
        }
      : {})
  };

  const [items, total] = await Promise.all([
    prisma.examCycle.findMany({
      where,
      orderBy: orderBy || { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        code: true,
        name: true,
        examStartsAt: true,
        examEndsAt: true,
        resultStatus: true,
        resultPublishAt: true,
        resultPublishedAt: true,
        resultPublishedByUserId: true,
        businessPartner: { select: { id: true, code: true, name: true } },
        publishedByUser: {
          select: {
            id: true,
            username: true,
            email: true
          }
        },
        _count: {
          select: {
            enrollmentEntries: true,
            resultPublicationAudits: true
          }
        }
      }
    }),
    prisma.examCycle.count({ where })
  ]);

  const enriched = await Promise.all(
    items.map(async (cycle) => {
      const enrollmentCounts = await getEnrollmentCounts({
        tenantId: req.auth.tenantId,
        examCycleId: cycle.id
      });

      const submissionsCount = await prisma.worksheetSubmission.count({
        where: {
          tenantId: req.auth.tenantId,
          worksheet: {
            is: {
              examCycleId: cycle.id,
              generationMode: "EXAM"
            }
          },
          finalSubmittedAt: { not: null },
          score: { not: null }
        }
      });

      return {
        ...cycle,
        enrollmentCounts,
        metrics: {
          enrolledCount: cycle._count.enrollmentEntries,
          appearedCount: submissionsCount,
          publicationEvents: cycle._count.resultPublicationAudits
        },
        publication: {
          canPublish: cycle.resultStatus === "READY_FOR_REVIEW" || cycle.resultStatus === "LOCKED",
          canUnpublish: cycle.resultStatus === "PUBLISHED"
        }
      };
    })
  );

  return res.apiSuccess("Exam result control center", {
    items: enriched,
    total,
    limit,
    offset,
    status: statusFilter
  });
});

const getExamResultsReview = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const payload = await buildExamResultReviewSummary({
    tenantId: req.auth.tenantId,
    examCycleId,
    actor: req.auth
  });
  return res.apiSuccess("Exam result review summary", payload);
});

const getExamResultPublicationAuditTrail = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);

  const cycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: { id: true }
  });

  if (!cycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  const audits = await prisma.examResultPublicationAudit.findMany({
    where: {
      tenantId: req.auth.tenantId,
      examCycleId
    },
    orderBy: { actedAt: "desc" },
    include: {
      actedByUser: {
        select: {
          id: true,
          username: true,
          email: true,
          role: true
        }
      }
    }
  });

  return res.apiSuccess("Exam result publication audit trail", audits);
});

const listPendingEnrollmentLists = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const scope = await resolveActorExamScope({ tenantId: req.auth.tenantId, actor: req.auth });

  const statusByRole = {
    FRANCHISE: "SUBMITTED_TO_FRANCHISE",
    BP: "SUBMITTED_TO_BUSINESS_PARTNER",
    SUPERADMIN: "SUBMITTED_TO_SUPERADMIN"
  };

  const desiredStatus = statusByRole[req.auth.role];
  if (!desiredStatus) {
    return res.apiError(403, "Forbidden", "ROLE_FORBIDDEN");
  }

  const where = {
    tenantId: req.auth.tenantId,
    examCycleId,
    type: "CENTER_COMBINED",
    status: desiredStatus
  };

  if (req.auth.role !== "SUPERADMIN") {
    if (!scope.hierarchyNodeIds.length) {
      // If scope nodes not computed, fall back to actor node.
      where.hierarchyNodeId = req.auth.hierarchyNodeId || undefined;
    } else {
      where.hierarchyNodeId = { in: scope.hierarchyNodeIds };
    }
  }

  const lists = await prisma.examEnrollmentList.findMany({
    where,
    orderBy: { forwardedAt: "asc" },
    include: {
      centerNode: { select: { id: true, name: true, code: true, type: true } },
      _count: { select: { items: { where: { included: true } } } }
    }
  });

  return res.apiSuccess("Pending lists", lists.map((l) => ({ ...l, entriesCount: l._count?.items ?? 0, _count: undefined })));
});

async function getRequiredLevelIdsForList({ tenantId, examCycleId, listId }) {
  const items = await prisma.examEnrollmentListItem.findMany({
    where: {
      tenantId,
      listId,
      included: true,
      list: {
        is: {
          id: listId,
          examCycleId,
          tenantId,
          type: "CENTER_COMBINED"
        }
      }
    },
    select: {
      entry: { select: { enrolledLevelId: true } }
    }
  });

  return Array.from(new Set(items.map((item) => item.entry?.enrolledLevelId).filter(Boolean)));
}

const getEnrollmentListLevelBreakdown = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const listId = String(req.params.listId);
  const tenantId = req.auth.tenantId;

  const list = await prisma.examEnrollmentList.findFirst({
    where: { id: listId, tenantId, examCycleId, type: "CENTER_COMBINED" },
    select: { id: true }
  });

  if (!list) {
    return res.apiError(404, "List not found", "EXAM_LIST_NOT_FOUND");
  }

  const breakdown = await getExamCycleLevels({ tenantId, examCycleId, listId });

  return res.apiSuccess("Level breakdown", breakdown);
});

const getExamCycleLevelsForAssessment = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const listId = req.query?.listId ? String(req.query.listId) : null;

  const levels = await getExamCycleLevels({
    tenantId: req.auth.tenantId,
    examCycleId,
    listId
  });

  return res.apiSuccess("Exam cycle levels", levels);
});

const getExamCycleAssessmentConfig = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const listId = req.query?.listId ? String(req.query.listId) : null;

  const levels = await getExamCycleLevels({
    tenantId: req.auth.tenantId,
    examCycleId,
    listId
  });
  const levelIds = levels.map((level) => level.levelId);

  const [configs, worksheetsByLevelId, questionBanksByLevelId] = await Promise.all([
    getConfig({ tenantId: req.auth.tenantId, examCycleId, levelIds }),
    getLevelWorksheets({ tenantId: req.auth.tenantId, levelIds }),
    getLevelQuestionBanks({ tenantId: req.auth.tenantId, levelIds })
  ]);

  const configuredLevels = new Set(configs.map((config) => config.levelId));
  const isComplete = levelIds.length > 0 && levelIds.every((levelId) => configuredLevels.has(levelId));

  return res.apiSuccess("Assessment config fetched", {
    levels,
    configs,
    worksheetsByLevelId,
    questionBanksByLevelId,
    isComplete
  });
});

const saveExamCycleAssessmentConfig = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const listId = req.body?.listId ? String(req.body.listId) : req.query?.listId ? String(req.query.listId) : null;

  const levels = await getExamCycleLevels({
    tenantId: req.auth.tenantId,
    examCycleId,
    listId
  });

  const saved = await saveConfig({
    tenantId: req.auth.tenantId,
    examCycleId,
    actorUserId: req.auth.userId,
    configs: Array.isArray(req.body?.configs) ? req.body.configs : [],
    allowedLevelIds: levels.map((level) => level.levelId)
  });

  return res.apiSuccess("Assessment config saved", saved);
});

const generateExamCycleQuestionSet = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const studentId = String(req.body?.studentId || "").trim();
  const requestedLevelId = String(req.body?.levelId || "").trim();

  if (!studentId) {
    return res.apiError(400, "studentId is required", "VALIDATION_ERROR");
  }

  const enrollment = await prisma.examEnrollmentEntry.findUnique({
    where: {
      tenantId_examCycleId_studentId: {
        tenantId: req.auth.tenantId,
        examCycleId,
        studentId
      }
    },
    select: {
      enrolledLevelId: true
    }
  });

  if (!enrollment?.enrolledLevelId) {
    return res.apiError(404, "Exam enrollment not found", "EXAM_ENROLLMENT_NOT_FOUND");
  }

  if (requestedLevelId && requestedLevelId !== enrollment.enrolledLevelId) {
    return res.apiError(409, "Requested level does not match enrolled exam level", "EXAM_LEVEL_MISMATCH");
  }

  const result = await generateQuestionSet({
    tenantId: req.auth.tenantId,
    examCycleId,
    studentId,
    levelId: enrollment.enrolledLevelId
  });

  return res.apiSuccess("Question set generated", result);
});

const forwardPendingEnrollmentList = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const listId = String(req.params.listId);

  const scope = await resolveActorExamScope({ tenantId: req.auth.tenantId, actor: req.auth });

  const list = await prisma.examEnrollmentList.findFirst({
    where: { id: listId, tenantId: req.auth.tenantId, examCycleId, type: "CENTER_COMBINED" },
    select: { id: true, hierarchyNodeId: true }
  });

  if (!list) {
    return res.apiError(404, "List not found", "EXAM_LIST_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && scope.hierarchyNodeIds.length) {
    if (!scope.hierarchyNodeIds.includes(list.hierarchyNodeId)) {
      return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
    }
  }

  const result = await forwardEnrollmentList({
    tenantId: req.auth.tenantId,
    listId,
    actorUserId: req.auth.userId,
    actorRole: req.auth.role
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_LIST_FORWARD",
    entityType: "EXAM_ENROLLMENT_LIST",
    entityId: listId,
    metadata: { examCycleId, from: result.fromStatus, to: result.toStatus }
  });

  return res.apiSuccess("List forwarded", result.list);
});

const rejectPendingEnrollmentList = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const listId = String(req.params.listId);
  const remark = req.body?.remark;

  const scope = await resolveActorExamScope({ tenantId: req.auth.tenantId, actor: req.auth });

  const list = await prisma.examEnrollmentList.findFirst({
    where: { id: listId, tenantId: req.auth.tenantId, examCycleId, type: "CENTER_COMBINED" },
    select: { id: true, hierarchyNodeId: true }
  });

  if (!list) {
    return res.apiError(404, "List not found", "EXAM_LIST_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && scope.hierarchyNodeIds.length) {
    if (!scope.hierarchyNodeIds.includes(list.hierarchyNodeId)) {
      return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
    }
  }

  const result = await rejectEnrollmentList({
    tenantId: req.auth.tenantId,
    listId,
    actorUserId: req.auth.userId,
    actorRole: req.auth.role,
    remark
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_LIST_REJECT",
    entityType: "EXAM_ENROLLMENT_LIST",
    entityId: listId,
    metadata: { examCycleId }
  });

  return res.apiSuccess("List rejected", result.list);
});

const superadminApproveEnrollmentList = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const listId = String(req.params.listId);

  const requiredLevelIds = await getRequiredLevelIdsForList({
    tenantId: req.auth.tenantId,
    examCycleId,
    listId
  });
  if (!requiredLevelIds.length) {
    return res.apiError(409, "No enrolled students in list", "EXAM_LIST_EMPTY");
  }

  try {
    await validateConfig({
      tenantId: req.auth.tenantId,
      examCycleId,
      requiredLevelIds
    });
  } catch (error) {
    return res.apiError(error?.statusCode || 409, error?.message || "Assessment configuration is incomplete", error?.errorCode || "EXAM_ASSESSMENT_CONFIG_INCOMPLETE");
  }

  const approved = await approveEnrollmentList({
    tenantId: req.auth.tenantId,
    listId,
    actorUserId: req.auth.userId,
    actorRole: req.auth.role
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_LIST_APPROVE",
    entityType: "EXAM_ENROLLMENT_LIST",
    entityId: listId,
    metadata: { examCycleId, configuredLevels: requiredLevelIds.length }
  });

  // Keep the configured practice schedule intact; approval only finalizes the list
  // and assigns exam worksheets/questions for this cycle based on level config.
  const generation = await assignSelectedExamWorksheets({
    tenantId: req.auth.tenantId,
    examCycleId,
    combinedListId: listId,
    actorUserId: req.auth.userId
  });

  await prisma.examCycle.updateMany({
    where: {
      id: examCycleId,
      tenantId: req.auth.tenantId,
      resultStatus: { in: ["DRAFT", "LOCKED"] }
    },
    data: {
      resultStatus: "READY_FOR_REVIEW",
      resultPublishedAt: null,
      resultPublishedByUserId: null
    }
  });

  return res.apiSuccess("List approved; assessments assigned", { list: approved.list, worksheets: generation });
});

const centerCreateTemporaryStudents = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const centerNodeId = req.auth.hierarchyNodeId;

  if (!centerNodeId) {
    return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const items = Array.isArray(req.body?.students) ? req.body.students : null;
  if (!items || !items.length) {
    return res.apiError(400, "students[] is required", "VALIDATION_ERROR");
  }

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: { id: true, enrollmentStartAt: true, enrollmentEndAt: true, examEndsAt: true }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  if (!withinEnrollmentWindow(examCycle)) {
    return res.apiError(409, "Enrollment window is closed", "ENROLLMENT_WINDOW_CLOSED");
  }

  const combined = await getOrCreateCenterCombinedList({
    tenantId: req.auth.tenantId,
    examCycleId,
    centerNodeId,
    actorUserId: req.auth.userId
  });

  if (combined.locked && combined.status !== "REJECTED") {
    return res.apiError(409, "Combined list is locked", "LIST_LOCKED");
  }

  const expiryBufferDays = 7;
  const expiresAt = new Date(new Date(examCycle.examEndsAt).getTime() + expiryBufferDays * 24 * 60 * 60 * 1000);

  const created = await prisma.$transaction(async (tx) => {
    const out = [];

    for (const raw of items) {
      const firstName = raw?.firstName ? String(raw.firstName).trim() : "Temp";
      const lastName = raw?.lastName ? String(raw.lastName).trim() : "Student";
      const levelId = raw?.levelId ? String(raw.levelId).trim() : null;
      const password = raw?.password ? String(raw.password) : "Pass@123";

      if (!levelId) {
        const error = new Error("levelId is required for temporary student");
        error.statusCode = 400;
        error.errorCode = "VALIDATION_ERROR";
        throw error;
      }

      const username = await generateUsername({ tx, tenantId: req.auth.tenantId, role: "STUDENT" });
      const admissionNo = username;
      const passwordHash = await hashPassword(password);

      const student = await tx.student.create({
        data: {
          tenantId: req.auth.tenantId,
          admissionNo,
          firstName,
          lastName,
          email: null,
          hierarchyNodeId: centerNodeId,
          levelId,
          isActive: true,
          isTemporaryExam: true,
          temporaryExpiresAt: expiresAt,
          temporaryExamCycleId: examCycleId
        },
        select: { id: true, admissionNo: true, firstName: true, lastName: true, levelId: true }
      });

      const user = await tx.authUser.create({
        data: {
          tenantId: req.auth.tenantId,
          username,
          email: `${username.toLowerCase()}@temp.local`,
          passwordHash,
          role: "STUDENT",
          isActive: true,
          hierarchyNodeId: centerNodeId,
          parentUserId: req.auth.userId,
          studentId: student.id,
          mustChangePassword: true
        },
        select: { id: true, username: true }
      });

      const entry = await tx.examEnrollmentEntry.create({
        data: {
          tenantId: req.auth.tenantId,
          examCycleId,
          studentId: student.id,
          enrolledLevelId: levelId,
          isTemporary: true,
          sourceTeacherUserId: null,
          createdByUserId: req.auth.userId
        },
        select: { id: true }
      });

      await tx.examEnrollmentListItem.create({
        data: {
          tenantId: req.auth.tenantId,
          listId: combined.id,
          entryId: entry.id
        }
      });

      out.push({ student, user, entry, password });
    }

    return out;
  });

  return res.apiSuccess("Temporary students created", created, 201);
});

const getExamCycleArchiveImpact = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const impact = await loadExamCycleArchiveImpact({
    tenantId: req.auth.tenantId,
    examCycleId
  });

  res.locals.auditMetadata = {
    examCycleCode: impact.examCycle.code,
    approvedEnrollmentCount: impact.summary.approvedEnrollmentCount,
    certificateCount: impact.summary.certificateCount,
    resultCount: impact.summary.resultCount,
    isArchived: impact.examCycle.isArchived
  };

  return res.apiSuccess("Archive impact", impact);
});

const archiveExamCycle = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const password = String(req.body?.password || "").trim();
  const confirmCode = String(req.body?.confirmCode || "").trim();
  const archiveReason = String(req.body?.archiveReason || "").trim();

  if (!password) {
    return res.apiError(400, "password is required", "VALIDATION_ERROR");
  }

  if (!confirmCode) {
    return res.apiError(400, "confirmCode is required", "VALIDATION_ERROR");
  }

  if (archiveReason.length < 20) {
    return res.apiError(400, "archiveReason must be at least 20 characters", "VALIDATION_ERROR");
  }

  const impact = await loadExamCycleArchiveImpact({ tenantId: req.auth.tenantId, examCycleId });

  if (impact.examCycle.isArchived) {
    return res.apiError(409, "Exam cycle is already archived", "EXAM_CYCLE_ALREADY_ARCHIVED");
  }

  if (confirmCode.toUpperCase() !== String(impact.examCycle.code || "").toUpperCase()) {
    return res.apiError(400, "confirmCode must match exam cycle code", "EXAM_CYCLE_CODE_CONFIRMATION_MISMATCH");
  }

  const actor = await verifySuperadminPasswordOrThrow({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    password
  });

  const archived = await prisma.examCycle.update({
    where: { id: examCycleId },
    data: {
      isArchived: true,
      archivedAt: new Date(),
      archivedBy: req.auth.userId,
      archiveReason
    },
    select: {
      id: true,
      code: true,
      name: true,
      isArchived: true,
      archivedAt: true,
      archivedBy: true,
      archiveReason: true
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_CYCLE_ARCHIVED",
    entityType: "EXAM_CYCLE",
    entityId: archived.id,
    metadata: {
      cycleId: archived.id,
      cycleCode: archived.code,
      cycleName: archived.name,
      userId: req.auth.userId,
      username: actor.username || req.auth.username || null,
      timestamp: new Date().toISOString(),
      reason: archiveReason,
      tenantId: req.auth.tenantId
    }
  }, { strict: true });

  res.locals.auditMetadata = {
    cycleCode: archived.code,
    reasonLength: archiveReason.length
  };

  return res.apiSuccess("Exam cycle archived", archived);
});

const restoreExamCycle = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const password = String(req.body?.password || "").trim();

  if (!password) {
    return res.apiError(400, "password is required", "VALIDATION_ERROR");
  }

  const examCycle = await getExamCycleById({ tenantId: req.auth.tenantId, examCycleId });
  if (!examCycle.isArchived) {
    return res.apiError(409, "Exam cycle is not archived", "EXAM_CYCLE_NOT_ARCHIVED");
  }

  const actor = await verifySuperadminPasswordOrThrow({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    password
  });

  const restored = await prisma.examCycle.update({
    where: { id: examCycleId },
    data: {
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null
    },
    select: {
      id: true,
      code: true,
      name: true,
      isArchived: true
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_CYCLE_RESTORED",
    entityType: "EXAM_CYCLE",
    entityId: restored.id,
    metadata: {
      cycleId: restored.id,
      cycleCode: restored.code,
      cycleName: restored.name,
      userId: req.auth.userId,
      username: actor.username || req.auth.username || null,
      timestamp: new Date().toISOString(),
      reason: "RESTORE",
      tenantId: req.auth.tenantId
    }
  }, { strict: true });

  res.locals.auditMetadata = {
    cycleCode: restored.code,
    restored: true
  };

  return res.apiSuccess("Exam cycle restored", restored);
});

const getExamCycleDeleteImpact = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const impact = await loadExamCycleDeleteImpact({
    tenantId: req.auth.tenantId,
    examCycleId
  });

  res.locals.auditMetadata = {
    examCycleCode: impact.examCycle.code,
    canDelete: impact.flags.canDelete,
    approvedListCount: impact.summary.approvedListCount,
    submissionCount: impact.summary.submissionCount
  };

  return res.apiSuccess("Delete impact", impact);
});

const getExamCycleAuditCheck = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: {
      id: true,
      code: true,
      name: true,
      resultStatus: true,
      enrollmentStartAt: true,
      enrollmentEndAt: true,
      practiceStartAt: true,
      examStartsAt: true,
      examEndsAt: true,
      resultPublishAt: true,
      resultPublishedAt: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  const [lists, approvedListCount, rawAudit] = await Promise.all([
    prisma.examEnrollmentList.findMany({
      where: { tenantId: req.auth.tenantId, examCycleId },
      select: {
        id: true,
        status: true,
        locked: true,
        submittedAt: true,
        forwardedAt: true,
        approvedAt: true,
        rejectedAt: true
      }
    }),
    prisma.examEnrollmentList.count({
      where: { tenantId: req.auth.tenantId, examCycleId, status: "APPROVED" }
    }),
    prisma.auditLog.findMany({
      where: {
        tenantId: req.auth.tenantId,
        action: { startsWith: "EXAM_" }
      },
      orderBy: { createdAt: "desc" },
      take: 250,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        role: true,
        metadata: true,
        createdAt: true,
        user: { select: { id: true, username: true, email: true } }
      }
    })
  ]);

  const statusCounts = lists.reduce((acc, list) => {
    acc[list.status] = (acc[list.status] || 0) + 1;
    return acc;
  }, {});

  const timeline = rawAudit
    .filter((event) => {
      if (event.entityType === "EXAM_CYCLE" && event.entityId === examCycleId) {
        return true;
      }
      const metadataExamCycleId = String(event?.metadata?.examCycleId || "");
      return metadataExamCycleId === examCycleId;
    })
    .slice(0, 40);

  const now = new Date();
  const healthChecks = {
    publishedWithoutApprovedList: examCycle.resultStatus === "PUBLISHED" && approvedListCount === 0,
    examWindowEndedButDraft: now.getTime() > new Date(examCycle.examEndsAt).getTime() && examCycle.resultStatus === "DRAFT",
    practiceStartsAfterExam: new Date(examCycle.practiceStartAt).getTime() > new Date(examCycle.examStartsAt).getTime(),
    enrollmentEndsAfterExamStart:
      new Date(examCycle.enrollmentEndAt).getTime() > new Date(examCycle.examStartsAt).getTime(),
    publishedMissingPublishedAt: examCycle.resultStatus === "PUBLISHED" && !examCycle.resultPublishedAt
  };

  res.locals.auditMetadata = {
    examCycleCode: examCycle.code,
    timelineCount: timeline.length,
    approvedListCount
  };

  return res.apiSuccess("Exam audit check", {
    examCycle,
    enrollmentListSummary: {
      total: lists.length,
      approved: approvedListCount,
      byStatus: statusCounts
    },
    healthChecks,
    timeline
  });
});

const deleteExamCycle = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const password = String(req.body?.password || "").trim();
  const confirmCode = String(req.body?.confirmCode || "").trim();

  if (!password) {
    return res.apiError(400, "password is required", "VALIDATION_ERROR");
  }

  const impact = await loadExamCycleDeleteImpact({
    tenantId: req.auth.tenantId,
    examCycleId
  });

  if (!confirmCode) {
    return res.apiError(400, "confirmCode is required", "VALIDATION_ERROR");
  }

  if (confirmCode.toUpperCase() !== String(impact.examCycle.code || "").toUpperCase()) {
    return res.apiError(400, "confirmCode must match exam cycle code", "EXAM_CYCLE_CODE_CONFIRMATION_MISMATCH");
  }

  if (!impact.flags.canDelete) {
    return res.apiError(409, impact.blockers[0] || "Delete is blocked", "EXAM_CYCLE_DELETE_BLOCKED");
  }

  await verifySuperadminPasswordOrThrow({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    password
  });

  await prisma.$transaction(async (tx) => {
    await tx.worksheet.updateMany({
      where: { tenantId: req.auth.tenantId, examCycleId },
      data: { examCycleId: null }
    });

    await tx.examCycle.delete({
      where: { id: examCycleId }
    });
  });

  res.locals.auditMetadata = {
    examCycleCode: impact.examCycle.code,
    approvedListCount: impact.summary.approvedListCount,
    resultStatus: impact.examCycle.resultStatus,
    submissionCount: impact.summary.submissionCount
  };

  return res.apiSuccess("Exam cycle deleted", {
    id: impact.examCycle.id,
    code: impact.examCycle.code,
    name: impact.examCycle.name
  });
});

const getExamResults = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);

  const payload = await buildExamResultsPayload({ tenantId: req.auth.tenantId, actor: req.auth, examCycleId });
  return res.apiSuccess("Exam results", payload);
});

const exportExamResultsCsv = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: { id: true, code: true, name: true }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  const payload = await buildExamResultsPayload({ tenantId: req.auth.tenantId, actor: req.auth, examCycleId });

  const headers = [
    { key: "examCode", label: "Exam Code" },
    { key: "examName", label: "Exam Name" },
    { key: "resultStatus", label: "Result Status" },
    { key: "studentCode", label: "Student Code" },
    { key: "studentName", label: "Student Name" },
    { key: "score", label: "Score" },
    { key: "correctCount", label: "Correct" },
    { key: "totalQuestions", label: "Total" },
    { key: "completionTimeSeconds", label: "Time (sec)" },
    { key: "submittedAt", label: "Submitted At" }
  ];

  const rows = (payload.results || []).map((r) => ({
    examCode: examCycle.code,
    examName: examCycle.name,
    resultStatus: payload.status,
    studentCode: r.admissionNo,
    studentName: r.studentName,
    score: r.score,
    correctCount: r.correctCount,
    totalQuestions: r.totalQuestions,
    completionTimeSeconds: r.completionTimeSeconds,
    submittedAt: r.submittedAt ? new Date(r.submittedAt).toISOString() : ""
  }));

  const csv = toCsv({ headers, rows });
  const filename = `exam_results_${examCycle.code || examCycleId}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
});

const publishExamResults = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const note = req.body?.note ? String(req.body.note).trim() : null;
  const confirmationAccepted = req.body?.confirmationAccepted === undefined ? true : Boolean(req.body?.confirmationAccepted);

  if (!confirmationAccepted) {
    return res.apiError(400, "Publish confirmation is required", "PUBLISH_CONFIRMATION_REQUIRED");
  }

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: {
      id: true,
      name: true,
      code: true,
      businessPartnerId: true,
      resultStatus: true
    }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  if (examCycle.resultStatus === "PUBLISHED") {
    return res.apiError(409, "Results are already published", "EXAM_RESULTS_ALREADY_PUBLISHED");
  }

  if (!(["READY_FOR_REVIEW", "LOCKED"].includes(examCycle.resultStatus))) {
    return res.apiError(409, "Results must be ready for review before publishing", "EXAM_RESULTS_NOT_READY_FOR_PUBLICATION");
  }

  const publishedAt = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const cycle = await tx.examCycle.update({
      where: { id: examCycle.id },
      data: {
        resultStatus: "PUBLISHED",
        resultPublishedAt: publishedAt,
        resultPublishedByUserId: req.auth.userId
      }
    });

    await tx.examResultPublicationAudit.create({
      data: {
        tenantId: req.auth.tenantId,
        examCycleId: examCycle.id,
        action: "PUBLISHED",
        notes: note,
        actedByUserId: req.auth.userId,
        actedAt: publishedAt
      }
    });

    return cycle;
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_RESULTS_PUBLISH",
    entityType: "EXAM_CYCLE",
    entityId: examCycleId,
    metadata: {
      previousStatus: examCycle.resultStatus,
      newStatus: "PUBLISHED",
      note
    }
  });

  void (async () => {
    try {
      const bp = await prisma.businessPartner.findFirst({
        where: { id: examCycle.businessPartnerId, tenantId: req.auth.tenantId },
        select: { id: true, hierarchyNodeId: true }
      });

      const nodeIds = bp?.hierarchyNodeId
        ? await resolveBusinessPartnerHierarchyNodeIds({ tenantId: req.auth.tenantId, businessPartnerId: bp.id })
        : [];

      const operationalRecipients = await prisma.authUser.findMany({
        where: {
          tenantId: req.auth.tenantId,
          isActive: true,
          role: { in: ["BP", "FRANCHISE", "CENTER", "TEACHER"] },
          ...(nodeIds.length ? { hierarchyNodeId: { in: nodeIds } } : {})
        },
        select: { id: true },
        take: 500
      });

      const enrolled = await prisma.examEnrollmentEntry.findMany({
        where: {
          tenantId: req.auth.tenantId,
          examCycleId: examCycle.id
        },
        select: { studentId: true }
      });

      const studentIds = Array.from(new Set(enrolled.map((row) => row.studentId).filter(Boolean)));

      const [studentRecipients, parentLinks] = await Promise.all([
        studentIds.length
          ? prisma.authUser.findMany({
              where: {
                tenantId: req.auth.tenantId,
                role: "STUDENT",
                isActive: true,
                studentId: { in: studentIds }
              },
              select: { id: true }
            })
          : [],
        studentIds.length
          ? prisma.parentStudentLink.findMany({
              where: {
                tenantId: req.auth.tenantId,
                studentId: { in: studentIds },
                isActive: true
              },
              select: { parentUserId: true }
            })
          : []
      ]);

      const parentRecipientIds = Array.from(new Set(parentLinks.map((row) => row.parentUserId).filter(Boolean)));
      const parentRecipients = parentRecipientIds.length
        ? await prisma.authUser.findMany({
            where: {
              tenantId: req.auth.tenantId,
              role: "PARENT",
              isActive: true,
              id: { in: parentRecipientIds }
            },
            select: { id: true }
          })
        : [];

      const recipients = Array.from(
        new Set([
          ...operationalRecipients.map((r) => r.id),
          ...studentRecipients.map((r) => r.id),
          ...parentRecipients.map((r) => r.id)
        ])
      ).map((id) => ({ id }));

      await createBulkNotification(
        recipients.map((r) => ({
          tenantId: req.auth.tenantId,
          recipientUserId: r.id,
          type: "EXAM_RESULT_PUBLISHED",
          title: "Exam Results Published",
          message: `Exam results are now available for ${examCycle.name} (${examCycle.code}).`,
          entityType: "EXAM_CYCLE",
          entityId: examCycle.id
        }))
      );
    } catch {
      return;
    }
  })();

  return res.apiSuccess("Results published", updated);
});

const unpublishExamResults = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const note = req.body?.note ? String(req.body.note).trim() : null;

  if (!note || note.length < 8) {
    return res.apiError(400, "note is required and must be at least 8 characters", "UNPUBLISH_NOTE_REQUIRED");
  }

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: {
      id: true,
      name: true,
      code: true,
      businessPartnerId: true,
      resultStatus: true
    }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  if (examCycle.resultStatus !== "PUBLISHED") {
    return res.apiError(409, "Results are not published", "EXAM_RESULTS_NOT_PUBLISHED");
  }

  const actedAt = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const cycle = await tx.examCycle.update({
      where: { id: examCycle.id },
      data: {
        resultStatus: "READY_FOR_REVIEW",
        resultPublishedAt: null,
        resultPublishedByUserId: null
      }
    });

    await tx.examResultPublicationAudit.create({
      data: {
        tenantId: req.auth.tenantId,
        examCycleId: examCycle.id,
        action: "UNPUBLISHED",
        notes: note,
        actedByUserId: req.auth.userId,
        actedAt
      }
    });

    return cycle;
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_RESULTS_UNPUBLISH",
    entityType: "EXAM_CYCLE",
    entityId: examCycleId,
    metadata: {
      previousStatus: "PUBLISHED",
      newStatus: "READY_FOR_REVIEW",
      note
    }
  });

  void (async () => {
    try {
      const bp = await prisma.businessPartner.findFirst({
        where: { id: examCycle.businessPartnerId, tenantId: req.auth.tenantId },
        select: { id: true, hierarchyNodeId: true }
      });

      const nodeIds = bp?.hierarchyNodeId
        ? await resolveBusinessPartnerHierarchyNodeIds({ tenantId: req.auth.tenantId, businessPartnerId: bp.id })
        : [];

      const recipients = await prisma.authUser.findMany({
        where: {
          tenantId: req.auth.tenantId,
          isActive: true,
          role: { in: ["BP", "FRANCHISE", "CENTER", "TEACHER", "STUDENT", "PARENT"] },
          ...(nodeIds.length ? { hierarchyNodeId: { in: nodeIds } } : {})
        },
        select: { id: true },
        take: 500
      });

      await createBulkNotification(
        recipients.map((r) => ({
          tenantId: req.auth.tenantId,
          recipientUserId: r.id,
          type: "EXAM_RESULT_UNPUBLISHED",
          title: "Exam Results Unpublished",
          message: `Exam results are temporarily unavailable for ${examCycle.name} (${examCycle.code}) due to review updates.`,
          entityType: "EXAM_CYCLE",
          entityId: examCycle.id
        }))
      );
    } catch {
      return;
    }
  })();

  return res.apiSuccess("Results unpublished", updated);
});

export {
  listExamCycles,
  listExamResultsControlCenter,
  createExamCycle,
  getTeacherList,
  teacherEnrollStudents,
  submitTeacherListToCenter,
  centerPrepareCombinedList,
  centerSubmitCombinedListToFranchise,
  centerSetCombinedListItemIncluded,
  centerRejectTeacherList,
  exportEnrollmentListCsv,
  getEnrollmentListLevelBreakdown,
  getExamCycleLevelsForAssessment,
  getExamCycleAssessmentConfig,
  saveExamCycleAssessmentConfig,
  generateExamCycleQuestionSet,
  listPendingEnrollmentLists,
  forwardPendingEnrollmentList,
  rejectPendingEnrollmentList,
  superadminApproveEnrollmentList,
  centerCreateTemporaryStudents,
  getExamCycleArchiveImpact,
  archiveExamCycle,
  restoreExamCycle,
  getExamCycleDeleteImpact,
  getExamCycleAuditCheck,
  deleteExamCycle,
  getExamResults,
  getExamResultsReview,
  getExamResultPublicationAuditTrail,
  exportExamResultsCsv,
  publishExamResults,
  unpublishExamResults
};
