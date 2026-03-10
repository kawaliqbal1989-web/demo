import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import { ensureTenantCourseCatalog } from "../services/course-bootstrap.service.js";
import {
  listReassignmentRequests as svcListReassignments,
  reviewReassignmentRequest as svcReviewReassignment,
  directReassign as svcDirectReassign,
  bulkAssignWorksheetToStudents as svcBulkAssign,
} from "../services/worksheet-reassignment.service.js";
import {
  getCenterPracticeStatus,
  getStudentPracticeAssignments,
  assignStudentPracticeFeature,
  unassignStudentPracticeFeature
} from "../services/practice-entitlement.service.js";
import { getStudent360Data } from "../services/student-360.service.js";

function fullName(student) {
  const first = String(student?.firstName || "").trim();
  const last = String(student?.lastName || "").trim();
  return [first, last].filter(Boolean).join(" ").trim();
}

function parseISODateOnly(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

const getCenterMe = asyncHandler(async (req, res) => {
  if (!req.auth?.userId || !req.auth?.tenantId) {
    return res.apiError(401, "Unauthorized", "AUTH_REQUIRED");
  }

  const user = await prisma.authUser.findFirst({
    where: {
      id: req.auth.userId,
      tenantId: req.auth.tenantId,
      role: "CENTER"
    },
    select: {
      id: true,
      username: true,
      email: true,
      isActive: true,
      hierarchyNodeId: true,
      hierarchyNode: { select: { id: true, name: true, code: true, type: true, isActive: true } },
      centerProfile: {
        select: {
          id: true,
          code: true,
          name: true,
          displayName: true,
          status: true,
          isActive: true,
          phonePrimary: true,
          emailOfficial: true,
          logoUrl: true
        }
      }
    }
  });

  if (!user) {
    return res.apiError(404, "Center not found", "CENTER_NOT_FOUND");
  }

  return res.apiSuccess("Center profile fetched", user);
});

const getCenterDashboard = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerId = req.auth.hierarchyNodeId;

  if (!tenantId || !centerId) {
    return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const now = new Date();
  const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [activeStudents, activeTeachers, newAdmissions7d, activeEnrollments] = await Promise.all([
    prisma.student.count({ where: { tenantId, hierarchyNodeId: centerId, isActive: true } }),
    prisma.authUser.count({ where: { tenantId, hierarchyNodeId: centerId, role: "TEACHER", isActive: true } }),
    prisma.student.count({
      where: {
        tenantId,
        hierarchyNodeId: centerId,
        createdAt: { gte: since7 }
      }
    }),
    prisma.enrollment.count({ where: { tenantId, hierarchyNodeId: centerId, status: "ACTIVE" } })
  ]);

  return res.apiSuccess("Center dashboard fetched", {
    activeStudents,
    activeTeachers,
    newAdmissions7d,
    activeEnrollments
  });
});

const listMockTests = asyncHandler(async (req, res) => {
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);
  const tenantId = req.auth.tenantId;
  const centerId = req.auth.hierarchyNodeId;

  if (!tenantId || !centerId) {
    return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const where = {
    tenantId,
    hierarchyNodeId: centerId
  };

  if (req.query.batchId) {
    where.batchId = String(req.query.batchId);
  }

  const [total, items] = await Promise.all([
    prisma.mockTest.count({ where }),
    prisma.mockTest.findMany({
      where,
      take,
      skip,
      orderBy,
      include: {
        batch: { select: { id: true, name: true } },
        worksheet: { select: { id: true, title: true, isPublished: true } }
      }
    })
  ]);

  return res.apiSuccess("Mock tests fetched", { items, total, limit, offset });
});

const getCenterAssignWorksheetsContext = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerId = req.auth.hierarchyNodeId;
  const studentId = String(req.params.studentId || "").trim();

  if (!tenantId || !centerId) {
    return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  if (!studentId) {
    return res.apiError(400, "studentId is required", "VALIDATION_ERROR");
  }

  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId,
      hierarchyNodeId: centerId
    },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      levelId: true
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      tenantId,
      hierarchyNodeId: centerId,
      studentId: student.id,
      status: "ACTIVE"
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
        isAssigned: assignedById.has(w.id),
        wasPreviouslyAssigned: Boolean(assignment && !assignment.isActive && assignment.unassignedAt),
        assignedAt: assignment?.assignedAt || null,
        unassignedAt: assignment?.unassignedAt || null
      };
    })
  });
});

const saveCenterWorksheetAssignments = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerId = req.auth.hierarchyNodeId;
  const studentId = String(req.params.studentId || "").trim();

  if (!tenantId || !centerId) {
    return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  if (!studentId) {
    return res.apiError(400, "studentId is required", "VALIDATION_ERROR");
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
      hierarchyNodeId: centerId
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
      hierarchyNodeId: centerId,
      studentId: student.id,
      status: "ACTIVE"
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

const createMockTest = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerId = req.auth.hierarchyNodeId;

  const { batchId, worksheetId, title, date, maxMarks } = req.body;

  if (!tenantId || !centerId) {
    return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  if (!batchId || !title || !date) {
    return res.apiError(400, "batchId, title, date are required", "VALIDATION_ERROR");
  }

  const parsedDate = parseISODateOnly(date);
  if (!parsedDate) {
    return res.apiError(400, "date must be YYYY-MM-DD", "VALIDATION_ERROR");
  }

  const mm = Number.parseInt(String(maxMarks ?? 0), 10);
  if (!Number.isFinite(mm) || mm <= 0 || mm > 1000) {
    return res.apiError(400, "maxMarks must be a positive integer", "VALIDATION_ERROR");
  }

  const batch = await prisma.batch.findFirst({
    where: { id: String(batchId), tenantId, hierarchyNodeId: centerId },
    select: { id: true }
  });

  if (!batch) {
    return res.apiError(404, "Batch not found", "BATCH_NOT_FOUND");
  }

  let resolvedWorksheetId = null;
  if (worksheetId !== null && worksheetId !== undefined && String(worksheetId).trim()) {
    const worksheet = await prisma.worksheet.findFirst({
      where: {
        id: String(worksheetId).trim(),
        tenantId,
        isPublished: true
      },
      select: { id: true }
    });
    if (!worksheet) {
      return res.apiError(404, "Published worksheet not found", "WORKSHEET_NOT_FOUND");
    }
    resolvedWorksheetId = worksheet.id;
  }

  const created = await prisma.mockTest.create({
    data: {
      tenantId,
      hierarchyNodeId: centerId,
      batchId: String(batchId),
      worksheetId: resolvedWorksheetId,
      title: String(title).trim(),
      date: parsedDate,
      maxMarks: mm,
      createdByUserId: req.auth.userId
    }
  });

  res.locals.entityId = created.id;
  return res.apiSuccess("Mock test created", created, 201);
});

const updateMockTestStatus = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerId = req.auth.hierarchyNodeId;
  const { id } = req.params;
  const status = String(req.body?.status || "").trim().toUpperCase();

  if (!tenantId || !centerId) {
    return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  if (!id) {
    return res.apiError(400, "mock test id is required", "VALIDATION_ERROR");
  }

  const allowed = new Set(["DRAFT", "PUBLISHED", "ARCHIVED"]);
  if (!allowed.has(status)) {
    return res.apiError(400, "status must be one of DRAFT, PUBLISHED, ARCHIVED", "VALIDATION_ERROR");
  }

  const existing = await prisma.mockTest.findFirst({
    where: {
      id,
      tenantId,
      hierarchyNodeId: centerId
    },
    select: { id: true, status: true }
  });

  if (!existing) {
    return res.apiError(404, "Mock test not found", "MOCK_TEST_NOT_FOUND");
  }

  if (existing.status === status) {
    return res.apiSuccess("Mock test status updated", {
      id: existing.id,
      status: existing.status
    });
  }

  const updated = await prisma.mockTest.update({
    where: { id: existing.id },
    data: { status },
    select: {
      id: true,
      status: true
    }
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Mock test status updated", updated);
});

const getMockTest = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerId = req.auth.hierarchyNodeId;
  const { id } = req.params;

  const mockTest = await prisma.mockTest.findFirst({
    where: { id, tenantId, hierarchyNodeId: centerId },
    include: {
      batch: { select: { id: true, name: true } },
      worksheet: { select: { id: true, title: true, isPublished: true } },
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

  const roster = await prisma.enrollment.findMany({
    where: {
      tenantId,
      hierarchyNodeId: centerId,
      batchId: mockTest.batchId,
      status: "ACTIVE"
    },
    include: {
      student: { select: { id: true, admissionNo: true, firstName: true, lastName: true } }
    },
    orderBy: [{ student: { admissionNo: "asc" } }]
  });

  const resultByStudent = new Map((mockTest.results || []).map((r) => [r.studentId, r]));

  return res.apiSuccess("Mock test fetched", {
    ...mockTest,
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

const upsertMockTestResults = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerId = req.auth.hierarchyNodeId;
  const { id } = req.params;
  const { results } = req.body;

  if (!Array.isArray(results)) {
    return res.apiError(400, "results array is required", "VALIDATION_ERROR");
  }

  const mockTest = await prisma.mockTest.findFirst({
    where: { id, tenantId, hierarchyNodeId: centerId },
    select: { id: true, batchId: true, maxMarks: true, status: true }
  });

  if (!mockTest) {
    return res.apiError(404, "Mock test not found", "MOCK_TEST_NOT_FOUND");
  }

  if (mockTest.status === "ARCHIVED") {
    return res.apiError(409, "Archived mock test cannot be edited", "MOCK_TEST_ARCHIVED");
  }

  const roster = await prisma.enrollment.findMany({
    where: {
      tenantId,
      hierarchyNodeId: centerId,
      batchId: mockTest.batchId,
      status: "ACTIVE"
    },
    select: { studentId: true }
  });

  const allowedStudentIds = new Set(roster.map((r) => r.studentId));

  const cleaned = results
    .map((r) => ({
      studentId: r?.studentId ? String(r.studentId) : "",
      marks: r?.marks === null || r?.marks === undefined ? null : Number.parseInt(String(r.marks), 10)
    }))
    .filter((r) => r.studentId && allowedStudentIds.has(r.studentId));

  let updatedCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const r of cleaned) {
      if (r.marks === null) {
        continue;
      }

      const marks = Math.max(0, Math.min(mockTest.maxMarks, r.marks));

      await tx.mockTestResult.upsert({
        where: { mockTestId_studentId: { mockTestId: mockTest.id, studentId: r.studentId } },
        update: {
          marks,
          recordedByUserId: req.auth.userId,
          recordedAt: new Date()
        },
        create: {
          tenantId,
          mockTestId: mockTest.id,
          studentId: r.studentId,
          marks,
          recordedByUserId: req.auth.userId
        }
      });

      updatedCount += 1;
    }
  });

  return res.apiSuccess("Mock test results saved", { mockTestId: mockTest.id, updatedCount });
});

const listCenterAvailableCourses = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const userId = req.auth.userId;

  await ensureTenantCourseCatalog(tenantId);

  // Resolve center → franchise → BP
  const centerProfile = await prisma.centerProfile.findFirst({
    where: { tenantId, authUserId: userId },
    select: {
      franchiseProfile: {
        select: {
          businessPartnerId: true,
          businessPartner: { select: { accessMode: true } }
        }
      }
    }
  });

  const businessPartnerId = centerProfile?.franchiseProfile?.businessPartnerId;
  if (!businessPartnerId) {
    return res.apiSuccess("Available courses", []);
  }

  const accessMode = centerProfile.franchiseProfile.businessPartner?.accessMode;

  // If BP has ALL access, return all active courses in the tenant
  if (accessMode === "ALL") {
    const allCourses = await prisma.course.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, name: true, description: true, isActive: true }
    });
    return res.apiSuccess("Available courses", allCourses);
  }

  const accesses = await prisma.partnerCourseAccess.findMany({
    where: { businessPartnerId },
    include: {
      course: {
        select: { id: true, code: true, name: true, description: true, isActive: true }
      }
    }
  });

  const courses = accesses
    .map((a) => a.course)
    .filter((c) => c.isActive);

  return res.apiSuccess("Available courses", courses);
});

/* ─── Center: List Reassignment Requests ─── */
const listCenterReassignmentRequests = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerId = req.auth.hierarchyNodeId;
  const { take, skip } = parsePagination(req.query);

  if (!centerId) return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");

  // Get all students in this center
  const students = await prisma.student.findMany({
    where: { tenantId, hierarchyNodeId: centerId, isActive: true },
    select: { id: true },
  });
  const studentIds = students.map((s) => s.id);

  if (!studentIds.length) {
    return res.apiSuccess("Reassignment requests", { total: 0, items: [] });
  }

  const VALID_REASSIGNMENT_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];
  const rawStatus = req.query.status ? String(req.query.status).trim().toUpperCase() : undefined;
  const status = rawStatus && VALID_REASSIGNMENT_STATUSES.includes(rawStatus) ? rawStatus : undefined;
  const result = await svcListReassignments({ tenantId, status, studentIds, skip, take });
  return res.apiSuccess("Reassignment requests", result);
});

/* ─── Center: Review Reassignment Request ─── */
const reviewCenterReassignmentRequest = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerId = req.auth.hierarchyNodeId;
  const requestId = String(req.params.requestId || "").trim();
  const { action, reviewReason } = req.body || {};

  if (!centerId) return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
  if (!requestId) return res.apiError(400, "requestId is required", "VALIDATION_ERROR");
  if (!action || !["APPROVED", "REJECTED"].includes(action)) {
    return res.apiError(400, "action must be APPROVED or REJECTED", "VALIDATION_ERROR");
  }

  // Verify request belongs to a student in this center
  const request = await prisma.worksheetReassignmentRequest.findFirst({
    where: { id: requestId, tenantId, status: "PENDING" },
    include: { student: { select: { hierarchyNodeId: true } } },
  });
  if (!request) return res.apiError(404, "Request not found or not pending", "REQUEST_NOT_FOUND");
  if (request.student.hierarchyNodeId !== centerId) {
    return res.apiError(403, "Student not in your center", "CENTER_SCOPE_MISMATCH");
  }

  const result = await svcReviewReassignment({
    tenantId, requestId, action, reviewedByUserId: req.auth.userId, reviewReason: reviewReason || null,
  });

  if (result.error) return res.apiError(400, result.error, result.code);
  return res.apiSuccess(`Request ${action.toLowerCase()}`, result.data);
});

/* ─── Center: Direct Reassign ─── */
const centerDirectReassign = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerId = req.auth.hierarchyNodeId;
  const studentId = String(req.params.studentId || "").trim();

  if (!centerId) return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");

  // Verify student belongs to center
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId, hierarchyNodeId: centerId },
    select: { id: true },
  });
  if (!student) return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");

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

/* ─── Center: Bulk Assign Worksheet to Students ─── */
const centerBulkAssignWorksheet = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerId = req.auth.hierarchyNodeId;

  if (!centerId) return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");

  const { worksheetId, studentIds, dueDate } = req.body || {};
  if (!worksheetId) return res.apiError(400, "worksheetId is required", "VALIDATION_ERROR");
  if (!Array.isArray(studentIds) || !studentIds.length) {
    return res.apiError(400, "studentIds array is required", "VALIDATION_ERROR");
  }
  if (studentIds.length > 200) {
    return res.apiError(400, "Cannot assign to more than 200 students at once", "VALIDATION_ERROR");
  }

  // Verify students belong to center
  const students = await prisma.student.findMany({
    where: { tenantId, hierarchyNodeId: centerId, id: { in: studentIds.map((id) => String(id).trim()) }, isActive: true },
    select: { id: true },
  });
  const validStudentIds = students.map((s) => s.id);

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

// ──────────────────────────────────────────────────────────────────────────────
// Practice Feature Management
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /center/practice-features
 * Returns center's practice feature status (allocated seats, assigned count, remaining)
 */
const getCenterPracticeFeatures = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerNodeId = req.auth.hierarchyNodeId;

  if (!centerNodeId) {
    return res.apiError(400, "Center hierarchy node required", "CENTER_SCOPE_REQUIRED");
  }

  const status = await getCenterPracticeStatus({ tenantId, centerNodeId });

  return res.apiSuccess("Practice features loaded", status);
});

/**
 * GET /center/students/:studentId/practice-features
 * Returns student's current practice feature assignments
 */
const getStudentPracticeFeatures = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerNodeId = req.auth.hierarchyNodeId;
  const studentId = String(req.params.studentId || "").trim();

  if (!centerNodeId) {
    return res.apiError(400, "Center hierarchy node required", "CENTER_SCOPE_REQUIRED");
  }

  if (!studentId) {
    return res.apiError(400, "Student ID is required", "MISSING_STUDENT_ID");
  }

  // Verify student belongs to this center
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId, hierarchyNodeId: centerNodeId },
    select: { id: true, firstName: true, lastName: true }
  });

  if (!student) {
    return res.apiError(404, "Student not found or not under this center", "STUDENT_NOT_FOUND");
  }

  // Get center status and student assignments
  const [centerStatus, studentAssignments] = await Promise.all([
    getCenterPracticeStatus({ tenantId, centerNodeId }),
    getStudentPracticeAssignments({ tenantId, studentId })
  ]);

  return res.apiSuccess("Student practice features loaded", {
    student: {
      id: student.id,
      name: fullName(student)
    },
    centerStatus,
    assignments: studentAssignments
  });
});

/**
 * POST /center/students/:studentId/practice-features
 * Assign a practice feature to a student
 * Body: { featureKey: "PRACTICE" | "ABACUS_PRACTICE" }
 */
const assignStudentFeature = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerNodeId = req.auth.hierarchyNodeId;
  const actorUserId = req.auth.userId;
  const studentId = String(req.params.studentId || "").trim();

  if (!centerNodeId) {
    return res.apiError(400, "Center hierarchy node required", "CENTER_SCOPE_REQUIRED");
  }

  if (!studentId) {
    return res.apiError(400, "Student ID is required", "MISSING_STUDENT_ID");
  }

  const { featureKey } = req.body || {};

  if (!featureKey || !["PRACTICE", "ABACUS_PRACTICE"].includes(featureKey)) {
    return res.apiError(400, "featureKey must be 'PRACTICE' or 'ABACUS_PRACTICE'", "INVALID_FEATURE_KEY");
  }

  const assignment = await assignStudentPracticeFeature({
    tenantId,
    studentId,
    featureKey,
    centerNodeId,
    actorUserId
  });

  // Return updated state
  const [centerStatus, studentAssignments] = await Promise.all([
    getCenterPracticeStatus({ tenantId, centerNodeId }),
    getStudentPracticeAssignments({ tenantId, studentId })
  ]);

  res.locals.entityId = assignment.id;
  return res.apiSuccess("Feature assigned to student", {
    assignment,
    centerStatus,
    assignments: studentAssignments
  });
});

/**
 * DELETE /center/students/:studentId/practice-features/:featureKey
 * Unassign a practice feature from a student
 */
const unassignStudentFeature = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerNodeId = req.auth.hierarchyNodeId;
  const actorUserId = req.auth.userId;
  const studentId = String(req.params.studentId || "").trim();
  const featureKey = String(req.params.featureKey || "").trim().toUpperCase();

  if (!centerNodeId) {
    return res.apiError(400, "Center hierarchy node required", "CENTER_SCOPE_REQUIRED");
  }

  if (!studentId) {
    return res.apiError(400, "Student ID is required", "MISSING_STUDENT_ID");
  }

  if (!["PRACTICE", "ABACUS_PRACTICE"].includes(featureKey)) {
    return res.apiError(400, "featureKey must be 'PRACTICE' or 'ABACUS_PRACTICE'", "INVALID_FEATURE_KEY");
  }

  await unassignStudentPracticeFeature({
    tenantId,
    studentId,
    featureKey,
    centerNodeId,
    actorUserId
  });

  // Return updated state
  const [centerStatus, studentAssignments] = await Promise.all([
    getCenterPracticeStatus({ tenantId, centerNodeId }),
    getStudentPracticeAssignments({ tenantId, studentId })
  ]);

  return res.apiSuccess("Feature unassigned from student", {
    centerStatus,
    assignments: studentAssignments
  });
});

/**
 * GET /center/practice-features/students
 * List center's students with their practice feature assignments
 */
const listStudentsWithPracticeFeatures = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerNodeId = req.auth.hierarchyNodeId;

  if (!centerNodeId) {
    return res.apiError(400, "Center hierarchy node required", "CENTER_SCOPE_REQUIRED");
  }

  const { limit, offset } = parsePagination(req.query);
  const q = String(req.query.q || "").trim().toLowerCase();
  const filterFeature = String(req.query.feature || "").trim().toUpperCase();

  // Get students
  const where = {
    tenantId,
    hierarchyNodeId: centerNodeId,
    isActive: true
  };

  if (q) {
    where.OR = [
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { admissionNo: { contains: q } }
    ];
  }

  const [totalCount, students] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNo: true,
        practiceAssignments: {
          where: { isActive: true },
          select: {
            featureKey: true,
            assignedAt: true
          }
        }
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      skip: offset,
      take: limit
    })
  ]);

  // Transform
  let results = students.map(s => {
    const practiceAssignment = s.practiceAssignments.find(a => a.featureKey === "PRACTICE");
    const abacusAssignment = s.practiceAssignments.find(a => a.featureKey === "ABACUS_PRACTICE");

    return {
      id: s.id,
      name: fullName(s),
      admissionNo: s.admissionNo,
      hasPractice: Boolean(practiceAssignment),
      practiceAssignedAt: practiceAssignment?.assignedAt || null,
      hasAbacusPractice: Boolean(abacusAssignment),
      abacusPracticeAssignedAt: abacusAssignment?.assignedAt || null
    };
  });

  // Filter by feature if specified
  if (filterFeature === "PRACTICE") {
    results = results.filter(r => r.hasPractice);
  } else if (filterFeature === "ABACUS_PRACTICE") {
    results = results.filter(r => r.hasAbacusPractice);
  } else if (filterFeature === "NONE") {
    results = results.filter(r => !r.hasPractice && !r.hasAbacusPractice);
  }

  // Get center status
  const centerStatus = await getCenterPracticeStatus({ tenantId, centerNodeId });

  return res.apiSuccess("Students loaded", {
    students: results,
    pagination: {
      total: totalCount,
      limit,
      offset
    },
    centerStatus
  });
});

/* ── Student Attendance History ── */
const getCenterStudentAttendanceHistory = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerId = req.auth.hierarchyNodeId;
  const studentId = String(req.params.studentId || "").trim();

  if (!tenantId || !centerId) {
    return res.apiError(400, "Missing scope", "SCOPE_REQUIRED");
  }

  const limitRaw = req.query.limit ? Number(req.query.limit) : 20;
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 20;
  const offsetRaw = req.query.offset ? Number(req.query.offset) : 0;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const statusVal = String(req.query.status || "").trim().toUpperCase();
  const statusFilter = ["PRESENT", "ABSENT", "LATE", "EXCUSED"].includes(statusVal) ? statusVal : null;

  let from = null, to = null;
  const fromText = String(req.query.from || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromText)) { const d = new Date(`${fromText}T00:00:00.000Z`); if (!Number.isNaN(d.getTime())) from = d; }
  const toText = String(req.query.to || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(toText)) { const d = new Date(`${toText}T00:00:00.000Z`); if (!Number.isNaN(d.getTime())) to = d; }

  const where = {
    tenantId,
    studentId,
    session: {
      hierarchyNodeId: centerId,
      status: { in: ["PUBLISHED", "LOCKED"] },
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {})
    },
    ...(statusFilter ? { status: statusFilter } : {})
  };

  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId,
      hierarchyNodeId: centerId
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
        session: { hierarchyNodeId: centerId, status: { in: ["PUBLISHED", "LOCKED"] } }
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

/* ── Center-wide Attendance History ── */
const listCenterAttendanceHistory = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerId = req.auth.hierarchyNodeId;

  if (!tenantId || !centerId) {
    return res.apiError(400, "Missing scope", "SCOPE_REQUIRED");
  }

  const limitRaw = req.query.limit ? Number(req.query.limit) : 20;
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 20;
  const offsetRaw = req.query.offset ? Number(req.query.offset) : 0;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const statusVal = String(req.query.status || "").trim().toUpperCase();
  const statusFilter = ["PRESENT", "ABSENT", "LATE", "EXCUSED"].includes(statusVal) ? statusVal : null;

  const search = String(req.query.search || "").trim();

  let from = null, to = null;
  const fromText = String(req.query.from || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromText)) { const d = new Date(`${fromText}T00:00:00.000Z`); if (!Number.isNaN(d.getTime())) from = d; }
  const toText = String(req.query.to || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(toText)) { const d = new Date(`${toText}T00:00:00.000Z`); if (!Number.isNaN(d.getTime())) to = d; }

  const where = {
    tenantId,
    student: {
      tenantId,
      hierarchyNodeId: centerId,
      ...(search ? {
        OR: [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { admissionNo: { contains: search } }
        ]
      } : {})
    },
    session: {
      hierarchyNodeId: centerId,
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
        student: {
          select: { id: true, admissionNo: true, firstName: true, lastName: true }
        },
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
        student: { tenantId, hierarchyNodeId: centerId },
        session: { hierarchyNodeId: centerId, status: { in: ["PUBLISHED", "LOCKED"] } }
      },
      _count: { _all: true }
    })
  ]);

  const counts = Object.fromEntries(summary.map((r) => [r.status, r._count._all]));
  const totalSessions = Object.values(counts).reduce((a, b) => a + b, 0);

  return res.apiSuccess("Center attendance history", {
    items: rows.map((r) => ({
      date: r.session?.date || null,
      studentId: r.student?.id || null,
      studentName: r.student ? `${r.student.firstName || ""} ${r.student.lastName || ""}`.trim() : null,
      admissionNo: r.student?.admissionNo || null,
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
const getStudent360 = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const centerId = req.auth.hierarchyNodeId;
  const studentId = String(req.params.studentId || "").trim();

  if (!tenantId || !centerId) {
    return res.apiError(400, "Missing scope", "SCOPE_REQUIRED");
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId, hierarchyNodeId: centerId },
    select: { id: true }
  });
  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const data = await getStudent360Data(studentId, tenantId, centerId);
  return res.apiSuccess("Student 360 data", data);
});

export {
  getCenterMe,
  getCenterDashboard,
  listCenterAvailableCourses,
  listMockTests,
  createMockTest,
  updateMockTestStatus,
  getMockTest,
  upsertMockTestResults,
  getCenterAssignWorksheetsContext,
  saveCenterWorksheetAssignments,
  listCenterReassignmentRequests,
  reviewCenterReassignmentRequest,
  centerDirectReassign,
  centerBulkAssignWorksheet,
  getCenterPracticeFeatures,
  getStudentPracticeFeatures,
  assignStudentFeature,
  unassignStudentFeature,
  listStudentsWithPracticeFeatures,
  getCenterStudentAttendanceHistory,
  listCenterAttendanceHistory,
  getStudent360,
};
