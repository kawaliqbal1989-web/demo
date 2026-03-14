import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import { verifyPassword } from "../utils/password.js";
import { signAccessToken, signRefreshToken, tokenHash } from "../utils/token.js";
import { recordAudit } from "../utils/audit.js";
import { assignLevelWithIntegrity } from "../services/student-lifecycle.service.js";
import { toCsv } from "../utils/csv.js";
import {
  createReassignmentRequest as svcCreateReassignment,
  listReassignmentRequests as svcListReassignments,
  reviewReassignmentRequest as svcReviewReassignment,
  directReassign as svcDirectReassign,
  bulkAssignWorksheetToStudents as svcBulkAssign,
} from "../services/worksheet-reassignment.service.js";
import { getStudent360Data } from "../services/student-360.service.js";

function fullName(student) {
  const first = String(student?.firstName || "").trim();
  const last = String(student?.lastName || "").trim();
  return [first, last].filter(Boolean).join(" ").trim();
}

function normalizeAttendanceEntryStatus(value) {
  const v = String(value || "").trim().toUpperCase();
  if (["PRESENT", "ABSENT", "LATE", "EXCUSED"].includes(v)) return v;
  return null;
}

function normalizeAttendanceSessionStatus(value) {
  const v = String(value || "").trim().toUpperCase();
  if (["DRAFT", "PUBLISHED", "LOCKED", "CANCELLED"].includes(v)) return v;
  return null;
}

function normalizeSubmissionStatus(value) {
  const v = String(value || "").trim().toUpperCase();
  if (["PENDING", "REVIEWED", "REJECTED"].includes(v)) return v;
  return null;
}

function normalizeBooleanQuery(value) {
  if (value === undefined || value === null || value === "") return null;
  const v = String(value).trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return null;
}

function parseISODateOnly(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function normalizePositiveInt(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function isMissingMockTestSchemaError(error) {
  const code = String(error?.code || "").trim().toUpperCase();
  if (code === "P2021" || code === "P2022") {
    return true;
  }

  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("mocktest") ||
    message.includes("mock_test") ||
    message.includes("mock test")
  );
}

async function loadTeacherContext({ tenantId, teacherUserId }) {
  const teacher = await prisma.authUser.findFirst({
    where: { id: teacherUserId, tenantId, role: "TEACHER", isActive: true },
    select: {
      id: true,
      username: true,
      email: true,
      hierarchyNodeId: true,
      teacherProfile: { select: { fullName: true, phonePrimary: true, status: true, isActive: true } }
    }
  });

  return teacher;
}

async function ensureTeacherAssignedToBatch({ tenantId, teacherUserId, batchId }) {
  const assignment = await prisma.batchTeacherAssignment.findFirst({
    where: { tenantId, batchId, teacherUserId },
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

async function loadCenterAttendanceConfig({ tenantId, centerHierarchyNodeId }) {
  const profile = await prisma.centerProfile.findFirst({
    where: {
      tenantId,
      authUser: { hierarchyNodeId: centerHierarchyNodeId }
    },
    select: {
      attendanceConfig: true
    }
  });

  const raw = profile?.attendanceConfig && typeof profile.attendanceConfig === "object" ? profile.attendanceConfig : {};

  const defaultEntryStatus = normalizeAttendanceEntryStatus(raw.defaultEntryStatus) || "ABSENT";

  // Prefer hours if configured, else fall back to existing editWindowDays (default 3 days).
  const editWindowHours = Number.isFinite(Number(raw.teacherEditWindowHours))
    ? Math.max(0, Number(raw.teacherEditWindowHours))
    : (Number.isFinite(Number(raw.editWindowDays)) ? Math.max(0, Number(raw.editWindowDays)) * 24 : 72);

  const teacherCanLock = Boolean(raw.teacherCanLock);

  return { defaultEntryStatus, editWindowHours, teacherCanLock };
}

function isWithinEditWindow({ sessionDate, editWindowHours }) {
  const ms = Math.max(0, Number(editWindowHours)) * 60 * 60 * 1000;
  if (!ms) return false;
  return Date.now() - sessionDate.getTime() <= ms;
}

const teacherLogin = asyncHandler(async (req, res) => {
  const { tenantCode = "DEFAULT", username, password } = req.body;

  const tenant = await prisma.tenant.findUnique({
    where: { code: tenantCode },
    select: { id: true, code: true }
  });

  if (!tenant || !username || !password) {
    await recordAudit({
      tenantId: tenant?.id || "tenant_default",
      action: "TEACHER_LOGIN_ATTEMPT",
      entityType: "AUTH",
      metadata: { username, tenantCode, success: false, reason: "invalid_credentials_input" }
    });

    return res.apiError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  const user = await prisma.authUser.findFirst({
    where: { tenantId: tenant.id, username },
    select: { id: true, role: true, isActive: true, passwordHash: true, hierarchyNodeId: true, username: true, failedAttempts: true, lockUntil: true }
  });

  if (!user || !user.isActive || user.role !== "TEACHER") {
    await recordAudit({
      tenantId: tenant.id,
      action: "TEACHER_LOGIN_ATTEMPT",
      entityType: "AUTH",
      metadata: { username, tenantCode, success: false, reason: "user_not_found_or_inactive_or_wrong_role" }
    });

    return res.apiError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  if (user.lockUntil && user.lockUntil > new Date()) {
    return res.apiError(423, "Account temporarily locked", "ACCOUNT_LOCKED");
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    const nextAttempts = (user.failedAttempts || 0) + 1;
    const lockUntil = nextAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

    await prisma.authUser.update({
      where: { id: user.id },
      data: {
        failedAttempts: nextAttempts >= 5 ? 0 : nextAttempts,
        lockUntil
      }
    });

    await recordAudit({
      tenantId: tenant.id,
      userId: user.id,
      role: user.role,
      action: "TEACHER_LOGIN_ATTEMPT",
      entityType: "AUTH",
      metadata: { username, tenantCode, success: false, reason: nextAttempts >= 5 ? "account_locked" : "password_mismatch" }
    });

    return nextAttempts >= 5
      ? res.apiError(423, "Account temporarily locked", "ACCOUNT_LOCKED")
      : res.apiError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  await prisma.authUser.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockUntil: null }
  });

  const profile = await prisma.teacherProfile.findFirst({
    where: { tenantId: tenant.id, authUserId: user.id },
    select: { fullName: true }
  });

  const payload = {
    userId: user.id,
    role: "TEACHER",
    tenantId: tenant.id,
    hierarchyNodeId: user.hierarchyNodeId,
    username: user.username
  };

  const accessToken = signAccessToken(payload);
  const refresh = signRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      tokenId: refresh.tokenId,
      tokenHash: tokenHash(refresh.token),
      userId: user.id,
      tenantId: tenant.id,
      expiresAt: refresh.expiresAt,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] || null
    }
  });

  await recordAudit({
    tenantId: tenant.id,
    userId: user.id,
    role: "TEACHER",
    action: "TEACHER_LOGIN_ATTEMPT",
    entityType: "AUTH",
    metadata: { username, tenantCode, success: true }
  });

  return res.apiSuccess("Teacher login successful", {
    token: accessToken,
    teacher: {
      id: user.id,
      centerId: user.hierarchyNodeId,
      name: profile?.fullName || user.username
    }
  });
});

const getTeacherMe = asyncHandler(async (req, res) => {
  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher) {
    return res.apiError(404, "Teacher not found", "TEACHER_NOT_FOUND");
  }

  return res.apiSuccess("Teacher context", {
    id: teacher.id,
    teacherCode: teacher.username,
    username: teacher.username,
    email: teacher.email,
    phonePrimary: teacher.teacherProfile?.phonePrimary || null,
    centerId: teacher.hierarchyNodeId,
    fullName: teacher.teacherProfile?.fullName || teacher.username || teacher.email,
    status: teacher.teacherProfile?.status || "ACTIVE",
    isActive: teacher.teacherProfile?.isActive ?? true,
    role: "TEACHER"
  });
});

const listTeacherBatches = asyncHandler(async (req, res) => {
  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const assignments = await prisma.batchTeacherAssignment.findMany({
    where: { tenantId: req.auth.tenantId, teacherUserId: teacher.id },
    select: { batchId: true }
  });

  const enrollmentBatches = await prisma.enrollment.findMany({
    where: {
      tenantId: req.auth.tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId,
      status: "ACTIVE",
      assignedTeacherUserId: teacher.id
    },
    select: { batchId: true },
    distinct: ["batchId"]
  });

  const assignmentBatchIds = assignments.map((a) => a.batchId);
  const enrollmentBatchIds = enrollmentBatches.map((e) => e.batchId);
  const batchIds = Array.from(new Set([...assignmentBatchIds, ...enrollmentBatchIds]));

  if (!batchIds.length) {
    return res.apiSuccess("Teacher batches", []);
  }

  const batches = await prisma.batch.findMany({
    where: {
      tenantId: req.auth.tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId,
      id: { in: batchIds }
    },
    select: { id: true, name: true, status: true }
  });

  const counts = await prisma.enrollment.groupBy({
    by: ["batchId"],
    where: {
      tenantId: req.auth.tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId,
      status: "ACTIVE",
      assignedTeacherUserId: teacher.id,
      batchId: { in: batchIds }
    },
    _count: { _all: true }
  });

  const countMap = new Map(counts.map((c) => [c.batchId, c._count._all]));

  return res.apiSuccess(
    "Teacher batches",
    batches.map((b) => ({
      batchId: b.id,
      name: b.name,
      activeStudentCount: countMap.get(b.id) || 0,
      status: b.status
    }))
  );
});

const getTeacherBatchRoster = asyncHandler(async (req, res) => {
  const { batchId } = req.params;

  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherAssignedToBatch({ tenantId: req.auth.tenantId, teacherUserId: teacher.id, batchId: String(batchId) });
  if (!allowed) {
    return res.apiError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      tenantId: req.auth.tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId,
      batchId: String(batchId),
      status: "ACTIVE",
      assignedTeacherUserId: teacher.id
    },
    select: {
      id: true,
      status: true,
      level: { select: { id: true, name: true, rank: true } },
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          guardianPhone: true,
          isActive: true
        }
      }
    },
    orderBy: [{ student: { admissionNo: "asc" } }]
  });

  return res.apiSuccess(
    "Batch roster",
    enrollments.map((e) => ({
      studentId: e.student.id,
      fullName: `${e.student.firstName} ${e.student.lastName}`.trim(),
      enrollmentId: e.id,
      level: e.level ? { id: e.level.id, name: e.level.name, rank: e.level.rank } : null,
      status: e.status,
      guardianPhone: e.student.guardianPhone || null
    }))
  );
});

const getTeacherBatchWorksheetsContext = asyncHandler(async (req, res) => {
  const { batchId } = req.params;

  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherAssignedToBatch({
    tenantId: req.auth.tenantId,
    teacherUserId: teacher.id,
    batchId: String(batchId)
  });
  if (!allowed) {
    return res.apiError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      tenantId: req.auth.tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId,
      batchId: String(batchId),
      status: "ACTIVE",
      assignedTeacherUserId: teacher.id
    },
    select: {
      studentId: true,
      levelId: true,
      level: { select: { id: true, name: true, rank: true } },
      student: { select: { levelId: true } }
    }
  });

  const levelIds = Array.from(
    new Set(
      enrollments
        .map((e) => e.levelId || e.student?.levelId || null)
        .filter(Boolean)
    )
  );

  if (!levelIds.length) {
    return res.apiSuccess("Batch worksheet context", {
      batchId: String(batchId),
      studentCount: enrollments.length,
      worksheets: []
    });
  }

  const worksheets = await prisma.worksheet.findMany({
    where: {
      tenantId: req.auth.tenantId,
      levelId: { in: levelIds }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      title: true,
      levelId: true,
      level: { select: { id: true, name: true, rank: true } }
    }
  });

  return res.apiSuccess("Batch worksheet context", {
    batchId: String(batchId),
    studentCount: enrollments.length,
    worksheets: worksheets.map((w, idx) => ({
      worksheetId: w.id,
      number: idx + 1,
      title: w.title,
      levelId: w.levelId,
      levelLabel: w.level ? `${w.level.name} / ${w.level.rank}` : ""
    }))
  });
});

const assignTeacherBatchWorksheet = asyncHandler(async (req, res) => {
  const { batchId } = req.params;
  const worksheetId = String(req.body?.worksheetId || "").trim();
  const dueDate = parseISODateOnly(req.body?.dueDate);

  if (!worksheetId) {
    return res.apiError(400, "worksheetId is required", "VALIDATION_ERROR");
  }

  if (!dueDate) {
    return res.apiError(400, "dueDate must be YYYY-MM-DD", "VALIDATION_ERROR");
  }

  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherAssignedToBatch({
    tenantId: req.auth.tenantId,
    teacherUserId: teacher.id,
    batchId: String(batchId)
  });
  if (!allowed) {
    return res.apiError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
  }

  const worksheet = await prisma.worksheet.findFirst({
    where: {
      id: worksheetId,
      tenantId: req.auth.tenantId
    },
    select: { id: true, levelId: true }
  });
  if (!worksheet) {
    return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      tenantId: req.auth.tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId,
      batchId: String(batchId),
      status: "ACTIVE",
      assignedTeacherUserId: teacher.id
    },
    select: {
      studentId: true,
      levelId: true,
      student: { select: { levelId: true } }
    }
  });

  const targetStudentIds = enrollments
    .filter((e) => (e.levelId || e.student?.levelId || null) === worksheet.levelId)
    .map((e) => e.studentId);

  const now = new Date();
  let assignedCount = 0;

  const runAssignment = async ({ includeDueDate }) => {
    assignedCount = 0;
    await prisma.$transaction(async (tx) => {
      for (const studentId of targetStudentIds) {
        const baseUpdate = {
          tenantId: req.auth.tenantId,
          createdByUserId: req.auth.userId,
          isActive: true,
          unassignedAt: null,
          assignedAt: now
        };

        const baseCreate = {
          tenantId: req.auth.tenantId,
          worksheetId: worksheet.id,
          studentId,
          createdByUserId: req.auth.userId,
          isActive: true,
          assignedAt: now,
          unassignedAt: null
        };

        // eslint-disable-next-line no-await-in-loop
        await tx.worksheetAssignment.upsert({
          where: {
            worksheetId_studentId: {
              worksheetId: worksheet.id,
              studentId
            }
          },
          update: includeDueDate ? { ...baseUpdate, dueDate } : baseUpdate,
          create: includeDueDate ? { ...baseCreate, dueDate } : baseCreate
        });
        assignedCount += 1;
      }
    });
  };

  try {
    await runAssignment({ includeDueDate: true });
  } catch (err) {
    const message = String(err?.message || "");
    const canRetryWithoutDueDate =
      message.includes("Unknown argument `dueDate`") ||
      message.includes("The column `dueDate` does not exist in the current database.") ||
      err?.code === "P2022";
    if (!canRetryWithoutDueDate) {
      throw err;
    }
    await runAssignment({ includeDueDate: false });
  }

  return res.apiSuccess("Worksheet assigned to batch", {
    batchId: String(batchId),
    worksheetId: worksheet.id,
    dueDate,
    assignedCount
  });
});

const listTeacherBatchMockTests = asyncHandler(async (req, res) => {
  const { batchId } = req.params;
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);

  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherAssignedToBatch({
    tenantId: req.auth.tenantId,
    teacherUserId: teacher.id,
    batchId: String(batchId)
  });
  if (!allowed) {
    return res.apiError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
  }

  const where = {
    tenantId: req.auth.tenantId,
    hierarchyNodeId: teacher.hierarchyNodeId,
    batchId: String(batchId)
  };

  let total = 0;
  let items = [];

  try {
    [total, items] = await Promise.all([
      prisma.mockTest.count({ where }),
      prisma.mockTest.findMany({
        where,
        take,
        skip,
        orderBy,
        select: {
          id: true,
          title: true,
          date: true,
          maxMarks: true,
          status: true,
          batch: { select: { id: true, name: true } }
        }
      })
    ]);
  } catch (error) {
    if (!isMissingMockTestSchemaError(error)) {
      throw error;
    }
  }

  return res.apiSuccess("Teacher batch mock tests", { items, total, limit, offset });
});

const getTeacherMockTest = asyncHandler(async (req, res) => {
  const mockTestId = String(req.params.mockTestId || "").trim();

  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const mockTest = await prisma.mockTest.findFirst({
    where: {
      id: mockTestId,
      tenantId: req.auth.tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId
    },
    include: {
      batch: { select: { id: true, name: true } },
      results: {
        include: {
          student: { select: { id: true, admissionNo: true, firstName: true, lastName: true } }
        }
      }
    }
  });

  if (!mockTest) {
    return res.apiError(404, "Mock test not found", "MOCK_TEST_NOT_FOUND");
  }

  const allowed = await ensureTeacherAssignedToBatch({
    tenantId: req.auth.tenantId,
    teacherUserId: teacher.id,
    batchId: String(mockTest.batchId)
  });
  if (!allowed) {
    return res.apiError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
  }

  const roster = await prisma.enrollment.findMany({
    where: {
      tenantId: req.auth.tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId,
      batchId: mockTest.batchId,
      status: "ACTIVE",
      assignedTeacherUserId: teacher.id
    },
    include: {
      student: { select: { id: true, admissionNo: true, firstName: true, lastName: true } }
    },
    orderBy: [{ student: { admissionNo: "asc" } }]
  });

  const resultByStudent = new Map((mockTest.results || []).map((r) => [r.studentId, r]));

  return res.apiSuccess("Teacher mock test", {
    id: mockTest.id,
    title: mockTest.title,
    date: mockTest.date,
    maxMarks: mockTest.maxMarks,
    status: mockTest.status,
    batch: mockTest.batch,
    roster: roster.map((e) => {
      const existing = resultByStudent.get(e.studentId);
      return {
        studentId: e.studentId,
        student: e.student,
        marks: existing?.marks ?? null
      };
    })
  });
});

const upsertTeacherMockTestResults = asyncHandler(async (req, res) => {
  const mockTestId = String(req.params.mockTestId || "").trim();
  const results = Array.isArray(req.body?.results) ? req.body.results : null;

  if (!results) {
    return res.apiError(400, "results array is required", "VALIDATION_ERROR");
  }

  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const mockTest = await prisma.mockTest.findFirst({
    where: {
      id: mockTestId,
      tenantId: req.auth.tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId
    },
    select: {
      id: true,
      batchId: true,
      maxMarks: true,
      status: true
    }
  });

  if (!mockTest) {
    return res.apiError(404, "Mock test not found", "MOCK_TEST_NOT_FOUND");
  }

  if (mockTest.status === "ARCHIVED") {
    return res.apiError(409, "Archived mock test cannot be edited", "MOCK_TEST_ARCHIVED");
  }

  const allowed = await ensureTeacherAssignedToBatch({
    tenantId: req.auth.tenantId,
    teacherUserId: teacher.id,
    batchId: String(mockTest.batchId)
  });
  if (!allowed) {
    return res.apiError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
  }

  const roster = await prisma.enrollment.findMany({
    where: {
      tenantId: req.auth.tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId,
      batchId: mockTest.batchId,
      status: "ACTIVE",
      assignedTeacherUserId: teacher.id
    },
    select: { studentId: true }
  });

  const allowedStudentIds = new Set(roster.map((r) => r.studentId));
  const cleaned = results
    .map((r) => ({
      studentId: r?.studentId ? String(r.studentId) : "",
      marks: r?.marks === null || r?.marks === undefined || r?.marks === "" ? null : Number.parseInt(String(r.marks), 10)
    }))
    .filter((r) => r.studentId && allowedStudentIds.has(r.studentId));

  let updatedCount = 0;
  await prisma.$transaction(async (tx) => {
    for (const result of cleaned) {
      if (result.marks === null || !Number.isFinite(result.marks)) {
        continue;
      }

      const marks = Math.max(0, Math.min(mockTest.maxMarks, result.marks));

      // eslint-disable-next-line no-await-in-loop
      await tx.mockTestResult.upsert({
        where: {
          mockTestId_studentId: {
            mockTestId: mockTest.id,
            studentId: result.studentId
          }
        },
        update: {
          marks,
          recordedByUserId: req.auth.userId,
          recordedAt: new Date()
        },
        create: {
          tenantId: req.auth.tenantId,
          mockTestId: mockTest.id,
          studentId: result.studentId,
          marks,
          recordedByUserId: req.auth.userId
        }
      });

      updatedCount += 1;
    }
  });

  return res.apiSuccess("Teacher mock test results saved", {
    mockTestId: mockTest.id,
    updatedCount
  });
});

const listTeacherStudents = asyncHandler(async (req, res) => {
  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const q = String(req.query.q || "").trim();

  const where = {
    tenantId: req.auth.tenantId,
    hierarchyNodeId: teacher.hierarchyNodeId,
    status: "ACTIVE",
    assignedTeacherUserId: teacher.id
  };

  if (q) {
    where.student = {
      OR: [
        { admissionNo: { contains: q } },
        { firstName: { contains: q } },
        { lastName: { contains: q } }
      ]
    };
  }

  const enrollments = await prisma.enrollment.findMany({
    where,
    select: {
      id: true,
      batchId: true,
      status: true,
      createdAt: true,
      level: { select: { id: true, name: true, rank: true } },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNo: true,
          isActive: true,
          level: { select: { id: true, name: true, rank: true } },
          course: { select: { id: true, code: true, name: true } }
        }
      }
    },
    orderBy: [{ createdAt: "desc" }, { student: { admissionNo: "asc" } }]
  });

  const studentMap = new Map();
  for (const enrollment of enrollments) {
    if (!studentMap.has(enrollment.student.id)) {
      studentMap.set(enrollment.student.id, enrollment);
    }
  }

  const uniqueEnrollments = Array.from(studentMap.values());
  const studentIds = uniqueEnrollments.map((item) => item.student.id);

  let assignmentCounts = [];
  let latestAttempts = [];
  let practiceAssignments = [];

  if (studentIds.length) {
    try {
      assignmentCounts = await prisma.worksheetAssignment.groupBy({
        by: ["studentId"],
        where: {
          tenantId: req.auth.tenantId,
          studentId: { in: studentIds },
          isActive: true
        },
        _count: { studentId: true }
      });
    } catch (error) {
      // Local/dev DB can be in partial schema state without worksheet tables.
      if (error?.code !== "P2021" && error?.code !== "P2022") {
        throw error;
      }
      assignmentCounts = [];
    }

    try {
      latestAttempts = await prisma.worksheetSubmission.groupBy({
        by: ["studentId"],
        where: {
          tenantId: req.auth.tenantId,
          studentId: { in: studentIds }
        },
        _max: {
          finalSubmittedAt: true,
          submittedAt: true
        }
      });
    } catch (error) {
      // Local/dev DB can be in partial schema state without worksheet tables.
      if (error?.code !== "P2021" && error?.code !== "P2022") {
        throw error;
      }
      latestAttempts = [];
    }

    try {
      practiceAssignments = await prisma.studentPracticeAssignment.findMany({
        where: {
          tenantId: req.auth.tenantId,
          studentId: { in: studentIds },
          isActive: true
        },
        select: {
          studentId: true,
          featureKey: true
        }
      });
    } catch (error) {
      if (error?.code !== "P2021" && error?.code !== "P2022") {
        throw error;
      }
      practiceAssignments = [];
    }
  }

  const assignmentCountByStudent = new Map(
    assignmentCounts.map((row) => [row.studentId, Number(row?._count?.studentId || 0)])
  );

  const latestAttemptByStudent = new Map(
    latestAttempts.map((row) => [
      row.studentId,
      row?._max?.finalSubmittedAt || row?._max?.submittedAt || null
    ])
  );

  const practiceFeaturesByStudent = new Map();
  for (const row of practiceAssignments) {
    if (!practiceFeaturesByStudent.has(row.studentId)) {
      practiceFeaturesByStudent.set(row.studentId, new Set());
    }
    practiceFeaturesByStudent.get(row.studentId).add(row.featureKey);
  }

  return res.apiSuccess(
    "Teacher students",
    uniqueEnrollments.map((e) => {
      const effectiveLevel = e.level || e.student.level || null;
      const assignedWorksheetCount = assignmentCountByStudent.get(e.student.id) || 0;
      const latestAttemptAt = latestAttemptByStudent.get(e.student.id) || null;
      const practiceFeatures = practiceFeaturesByStudent.get(e.student.id) || new Set();

      return {
        enrollmentId: e.id,
        studentId: e.student.id,
        admissionNo: e.student.admissionNo,
        fullName: `${e.student.firstName} ${e.student.lastName}`.trim(),
        batchId: e.batchId,
        level: effectiveLevel ? { id: effectiveLevel.id, name: effectiveLevel.name, rank: effectiveLevel.rank } : null,
        course: e.student.course
          ? {
              id: e.student.course.id,
              code: e.student.course.code,
              name: e.student.course.name
            }
          : null,
        status: e.status,
        assignedWorksheetCount,
        latestAttemptAt,
        hasPractice: practiceFeatures.has("PRACTICE"),
        hasAbacusPractice: practiceFeatures.has("ABACUS_PRACTICE")
      };
    })
  );
});

async function ensureTeacherCanAccessStudent({ tenantId, centerId, teacherUserId, studentId }) {
  const active = await prisma.enrollment.findFirst({
    where: {
      tenantId,
      hierarchyNodeId: centerId,
      studentId,
      status: "ACTIVE",
      assignedTeacherUserId: teacherUserId
    },
    select: { id: true }
  });

  return Boolean(active);
}

const getTeacherAssignWorksheetsContext = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const studentId = String(req.params.studentId || "").trim();

  const teacher = await loadTeacherContext({ tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherCanAccessStudent({
    tenantId,
    centerId: teacher.hierarchyNodeId,
    teacherUserId: teacher.id,
    studentId
  });
  if (!allowed) {
    return res.apiError(403, "Forbidden", "TEACHER_STUDENT_FORBIDDEN");
  }

  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId
    },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      levelId: true,
      guardianName: true,
      guardianPhone: true,
      email: true,
      phonePrimary: true,
      level: { select: { id: true, name: true, rank: true } },
      currentTeacher: {
        select: {
          username: true,
          email: true,
          teacherProfile: { select: { fullName: true } }
        }
      }
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId,
      studentId: student.id,
      status: "ACTIVE",
      assignedTeacherUserId: teacher.id
    },
    orderBy: { createdAt: "desc" },
    include: {
      level: { select: { id: true, name: true, rank: true } },
      assignedTeacher: { select: { id: true, username: true } }
    }
  });

  const effectiveLevelId = enrollment?.levelId || student.levelId;

  const effectiveLevel = effectiveLevelId
    ? await prisma.level.findFirst({
        where: {
          id: effectiveLevelId,
          tenantId
        },
        select: { id: true, name: true, rank: true }
      })
    : null;

  const teacherProfile = enrollment?.assignedTeacher?.id
    ? await prisma.teacherProfile.findFirst({
        where: {
          tenantId,
          authUserId: enrollment.assignedTeacher.id
        },
        select: { fullName: true }
      })
    : null;

  const worksheets = effectiveLevelId
    ? await prisma.worksheet.findMany({
        where: {
          tenantId,
          levelId: effectiveLevelId
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          title: true,
          isPublished: true
        }
      })
    : [];

  const worksheetIds = worksheets.map((w) => w.id);
  const submissions = worksheetIds.length
    ? await prisma.worksheetSubmission.findMany({
        where: {
          tenantId,
          studentId: student.id,
          worksheetId: { in: worksheetIds }
        },
        select: {
          worksheetId: true,
          id: true,
          finalSubmittedAt: true
        }
      })
    : [];

  const assignmentRows = worksheetIds.length
    ? await prisma.worksheetAssignment.findMany({
        where: {
          tenantId,
          studentId: student.id,
          worksheetId: { in: worksheetIds }
        },
        select: {
          worksheetId: true,
          isActive: true,
          assignedAt: true,
          unassignedAt: true
        }
      })
    : [];

  const assignmentByWorksheetId = new Map(assignmentRows.map((r) => [r.worksheetId, r]));
  const assignedWorksheetIds = assignmentRows.filter((r) => r.isActive).map((r) => r.worksheetId);
  const previousAssignedWorksheetIds = assignmentRows.filter((r) => !r.isActive).map((r) => r.worksheetId);
  const assignedById = new Set(assignedWorksheetIds);

  const attemptedByWorksheetId = new Map(submissions.map((s) => [s.worksheetId, 1]));
  const submittedByWorksheetId = new Set(submissions.filter((s) => s.finalSubmittedAt).map((s) => s.worksheetId));

  const levelRank = enrollment?.level?.rank ?? effectiveLevel?.rank ?? null;
  const courseCode = levelRank ? `AB-L${levelRank}` : null;

  return res.apiSuccess("Assign worksheets context fetched", {
    student: {
      id: student.id,
      fullName: fullName(student),
      studentCode: student.admissionNo
    },
    enrollment: {
      enrollmentId: enrollment?.id || null,
      courseCode,
      levelRank,
      levelTitle: enrollment?.level?.name || effectiveLevel?.name || null,
      courseLevelLabel:
        courseCode && (effectiveLevel?.name || levelRank)
          ? `${courseCode} / ${levelRank ?? ""}`.trim()
          : null,
      assignedTeacherName:
        teacherProfile?.fullName || enrollment?.assignedTeacher?.username || null
    },
    assignedWorksheetIds,
    previousAssignedWorksheetIds,
    worksheets: worksheets.map((w, idx) => {
      const assignment = assignmentByWorksheetId.get(w.id) || null;
      return {
        worksheetId: w.id,
        number: idx + 1,
        title: w.title,
        isPublished: Boolean(w.isPublished),
        attempt: attemptedByWorksheetId.get(w.id) || 0,
        isSubmitted: submittedByWorksheetId.has(w.id),
        isAssigned: assignedById.has(w.id),
        wasPreviouslyAssigned: Boolean(assignment && !assignment.isActive && assignment.unassignedAt),
        assignedAt: assignment?.assignedAt || null,
        unassignedAt: assignment?.unassignedAt || null
      };
    })
  });
});

const saveTeacherWorksheetAssignments = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const studentId = String(req.params.studentId || "").trim();

  const teacher = await loadTeacherContext({ tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherCanAccessStudent({
    tenantId,
    centerId: teacher.hierarchyNodeId,
    teacherUserId: teacher.id,
    studentId
  });
  if (!allowed) {
    return res.apiError(403, "Forbidden", "TEACHER_STUDENT_FORBIDDEN");
  }

  const worksheetIds = Array.isArray(req.body?.worksheetIds)
    ? Array.from(
        new Set(
          req.body.worksheetIds
            .map((v) => String(v).trim())
            .filter(Boolean)
        )
      )
    : [];

  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId
    },
    select: {
      id: true,
      levelId: true
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId,
      studentId: student.id,
      status: "ACTIVE",
      assignedTeacherUserId: teacher.id
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, levelId: true }
  });

  const effectiveLevelId = enrollment?.levelId || student.levelId;
  if (!effectiveLevelId) {
    return res.apiError(400, "Student level not set", "LEVEL_REQUIRED");
  }

  const allowedWorksheets = worksheetIds.length
    ? await prisma.worksheet.findMany({
        where: {
          tenantId,
          levelId: effectiveLevelId,
          id: { in: worksheetIds }
        },
        select: { id: true }
      })
    : [];

  const allowedIds = allowedWorksheets.map((w) => w.id);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.worksheetAssignment.updateMany({
      where: {
        tenantId,
        studentId: student.id,
        isActive: true,
        ...(allowedIds.length ? { worksheetId: { notIn: allowedIds } } : {})
      },
      data: {
        isActive: false,
        unassignedAt: now
      }
    });

    for (const worksheetId of allowedIds) {
      // eslint-disable-next-line no-await-in-loop
      await tx.worksheetAssignment.upsert({
        where: {
          worksheetId_studentId: {
            worksheetId,
            studentId: student.id
          }
        },
        update: {
          tenantId,
          createdByUserId: req.auth.userId,
          isActive: true,
          unassignedAt: null,
          assignedAt: now
        },
        create: {
          tenantId,
          worksheetId,
          studentId: student.id,
          createdByUserId: req.auth.userId,
          isActive: true,
          assignedAt: now,
          unassignedAt: null
        }
      });
    }
  });

  return res.apiSuccess("Assignments saved", {
    studentId,
    assignedCount: allowedIds.length
  });
});

const getTeacherStudent = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherCanAccessStudent({
    tenantId: req.auth.tenantId,
    centerId: teacher.hierarchyNodeId,
    teacherUserId: teacher.id,
    studentId: String(studentId)
  });

  if (!allowed) {
    return res.apiError(403, "Forbidden", "TEACHER_STUDENT_FORBIDDEN");
  }

  const [student, enrollments, notes, practiceAssignments] = await Promise.all([
    prisma.student.findFirst({
      where: { id: String(studentId), tenantId: req.auth.tenantId, hierarchyNodeId: teacher.hierarchyNodeId },
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        isActive: true,
        level: { select: { id: true, name: true, rank: true } }
      }
    }),
    prisma.enrollment.findMany({
      where: {
        tenantId: req.auth.tenantId,
        hierarchyNodeId: teacher.hierarchyNodeId,
        studentId: String(studentId),
        status: "ACTIVE",
        assignedTeacherUserId: teacher.id
      },
      include: {
        batch: { select: { id: true, name: true } },
        level: { select: { id: true, name: true, rank: true } }
      }
    }),
    prisma.teacherNote.findMany({
      where: {
        tenantId: req.auth.tenantId,
        hierarchyNodeId: teacher.hierarchyNodeId,
        teacherUserId: teacher.id,
        studentId: String(studentId),
        isDeleted: false
      },
      orderBy: [{ createdAt: "desc" }],
      take: 20
    }),
    prisma.studentPracticeAssignment.findMany({
      where: {
        tenantId: req.auth.tenantId,
        studentId: String(studentId),
        isActive: true
      },
      select: {
        featureKey: true,
        assignedAt: true
      }
    })
  ]);

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const attendanceSummary = await prisma.attendanceEntry.groupBy({
    by: ["status"],
    where: {
      tenantId: req.auth.tenantId,
      studentId: String(studentId),
      session: {
        hierarchyNodeId: teacher.hierarchyNodeId
      }
    },
    _count: { _all: true }
  });

  const counts = Object.fromEntries(attendanceSummary.map((r) => [r.status, r._count._all]));
  const practiceAssignmentByFeature = Object.fromEntries(
    practiceAssignments.map((row) => [row.featureKey, row])
  );

  return res.apiSuccess("Teacher student", {
    student: {
      ...student,
      practiceFeatures: {
        PRACTICE: practiceAssignmentByFeature.PRACTICE || null,
        ABACUS_PRACTICE: practiceAssignmentByFeature.ABACUS_PRACTICE || null
      }
    },
    enrollments: enrollments.map((e) => ({
      enrollmentId: e.id,
      batch: e.batch,
      level: e.level,
      status: e.status,
      startDate: e.startDate
    })),
    attendanceSummary: {
      PRESENT: counts.PRESENT || 0,
      ABSENT: counts.ABSENT || 0,
      LATE: counts.LATE || 0,
      EXCUSED: counts.EXCUSED || 0
    },
    recentNotes: notes
  });
});

const listTeacherStudentMaterials = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const tenantId = req.auth.tenantId;

  const teacher = await loadTeacherContext({ tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherCanAccessStudent({
    tenantId,
    centerId: teacher.hierarchyNodeId,
    teacherUserId: teacher.id,
    studentId: String(studentId)
  });

  if (!allowed) {
    return res.apiError(403, "Forbidden", "TEACHER_STUDENT_FORBIDDEN");
  }

  const student = await prisma.student.findFirst({
    where: {
      id: String(studentId),
      tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId
    },
    select: {
      id: true,
      levelId: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      course: { select: { id: true, code: true, name: true } },
      level: { select: { id: true, name: true, rank: true } }
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId,
      studentId: student.id,
      status: "ACTIVE",
      assignedTeacherUserId: teacher.id
    },
    orderBy: { createdAt: "desc" },
    select: {
      level: { select: { id: true, name: true, rank: true } }
    }
  });

  const effectiveLevel = enrollment?.level || student.level || null;

  const items = await prisma.material.findMany({
    where: {
      tenantId,
      isPublished: true,
      OR: [{ levelId: null }, { levelId: effectiveLevel?.id || student.levelId }]
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      url: true,
      levelId: true,
      createdAt: true
    }
  });

  const worksheets = effectiveLevel?.id
    ? await prisma.worksheet.findMany({
        where: {
          tenantId,
          levelId: effectiveLevel.id
        },
        orderBy: { title: "asc" },
        select: {
          id: true,
          title: true,
          isPublished: true
        }
      })
    : [];

  const courseLabel = student.course
    ? `${student.course.code || ""}${student.course.name ? ` - ${student.course.name}` : ""}`.trim()
    : "—";

  const levelLabel = effectiveLevel
    ? `${effectiveLevel.name || `Level ${effectiveLevel.rank || ""}`}${effectiveLevel.rank ? ` - Level ${effectiveLevel.rank}` : ""}`
    : "—";

  return res.apiSuccess("Teacher student materials", {
    student: {
      id: student.id,
      admissionNo: student.admissionNo,
      fullName: fullName(student),
      course: student.course,
      level: effectiveLevel,
      courseLevelLabel: `${courseLabel} / ${levelLabel}`
    },
    worksheets: worksheets.map((w) => ({
      id: w.id,
      title: w.title,
      status: w.isPublished ? "PUBLISHED" : "DRAFT"
    })),
    items: items.map((m) => ({
      materialId: m.id,
      title: m.title,
      description: m.description,
      type: m.type,
      url: m.url,
      levelId: m.levelId,
      publishedAt: m.createdAt
    }))
  });
});

const getTeacherStudentPracticeReport = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const tenantId = req.auth.tenantId;

  const teacher = await loadTeacherContext({ tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherCanAccessStudent({
    tenantId,
    centerId: teacher.hierarchyNodeId,
    teacherUserId: teacher.id,
    studentId: String(studentId)
  });

  if (!allowed) {
    return res.apiError(403, "Forbidden", "TEACHER_STUDENT_FORBIDDEN");
  }

  const student = await prisma.student.findFirst({
    where: {
      id: String(studentId),
      tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId
    },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const rawLimit = req.query?.limit ?? req.query?.take;
  const safeLimit = Math.min(200, Math.max(1, normalizePositiveInt(rawLimit) || 50));

  const [summary, recent] = await Promise.all([
    prisma.worksheetSubmission.aggregate({
      where: {
        tenantId,
        studentId: student.id,
        finalSubmittedAt: { not: null }
      },
      _count: { id: true },
      _avg: { score: true },
      _min: { score: true },
      _max: { score: true }
    }),
    prisma.worksheetSubmission.findMany({
      where: {
        tenantId,
        studentId: student.id,
        finalSubmittedAt: { not: null }
      },
      orderBy: { finalSubmittedAt: "desc" },
      take: safeLimit,
      include: {
        worksheet: { select: { id: true, title: true, timeLimitSeconds: true } }
      }
    })
  ]);

  return res.apiSuccess("Teacher student practice report", {
    student: {
      id: student.id,
      admissionNo: student.admissionNo,
      fullName: fullName(student)
    },
    totalAttempts: summary._count.id,
    avgScore: summary._avg.score === null ? null : Number(summary._avg.score),
    minScore: summary._min.score === null ? null : Number(summary._min.score),
    maxScore: summary._max.score === null ? null : Number(summary._max.score),
    recent: recent.map((s) => ({
      worksheetId: s.worksheetId,
      worksheetTitle: s.worksheet?.title || null,
      score: s.score === null ? null : Number(s.score),
      total: s.totalQuestions ?? null,
      correctCount: s.correctCount ?? null,
      completionTimeSeconds: s.completionTimeSeconds ?? null,
      timeLimitSeconds: s.worksheet?.timeLimitSeconds ?? null,
      submittedAt: s.finalSubmittedAt
    }))
  });
});

const listTeacherStudentAttempts = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const tenantId = req.auth.tenantId;
  const { take, skip, limit, offset } = parsePagination(req.query);
  const status = normalizeSubmissionStatus(req.query?.status);
  const passed = normalizeBooleanQuery(req.query?.passed);
  const from = req.query?.from ? parseISODateOnly(req.query.from) : null;
  const to = req.query?.to ? parseISODateOnly(req.query.to) : null;

  const teacher = await loadTeacherContext({ tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherCanAccessStudent({
    tenantId,
    centerId: teacher.hierarchyNodeId,
    teacherUserId: teacher.id,
    studentId: String(studentId)
  });

  if (!allowed) {
    return res.apiError(403, "Forbidden", "TEACHER_STUDENT_FORBIDDEN");
  }

  const student = await prisma.student.findFirst({
    where: {
      id: String(studentId),
      tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId
    },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const where = {
    tenantId,
    studentId: student.id,
    ...(status ? { status } : {}),
    ...(passed === null ? {} : { passed }),
    ...(from || to
      ? {
          submittedAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1) } : {})
          }
        }
      : {})
  };

  const safeTake = Math.min(take, 200);

  const [total, attempts] = await Promise.all([
    prisma.worksheetSubmission.count({ where }),
    prisma.worksheetSubmission.findMany({
      where,
      orderBy: [{ finalSubmittedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: safeTake,
      include: {
        worksheet: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            timeLimitSeconds: true
          }
        }
      }
    })
  ]);

  return res.apiSuccess("Teacher student attempts", {
    student: {
      id: student.id,
      admissionNo: student.admissionNo,
      fullName: fullName(student)
    },
    total,
    limit,
    offset,
    filters: {
      status: status || null,
      passed,
      from: from ? from.toISOString().slice(0, 10) : null,
      to: to ? to.toISOString().slice(0, 10) : null
    },
    items: attempts.map((item) => ({
      id: item.id,
      worksheetId: item.worksheetId,
      worksheetTitle: item.worksheet?.title || null,
      difficulty: item.worksheet?.difficulty || null,
      status: item.status,
      passed: item.passed ?? null,
      score: item.score === null ? null : Number(item.score),
      correctCount: item.correctCount ?? null,
      totalQuestions: item.totalQuestions ?? null,
      completionTimeSeconds: item.completionTimeSeconds ?? null,
      timeLimitSeconds: item.worksheet?.timeLimitSeconds ?? null,
      submittedAt: item.finalSubmittedAt || item.submittedAt || item.createdAt || null
    }))
  });
});

const exportTeacherStudentAttemptsCsv = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const tenantId = req.auth.tenantId;
  const { take, skip } = parsePagination(req.query);
  const status = normalizeSubmissionStatus(req.query?.status);
  const passed = normalizeBooleanQuery(req.query?.passed);
  const from = req.query?.from ? parseISODateOnly(req.query.from) : null;
  const to = req.query?.to ? parseISODateOnly(req.query.to) : null;

  const teacher = await loadTeacherContext({ tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherCanAccessStudent({
    tenantId,
    centerId: teacher.hierarchyNodeId,
    teacherUserId: teacher.id,
    studentId: String(studentId)
  });

  if (!allowed) {
    return res.apiError(403, "Forbidden", "TEACHER_STUDENT_FORBIDDEN");
  }

  const student = await prisma.student.findFirst({
    where: {
      id: String(studentId),
      tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId
    },
    select: {
      id: true,
      admissionNo: true
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const safeTake = Math.min(take, 5000);

  const attempts = await prisma.worksheetSubmission.findMany({
    where: {
      tenantId,
      studentId: student.id,
      ...(status ? { status } : {}),
      ...(passed === null ? {} : { passed }),
      ...(from || to
        ? {
            submittedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1) } : {})
            }
          }
        : {})
    },
    orderBy: [{ finalSubmittedAt: "desc" }, { createdAt: "desc" }],
    skip,
    take: safeTake,
    include: {
      worksheet: {
        select: {
          id: true,
          title: true,
          difficulty: true,
          timeLimitSeconds: true
        }
      }
    }
  });

  const csv = toCsv({
    headers: [
      "attemptId",
      "studentId",
      "studentCode",
      "worksheetId",
      "worksheetTitle",
      "difficulty",
      "status",
      "passed",
      "score",
      "correctCount",
      "totalQuestions",
      "completionTimeSeconds",
      "timeLimitSeconds",
      "submittedAt"
    ],
    rows: attempts.map((item) => [
      item.id,
      student.id,
      student.admissionNo,
      item.worksheetId,
      item.worksheet?.title || "",
      item.worksheet?.difficulty || "",
      item.status || "",
      item.passed === null || item.passed === undefined ? "" : item.passed ? "true" : "false",
      item.score === null || item.score === undefined ? "" : String(item.score),
      item.correctCount ?? "",
      item.totalQuestions ?? "",
      item.completionTimeSeconds ?? "",
      item.worksheet?.timeLimitSeconds ?? "",
      (item.finalSubmittedAt || item.submittedAt || item.createdAt)?.toISOString?.() || ""
    ])
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=teacher_student_attempts_${student.admissionNo || student.id}.csv`);
  return res.status(200).send(csv);
});

const overrideTeacherStudentPromotion = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const tenantId = req.auth.tenantId;

  const teacher = await loadTeacherContext({ tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherCanAccessStudent({
    tenantId,
    centerId: teacher.hierarchyNodeId,
    teacherUserId: teacher.id,
    studentId: String(studentId)
  });

  if (!allowed) {
    return res.apiError(403, "Forbidden", "TEACHER_STUDENT_FORBIDDEN");
  }

  const providedLevelId = String(req.body?.levelId || "").trim();
  const providedLevelRankRaw = req.body?.levelRank;

  let targetLevelId = providedLevelId || "";
  if (!targetLevelId && providedLevelRankRaw !== undefined && providedLevelRankRaw !== null && providedLevelRankRaw !== "") {
    const levelRank = Number(providedLevelRankRaw);
    if (!Number.isFinite(levelRank) || !Number.isInteger(levelRank) || levelRank <= 0) {
      return res.apiError(400, "levelRank must be a positive integer", "VALIDATION_ERROR");
    }

    const level = await prisma.level.findFirst({
      where: {
        tenantId,
        rank: levelRank
      },
      select: { id: true }
    });

    if (!level) {
      return res.apiError(404, "Level not found", "LEVEL_NOT_FOUND");
    }
    targetLevelId = level.id;
  }

  if (!targetLevelId) {
    return res.apiError(400, "levelId or levelRank is required", "VALIDATION_ERROR");
  }

  const student = await prisma.student.findFirst({
    where: {
      id: String(studentId),
      tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId
    },
    select: { id: true }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const result = await assignLevelWithIntegrity({
    tenantId,
    studentId: student.id,
    targetLevelId,
    actorUserId: req.auth.userId,
    reason: "TEACHER_OVERRIDE_PROMOTION"
  });

  const updated = await prisma.student.findUniqueOrThrow({
    where: { id: student.id },
    include: {
      level: { select: { id: true, name: true, rank: true } }
    }
  });

  await recordAudit({
    tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "TEACHER_OVERRIDE_PROMOTION",
    entityType: "STUDENT",
    entityId: student.id,
    metadata: {
      assignedLevelId: targetLevelId,
      previousLevelId: result.previousLevelId,
      changed: result.changed
    }
  });

  return res.apiSuccess("Teacher override promotion applied", updated);
});

const listTeacherNotesForStudent = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);

  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherCanAccessStudent({
    tenantId: req.auth.tenantId,
    centerId: teacher.hierarchyNodeId,
    teacherUserId: teacher.id,
    studentId: String(studentId)
  });

  if (!allowed) {
    return res.apiError(403, "Forbidden", "TEACHER_STUDENT_FORBIDDEN");
  }

  const from = req.query.from ? parseISODateOnly(req.query.from) : null;
  const to = req.query.to ? parseISODateOnly(req.query.to) : null;

  const where = {
    tenantId: req.auth.tenantId,
    hierarchyNodeId: teacher.hierarchyNodeId,
    teacherUserId: teacher.id,
    studentId: String(studentId),
    isDeleted: false,
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1) } : {})
          }
        }
      : {})
  };

  const [total, items] = await Promise.all([
    prisma.teacherNote.count({ where }),
    prisma.teacherNote.findMany({
      where,
      take,
      skip,
      orderBy,
      select: { id: true, note: true, tags: true, createdAt: true, updatedAt: true }
    })
  ]);

  return res.apiSuccess("Teacher notes", { items, total, limit, offset });
});

const createTeacherNoteForStudent = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { note, tags } = req.body;

  if (!note || !String(note).trim()) {
    return res.apiError(400, "note is required", "VALIDATION_ERROR");
  }

  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherCanAccessStudent({
    tenantId: req.auth.tenantId,
    centerId: teacher.hierarchyNodeId,
    teacherUserId: teacher.id,
    studentId: String(studentId)
  });

  if (!allowed) {
    return res.apiError(403, "Forbidden", "TEACHER_STUDENT_FORBIDDEN");
  }

  const created = await prisma.teacherNote.create({
    data: {
      tenantId: req.auth.tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId,
      teacherUserId: teacher.id,
      studentId: String(studentId),
      note: String(note).trim(),
      tags: Array.isArray(tags) ? tags : tags && typeof tags === "object" ? tags : undefined
    }
  });

  res.locals.entityId = created.id;
  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: teacher.id,
    role: "TEACHER",
    action: "TEACHER_NOTE_CREATE",
    entityType: "TEACHER_NOTE",
    entityId: created.id,
    metadata: { studentId: String(studentId) }
  });

  return res.apiSuccess("Note created", created, 201);
});

const updateTeacherNote = asyncHandler(async (req, res) => {
  const { noteId } = req.params;
  const { note, tags } = req.body;

  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const existing = await prisma.teacherNote.findFirst({
    where: {
      id: String(noteId),
      tenantId: req.auth.tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId,
      teacherUserId: teacher.id,
      isDeleted: false
    }
  });

  if (!existing) {
    return res.apiError(404, "Note not found", "NOTE_NOT_FOUND");
  }

  const updated = await prisma.teacherNote.update({
    where: { id: existing.id },
    data: {
      ...(note !== undefined ? { note: String(note || "").trim() } : {}),
      ...(tags !== undefined ? { tags: Array.isArray(tags) ? tags : tags && typeof tags === "object" ? tags : null } : {})
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: teacher.id,
    role: "TEACHER",
    action: "TEACHER_NOTE_UPDATE",
    entityType: "TEACHER_NOTE",
    entityId: updated.id
  });

  return res.apiSuccess("Note updated", updated);
});

const deleteTeacherNote = asyncHandler(async (req, res) => {
  const { noteId } = req.params;

  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const existing = await prisma.teacherNote.findFirst({
    where: {
      id: String(noteId),
      tenantId: req.auth.tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId,
      teacherUserId: teacher.id,
      isDeleted: false
    },
    select: { id: true }
  });

  if (!existing) {
    return res.apiError(404, "Note not found", "NOTE_NOT_FOUND");
  }

  const updated = await prisma.teacherNote.update({
    where: { id: existing.id },
    data: {
      isDeleted: true,
      deletedAt: new Date()
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: teacher.id,
    role: "TEACHER",
    action: "TEACHER_NOTE_DELETE",
    entityType: "TEACHER_NOTE",
    entityId: updated.id
  });

  return res.apiSuccess("Note deleted", null);
});

const createTeacherAttendanceSession = asyncHandler(async (req, res) => {
  const { batchId, date } = req.body;

  if (!batchId || !date) {
    return res.apiError(400, "batchId and date are required", "VALIDATION_ERROR");
  }

  const sessionDate = parseISODateOnly(date);
  if (!sessionDate) {
    return res.apiError(400, "date must be YYYY-MM-DD", "VALIDATION_ERROR");
  }

  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherAssignedToBatch({ tenantId: req.auth.tenantId, teacherUserId: teacher.id, batchId: String(batchId) });
  if (!allowed) {
    return res.apiError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
  }

  const batch = await prisma.batch.findFirst({
    where: { id: String(batchId), tenantId: req.auth.tenantId, hierarchyNodeId: teacher.hierarchyNodeId },
    select: { id: true }
  });

  if (!batch) {
    return res.apiError(404, "Batch not found", "BATCH_NOT_FOUND");
  }

  const config = await loadCenterAttendanceConfig({ tenantId: req.auth.tenantId, centerHierarchyNodeId: teacher.hierarchyNodeId });

  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.attendanceSession.findFirst({
      where: { tenantId: req.auth.tenantId, batchId: batch.id, date: sessionDate },
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
        hierarchyNodeId: teacher.hierarchyNodeId,
        batchId: batch.id,
        date: sessionDate,
        status: "DRAFT",
        createdByUserId: teacher.id
      }
    });

    const roster = await tx.enrollment.findMany({
      where: {
        tenantId: req.auth.tenantId,
        hierarchyNodeId: teacher.hierarchyNodeId,
        batchId: batch.id,
        status: "ACTIVE",
        assignedTeacherUserId: teacher.id
      },
      select: { studentId: true }
    });

    if (roster.length) {
      await tx.attendanceEntry.createMany({
        data: roster.map((r) => ({
          tenantId: req.auth.tenantId,
          sessionId: session.id,
          studentId: r.studentId,
          status: config.defaultEntryStatus
        }))
      });
    }

    return session;
  });

  res.locals.entityId = created.id;
  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: teacher.id,
    role: "TEACHER",
    action: "TEACHER_ATTENDANCE_CREATE_SESSION",
    entityType: "ATTENDANCE_SESSION",
    entityId: created.id,
    metadata: { batchId: String(batchId), date: String(date) }
  });

  return res.apiSuccess("Attendance session created", { sessionId: created.id, status: created.status }, 201);
});

const listTeacherAttendanceSessions = asyncHandler(async (req, res) => {
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);

  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const where = {
    tenantId: req.auth.tenantId,
    hierarchyNodeId: teacher.hierarchyNodeId
  };

  const batchId = req.query.batchId ? String(req.query.batchId) : "";
  if (batchId) {
    const allowed = await ensureTeacherAssignedToBatch({ tenantId: req.auth.tenantId, teacherUserId: teacher.id, batchId });
    if (!allowed) {
      return res.apiError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
    }
    where.batchId = batchId;
  } else {
    const assignedBatchIds = await listTeacherAssignedBatchIds({
      tenantId: req.auth.tenantId,
      teacherUserId: teacher.id,
      centerHierarchyNodeId: teacher.hierarchyNodeId
    });

    if (!assignedBatchIds.length) {
      return res.apiSuccess("Attendance sessions", {
        items: [],
        total: 0,
        limit,
        offset
      });
    }

    where.batchId = { in: assignedBatchIds };
  }

  const date = req.query.date ? parseISODateOnly(req.query.date) : null;
  if (date) {
    where.date = date;
  }

  const [total, items] = await Promise.all([
    prisma.attendanceSession.count({ where }),
    prisma.attendanceSession.findMany({
      where,
      take,
      skip,
      orderBy,
      select: {
        id: true,
        batchId: true,
        date: true,
        status: true,
        batch: { select: { name: true } }
      }
    })
  ]);

  return res.apiSuccess(
    "Attendance sessions",
    {
      items: items.map((s) => ({
        sessionId: s.id,
        batchId: s.batchId,
        batchName: s.batch?.name || null,
        date: s.date,
        status: s.status
      })),
      total,
      limit,
      offset
    }
  );
});

const listTeacherBatchAttendanceHistory = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset } = parsePagination(req.query);
  const batchId = String(req.query.batchId || "").trim();

  if (!batchId) {
    return res.apiError(400, "batchId is required", "VALIDATION_ERROR");
  }

  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherAssignedToBatch({
    tenantId: req.auth.tenantId,
    teacherUserId: teacher.id,
    batchId
  });
  if (!allowed) {
    return res.apiError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
  }

  const from = req.query.from ? parseISODateOnly(req.query.from) : null;
  const to = req.query.to ? parseISODateOnly(req.query.to) : null;
  const sessionStatus = normalizeAttendanceSessionStatus(req.query.sessionStatus);

  const sessionWhere = {
    tenantId: req.auth.tenantId,
    hierarchyNodeId: teacher.hierarchyNodeId,
    batchId,
    ...(sessionStatus ? { status: sessionStatus } : {}),
    ...(from || to
      ? {
          date: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {})
          }
        }
      : {})
  };

  const [total, sessions, groupedEntries, batch] = await Promise.all([
    prisma.attendanceSession.count({ where: sessionWhere }),
    prisma.attendanceSession.findMany({
      where: sessionWhere,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take,
      select: {
        id: true,
        date: true,
        status: true
      }
    }),
    prisma.attendanceEntry.groupBy({
      by: ["sessionId", "status"],
      where: {
        tenantId: req.auth.tenantId,
        session: sessionWhere
      },
      _count: { _all: true }
    }),
    prisma.batch.findFirst({
      where: {
        id: batchId,
        tenantId: req.auth.tenantId,
        hierarchyNodeId: teacher.hierarchyNodeId
      },
      select: { id: true, name: true }
    })
  ]);

  const countsBySession = new Map();
  for (const row of groupedEntries) {
    if (!countsBySession.has(row.sessionId)) {
      countsBySession.set(row.sessionId, { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, total: 0 });
    }

    const bucket = countsBySession.get(row.sessionId);
    const count = Number(row?._count?._all || 0);
    bucket.total += count;
    if (row.status === "PRESENT") bucket.PRESENT += count;
    else if (row.status === "ABSENT") bucket.ABSENT += count;
    else if (row.status === "LATE") bucket.LATE += count;
    else if (row.status === "EXCUSED") bucket.EXCUSED += count;
  }

  const items = sessions.map((session) => {
    const counts = countsBySession.get(session.id) || { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, total: 0 };
    const attendanceRate = counts.total ? Math.round((counts.PRESENT / counts.total) * 1000) / 10 : 0;
    return {
      sessionId: session.id,
      date: session.date,
      sessionStatus: session.status,
      totalStudents: counts.total,
      presentCount: counts.PRESENT,
      absentCount: counts.ABSENT,
      lateCount: counts.LATE,
      excusedCount: counts.EXCUSED,
      attendanceRate
    };
  });

  return res.apiSuccess("Batch attendance history", {
    batch: batch ? { id: batch.id, name: batch.name } : { id: batchId, name: null },
    filters: {
      from: from ? from.toISOString().slice(0, 10) : null,
      to: to ? to.toISOString().slice(0, 10) : null,
      sessionStatus: sessionStatus || null
    },
    items,
    total,
    limit,
    offset
  });
});

const exportTeacherBatchAttendanceHistoryCsv = asyncHandler(async (req, res) => {
  const { take, skip } = parsePagination(req.query);
  const safeTake = Math.min(take, 5000);
  const batchId = String(req.query.batchId || "").trim();

  if (!batchId) {
    return res.apiError(400, "batchId is required", "VALIDATION_ERROR");
  }

  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherAssignedToBatch({
    tenantId: req.auth.tenantId,
    teacherUserId: teacher.id,
    batchId
  });
  if (!allowed) {
    return res.apiError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
  }

  const from = req.query.from ? parseISODateOnly(req.query.from) : null;
  const to = req.query.to ? parseISODateOnly(req.query.to) : null;
  const sessionStatus = normalizeAttendanceSessionStatus(req.query.sessionStatus);

  const sessionWhere = {
    tenantId: req.auth.tenantId,
    hierarchyNodeId: teacher.hierarchyNodeId,
    batchId,
    ...(sessionStatus ? { status: sessionStatus } : {}),
    ...(from || to
      ? {
          date: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {})
          }
        }
      : {})
  };

  const sessions = await prisma.attendanceSession.findMany({
    where: sessionWhere,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    skip,
    take: safeTake,
    select: {
      id: true,
      date: true,
      status: true,
      batch: { select: { name: true } }
    }
  });

  const sessionIds = sessions.map((row) => row.id);
  const groupedEntries = sessionIds.length
    ? await prisma.attendanceEntry.groupBy({
        by: ["sessionId", "status"],
        where: {
          tenantId: req.auth.tenantId,
          sessionId: { in: sessionIds }
        },
        _count: { _all: true }
      })
    : [];

  const countsBySession = new Map();
  for (const row of groupedEntries) {
    if (!countsBySession.has(row.sessionId)) {
      countsBySession.set(row.sessionId, { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, total: 0 });
    }

    const bucket = countsBySession.get(row.sessionId);
    const count = Number(row?._count?._all || 0);
    bucket.total += count;
    if (row.status === "PRESENT") bucket.PRESENT += count;
    else if (row.status === "ABSENT") bucket.ABSENT += count;
    else if (row.status === "LATE") bucket.LATE += count;
    else if (row.status === "EXCUSED") bucket.EXCUSED += count;
  }

  const csv = toCsv({
    headers: [
      "sessionId",
      "batchId",
      "batchName",
      "date",
      "sessionStatus",
      "totalStudents",
      "presentCount",
      "absentCount",
      "lateCount",
      "excusedCount",
      "attendanceRate"
    ],
    rows: sessions.map((session) => {
      const counts = countsBySession.get(session.id) || { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, total: 0 };
      const attendanceRate = counts.total ? Math.round((counts.PRESENT / counts.total) * 1000) / 10 : 0;
      return [
        session.id,
        batchId,
        session.batch?.name || "",
        session.date?.toISOString?.().slice(0, 10) || "",
        session.status,
        counts.total,
        counts.PRESENT,
        counts.ABSENT,
        counts.LATE,
        counts.EXCUSED,
        attendanceRate
      ];
    })
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=teacher_batch_attendance_${batchId}.csv`);
  return res.status(200).send(csv);
});

const getTeacherAttendanceSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const session = await prisma.attendanceSession.findFirst({
    where: {
      id: String(sessionId),
      tenantId: req.auth.tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId
    },
    select: {
      id: true,
      batchId: true,
      date: true,
      status: true,
      version: true,
      entries: {
        select: {
          studentId: true,
          status: true,
          note: true,
          student: { select: { admissionNo: true, firstName: true, lastName: true } }
        },
        orderBy: [{ student: { admissionNo: "asc" } }]
      }
    }
  });

  if (!session) {
    return res.apiError(404, "Attendance session not found", "SESSION_NOT_FOUND");
  }

  const allowed = await ensureTeacherAssignedToBatch({
    tenantId: req.auth.tenantId,
    teacherUserId: teacher.id,
    batchId: session.batchId
  });
  if (!allowed) {
    return res.apiError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
  }

  const studentIds = session.entries.map((entry) => entry.studentId).filter(Boolean);
  const previousEntries = studentIds.length
    ? await prisma.attendanceEntry.findMany({
      where: {
        tenantId: req.auth.tenantId,
        studentId: { in: studentIds },
        sessionId: { not: session.id },
        session: {
          hierarchyNodeId: teacher.hierarchyNodeId,
          status: { in: ["PUBLISHED", "LOCKED"] },
          date: { lt: session.date }
        }
      },
      orderBy: [
        { studentId: "asc" },
        { session: { date: "desc" } },
        { markedAt: "desc" }
      ],
      select: {
        studentId: true,
        status: true,
        note: true,
        markedAt: true,
        session: {
          select: {
            id: true,
            date: true,
            batch: { select: { id: true, name: true } }
          }
        }
      }
    })
    : [];

  const previousByStudentId = new Map();
  for (const entry of previousEntries) {
    if (!previousByStudentId.has(entry.studentId)) {
      previousByStudentId.set(entry.studentId, {
        sessionId: entry.session?.id || null,
        date: entry.session?.date || null,
        status: entry.status,
        note: entry.note || "",
        markedAt: entry.markedAt || null,
        batchName: entry.session?.batch?.name || ""
      });
    }
  }

  return res.apiSuccess("Attendance session", {
    sessionId: session.id,
    batchId: session.batchId,
    date: session.date,
    status: session.status,
    version: session.version,
    entries: session.entries.map((e) => ({
      studentId: e.studentId,
      status: e.status,
      note: e.note || "",
      admissionNo: e.student?.admissionNo || "",
      fullName: `${e.student?.firstName || ""} ${e.student?.lastName || ""}`.trim(),
      previousAttendance: previousByStudentId.get(e.studentId) || null
    }))
  });
});

const updateTeacherAttendanceEntries = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { entries, version, reason } = req.body;

  if (!Array.isArray(entries) || !entries.length) {
    return res.apiError(400, "entries array is required", "VALIDATION_ERROR");
  }

  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const session = await prisma.attendanceSession.findFirst({
    where: {
      id: String(sessionId),
      tenantId: req.auth.tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId
    },
    select: { id: true, batchId: true, date: true, status: true, version: true }
  });

  if (!session) {
    return res.apiError(404, "Attendance session not found", "SESSION_NOT_FOUND");
  }

  const allowed = await ensureTeacherAssignedToBatch({
    tenantId: req.auth.tenantId,
    teacherUserId: teacher.id,
    batchId: session.batchId
  });
  if (!allowed) {
    return res.apiError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
  }

  const config = await loadCenterAttendanceConfig({ tenantId: req.auth.tenantId, centerHierarchyNodeId: teacher.hierarchyNodeId });

  if (session.status === "PUBLISHED" && !isWithinEditWindow({ sessionDate: session.date, editWindowHours: config.editWindowHours })) {
    return res.apiError(403, "Edit window has closed", "EDIT_WINDOW_CLOSED");
  }

  if (!["DRAFT", "PUBLISHED"].includes(session.status)) {
    return res.apiError(409, `Session is ${session.status} and cannot be edited`, "SESSION_NOT_EDITABLE");
  }

  if (version !== undefined && Number(version) !== Number(session.version)) {
    return res.apiError(409, "Version conflict", "VERSION_CONFLICT", { currentVersion: session.version });
  }

  const normalized = entries
    .map((e) => ({
      studentId: String(e?.studentId || ""),
      status: normalizeAttendanceEntryStatus(e?.status),
      note: e?.note !== undefined ? String(e.note || "").slice(0, 191) : undefined
    }))
    .filter((e) => e.studentId && e.status);

  if (!normalized.length) {
    return res.apiError(400, "No valid entries provided", "VALIDATION_ERROR");
  }

  const rosterEntries = await prisma.attendanceEntry.findMany({
    where: { tenantId: req.auth.tenantId, sessionId: session.id },
    select: { studentId: true }
  });

  const rosterSet = new Set(rosterEntries.map((e) => e.studentId));
  const conflicts = [];
  const markedAt = new Date();
  const operations = [];

  for (const e of normalized) {
    if (!rosterSet.has(e.studentId)) {
      conflicts.push({ studentId: e.studentId, reason: "NOT_IN_ROSTER" });
      continue;
    }

    operations.push(
      prisma.attendanceEntry.update({
        where: {
          sessionId_studentId: {
            sessionId: session.id,
            studentId: e.studentId
          }
        },
        data: {
          status: e.status,
          ...(e.note !== undefined ? { note: e.note } : {}),
          markedAt,
          markedByUserId: teacher.id
        }
      })
    );
  }

  if (!operations.length) {
    return res.apiSuccess("Attendance entries updated", {
      updatedCount: 0,
      version: session.version,
      ...(conflicts.length ? { conflicts } : {})
    });
  }

  operations.push(
    prisma.attendanceSession.update({
      where: { id: session.id },
      data: { version: { increment: 1 } },
      select: { version: true }
    })
  );

  const txResults = await prisma.$transaction(operations);
  const updatedCount = txResults.length - 1;
  const result = { updatedCount, version: txResults[txResults.length - 1].version };

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: teacher.id,
    role: "TEACHER",
    action: "TEACHER_ATTENDANCE_UPDATE_ENTRIES",
    entityType: "ATTENDANCE_SESSION",
    entityId: session.id,
    metadata: { reason: reason ? String(reason).trim() : undefined, updatedCount: result.updatedCount }
  });

  return res.apiSuccess("Attendance entries updated", {
    updatedCount: result.updatedCount,
    version: result.version,
    ...(conflicts.length ? { conflicts } : {})
  });
});

const publishTeacherAttendanceSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const session = await prisma.attendanceSession.findFirst({
    where: {
      id: String(sessionId),
      tenantId: req.auth.tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId
    },
    select: { id: true, batchId: true, status: true }
  });

  if (!session) {
    return res.apiError(404, "Attendance session not found", "SESSION_NOT_FOUND");
  }

  const allowed = await ensureTeacherAssignedToBatch({
    tenantId: req.auth.tenantId,
    teacherUserId: teacher.id,
    batchId: session.batchId
  });
  if (!allowed) {
    return res.apiError(403, "Teacher not assigned to batch", "TEACHER_BATCH_FORBIDDEN");
  }

  const entriesCount = await prisma.attendanceEntry.count({
    where: { tenantId: req.auth.tenantId, sessionId: session.id }
  });

  if (!entriesCount) {
    return res.apiError(409, "Session has no entries", "SESSION_EMPTY");
  }

  const updated = await prisma.attendanceSession.update({
    where: { id: session.id },
    data: { status: "PUBLISHED", publishedAt: new Date(), version: { increment: 1 } },
    select: { id: true, status: true }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: teacher.id,
    role: "TEACHER",
    action: "TEACHER_ATTENDANCE_PUBLISH",
    entityType: "ATTENDANCE_SESSION",
    entityId: updated.id
  });

  return res.apiSuccess("Attendance session published", { sessionId: updated.id, status: updated.status });
});

const updateTeacherProfile = asyncHandler(async (req, res) => {
  const teacher = await loadTeacherContext({ tenantId: req.auth.tenantId, teacherUserId: req.auth.userId });
  if (!teacher) {
    return res.apiError(404, "Teacher not found", "TEACHER_NOT_FOUND");
  }

  const profile = await prisma.teacherProfile.findFirst({
    where: { tenantId: req.auth.tenantId, authUserId: teacher.id },
    select: { id: true }
  });

  if (!profile) {
    return res.apiError(404, "Teacher profile not found", "TEACHER_PROFILE_NOT_FOUND");
  }

  const allowed = ["fullName", "phonePrimary"];
  const data = {};
  for (const key of allowed) {
    if (key in req.body) {
      const value = req.body[key];
      if (value === null) {
        data[key] = null;
      } else if (value !== undefined) {
        data[key] = String(value).trim();
      }
    }
  }

  if (!Object.keys(data).length) {
    return res.apiError(400, "No updatable fields provided", "VALIDATION_ERROR");
  }

  if (data.fullName !== undefined && !data.fullName) {
    return res.apiError(400, "fullName cannot be empty", "VALIDATION_ERROR");
  }

  const updated = await prisma.teacherProfile.update({
    where: { id: profile.id },
    data
  });

  return res.apiSuccess("Teacher profile updated", {
    fullName: updated.fullName,
    phonePrimary: updated.phonePrimary,
    status: updated.status,
    isActive: updated.isActive
  });
});

/* ─── Teacher Direct Reassign ─── */
const teacherDirectReassign = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const studentId = String(req.params.studentId || "").trim();

  const teacher = await loadTeacherContext({ tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherCanAccessStudent({
    tenantId, centerId: teacher.hierarchyNodeId, teacherUserId: teacher.id, studentId
  });
  if (!allowed) {
    return res.apiError(403, "Forbidden", "TEACHER_STUDENT_FORBIDDEN");
  }

  const { currentWorksheetId, type, newWorksheetId, reason } = req.body || {};
  if (!currentWorksheetId) return res.apiError(400, "currentWorksheetId is required", "VALIDATION_ERROR");
  if (!reason || !String(reason).trim()) return res.apiError(400, "Reason is required", "VALIDATION_ERROR");

  const result = await svcDirectReassign({
    tenantId, studentId, currentWorksheetId,
    type: type || "RETRY", newWorksheetId, reason: String(reason).trim(),
    performedByUserId: req.auth.userId,
  });

  if (result.error) return res.apiError(400, result.error, result.code);
  return res.apiSuccess("Reassignment completed", result.data);
});

/* ─── Teacher Reassignment Request Queue ─── */
const listTeacherReassignmentRequests = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const { take, skip } = parsePagination(req.query);

  const teacher = await loadTeacherContext({ tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  // Get students assigned to this teacher
  const enrollments = await prisma.enrollment.findMany({
    where: { tenantId, assignedTeacherUserId: teacher.id, status: "ACTIVE" },
    select: { studentId: true },
  });
  const studentIds = [...new Set(enrollments.map((e) => e.studentId))];

  if (!studentIds.length) {
    return res.apiSuccess("Reassignment requests", { total: 0, items: [] });
  }

  const VALID_REASSIGNMENT_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];
  const rawStatus = req.query.status ? String(req.query.status).trim().toUpperCase() : undefined;
  const status = rawStatus && VALID_REASSIGNMENT_STATUSES.includes(rawStatus) ? rawStatus : undefined;
  const result = await svcListReassignments({ tenantId, status, studentIds, skip, take });
  return res.apiSuccess("Reassignment requests", result);
});

/* ─── Teacher Review Reassignment Request ─── */
const reviewTeacherReassignmentRequest = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const requestId = String(req.params.requestId || "").trim();
  const { action, reviewReason } = req.body || {};

  if (!requestId) return res.apiError(400, "requestId is required", "VALIDATION_ERROR");
  if (!action || !["APPROVED", "REJECTED"].includes(action)) {
    return res.apiError(400, "action must be APPROVED or REJECTED", "VALIDATION_ERROR");
  }

  const teacher = await loadTeacherContext({ tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  // Verify teacher has access to the student in the request
  const request = await prisma.worksheetReassignmentRequest.findFirst({
    where: { id: requestId, tenantId, status: "PENDING" },
    select: { studentId: true },
  });
  if (!request) return res.apiError(404, "Request not found or not pending", "REQUEST_NOT_FOUND");

  const allowed = await ensureTeacherCanAccessStudent({
    tenantId, centerId: teacher.hierarchyNodeId, teacherUserId: teacher.id, studentId: request.studentId
  });
  if (!allowed) return res.apiError(403, "Forbidden", "TEACHER_STUDENT_FORBIDDEN");

  const result = await svcReviewReassignment({
    tenantId, requestId, action, reviewedByUserId: req.auth.userId, reviewReason: reviewReason || null,
  });

  if (result.error) return res.apiError(400, result.error, result.code);
  return res.apiSuccess(`Request ${action.toLowerCase()}`, result.data);
});

/* ─── Bulk Assign: 1 worksheet → N students ─── */
const bulkAssignWorksheetToStudents = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;

  const teacher = await loadTeacherContext({ tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const { worksheetId, studentIds, dueDate } = req.body || {};
  if (!worksheetId) return res.apiError(400, "worksheetId is required", "VALIDATION_ERROR");
  if (!Array.isArray(studentIds) || !studentIds.length) {
    return res.apiError(400, "studentIds array is required", "VALIDATION_ERROR");
  }
  if (studentIds.length > 200) {
    return res.apiError(400, "Cannot assign to more than 200 students at once", "VALIDATION_ERROR");
  }

  // Verify all students belong to this teacher
  const enrollments = await prisma.enrollment.findMany({
    where: {
      tenantId, assignedTeacherUserId: teacher.id, status: "ACTIVE",
      studentId: { in: studentIds.map((id) => String(id).trim()) },
    },
    select: { studentId: true },
  });
  const validStudentIds = [...new Set(enrollments.map((e) => e.studentId))];

  if (!validStudentIds.length) {
    return res.apiError(400, "No valid students found", "NO_VALID_STUDENTS");
  }

  const result = await svcBulkAssign({
    tenantId, worksheetId,
    studentIds: validStudentIds,
    dueDate: dueDate ? new Date(dueDate) : null,
    createdByUserId: req.auth.userId,
  });

  if (result.error) return res.apiError(400, result.error, result.code);
  return res.apiSuccess("Bulk assignment completed", result.data);
});

/* ── Student Attendance History ── */
const getTeacherStudentAttendanceHistory = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const studentId = String(req.params.studentId || "").trim();

  const teacher = await loadTeacherContext({ tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherCanAccessStudent({
    tenantId,
    centerId: teacher.hierarchyNodeId,
    teacherUserId: teacher.id,
    studentId
  });
  if (!allowed) {
    return res.apiError(403, "Forbidden", "TEACHER_STUDENT_FORBIDDEN");
  }

  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId
    },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      email: true,
      phonePrimary: true,
      level: { select: { id: true, name: true, rank: true } },
      currentTeacher: {
        select: {
          username: true,
          email: true,
          teacherProfile: { select: { fullName: true } }
        }
      }
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const { limit, offset } = parsePagination(req.query);
  const statusFilter = normalizeAttendanceEntryStatus(req.query.status);
  const from = parseISODateOnly(req.query.from);
  const to = parseISODateOnly(req.query.to);

  const where = {
    tenantId,
    studentId,
    session: {
      hierarchyNodeId: teacher.hierarchyNodeId,
      status: { in: ["PUBLISHED", "LOCKED"] },
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {})
    },
    ...(statusFilter ? { status: statusFilter } : {})
  };

  const [rows, total, summary] = await Promise.all([
    prisma.attendanceEntry.findMany({
      where,
      orderBy: { session: { date: "desc" } },
      skip: offset,
      take: limit,
      select: {
        status: true,
        note: true,
        markedAt: true,
        session: {
          select: {
            id: true,
            date: true,
            status: true,
            batch: { select: { id: true, name: true } }
          }
        }
      }
    }),
    prisma.attendanceEntry.count({ where }),
    prisma.attendanceEntry.groupBy({
      by: ["status"],
      where: {
        tenantId,
        studentId,
        session: { hierarchyNodeId: teacher.hierarchyNodeId, status: { in: ["PUBLISHED", "LOCKED"] } }
      },
      _count: { _all: true }
    })
  ]);

  const counts = Object.fromEntries(summary.map((r) => [r.status, r._count._all]));
  const totalSessions = Object.values(counts).reduce((a, b) => a + b, 0);

  return res.apiSuccess("Student attendance history", {
    student: {
      id: student.id,
      admissionNo: student.admissionNo || null,
      fullName: `${student.firstName || ""} ${student.lastName || ""}`.trim() || null,
      guardianName: student.guardianName || null,
      guardianPhone: student.guardianPhone || student.phonePrimary || null,
      email: student.email || null,
      levelName: student.level?.name || null,
      levelRank: student.level?.rank ?? null,
      teacherName: student.currentTeacher?.teacherProfile?.fullName || student.currentTeacher?.username || student.currentTeacher?.email || null
    },
    items: rows.map((r) => ({
      date: r.session?.date || null,
      batchName: r.session?.batch?.name || null,
      status: r.status,
      note: r.note || null,
      markedAt: r.markedAt || null,
      sessionStatus: r.session?.status || null,
      sessionId: r.session?.id || null
    })),
    total,
    limit,
    offset,
    summary: {
      PRESENT: counts.PRESENT || 0,
      ABSENT: counts.ABSENT || 0,
      LATE: counts.LATE || 0,
      EXCUSED: counts.EXCUSED || 0,
      total: totalSessions
    }
  });
});

/* ── Student 360° ── */
const getTeacherStudent360 = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const studentId = String(req.params.studentId || "").trim();

  const teacher = await loadTeacherContext({ tenantId, teacherUserId: req.auth.userId });
  if (!teacher?.hierarchyNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const allowed = await ensureTeacherCanAccessStudent({
    tenantId,
    centerId: teacher.hierarchyNodeId,
    teacherUserId: teacher.id,
    studentId
  });
  if (!allowed) {
    return res.apiError(403, "Forbidden", "TEACHER_STUDENT_FORBIDDEN");
  }

  const data = await getStudent360Data(studentId, tenantId, teacher.hierarchyNodeId);
  return res.apiSuccess("Student 360 data", data);
});

export {
  teacherLogin,
  getTeacherMe,
  updateTeacherProfile,
  listTeacherBatches,
  getTeacherBatchRoster,
  getTeacherBatchWorksheetsContext,
  assignTeacherBatchWorksheet,
  listTeacherBatchMockTests,
  getTeacherMockTest,
  upsertTeacherMockTestResults,
  listTeacherStudents,
  getTeacherStudent,
  listTeacherStudentMaterials,
  getTeacherStudentPracticeReport,
  listTeacherStudentAttempts,
  exportTeacherStudentAttemptsCsv,
  overrideTeacherStudentPromotion,
  getTeacherAssignWorksheetsContext,
  saveTeacherWorksheetAssignments,
  listTeacherNotesForStudent,
  createTeacherNoteForStudent,
  updateTeacherNote,
  deleteTeacherNote,
  createTeacherAttendanceSession,
  listTeacherAttendanceSessions,
  listTeacherBatchAttendanceHistory,
  exportTeacherBatchAttendanceHistoryCsv,
  getTeacherAttendanceSession,
  updateTeacherAttendanceEntries,
  publishTeacherAttendanceSession,
  teacherDirectReassign,
  listTeacherReassignmentRequests,
  reviewTeacherReassignmentRequest,
  bulkAssignWorksheetToStudents,
  getTeacherStudentAttendanceHistory,
  getTeacherStudent360,
};
