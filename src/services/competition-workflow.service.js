import { prisma } from "../lib/prisma.js";

const stageFlowByRole = {
  CENTER: { from: "CENTER_REVIEW", to: "FRANCHISE_REVIEW" },
  FRANCHISE: { from: "FRANCHISE_REVIEW", to: "BP_REVIEW" },
  BP: { from: "BP_REVIEW", to: "SUPERADMIN_APPROVAL" },
  SUPERADMIN: { from: "SUPERADMIN_APPROVAL", to: "APPROVED" }
};

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function normalizeReason(reason) {
  if (reason === null || reason === undefined) {
    return "";
  }

  return String(reason).trim();
}

function assertNotRejected(competition) {
  if (competition.workflowStage === "REJECTED" || competition.rejectedAt) {
    throw createHttpError(409, "Competition is rejected and cannot transition", "WORKFLOW_REJECTED");
  }
}

async function transitionForward({ tenantId, competitionId, actorUserId, actorRole }) {
  const roleFlow = stageFlowByRole[actorRole];

  if (!roleFlow) {
    throw createHttpError(403, "Role cannot forward competition workflow", "WORKFLOW_ROLE_FORBIDDEN");
  }

  return prisma.$transaction(async (tx) => {
    const competition = await tx.competition.findFirst({
      where: {
        id: competitionId,
        tenantId
      },
      select: {
        id: true,
        title: true,
        workflowStage: true,
        status: true,
        hierarchyNodeId: true,
        rejectedAt: true
      }
    });

    if (!competition) {
      throw createHttpError(404, "Competition not found", "COMPETITION_NOT_FOUND");
    }

    assertNotRejected(competition);

    if (competition.workflowStage !== roleFlow.from) {
      throw createHttpError(
        409,
        "Competition is not in a forwardable stage for your role",
        "WORKFLOW_STAGE_CONFLICT"
      );
    }

    const updated = await tx.competition.update({
      where: { id: competitionId },
      data: {
        workflowStage: roleFlow.to,
        status: roleFlow.to === "APPROVED" ? "SCHEDULED" : competition.status
      }
    });

    await tx.competitionStageTransition.create({
      data: {
        tenantId,
        competitionId,
        fromStage: competition.workflowStage,
        toStage: roleFlow.to,
        action: "FORWARD",
        reason: null,
        actedByUserId: actorUserId
      }
    });

    return {
      competition: updated,
      fromStage: competition.workflowStage,
      toStage: roleFlow.to,
      action: "FORWARD"
    };
  });
}

async function transitionReject({ tenantId, competitionId, actorUserId, actorRole, reason }) {
  const roleFlow = stageFlowByRole[actorRole];

  if (!roleFlow) {
    throw createHttpError(403, "Role cannot reject competition workflow", "WORKFLOW_ROLE_FORBIDDEN");
  }

  const normalizedReason = normalizeReason(reason);
  if (!normalizedReason) {
    throw createHttpError(400, "Rejection reason is required", "REJECT_REASON_REQUIRED");
  }

  return prisma.$transaction(async (tx) => {
    const competition = await tx.competition.findFirst({
      where: {
        id: competitionId,
        tenantId
      },
      select: {
        id: true,
        workflowStage: true,
        status: true,
        rejectedAt: true
      }
    });

    if (!competition) {
      throw createHttpError(404, "Competition not found", "COMPETITION_NOT_FOUND");
    }

    assertNotRejected(competition);

    if (competition.workflowStage !== roleFlow.from) {
      throw createHttpError(
        409,
        "Competition is not in a rejectable stage for your role",
        "WORKFLOW_STAGE_CONFLICT"
      );
    }

    const now = new Date();

    const updated = await tx.competition.update({
      where: { id: competitionId },
      data: {
        workflowStage: "REJECTED",
        rejectedAt: now,
        rejectedByUserId: actorUserId
      }
    });

    await tx.competitionStageTransition.create({
      data: {
        tenantId,
        competitionId,
        fromStage: competition.workflowStage,
        toStage: "REJECTED",
        action: "REJECT",
        reason: normalizedReason,
        actedByUserId: actorUserId
      }
    });

    return {
      competition: updated,
      fromStage: competition.workflowStage,
      toStage: "REJECTED",
      action: "REJECT"
    };
  });
}

function getNextRoleByWorkflowStage(workflowStage) {
  switch (workflowStage) {
    case "FRANCHISE_REVIEW":
      return "FRANCHISE";
    case "BP_REVIEW":
      return "BP";
    case "SUPERADMIN_APPROVAL":
      return "SUPERADMIN";
    case "APPROVED":
      return "SUPERADMIN";
    default:
      return null;
  }
}

export { transitionForward, transitionReject, getNextRoleByWorkflowStage };