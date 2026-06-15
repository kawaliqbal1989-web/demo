import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { resolveActorExamScope } from "../services/exam-scope.service.js";
import { recordAudit } from "../utils/audit.js";

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

const REQUEST_PENDING_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "PARTIALLY_APPROVED"];
const REQUEST_FINAL_STATUSES = ["APPROVED", "REJECTED", "EXPIRED"];
const STUDENT_PENDING_STATUSES = ["SUBMITTED", "UNDER_REVIEW"];
const LATE_ENROLLMENT_ALLOWED_LIST_STATUSES = [
  "SUBMITTED_TO_FRANCHISE",
  "SUBMITTED_TO_BUSINESS_PARTNER",
  "SUBMITTED_TO_SUPERADMIN",
  "APPROVED"
];

async function getExamCycleOrThrow({ tenantId, examCycleId }) {
  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId },
    select: {
      id: true,
      code: true,
      name: true,
      businessPartnerId: true,
      examEndsAt: true,
      resultStatus: true,
      isArchived: true
    }
  });

  if (!examCycle) {
    throw createHttpError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  if (examCycle.isArchived) {
    throw createHttpError(409, "Exam cycle is archived", "EXAM_CYCLE_ARCHIVED");
  }

  return examCycle;
}

function assertLateEnrollmentWriteAllowed(examCycle) {
  const now = Date.now();
  if (examCycle.resultStatus === "PUBLISHED") {
    throw createHttpError(409, "Late enrollment is locked after result publication", "EXAM_RESULT_PUBLISHED_LOCK");
  }

  if (now > new Date(examCycle.examEndsAt).getTime()) {
    throw createHttpError(409, "Late enrollment window is closed", "LATE_ENROLLMENT_WINDOW_CLOSED");
  }
}

async function expirePendingRequestsForCycle({ tenantId, examCycleId }) {
  const now = new Date();

  const requestIds = await prisma.examLateEnrollmentRequest.findMany({
    where: {
      tenantId,
      examCycleId,
      status: { in: REQUEST_PENDING_STATUSES },
      examCycle: { is: { examEndsAt: { lt: now } } }
    },
    select: { id: true }
  });

  if (!requestIds.length) {
    return 0;
  }

  const ids = requestIds.map((r) => r.id);

  await prisma.$transaction([
    prisma.examLateEnrollmentStudent.updateMany({
      where: {
        requestId: { in: ids },
        status: { in: STUDENT_PENDING_STATUSES }
      },
      data: {
        status: "EXPIRED",
        reviewRemarks: "Auto-expired after exam end"
      }
    }),
    prisma.examLateEnrollmentRequest.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "EXPIRED",
        reviewedAt: now
      }
    })
  ]);

  return ids.length;
}

async function assertLateEnrollmentAvailabilityForCenter({ tenantId, examCycleId, centerId, levelId }) {
  const forwardedListCount = await prisma.examEnrollmentList.count({
    where: {
      tenantId,
      examCycleId,
      type: "CENTER_COMBINED",
      hierarchyNodeId: centerId,
      status: { in: LATE_ENROLLMENT_ALLOWED_LIST_STATUSES }
    }
  });

  if (forwardedListCount <= 0) {
    throw createHttpError(409, "Late enrollment is available only after center list is forwarded upward", "LATE_ENROLLMENT_NOT_AVAILABLE");
  }

  const config = await prisma.examLevelAssessmentConfig.findFirst({
    where: { tenantId, examCycleId, levelId },
    select: { assessmentType: true }
  });

  if (!config) {
    throw createHttpError(409, "No approved exam package exists for the selected level.", "LATE_ENROLLMENT_PACKAGE_NOT_AVAILABLE");
  }

  if (config.assessmentType === "WORKSHEET") {
    const worksheetPackageCount = await prisma.worksheetAssignment.count({
      where: {
        tenantId,
        isActive: true,
        worksheet: {
          is: {
            tenantId,
            examCycleId,
            generationMode: "EXAM",
            levelId
          }
        }
      }
    });

    if (worksheetPackageCount <= 0) {
      throw createHttpError(409, "No approved exam package exists for the selected level.", "LATE_ENROLLMENT_PACKAGE_NOT_AVAILABLE");
    }
    return;
  }

  if (config.assessmentType === "QUESTION_BANK") {
    const questionSetCount = await prisma.examGeneratedQuestionSet.count({
      where: {
        tenantId,
        examCycleId,
        levelId
      }
    });

    if (questionSetCount <= 0) {
      throw createHttpError(409, "No approved exam package exists for the selected level.", "LATE_ENROLLMENT_PACKAGE_NOT_AVAILABLE");
    }
    return;
  }

  throw createHttpError(409, "No approved exam package exists for the selected level.", "LATE_ENROLLMENT_PACKAGE_NOT_AVAILABLE");
}

async function getEnrollmentCounts({ tenantId, examCycleId }) {
  const [totalEnrollmentCount, lateEnrollmentCount] = await Promise.all([
    prisma.examEnrollmentEntry.count({ where: { tenantId, examCycleId } }),
    prisma.examLateEnrollmentStudent.count({
      where: {
        tenantId,
        status: "APPROVED",
        request: { is: { examCycleId } }
      }
    })
  ]);

  return {
    normalEnrollmentCount: Math.max(totalEnrollmentCount - lateEnrollmentCount, 0),
    lateEnrollmentCount,
    totalEnrollmentCount
  };
}

async function resolveReusableExamPackage({ tx, tenantId, examCycleId, levelId }) {
  const config = await tx.examLevelAssessmentConfig.findFirst({
    where: { tenantId, examCycleId, levelId },
    select: { assessmentType: true }
  });

  const sourceAssignment = await tx.worksheetAssignment.findFirst({
    where: {
      tenantId,
      isActive: true,
      worksheet: {
        is: {
          tenantId,
          examCycleId,
          generationMode: "EXAM",
          levelId
        }
      }
    },
    orderBy: { assignedAt: "asc" },
    select: {
      worksheetId: true,
      studentId: true
    }
  });

  if (!sourceAssignment?.worksheetId) {
    throw createHttpError(409, "No reusable exam package found for this level", "LATE_ENROLLMENT_PACKAGE_NOT_FOUND");
  }

  let sourceQuestionSet = null;
  if (config?.assessmentType === "QUESTION_BANK") {
    sourceQuestionSet = await tx.examGeneratedQuestionSet.findFirst({
      where: {
        tenantId,
        examCycleId,
        levelId,
        studentId: sourceAssignment.studentId
      },
      select: {
        questionBankId: true,
        generatedQuestionIds: true
      }
    });

    if (!sourceQuestionSet) {
      throw createHttpError(409, "No reusable exam package found for this level", "LATE_ENROLLMENT_PACKAGE_NOT_FOUND");
    }
  }

  return {
    worksheetId: sourceAssignment.worksheetId,
    questionSet: sourceQuestionSet
  };
}

const listLateEnrollmentEligibleStudents = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const levelId = String(req.query?.levelId || "").trim();

  if (!levelId) {
    return res.apiError(400, "levelId is required", "VALIDATION_ERROR");
  }

  if (!req.auth?.hierarchyNodeId) {
    return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const examCycle = await getExamCycleOrThrow({ tenantId: req.auth.tenantId, examCycleId });
  await expirePendingRequestsForCycle({ tenantId: req.auth.tenantId, examCycleId });
  assertLateEnrollmentWriteAllowed(examCycle);
  await assertLateEnrollmentAvailabilityForCenter({
    tenantId: req.auth.tenantId,
    examCycleId,
    centerId: req.auth.hierarchyNodeId,
    levelId
  });

  const [enrolledEntries, pendingLateRows, centerStudents, counts] = await Promise.all([
    prisma.examEnrollmentEntry.findMany({
      where: { tenantId: req.auth.tenantId, examCycleId },
      select: { studentId: true }
    }),
    prisma.examLateEnrollmentStudent.findMany({
      where: {
        tenantId: req.auth.tenantId,
        levelId,
        status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED"] },
        request: {
          is: {
            examCycleId,
            centerId: req.auth.hierarchyNodeId,
            status: { notIn: ["REJECTED", "EXPIRED"] }
          }
        }
      },
      select: { studentId: true }
    }),
    prisma.student.findMany({
      where: {
        tenantId: req.auth.tenantId,
        hierarchyNodeId: req.auth.hierarchyNodeId,
        isActive: true,
        levelId
      },
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        levelId: true,
        level: { select: { id: true, name: true, rank: true } }
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }]
    }),
    getEnrollmentCounts({ tenantId: req.auth.tenantId, examCycleId })
  ]);

  const excludedStudentIds = new Set([
    ...enrolledEntries.map((entry) => entry.studentId),
    ...pendingLateRows.map((row) => row.studentId)
  ]);

  const eligibleStudents = centerStudents.filter((student) => !excludedStudentIds.has(student.id));

  return res.apiSuccess("Eligible late enrollment students", {
    examCycleId,
    levelId,
    eligibleStudents,
    counts
  });
});

const createLateEnrollmentRequest = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const centerId = req.auth?.hierarchyNodeId;
  const levelId = String(req.body?.levelId || "").trim();
  const remarks = req.body?.remarks ? String(req.body.remarks).trim() : null;
  const studentIds = Array.isArray(req.body?.studentIds)
    ? Array.from(new Set(req.body.studentIds.map((id) => String(id).trim()).filter(Boolean)))
    : [];

  if (!centerId) {
    return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  if (!levelId || !studentIds.length) {
    return res.apiError(400, "levelId and studentIds[] are required", "VALIDATION_ERROR");
  }

  const examCycle = await getExamCycleOrThrow({ tenantId: req.auth.tenantId, examCycleId });
  await expirePendingRequestsForCycle({ tenantId: req.auth.tenantId, examCycleId });
  assertLateEnrollmentWriteAllowed(examCycle);
  await assertLateEnrollmentAvailabilityForCenter({
    tenantId: req.auth.tenantId,
    examCycleId,
    centerId,
    levelId
  });

  const [students, alreadyEnrolled, pendingLateRows] = await Promise.all([
    prisma.student.findMany({
      where: {
        tenantId: req.auth.tenantId,
        id: { in: studentIds },
        hierarchyNodeId: centerId,
        isActive: true
      },
      select: { id: true, levelId: true }
    }),
    prisma.examEnrollmentEntry.findMany({
      where: {
        tenantId: req.auth.tenantId,
        examCycleId,
        studentId: { in: studentIds }
      },
      select: { studentId: true }
    }),
    prisma.examLateEnrollmentStudent.findMany({
      where: {
        tenantId: req.auth.tenantId,
        studentId: { in: studentIds },
        status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED"] },
        request: {
          is: {
            examCycleId,
            centerId,
            status: { notIn: ["REJECTED", "EXPIRED"] }
          }
        }
      },
      select: { studentId: true }
    })
  ]);

  if (students.length !== studentIds.length) {
    return res.apiError(403, "One or more students are outside your center scope", "HIERARCHY_SCOPE_DENIED");
  }

  if (students.some((student) => student.levelId !== levelId)) {
    return res.apiError(409, "One or more students are not in the selected level", "LATE_ENROLLMENT_LEVEL_MISMATCH");
  }

  if (alreadyEnrolled.length) {
    return res.apiError(409, "One or more students are already enrolled", "DUPLICATE_ENROLLMENT");
  }

  if (pendingLateRows.length) {
    return res.apiError(409, "One or more students already have a pending late enrollment request", "LATE_ENROLLMENT_REQUEST_DUPLICATE");
  }

  const created = await prisma.$transaction(async (tx) => {
    const request = await tx.examLateEnrollmentRequest.create({
      data: {
        tenantId: req.auth.tenantId,
        examCycleId,
        centerId,
        submittedByUserId: req.auth.userId,
        status: "SUBMITTED",
        remarks: remarks || null
      },
      select: { id: true }
    });

    await tx.examLateEnrollmentStudent.createMany({
      data: studentIds.map((studentId) => ({
        requestId: request.id,
        tenantId: req.auth.tenantId,
        studentId,
        levelId,
        status: "SUBMITTED"
      }))
    });

    return tx.examLateEnrollmentRequest.findUnique({
      where: { id: request.id },
      include: {
        students: {
          include: {
            student: { select: { id: true, admissionNo: true, firstName: true, lastName: true } },
            level: { select: { id: true, name: true, rank: true } }
          },
          orderBy: { createdAt: "asc" }
        }
      }
    });
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_LATE_ENROLLMENT_REQUEST_CREATE",
    entityType: "EXAM_LATE_ENROLLMENT_REQUEST",
    entityId: created.id,
    metadata: {
      examCycleId,
      centerId,
      levelId,
      studentCount: studentIds.length
    }
  });

  const counts = await getEnrollmentCounts({ tenantId: req.auth.tenantId, examCycleId });

  return res.apiSuccess("Late enrollment request submitted", { request: created, counts }, 201);
});

const listLateEnrollmentRequests = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const status = String(req.query?.status || "ALL").trim().toUpperCase();

  const examCycle = await getExamCycleOrThrow({ tenantId: req.auth.tenantId, examCycleId });
  await expirePendingRequestsForCycle({ tenantId: req.auth.tenantId, examCycleId });

  const where = {
    tenantId: req.auth.tenantId,
    examCycleId,
    ...(status !== "ALL" ? { status } : {})
  };

  if (req.auth.role === "CENTER") {
    if (!req.auth.hierarchyNodeId) {
      return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
    }
    where.centerId = req.auth.hierarchyNodeId;
  } else if (req.auth.role === "FRANCHISE" || req.auth.role === "BP") {
    const scope = await resolveActorExamScope({ tenantId: req.auth.tenantId, actor: req.auth });
    if (scope.businessPartnerId && scope.businessPartnerId !== examCycle.businessPartnerId) {
      return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
    }

    if (scope.hierarchyNodeIds.length) {
      where.centerId = { in: scope.hierarchyNodeIds };
    } else if (req.auth.hierarchyNodeId) {
      where.centerId = req.auth.hierarchyNodeId;
    }
  }

  const requests = await prisma.examLateEnrollmentRequest.findMany({
    where,
    include: {
      centerNode: { select: { id: true, code: true, name: true } },
      submittedBy: { select: { id: true, username: true, role: true } },
      reviewedBy: { select: { id: true, username: true, role: true } },
      students: {
        include: {
          student: { select: { id: true, admissionNo: true, firstName: true, lastName: true } },
          level: { select: { id: true, name: true, rank: true } }
        },
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }]
  });

  const counts = await getEnrollmentCounts({ tenantId: req.auth.tenantId, examCycleId });

  return res.apiSuccess("Late enrollment requests", {
    examCycleId,
    status,
    requests,
    counts
  });
});

const reviewLateEnrollmentRequest = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const requestId = String(req.params.requestId);
  const decisions = Array.isArray(req.body?.decisions) ? req.body.decisions : [];

  if (!decisions.length) {
    return res.apiError(400, "decisions[] is required", "VALIDATION_ERROR");
  }

  const normalizedDecisions = decisions
    .map((item) => {
      const studentId = String(item?.studentId || "").trim();
      const decision = String(item?.decision || item?.status || "").trim().toUpperCase();
      const reviewRemarks = item?.reviewRemarks ? String(item.reviewRemarks).trim() : null;
      return { studentId, decision, reviewRemarks };
    })
    .filter((item) => item.studentId && ["APPROVED", "REJECTED"].includes(item.decision));

  if (!normalizedDecisions.length) {
    return res.apiError(400, "decisions[] must include valid APPROVED or REJECTED actions", "VALIDATION_ERROR");
  }

  const examCycle = await getExamCycleOrThrow({ tenantId: req.auth.tenantId, examCycleId });
  await expirePendingRequestsForCycle({ tenantId: req.auth.tenantId, examCycleId });
  assertLateEnrollmentWriteAllowed(examCycle);

  const decisionMap = new Map(normalizedDecisions.map((item) => [item.studentId, item]));

  const request = await prisma.$transaction(async (tx) => {
    const currentRequest = await tx.examLateEnrollmentRequest.findFirst({
      where: {
        id: requestId,
        tenantId: req.auth.tenantId,
        examCycleId
      },
      include: {
        students: {
          select: {
            id: true,
            studentId: true,
            levelId: true,
            status: true
          }
        }
      }
    });

    if (!currentRequest) {
      throw createHttpError(404, "Late enrollment request not found", "LATE_ENROLLMENT_REQUEST_NOT_FOUND");
    }

    if (REQUEST_FINAL_STATUSES.includes(currentRequest.status)) {
      throw createHttpError(409, "Request is already finalized", "LATE_ENROLLMENT_REQUEST_FINALIZED");
    }

    await tx.examLateEnrollmentRequest.update({
      where: { id: currentRequest.id },
      data: {
        status: "UNDER_REVIEW"
      }
    });

    for (const row of currentRequest.students) {
      const picked = decisionMap.get(row.studentId);
      if (!picked) {
        continue;
      }

      if (["APPROVED", "REJECTED", "EXPIRED"].includes(row.status)) {
        continue;
      }

      if (picked.decision === "REJECTED") {
        await tx.examLateEnrollmentStudent.update({
          where: { id: row.id },
          data: {
            status: "REJECTED",
            reviewRemarks: picked.reviewRemarks || null,
            approvedAt: null,
            approvedByUserId: null
          }
        });
        continue;
      }

      const existingEnrollment = await tx.examEnrollmentEntry.findUnique({
        where: {
          tenantId_examCycleId_studentId: {
            tenantId: req.auth.tenantId,
            examCycleId,
            studentId: row.studentId
          }
        },
        select: { id: true }
      });

      const reusable = await resolveReusableExamPackage({
        tx,
        tenantId: req.auth.tenantId,
        examCycleId,
        levelId: row.levelId
      });

      if (!existingEnrollment) {
        await tx.examEnrollmentEntry.create({
          data: {
            tenantId: req.auth.tenantId,
            examCycleId,
            studentId: row.studentId,
            enrolledLevelId: row.levelId,
            isTemporary: false,
            sourceTeacherUserId: null,
            createdByUserId: req.auth.userId
          }
        });
      }

      await tx.worksheetAssignment.upsert({
        where: {
          worksheetId_studentId: {
            worksheetId: reusable.worksheetId,
            studentId: row.studentId
          }
        },
        create: {
          tenantId: req.auth.tenantId,
          worksheetId: reusable.worksheetId,
          studentId: row.studentId,
          createdByUserId: req.auth.userId,
          assignedAt: new Date(),
          isActive: true
        },
        update: {
          isActive: true,
          unassignedAt: null
        }
      });

      if (reusable.questionSet) {
        await tx.examGeneratedQuestionSet.upsert({
          where: {
            tenantId_examCycleId_studentId_levelId: {
              tenantId: req.auth.tenantId,
              examCycleId,
              studentId: row.studentId,
              levelId: row.levelId
            }
          },
          create: {
            tenantId: req.auth.tenantId,
            examCycleId,
            studentId: row.studentId,
            levelId: row.levelId,
            questionBankId: reusable.questionSet.questionBankId,
            generatedQuestionIds: reusable.questionSet.generatedQuestionIds
          },
          update: {
            questionBankId: reusable.questionSet.questionBankId,
            generatedQuestionIds: reusable.questionSet.generatedQuestionIds,
            generatedAt: new Date()
          }
        });
      }

      await tx.examLateEnrollmentStudent.update({
        where: { id: row.id },
        data: {
          status: "APPROVED",
          reviewRemarks: picked.reviewRemarks || null,
          approvedAt: new Date(),
          approvedByUserId: req.auth.userId
        }
      });
    }

    const finalRows = await tx.examLateEnrollmentStudent.findMany({
      where: { requestId: currentRequest.id },
      select: { status: true }
    });

    const statusCounts = finalRows.reduce(
      (acc, row) => {
        acc[row.status] = (acc[row.status] || 0) + 1;
        return acc;
      },
      { SUBMITTED: 0, UNDER_REVIEW: 0, APPROVED: 0, REJECTED: 0, EXPIRED: 0 }
    );

    let nextRequestStatus = "UNDER_REVIEW";
    const total = finalRows.length;
    const approved = statusCounts.APPROVED;
    const rejected = statusCounts.REJECTED;
    const expired = statusCounts.EXPIRED;

    if (approved === total && total > 0) {
      nextRequestStatus = "APPROVED";
    } else if (approved > 0 && approved + rejected + expired === total) {
      nextRequestStatus = "PARTIALLY_APPROVED";
    } else if (rejected + expired === total) {
      nextRequestStatus = "REJECTED";
    } else if (approved > 0) {
      nextRequestStatus = "PARTIALLY_APPROVED";
    }

    await tx.examLateEnrollmentRequest.update({
      where: { id: currentRequest.id },
      data: {
        status: nextRequestStatus,
        reviewedAt: new Date(),
        reviewedByUserId: req.auth.userId
      }
    });

    return tx.examLateEnrollmentRequest.findUnique({
      where: { id: currentRequest.id },
      include: {
        centerNode: { select: { id: true, code: true, name: true } },
        submittedBy: { select: { id: true, username: true, role: true } },
        reviewedBy: { select: { id: true, username: true, role: true } },
        students: {
          include: {
            student: { select: { id: true, admissionNo: true, firstName: true, lastName: true } },
            level: { select: { id: true, name: true, rank: true } }
          },
          orderBy: { createdAt: "asc" }
        }
      }
    });
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_LATE_ENROLLMENT_REQUEST_REVIEW",
    entityType: "EXAM_LATE_ENROLLMENT_REQUEST",
    entityId: request.id,
    metadata: {
      examCycleId,
      approvedStudents: request.students.filter((item) => item.status === "APPROVED").length,
      rejectedStudents: request.students.filter((item) => item.status === "REJECTED").length,
      expiredStudents: request.students.filter((item) => item.status === "EXPIRED").length,
      finalStatus: request.status
    }
  });

  const counts = await getEnrollmentCounts({ tenantId: req.auth.tenantId, examCycleId });

  return res.apiSuccess("Late enrollment request reviewed", { request, counts });
});

const getLateEnrollmentAudit = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);

  await getExamCycleOrThrow({ tenantId: req.auth.tenantId, examCycleId });
  await expirePendingRequestsForCycle({ tenantId: req.auth.tenantId, examCycleId });

  const where = {
    tenantId: req.auth.tenantId,
    examCycleId
  };

  if (req.auth.role === "CENTER") {
    if (!req.auth.hierarchyNodeId) {
      return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
    }
    where.centerId = req.auth.hierarchyNodeId;
  } else if (req.auth.role === "FRANCHISE" || req.auth.role === "BP") {
    const scope = await resolveActorExamScope({ tenantId: req.auth.tenantId, actor: req.auth });
    if (scope.hierarchyNodeIds.length) {
      where.centerId = { in: scope.hierarchyNodeIds };
    } else if (req.auth.hierarchyNodeId) {
      where.centerId = req.auth.hierarchyNodeId;
    }
  }

  const [counts, statusBuckets, recentRequests] = await Promise.all([
    getEnrollmentCounts({ tenantId: req.auth.tenantId, examCycleId }),
    prisma.examLateEnrollmentRequest.groupBy({
      by: ["status"],
      where,
      _count: { _all: true }
    }),
    prisma.examLateEnrollmentRequest.findMany({
      where,
      include: {
        centerNode: { select: { id: true, code: true, name: true } },
        _count: { select: { students: true } }
      },
      orderBy: { submittedAt: "desc" },
      take: 20
    })
  ]);

  return res.apiSuccess("Late enrollment audit", {
    counts,
    requestStatusSummary: statusBuckets.reduce((acc, bucket) => {
      acc[bucket.status] = bucket._count._all;
      return acc;
    }, {}),
    recentRequests: recentRequests.map((request) => ({
      ...request,
      studentCount: request._count.students,
      _count: undefined
    }))
  });
});

export {
  listLateEnrollmentEligibleStudents,
  createLateEnrollmentRequest,
  listLateEnrollmentRequests,
  reviewLateEnrollmentRequest,
  getLateEnrollmentAudit,
  getEnrollmentCounts
};
