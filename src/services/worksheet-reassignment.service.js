import { prisma } from "../lib/prisma.js";
import { isSchemaMismatchError } from "../utils/schema-mismatch.js";

function isMissingReassignmentSchemaError(error) {
  return isSchemaMismatchError(error, ["worksheetreassignmentrequest"]);
}

function buildReassignmentUnavailableResult() {
  return {
    error: "Worksheet reassignment is unavailable in this environment",
    code: "REASSIGNMENT_UNAVAILABLE"
  };
}

function buildArchivedResultSnapshot(submission) {
  if (!submission?.finalSubmittedAt) {
    return null;
  }

  return {
    submissionId: submission.id,
    score: submission.score === null || submission.score === undefined ? null : Number(submission.score),
    correctCount: submission.correctCount ?? null,
    totalQuestions: submission.totalQuestions ?? null,
    completionTimeSeconds: submission.completionTimeSeconds ?? null,
    submittedAt: submission.finalSubmittedAt,
    status: submission.status || null
  };
}

/**
 * Create a reassignment request (student-initiated or teacher/center direct).
 */
async function createReassignmentRequest({
  tenantId,
  studentId,
  currentWorksheetId,
  type,
  newWorksheetId,
  reason,
  requestedByUserId,
}) {
  try {
  // Guard: no duplicate PENDING request for same student + worksheet
  const existing = await prisma.worksheetReassignmentRequest.findFirst({
    where: {
      tenantId,
      studentId,
      currentWorksheetId,
      status: "PENDING",
    },
  });
  if (existing) {
    return { error: "A pending request already exists for this worksheet", code: "DUPLICATE_PENDING" };
  }

  // Guard: student must have a submission for the current worksheet
  const submission = await prisma.worksheetSubmission.findFirst({
    where: { tenantId, studentId, worksheetId: currentWorksheetId, finalSubmittedAt: { not: null } },
    select: { id: true },
  });
  if (!submission) {
    return { error: "Student has not submitted this worksheet", code: "NO_SUBMISSION" };
  }

  // Guard: if SWAP, newWorksheetId is required and must exist
  if (type === "SWAP") {
    if (!newWorksheetId) {
      return { error: "New worksheet ID is required for swap requests", code: "SWAP_WORKSHEET_REQUIRED" };
    }
    const newWs = await prisma.worksheet.findFirst({
      where: { id: newWorksheetId, tenantId },
      select: { id: true },
    });
    if (!newWs) {
      return { error: "New worksheet not found", code: "NEW_WORKSHEET_NOT_FOUND" };
    }
  }

  const request = await prisma.worksheetReassignmentRequest.create({
    data: {
      tenantId,
      studentId,
      currentWorksheetId,
      type: type || "RETRY",
      newWorksheetId: type === "SWAP" ? newWorksheetId : null,
      reason,
      status: "PENDING",
      requestedByUserId,
    },
  });

  return { data: request };
  } catch (error) {
    if (!isMissingReassignmentSchemaError(error)) {
      throw error;
    }

    return buildReassignmentUnavailableResult();
  }
}

/**
 * List reassignment requests filtered by scope.
 */
async function listReassignmentRequests({
  tenantId,
  status,
  studentId,
  reviewerUserId,
  studentIds,
  skip = 0,
  take = 50,
}) {
  try {
    const where = { tenantId };
    if (status) where.status = status;
    if (studentId) where.studentId = studentId;
    if (reviewerUserId) where.reviewedByUserId = reviewerUserId;
    if (studentIds && studentIds.length > 0) where.studentId = { in: studentIds };

    const [total, items] = await Promise.all([
      prisma.worksheetReassignmentRequest.count({ where }),
      prisma.worksheetReassignmentRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          student: { select: { id: true, admissionNo: true, firstName: true, lastName: true } },
          currentWorksheet: {
            select: {
              id: true,
              title: true,
              level: { select: { id: true, name: true, rank: true } },
            },
          },
          newWorksheet: {
            select: {
              id: true,
              title: true,
              level: { select: { id: true, name: true, rank: true } },
            },
          },
          requestedBy: { select: { id: true, username: true, role: true } },
          reviewedBy: { select: { id: true, username: true, role: true } },
        },
      }),
    ]);

    return { total, items };
  } catch (error) {
    if (!isMissingReassignmentSchemaError(error)) {
      throw error;
    }

    return { total: 0, items: [] };
  }
}

/**
 * Review (approve/reject) a reassignment request.
 */
async function reviewReassignmentRequest({
  tenantId,
  requestId,
  action,
  reviewedByUserId,
  reviewReason,
}) {
  try {
  const request = await prisma.worksheetReassignmentRequest.findFirst({
    where: { id: requestId, tenantId, status: "PENDING" },
  });
  if (!request) {
    return { error: "Request not found or not pending", code: "REQUEST_NOT_FOUND" };
  }

  if (action === "REJECTED" && !reviewReason) {
    return { error: "Rejection reason is required", code: "REJECT_REASON_REQUIRED" };
  }

  const now = new Date();

  if (action === "APPROVED") {
    // Execute the reassignment inside a transaction
    const result = await prisma.$transaction(async (tx) => {
      const submission = await tx.worksheetSubmission.findFirst({
        where: {
          tenantId,
          studentId: request.studentId,
          worksheetId: request.currentWorksheetId,
          finalSubmittedAt: { not: null }
        },
        select: {
          id: true,
          score: true,
          correctCount: true,
          totalQuestions: true,
          completionTimeSeconds: true,
          finalSubmittedAt: true,
          status: true
        }
      });
      const archivedResultSnapshot = buildArchivedResultSnapshot(submission);

      // Update request status
      await tx.worksheetReassignmentRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          reviewedByUserId,
          reviewReason: reviewReason || null,
          archivedResultSnapshot,
          reviewedAt: now,
        },
      });

      if (request.type === "RETRY") {
        // Delete existing submission so student can retry
        await tx.worksheetSubmission.deleteMany({
          where: {
            tenantId,
            studentId: request.studentId,
            worksheetId: request.currentWorksheetId,
          },
        });

        // Ensure assignment is active
        await tx.worksheetAssignment.upsert({
          where: {
            worksheetId_studentId: {
              worksheetId: request.currentWorksheetId,
              studentId: request.studentId,
            },
          },
          update: { isActive: true, unassignedAt: null, assignedAt: now, createdByUserId: reviewedByUserId },
          create: {
            tenantId,
            worksheetId: request.currentWorksheetId,
            studentId: request.studentId,
            createdByUserId: reviewedByUserId,
            isActive: true,
            assignedAt: now,
          },
        });
      } else if (request.type === "SWAP") {
        // Deactivate current worksheet assignment
        await tx.worksheetAssignment.updateMany({
          where: {
            tenantId,
            studentId: request.studentId,
            worksheetId: request.currentWorksheetId,
            isActive: true,
          },
          data: { isActive: false, unassignedAt: now },
        });

        // Activate new worksheet assignment
        await tx.worksheetAssignment.upsert({
          where: {
            worksheetId_studentId: {
              worksheetId: request.newWorksheetId,
              studentId: request.studentId,
            },
          },
          update: { isActive: true, unassignedAt: null, assignedAt: now, createdByUserId: reviewedByUserId },
          create: {
            tenantId,
            worksheetId: request.newWorksheetId,
            studentId: request.studentId,
            createdByUserId: reviewedByUserId,
            isActive: true,
            assignedAt: now,
          },
        });
      }

      return { success: true };
    });

    return { data: { requestId, status: "APPROVED", ...result } };
  }

  // REJECTED
  await prisma.worksheetReassignmentRequest.update({
    where: { id: requestId },
    data: {
      status: "REJECTED",
      reviewedByUserId,
      reviewReason,
      reviewedAt: now,
    },
  });

  return { data: { requestId, status: "REJECTED" } };
  } catch (error) {
    if (!isMissingReassignmentSchemaError(error)) {
      throw error;
    }

    return buildReassignmentUnavailableResult();
  }
}

/**
 * Cancel a pending request (by the student who created it).
 */
async function cancelReassignmentRequest({ tenantId, requestId, userId }) {
  try {
  const request = await prisma.worksheetReassignmentRequest.findFirst({
    where: { id: requestId, tenantId, status: "PENDING", requestedByUserId: userId },
  });
  if (!request) {
    return { error: "Request not found or cannot be cancelled", code: "REQUEST_NOT_FOUND" };
  }

  await prisma.worksheetReassignmentRequest.update({
    where: { id: requestId },
    data: { status: "CANCELLED" },
  });

  return { data: { requestId, status: "CANCELLED" } };
  } catch (error) {
    if (!isMissingReassignmentSchemaError(error)) {
      throw error;
    }

    return buildReassignmentUnavailableResult();
  }
}

/**
 * Direct teacher/center reassign: creates an auto-approved request record for audit trail.
 */
async function directReassign({
  tenantId,
  studentId,
  currentWorksheetId,
  type,
  newWorksheetId,
  reason,
  performedByUserId,
}) {
  try {
  // Validate submission exists
  const submission = await prisma.worksheetSubmission.findFirst({
    where: { tenantId, studentId, worksheetId: currentWorksheetId, finalSubmittedAt: { not: null } },
    select: {
      id: true,
      score: true,
      correctCount: true,
      totalQuestions: true,
      completionTimeSeconds: true,
      finalSubmittedAt: true,
      status: true
    },
  });
  if (!submission) {
    return { error: "Student has not submitted this worksheet", code: "NO_SUBMISSION" };
  }

  if (type === "SWAP" && !newWorksheetId) {
    return { error: "New worksheet ID is required for swap", code: "SWAP_WORKSHEET_REQUIRED" };
  }

  const now = new Date();
  const archivedResultSnapshot = buildArchivedResultSnapshot(submission);

  const result = await prisma.$transaction(async (tx) => {
    // Create auto-approved request record
    const request = await tx.worksheetReassignmentRequest.create({
      data: {
        tenantId,
        studentId,
        currentWorksheetId,
        type: type || "RETRY",
        newWorksheetId: type === "SWAP" ? newWorksheetId : null,
        reason,
        status: "APPROVED",
        requestedByUserId: performedByUserId,
        reviewedByUserId: performedByUserId,
        reviewReason: "Direct reassignment by teacher/center",
        archivedResultSnapshot,
        reviewedAt: now,
      },
    });

    if (type === "RETRY" || !type) {
      // Delete submission for retry
      await tx.worksheetSubmission.deleteMany({
        where: { tenantId, studentId, worksheetId: currentWorksheetId },
      });

      // Ensure assignment active
      await tx.worksheetAssignment.upsert({
        where: { worksheetId_studentId: { worksheetId: currentWorksheetId, studentId } },
        update: { isActive: true, unassignedAt: null, assignedAt: now, createdByUserId: performedByUserId },
        create: { tenantId, worksheetId: currentWorksheetId, studentId, createdByUserId: performedByUserId, isActive: true, assignedAt: now },
      });
    } else if (type === "SWAP") {
      // Deactivate current
      await tx.worksheetAssignment.updateMany({
        where: { tenantId, studentId, worksheetId: currentWorksheetId, isActive: true },
        data: { isActive: false, unassignedAt: now },
      });

      // Activate new
      await tx.worksheetAssignment.upsert({
        where: { worksheetId_studentId: { worksheetId: newWorksheetId, studentId } },
        update: { isActive: true, unassignedAt: null, assignedAt: now, createdByUserId: performedByUserId },
        create: { tenantId, worksheetId: newWorksheetId, studentId, createdByUserId: performedByUserId, isActive: true, assignedAt: now },
      });
    }

    return { requestId: request.id };
  });

  return { data: result };
  } catch (error) {
    if (!isMissingReassignmentSchemaError(error)) {
      throw error;
    }

    return buildReassignmentUnavailableResult();
  }
}

/**
 * Assign one worksheet to multiple students (bulk).
 */
async function bulkAssignWorksheetToStudents({
  tenantId,
  worksheetId,
  studentIds,
  dueDate,
  createdByUserId,
}) {
  const worksheet = await prisma.worksheet.findFirst({
    where: { id: worksheetId, tenantId },
    select: { id: true },
  });
  if (!worksheet) {
    return { error: "Worksheet not found", code: "WORKSHEET_NOT_FOUND" };
  }

  const now = new Date();
  const results = [];

  await prisma.$transaction(async (tx) => {
    for (const studentId of studentIds) {
      try {
        await tx.worksheetAssignment.upsert({
          where: { worksheetId_studentId: { worksheetId, studentId } },
          update: {
            tenantId,
            isActive: true,
            unassignedAt: null,
            assignedAt: now,
            createdByUserId,
            dueDate: dueDate || null,
          },
          create: {
            tenantId,
            worksheetId,
            studentId,
            createdByUserId,
            isActive: true,
            assignedAt: now,
            dueDate: dueDate || null,
          },
        });
        results.push({ studentId, success: true });
      } catch (err) {
        results.push({ studentId, success: false, error: err.message });
      }
    }
  });

  return { data: { worksheetId, results } };
}

export {
  createReassignmentRequest,
  listReassignmentRequests,
  reviewReassignmentRequest,
  cancelReassignmentRequest,
  directReassign,
  bulkAssignWorksheetToStudents,
};
