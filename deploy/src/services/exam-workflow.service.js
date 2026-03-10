import { prisma } from "../lib/prisma.js";

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function normalizeRemark(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

const forwardFlowByRole = {
  CENTER: { from: "DRAFT", to: "SUBMITTED_TO_FRANCHISE" },
  FRANCHISE: { from: "SUBMITTED_TO_FRANCHISE", to: "SUBMITTED_TO_BUSINESS_PARTNER" },
  BP: { from: "SUBMITTED_TO_BUSINESS_PARTNER", to: "SUBMITTED_TO_SUPERADMIN" }
};

async function forwardEnrollmentList({ tenantId, listId, actorUserId, actorRole }) {
  const flow = forwardFlowByRole[actorRole];
  if (!flow) {
    throw createHttpError(403, "Role cannot forward exam enrollment list", "WORKFLOW_ROLE_FORBIDDEN");
  }

  return prisma.$transaction(async (tx) => {
    const list = await tx.examEnrollmentList.findFirst({
      where: { id: listId, tenantId },
      select: { id: true, type: true, status: true, locked: true, hierarchyNodeId: true }
    });

    if (!list) {
      throw createHttpError(404, "Enrollment list not found", "EXAM_LIST_NOT_FOUND");
    }

    if (list.type !== "CENTER_COMBINED") {
      throw createHttpError(409, "Only combined center lists can be forwarded", "EXAM_LIST_TYPE_CONFLICT");
    }

    if (list.status !== flow.from) {
      throw createHttpError(409, "List is not in a forwardable stage for your role", "WORKFLOW_STAGE_CONFLICT");
    }

    const now = new Date();

    const updated = await tx.examEnrollmentList.update({
      where: { id: list.id },
      data: {
        status: flow.to,
        locked: true,
        submittedAt: list.status === "DRAFT" ? now : undefined,
        forwardedAt: now,
        rejectedAt: null,
        rejectedByUserId: null,
        rejectedRemark: null
      }
    });

    return { list: updated, fromStatus: flow.from, toStatus: flow.to };
  });
}

async function rejectEnrollmentList({ tenantId, listId, actorUserId, actorRole, remark }) {
  if (!["CENTER", "FRANCHISE", "BP", "SUPERADMIN"].includes(actorRole)) {
    throw createHttpError(403, "Role cannot reject exam enrollment list", "WORKFLOW_ROLE_FORBIDDEN");
  }

  const reason = normalizeRemark(remark);
  if (!reason) {
    throw createHttpError(400, "Rejection remark is required", "REJECT_REMARK_REQUIRED");
  }

  return prisma.$transaction(async (tx) => {
    const list = await tx.examEnrollmentList.findFirst({
      where: { id: listId, tenantId },
      select: { id: true, type: true, status: true }
    });

    if (!list) {
      throw createHttpError(404, "Enrollment list not found", "EXAM_LIST_NOT_FOUND");
    }

    const allowedStatuses = new Set([
      "SUBMITTED_TO_CENTER",
      "SUBMITTED_TO_FRANCHISE",
      "SUBMITTED_TO_BUSINESS_PARTNER",
      "SUBMITTED_TO_SUPERADMIN"
    ]);

    if (!allowedStatuses.has(list.status)) {
      throw createHttpError(409, "List is not in a rejectable stage", "WORKFLOW_STAGE_CONFLICT");
    }

    const now = new Date();

    const updated = await tx.examEnrollmentList.update({
      where: { id: list.id },
      data: {
        status: "REJECTED",
        locked: false,
        rejectedAt: now,
        rejectedByUserId: actorUserId,
        rejectedRemark: reason
      }
    });

    return { list: updated, toStatus: "REJECTED" };
  });
}

async function approveEnrollmentList({ tenantId, listId, actorUserId, actorRole }) {
  if (actorRole !== "SUPERADMIN") {
    throw createHttpError(403, "Only superadmin can approve", "ROLE_FORBIDDEN");
  }

  return prisma.$transaction(async (tx) => {
    const list = await tx.examEnrollmentList.findFirst({
      where: { id: listId, tenantId },
      select: { id: true, type: true, status: true }
    });

    if (!list) {
      throw createHttpError(404, "Enrollment list not found", "EXAM_LIST_NOT_FOUND");
    }

    if (list.type !== "CENTER_COMBINED") {
      throw createHttpError(409, "Only combined center lists can be approved", "EXAM_LIST_TYPE_CONFLICT");
    }

    if (list.status !== "SUBMITTED_TO_SUPERADMIN") {
      throw createHttpError(409, "List is not ready for superadmin approval", "WORKFLOW_STAGE_CONFLICT");
    }

    const now = new Date();

    const updated = await tx.examEnrollmentList.update({
      where: { id: list.id },
      data: {
        status: "APPROVED",
        locked: true,
        approvedAt: now,
        rejectedAt: null,
        rejectedByUserId: null,
        rejectedRemark: null
      }
    });

    return { list: updated, toStatus: "APPROVED" };
  });
}

export { forwardEnrollmentList, rejectEnrollmentList, approveEnrollmentList };
