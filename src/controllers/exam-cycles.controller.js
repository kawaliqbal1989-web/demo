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
import { hashPassword } from "../utils/password.js";
import { generateUsername } from "../utils/username-generator.js";

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

const listExamCycles = asyncHandler(async (req, res) => {
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);

  const scope = await resolveActorExamScope({ tenantId: req.auth.tenantId, actor: req.auth });

  const where = {
    tenantId: req.auth.tenantId,
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

  return res.apiSuccess("Exam cycles fetched", { items, total, limit, offset });
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
  const centerNodeId = req.auth.hierarchyNodeId;

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
  const studentIds = Array.isArray(req.body?.studentIds) ? req.body.studentIds.map(String) : null;

  if (!studentIds || !studentIds.length) {
    return res.apiError(400, "studentIds[] is required", "VALIDATION_ERROR");
  }

  if (!req.auth.hierarchyNodeId) {
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
    centerNodeId: req.auth.hierarchyNodeId
  });

  if (list.locked && list.status === "SUBMITTED_TO_CENTER") {
    return res.apiError(409, "List is submitted and locked", "LIST_LOCKED");
  }

  const activeEnrollments = await prisma.enrollment.findMany({
    where: {
      tenantId: req.auth.tenantId,
      hierarchyNodeId: req.auth.hierarchyNodeId,
      status: "ACTIVE",
      assignedTeacherUserId: req.auth.userId,
      studentId: { in: studentIds }
    },
    select: {
      student: { select: { id: true, isActive: true, levelId: true } }
    }
  });

  const allowedStudents = activeEnrollments.map((e) => e.student).filter((s) => s?.isActive);
  const allowedIds = new Set(allowedStudents.map((s) => s.id));

  for (const sid of studentIds) {
    if (!allowedIds.has(sid)) {
      return res.apiError(403, "One or more students are not assigned/active under this teacher", "TEACHER_STUDENT_FORBIDDEN");
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const sid of studentIds) {
      const s = allowedStudents.find((x) => x.id === sid);

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
          enrolledLevelId: s.levelId,
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

  if (!req.auth.hierarchyNodeId) {
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
    centerNodeId: req.auth.hierarchyNodeId
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
          hierarchyNodeId: req.auth.hierarchyNodeId
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

const listPendingEnrollmentLists = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
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

  const items = await prisma.examEnrollmentListItem.findMany({
    where: {
      tenantId,
      listId,
      included: true
    },
    select: {
      entry: {
        select: {
          enrolledLevel: {
            select: { id: true, name: true, rank: true }
          }
        }
      }
    }
  });

  const byLevelId = new Map();
  for (const item of items) {
    const level = item?.entry?.enrolledLevel;
    if (!level?.id) {
      continue;
    }
    const existing = byLevelId.get(level.id);
    if (existing) {
      existing.studentCount += 1;
    } else {
      byLevelId.set(level.id, {
        levelId: level.id,
        levelName: level.name,
        levelRank: level.rank,
        studentCount: 1
      });
    }
  }

  const breakdown = Array.from(byLevelId.values()).sort((a, b) => {
    const ar = typeof a.levelRank === "number" ? a.levelRank : 0;
    const br = typeof b.levelRank === "number" ? b.levelRank : 0;
    if (ar !== br) return ar - br;
    return String(a.levelName || "").localeCompare(String(b.levelName || ""));
  });

  return res.apiSuccess("Level breakdown", breakdown);
});

const forwardPendingEnrollmentList = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
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
  const listId = String(req.params.listId);

  const rawSelections = Array.isArray(req.body?.selections) ? req.body.selections : null;
  if (!rawSelections || rawSelections.length === 0) {
    return res.apiError(400, "Exam worksheet selections are required", "EXAM_WORKSHEET_SELECTION_REQUIRED");
  }

  const selections = rawSelections
    .map((s) => ({
      levelId: s?.levelId ? String(s.levelId).trim() : "",
      worksheetId: s?.worksheetId ? String(s.worksheetId).trim() : ""
    }))
    .filter((s) => s.levelId && s.worksheetId);

  if (!selections.length) {
    return res.apiError(400, "Invalid selections", "VALIDATION_ERROR");
  }

  // Compute required levels for this request.
  const requiredItems = await prisma.examEnrollmentListItem.findMany({
    where: {
      tenantId: req.auth.tenantId,
      listId,
      included: true,
      list: {
        is: {
          id: listId,
          examCycleId,
          tenantId: req.auth.tenantId,
          type: "CENTER_COMBINED"
        }
      }
    },
    select: {
      entry: { select: { enrolledLevelId: true } }
    }
  });

  const requiredLevelIds = Array.from(new Set(requiredItems.map((i) => i.entry?.enrolledLevelId).filter(Boolean)));
  if (!requiredLevelIds.length) {
    return res.apiError(409, "No enrolled students in list", "EXAM_LIST_EMPTY");
  }

  const selectedLevelIds = new Set(selections.map((s) => s.levelId));
  for (const levelId of requiredLevelIds) {
    if (!selectedLevelIds.has(levelId)) {
      return res.apiError(409, "Missing exam worksheet selection for one or more levels", "EXAM_WORKSHEET_SELECTION_INCOMPLETE");
    }
  }

  // Reject extra / mismatched levels explicitly to avoid accidental wrong mappings.
  const requiredLevelSet = new Set(requiredLevelIds);
  for (const s of selections) {
    if (!requiredLevelSet.has(s.levelId)) {
      return res.apiError(409, "Selection contains invalid level", "EXAM_WORKSHEET_SELECTION_LEVEL_INVALID");
    }
  }

  // Validate the selected worksheets.
  const worksheetIds = Array.from(new Set(selections.map((s) => s.worksheetId)));
  const worksheets = await prisma.worksheet.findMany({
    where: {
      tenantId: req.auth.tenantId,
      id: { in: worksheetIds }
    },
    select: {
      id: true,
      levelId: true,
      isPublished: true,
      examCycleId: true,
      _count: { select: { questions: true } }
    }
  });
  const wsById = new Map(worksheets.map((w) => [w.id, w]));

  for (const s of selections) {
    const ws = wsById.get(s.worksheetId);
    if (!ws) {
      return res.apiError(409, "Selected exam worksheet not found", "EXAM_WORKSHEET_NOT_FOUND");
    }
    if (ws.levelId !== s.levelId) {
      return res.apiError(409, "Selected exam worksheet level mismatch", "EXAM_WORKSHEET_LEVEL_MISMATCH");
    }
    if (ws.examCycleId) {
      return res.apiError(409, "Selected exam worksheet must be a base worksheet (not an exam cycle worksheet)", "EXAM_WORKSHEET_SOURCE_INVALID");
    }
    if (!ws.isPublished) {
      return res.apiError(409, "Selected exam worksheet must be published", "EXAM_WORKSHEET_NOT_PUBLISHED");
    }
    if ((ws._count?.questions ?? 0) <= 0) {
      return res.apiError(409, "Selected exam worksheet has no questions", "EXAM_WORKSHEET_QUESTIONS_MISSING");
    }
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
    metadata: { examCycleId, selectionsCount: selections.length }
  });

  // Persist selections (idempotent upsert).
  await prisma.$transaction(
    selections.map((s) =>
      prisma.examEnrollmentLevelWorksheetSelection.upsert({
        where: {
          tenantId_listId_levelId: {
            tenantId: req.auth.tenantId,
            listId,
            levelId: s.levelId
          }
        },
        create: {
          tenantId: req.auth.tenantId,
          listId,
          levelId: s.levelId,
          baseWorksheetId: s.worksheetId,
          createdByUserId: req.auth.userId
        },
        update: {
          baseWorksheetId: s.worksheetId,
          createdByUserId: req.auth.userId
        }
      })
    )
  );

  // Generate practice + exam worksheets immediately.
  // Also open practice immediately from approval time (requirement: practice starts when superadmin approves).
  const now = new Date();
  await prisma.examCycle.update({
    where: { id: examCycleId },
    data: {
      practiceStartAt: now
    }
  });

  const generation = await assignSelectedExamWorksheets({
    tenantId: req.auth.tenantId,
    examCycleId,
    combinedListId: listId,
    actorUserId: req.auth.userId
  });

  return res.apiSuccess("List approved; worksheets assigned", { list: approved.list, worksheets: generation });
});

const centerCreateTemporaryStudents = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
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

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: { id: true, name: true, code: true, businessPartnerId: true }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  const updated = await prisma.examCycle.update({
    where: { id: examCycle.id },
    data: {
      resultStatus: "PUBLISHED",
      resultPublishedAt: new Date()
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_RESULTS_PUBLISH",
    entityType: "EXAM_CYCLE",
    entityId: examCycleId
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
          type: "EXAM_RESULT_PUBLISHED",
          title: "Exam Results Published",
          message: `Results published for ${examCycle.name} (${examCycle.code})`,
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

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: { id: true, name: true, code: true, businessPartnerId: true }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  const updated = await prisma.examCycle.update({
    where: { id: examCycle.id },
    data: {
      resultStatus: "LOCKED",
      resultPublishedAt: null
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_RESULTS_UNPUBLISH",
    entityType: "EXAM_CYCLE",
    entityId: examCycleId
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
          type: "EXAM_RESULT_UNPUBLISHED",
          title: "Exam Results Unpublished",
          message: `Results unpublished for ${examCycle.name} (${examCycle.code})`,
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
  listPendingEnrollmentLists,
  forwardPendingEnrollmentList,
  rejectPendingEnrollmentList,
  superadminApproveEnrollmentList,
  centerCreateTemporaryStudents,
  getExamResults,
  exportExamResultsCsv,
  publishExamResults,
  unpublishExamResults
};
