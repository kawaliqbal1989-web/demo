import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { recordAudit } from "../utils/audit.js";
import { getCompetitionLeaderboard } from "../services/competition-leaderboard.service.js";
import { createBulkNotification } from "../services/notification.service.js";
import { assertCanModifyOperational } from "../services/ownership-guard.service.js";
import {
  getNextRoleByWorkflowStage,
  transitionForward,
  transitionReject
} from "../services/competition-workflow.service.js";
import { parsePagination } from "../utils/pagination.js";
import { recordCompetitionTransaction } from "../services/financial-ledger.service.js";
import { toCsv } from "../utils/csv.js";

function isCompetitionResultStatusSchemaMissing(error) {
  const msg = String(error?.message || "").toLowerCase();
  return error?.code === "P2022" || msg.includes("resultstatus") || msg.includes("resultpublishedat");
}

function buildCompetitionSelect({ includeResultMeta = true, includeStageTransitions = false } = {}) {
  const select = {
    id: true,
    tenantId: true,
    title: true,
    description: true,
    status: true,
    workflowStage: true,
    rejectedAt: true,
    rejectedByUserId: true,
    startsAt: true,
    endsAt: true,
    hierarchyNodeId: true,
    levelId: true,
    createdByUserId: true,
    createdAt: true,
    updatedAt: true,
    hierarchyNode: { select: { id: true, name: true, type: true, code: true } },
    level: { select: { id: true, name: true, rank: true } },
    createdBy: { select: { id: true, email: true, role: true } },
    enrollments: { select: { studentId: true, rank: true, totalScore: true, enrolledAt: true } },
    worksheets: { select: { worksheetId: true, assignedAt: true } }
  };

  if (includeResultMeta) {
    select.resultStatus = true;
    select.resultPublishedAt = true;
  }

  if (includeStageTransitions) {
    select.stageTransitions = {
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        fromStage: true,
        toStage: true,
        action: true,
        reason: true,
        createdAt: true,
        actedByUser: { select: { id: true, email: true, role: true } }
      }
    };
  }

  return select;
}

function applyLegacyCompetitionResultMeta(item) {
  if (!item) return item;
  return {
    ...item,
    resultStatus: item.resultStatus || "DRAFT",
    resultPublishedAt: item.resultPublishedAt || null,
    legacyResultStatus: true
  };
}

async function findCompetitionsWithResultFallback({ where, orderBy, skip, take }) {
  try {
    return {
      items: await prisma.competition.findMany({
        where,
        orderBy,
        skip,
        take,
        select: buildCompetitionSelect({ includeResultMeta: true })
      }),
      legacyResultStatus: false
    };
  } catch (error) {
    if (!isCompetitionResultStatusSchemaMissing(error)) {
      throw error;
    }

    const items = await prisma.competition.findMany({
      where,
      orderBy,
      skip,
      take,
      select: buildCompetitionSelect({ includeResultMeta: false })
    });

    return {
      items: items.map(applyLegacyCompetitionResultMeta),
      legacyResultStatus: true
    };
  }
}

async function findCompetitionDetailWithResultFallback(where) {
  try {
    return await prisma.competition.findFirst({
      where,
      select: buildCompetitionSelect({ includeResultMeta: true, includeStageTransitions: true })
    });
  } catch (error) {
    if (!isCompetitionResultStatusSchemaMissing(error)) {
      throw error;
    }

    const item = await prisma.competition.findFirst({
      where,
      select: buildCompetitionSelect({ includeResultMeta: false, includeStageTransitions: true })
    });

    return applyLegacyCompetitionResultMeta(item);
  }
}

async function getCompetitionResultMeta({ competitionId, tenantId }) {
  try {
    const row = await prisma.competition.findFirst({
      where: { id: competitionId, tenantId },
      select: { id: true, title: true, resultStatus: true, resultPublishedAt: true }
    });
    if (!row) return null;
    return { ...row, legacyResultStatus: false };
  } catch (error) {
    if (!isCompetitionResultStatusSchemaMissing(error)) {
      throw error;
    }

    const legacy = await prisma.competition.findFirst({
      where: { id: competitionId, tenantId },
      select: { id: true, title: true }
    });
    if (!legacy) return null;

    return {
      ...legacy,
      resultStatus: "DRAFT",
      resultPublishedAt: null,
      legacyResultStatus: true
    };
  }
}

const listCompetitions = asyncHandler(async (req, res) => {
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);

  const where = {
    tenantId: req.auth.tenantId
  };

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId) {
    where.hierarchyNodeId = req.auth.hierarchyNodeId;
  }

  const [{ items, legacyResultStatus }, total] = await Promise.all([
    findCompetitionsWithResultFallback({ where, orderBy, skip, take }),
    prisma.competition.count({ where })
  ]);

  res.setHeader("X-Pagination-Limit", String(limit));
  res.setHeader("X-Pagination-Offset", String(offset));
  res.setHeader("X-Pagination-Total", String(total));
  res.setHeader("X-Legacy-Result-Status", legacyResultStatus ? "true" : "false");

  return res.apiSuccess("Competitions fetched", items);
});

const getCompetitionDetail = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const where = {
    id,
    tenantId: req.auth.tenantId
  };

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId) {
    where.hierarchyNodeId = req.auth.hierarchyNodeId;
  }

  const item = await findCompetitionDetailWithResultFallback(where);

  if (!item) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  return res.apiSuccess("Competition fetched", item);
});

const createCompetition = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const {
    title,
    description,
    startsAt,
    endsAt,
    hierarchyNodeId,
    levelId,
  } = req.body;

  const trimmedTitle = String(title || "").trim();
  if (!trimmedTitle || trimmedTitle.length > 200) {
    return res.apiError(400, "title is required (max 200 chars)", "VALIDATION_ERROR");
  }
  if (description && String(description).length > 2000) {
    return res.apiError(400, "description must be at most 2000 chars", "VALIDATION_ERROR");
  }

  const parsedStart = new Date(startsAt);
  const parsedEnd = new Date(endsAt);
  if (!startsAt || !endsAt || isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
    return res.apiError(400, "startsAt and endsAt must be valid dates", "VALIDATION_ERROR");
  }
  if (parsedEnd <= parsedStart) {
    return res.apiError(400, "endsAt must be after startsAt", "VALIDATION_ERROR");
  }

  if (!levelId || !String(levelId).trim()) {
    return res.apiError(400, "levelId is required", "VALIDATION_ERROR");
  }

  const levelExists = await prisma.level.findUnique({ where: { id: String(levelId).trim() }, select: { id: true } });
  if (!levelExists) {
    return res.apiError(400, "Level not found", "LEVEL_NOT_FOUND");
  }

  const initialStageByRole = {
    CENTER: "CENTER_REVIEW",
    FRANCHISE: "FRANCHISE_REVIEW",
    BP: "BP_REVIEW",
    SUPERADMIN: "SUPERADMIN_APPROVAL"
  };

  const workflowStage = initialStageByRole[req.auth.role] || "CENTER_REVIEW";
  const resolvedHierarchyNodeId = hierarchyNodeId || req.auth.hierarchyNodeId;

  if (!resolvedHierarchyNodeId) {
    return res.apiError(400, "hierarchyNodeId is required", "HIERARCHY_NODE_REQUIRED");
  }

  const created = await prisma.competition.create({
    data: {
      tenantId: req.auth.tenantId,
      title: trimmedTitle,
      description: description ? String(description).trim() : null,
      status: "DRAFT",
      workflowStage,
      startsAt: parsedStart,
      endsAt: parsedEnd,
      hierarchyNodeId: resolvedHierarchyNodeId,
      levelId: String(levelId).trim(),
      createdByUserId: req.auth.userId
    }
  });

  res.locals.entityId = created.id;
  return res.apiSuccess("Competition created", created, 201);
});

const forwardCompetitionRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await transitionForward({
    tenantId: req.auth.tenantId,
    competitionId: id,
    actorUserId: req.auth.userId,
    actorRole: req.auth.role
  });

  const updated = result.competition;

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_WORKFLOW_TRANSITION",
    entityType: "COMPETITION",
    entityId: id,
    metadata: {
      from: result.fromStage,
      to: result.toStage,
      action: result.action
    }
  });

  void (async () => {
    try {
      const nextRole = getNextRoleByWorkflowStage(updated.workflowStage);

      if (!nextRole) {
        return;
      }

      const recipients = await prisma.authUser.findMany({
        where: {
          tenantId: req.auth.tenantId,
          isActive: true,
          role: nextRole,
          ...(nextRole === "SUPERADMIN" ? {} : { hierarchyNodeId: updated.hierarchyNodeId })
        },
        select: {
          id: true
        },
        take: 500
      });

      await createBulkNotification(
        recipients.map((recipient) => ({
          tenantId: req.auth.tenantId,
          recipientUserId: recipient.id,
          type: "COMPETITION_STAGE_UPDATE",
          title: "Competition Stage Updated",
          message: `Competition ${updated.title} moved to ${result.toStage}`,
          entityType: "COMPETITION",
          entityId: updated.id
        }))
      );
    } catch {
      return;
    }
  })();

  return res.apiSuccess("Competition request forwarded", updated);
});

const rejectCompetitionRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const result = await transitionReject({
    tenantId: req.auth.tenantId,
    competitionId: id,
    actorUserId: req.auth.userId,
    actorRole: req.auth.role,
    reason
  });

  const updated = result.competition;

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_WORKFLOW_REJECT",
    entityType: "COMPETITION",
    entityId: id,
    metadata: {
      from: result.fromStage,
      to: result.toStage,
      action: result.action
    }
  });

  return res.apiSuccess("Competition request rejected", updated);
});

const getLeaderboard = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit } = req.query;

  const competition = await getCompetitionResultMeta({ competitionId: id, tenantId: req.auth.tenantId });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (!competition.legacyResultStatus && req.auth.role !== "SUPERADMIN" && competition.resultStatus !== "PUBLISHED") {
    return res.apiError(403, "Results are not published", "RESULTS_NOT_PUBLISHED");
  }

  const leaderboard = await getCompetitionLeaderboard({
    competitionId: id,
    tenantId: req.auth.tenantId,
    limit,
    skipApprovalCheck: req.auth.role === "SUPERADMIN"
  });

  return res.apiSuccess("Competition leaderboard fetched", {
    ...leaderboard,
    status: competition.resultStatus,
    resultPublishedAt: competition.resultPublishedAt,
    legacyResultStatus: competition.legacyResultStatus
  });
});

const getCompetitionResults = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit } = req.query;

  const competition = await getCompetitionResultMeta({ competitionId: id, tenantId: req.auth.tenantId });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (!competition.legacyResultStatus && req.auth.role !== "SUPERADMIN" && competition.resultStatus !== "PUBLISHED") {
    return res.apiError(403, "Results are not published", "RESULTS_NOT_PUBLISHED");
  }

  const leaderboard = await getCompetitionLeaderboard({
    competitionId: id,
    tenantId: req.auth.tenantId,
    limit,
    skipApprovalCheck: req.auth.role === "SUPERADMIN"
  });

  return res.apiSuccess("Competition results", {
    competitionId: competition.id,
    competitionTitle: competition.title,
    status: competition.resultStatus,
    resultPublishedAt: competition.resultPublishedAt,
    legacyResultStatus: competition.legacyResultStatus,
    totalParticipants: leaderboard.totalParticipants,
    leaderboard: leaderboard.leaderboard
  });
});

const publishCompetitionResults = asyncHandler(async (req, res) => {
  const competitionId = String(req.params.id);

  const competition = await getCompetitionResultMeta({ competitionId, tenantId: req.auth.tenantId });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (competition.legacyResultStatus) {
    return res.apiError(409, "Apply competition result status migration first", "COMPETITION_RESULT_STATUS_MIGRATION_REQUIRED");
  }

  const updated = await prisma.competition.update({
    where: { id: competition.id },
    data: {
      resultStatus: "PUBLISHED",
      resultPublishedAt: new Date()
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_RESULTS_PUBLISH",
    entityType: "COMPETITION",
    entityId: competitionId
  });

  return res.apiSuccess("Competition results published", updated);
});

const unpublishCompetitionResults = asyncHandler(async (req, res) => {
  const competitionId = String(req.params.id);

  const competition = await getCompetitionResultMeta({ competitionId, tenantId: req.auth.tenantId });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (competition.legacyResultStatus) {
    return res.apiError(409, "Apply competition result status migration first", "COMPETITION_RESULT_STATUS_MIGRATION_REQUIRED");
  }

  const updated = await prisma.competition.update({
    where: { id: competition.id },
    data: {
      resultStatus: "LOCKED",
      resultPublishedAt: null
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_RESULTS_UNPUBLISH",
    entityType: "COMPETITION",
    entityId: competitionId
  });

  return res.apiSuccess("Competition results unpublished", updated);
});

const exportCompetitionResultsCsv = asyncHandler(async (req, res) => {
  const { id: competitionId } = req.params;

  const competition = await getCompetitionResultMeta({ competitionId, tenantId: req.auth.tenantId });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (!competition.legacyResultStatus && req.auth.role !== "SUPERADMIN" && competition.resultStatus !== "PUBLISHED") {
    return res.apiError(403, "Results are not published", "RESULTS_NOT_PUBLISHED");
  }

  const enrollments = await prisma.competitionEnrollment.findMany({
    where: {
      tenantId: req.auth.tenantId,
      competitionId
    },
    orderBy: [{ rank: "asc" }, { enrolledAt: "asc" }],
    select: {
      enrolledAt: true,
      rank: true,
      totalScore: true,
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true
        }
      }
    },
    take: 10000
  });

  const csv = toCsv({
    headers: [
      "competitionId",
      "competitionTitle",
      "resultStatus",
      "studentId",
      "admissionNo",
      "studentName",
      "rank",
      "totalScore",
      "enrolledAt"
    ],
    rows: enrollments.map((e) => [
      competition.id,
      competition.title,
      competition.resultStatus,
      e.student.id,
      e.student.admissionNo,
      `${e.student.firstName} ${e.student.lastName}`,
      e.rank ?? "",
      e.totalScore !== null && e.totalScore !== undefined ? String(e.totalScore) : "",
      e.enrolledAt?.toISOString?.() || String(e.enrolledAt)
    ])
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=competition_${competition.id}_results.csv`
  );
  return res.status(200).send(csv);
});

const enrollStudent = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const { id: competitionId } = req.params;
  const { studentId, competitionFeeAmount } = req.body;

  if (!studentId) {
    return res.apiError(400, "studentId is required", "STUDENT_ID_REQUIRED");
  }

  const created = await prisma.$transaction(async (tx) => {
    const competition = await tx.competition.findFirst({
      where: {
        id: competitionId,
        tenantId: req.auth.tenantId
      },
      select: {
        id: true
      }
    });

    if (!competition) {
      const error = new Error("Competition not found");
      error.statusCode = 404;
      error.errorCode = "COMPETITION_NOT_FOUND";
      throw error;
    }

    const student = await tx.student.findFirst({
      where: {
        id: studentId,
        tenantId: req.auth.tenantId
      },
      select: {
        id: true
      }
    });

    if (!student) {
      const error = new Error("Student not found");
      error.statusCode = 404;
      error.errorCode = "STUDENT_NOT_FOUND";
      throw error;
    }

    const existing = await tx.competitionEnrollment.findFirst({
      where: {
        competitionId,
        studentId,
        tenantId: req.auth.tenantId,
        isActive: true
      },
      select: {
        competitionId: true
      }
    });

    if (existing) {
      const error = new Error("Duplicate active enrollment is not allowed");
      error.statusCode = 409;
      error.errorCode = "DUPLICATE_ACTIVE_ENROLLMENT";
      throw error;
    }

    const enrollment = await tx.competitionEnrollment.create({
      data: {
        competitionId,
        studentId,
        tenantId: req.auth.tenantId,
        isActive: true
      }
    });

    await recordCompetitionTransaction({
      tx,
      tenantId: req.auth.tenantId,
      competitionId,
      studentId,
      actorUserId: req.auth.userId,
      grossAmount: competitionFeeAmount ?? 0
    });

    return enrollment;
  });

  return res.apiSuccess("Student enrolled", created, 201);
});

export {
  listCompetitions,
  getCompetitionDetail,
  createCompetition,
  forwardCompetitionRequest,
  rejectCompetitionRequest,
  getLeaderboard,
  getCompetitionResults,
  publishCompetitionResults,
  unpublishCompetitionResults,
  exportCompetitionResultsCsv,
  enrollStudent
};
