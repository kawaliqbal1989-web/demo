import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { submitWorksheet } from "../services/worksheet-submission.service.js";
import { createBulkNotification } from "../services/notification.service.js";
import { assertCanModifyAcademic } from "../services/ownership-guard.service.js";
import { parsePagination } from "../utils/pagination.js";
import { recordAudit } from "../utils/audit.js";
import { resolveActorLevelCap, resolveAllowedLevelIdsByRank } from "../services/worksheet-access-scope.service.js";

async function hierarchyContainsNode(targetNodeId, actorNodeId, tenantId) {
  if (!targetNodeId || !actorNodeId) {
    return false;
  }

  if (targetNodeId === actorNodeId) {
    return true;
  }

  let cursorId = targetNodeId;

  while (cursorId) {
    const node = await prisma.hierarchyNode.findFirst({
      where: {
        id: cursorId,
        tenantId
      },
      select: {
        id: true,
        parentId: true
      }
    });

    if (!node) {
      return false;
    }

    if (node.parentId === actorNodeId) {
      return true;
    }

    cursorId = node.parentId;
  }

  return false;
}

const listWorksheets = asyncHandler(async (req, res) => {
  const { take, skip, orderBy } = parsePagination(req.query);
  const levelId = req.query.levelId ? String(req.query.levelId) : null;
  const competitionCourseLevelId = req.query.competitionCourseLevelId ? String(req.query.competitionCourseLevelId) : null;
  const competitionCoursePaperId = req.query.competitionCoursePaperId ? String(req.query.competitionCoursePaperId) : null;
  const published = req.query.published === undefined ? null : String(req.query.published).trim().toLowerCase();
  const difficulty = req.query.difficulty ? String(req.query.difficulty).trim().toUpperCase() : null;
  const q = req.query.q ? String(req.query.q).trim() : null;
  const examSelectionEligible = ["1", "true", "yes"].includes(String(req.query.examSelectionEligible || "").trim().toLowerCase());

  const where = {
    tenantId: req.auth.tenantId,
    ...(levelId ? { levelId } : {}),
    ...(competitionCourseLevelId ? { competitionCourseLevelId } : {})
  };

  if (competitionCoursePaperId) {
    const paper = await prisma.competitionCoursePaper.findFirst({
      where: { id: competitionCoursePaperId, tenantId: req.auth.tenantId },
      select: { id: true, competitionCourseLevelId: true }
    });
    if (!paper) {
      return res.apiError(404, "Competition course paper not found", "COMPETITION_COURSE_PAPER_NOT_FOUND");
    }

    if (competitionCourseLevelId && paper.competitionCourseLevelId !== competitionCourseLevelId) {
      return res.apiError(400, "competitionCourseLevelId does not match competitionCoursePaperId", "VALIDATION_ERROR");
    }

    where.competitionCoursePaperId = paper.id;
  }

  if (competitionCourseLevelId) {
    const level = await prisma.competitionCourseLevel.findFirst({
      where: { id: competitionCourseLevelId, tenantId: req.auth.tenantId },
      select: { id: true }
    });
    if (!level) {
      return res.apiError(404, "Competition course level not found", "COMPETITION_COURSE_LEVEL_NOT_FOUND");
    }
  }

  const maxLevelRank = competitionCourseLevelId
    ? null
    : await resolveActorLevelCap({
        tenantId: req.auth.tenantId,
        auth: req.auth
      });

  if (Number.isFinite(maxLevelRank)) {
    const allowedLevelIds = await resolveAllowedLevelIdsByRank({
      tenantId: req.auth.tenantId,
      maxRank: maxLevelRank
    });

    if (!allowedLevelIds.length) {
      return res.apiSuccess("Worksheets fetched", []);
    }

    if (levelId && !allowedLevelIds.includes(levelId)) {
      return res.apiError(403, "Level visibility denied", "LEVEL_SCOPE_DENIED");
    }

    where.levelId = levelId
      ? levelId
      : { in: allowedLevelIds };
  }

  if (examSelectionEligible) {
    where.isPublished = true;
    where.examCycleId = null;
  }

  if (!examSelectionEligible && published === "true") {
    where.isPublished = true;
  }
  if (!examSelectionEligible && published === "false") {
    where.isPublished = false;
  }

  if (["EASY", "MEDIUM", "HARD"].includes(difficulty)) {
    where.difficulty = difficulty;
  }

  if (q) {
    where.OR = [
      { title: { contains: q } },
      { description: { contains: q } }
    ];
  }

  let data;
  try {
    data = await prisma.worksheet.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        level: { select: { id: true, name: true, rank: true } },
        competitionCourseLevel: {
          select: { id: true, competitionCourseId: true, levelNumber: true, title: true, sortOrder: true, isActive: true }
        },
        competitionCoursePaper: {
          select: { id: true, competitionCourseLevelId: true, code: true, title: true, sortOrder: true, status: true, isActive: true }
        },
        competitionCoursePaperBlueprint: {
          select: { id: true, title: true, version: true, status: true }
        },
        createdBy: { select: { id: true, email: true, role: true } },
        _count: { select: { questions: true, submissions: true } }
      }
    });
  } catch (error) {
    // Local/dev DB can be behind current schema; retry with a reduced scalar projection.
    if (error?.code !== "P2021" && error?.code !== "P2022") {
      throw error;
    }

    data = await prisma.worksheet.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        tenantId: true,
        title: true,
        description: true,
        difficulty: true,
        levelId: true,
        competitionCourseLevelId: true,
        createdByUserId: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
        level: { select: { id: true, name: true, rank: true } },
        competitionCourseLevel: {
          select: { id: true, competitionCourseId: true, levelNumber: true, title: true, sortOrder: true, isActive: true }
        },
        competitionCoursePaper: {
          select: { id: true, competitionCourseLevelId: true, code: true, title: true, sortOrder: true, status: true, isActive: true }
        },
        competitionCoursePaperBlueprint: {
          select: { id: true, title: true, version: true, status: true }
        },
        createdBy: { select: { id: true, email: true, role: true } },
        _count: { select: { questions: true, submissions: true } }
      }
    });
  }

  return res.apiSuccess(
    "Worksheets fetched",
    data
      .map((w) => ({
        ...w,
        questionCount: w?._count?.questions ?? 0,
        submissionCount: w?._count?.submissions ?? 0,
        _count: undefined
      }))
      .filter((w) => !examSelectionEligible || w.questionCount > 0)
  );
});

const getWorksheet = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const maxLevelRank = await resolveActorLevelCap({
    tenantId: req.auth.tenantId,
    auth: req.auth
  });

  const worksheet = await prisma.worksheet.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId
    },
    include: {
      level: { select: { id: true, name: true, rank: true } },
      competitionCourseLevel: {
        select: { id: true, competitionCourseId: true, levelNumber: true, title: true, sortOrder: true, isActive: true }
      },
      competitionCoursePaper: {
        select: { id: true, competitionCourseLevelId: true, code: true, title: true, sortOrder: true, status: true, isActive: true }
      },
      competitionCoursePaperBlueprint: {
        select: { id: true, title: true, version: true, status: true }
      },
      questions: {
        orderBy: { questionNumber: "asc" },
        include: {
          questionBank: {
            select: {
              id: true,
              prompt: true,
              difficulty: true,
              operands: true,
              operation: true,
              correctAnswer: true
            }
          }
        }
      }
    }
  });

  if (!worksheet) {
    return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
  }

  if (Number.isFinite(maxLevelRank) && worksheet.levelId && Number(worksheet?.level?.rank || 0) > maxLevelRank) {
    return res.apiError(403, "Level visibility denied", "LEVEL_SCOPE_DENIED");
  }

  return res.apiSuccess("Worksheet fetched", worksheet);
});

const updateWorksheet = asyncHandler(async (req, res) => {
  assertCanModifyAcademic(req.auth.role);
  const { id } = req.params;

  const existing = await prisma.worksheet.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true }
  });

  if (!existing) {
    return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
  }

  const data = {};
  if (req.body.title !== undefined) {
    data.title = String(req.body.title);
  }
  if (req.body.description !== undefined) {
    data.description = req.body.description === null ? null : String(req.body.description);
  }
  if (req.body.difficulty !== undefined) {
    data.difficulty = String(req.body.difficulty).trim().toUpperCase();
  }
  let nextIsPublished;
  if (req.body.isPublished !== undefined) {
    nextIsPublished = Boolean(req.body.isPublished);
    data.isPublished = nextIsPublished;
  }
  if (req.body.timeLimitSeconds !== undefined) {
    const timeLimitSeconds = req.body.timeLimitSeconds === null ? null : Number(req.body.timeLimitSeconds);
    if (timeLimitSeconds !== null && (!Number.isInteger(timeLimitSeconds) || timeLimitSeconds < 30 || timeLimitSeconds > 7200)) {
      return res.apiError(400, "timeLimitSeconds must be between 30 and 7200", "VALIDATION_ERROR");
    }
    data.timeLimitSeconds = timeLimitSeconds;
  }

  if (nextIsPublished === true) {
    const count = await prisma.worksheetQuestion.count({
      where: {
        tenantId: req.auth.tenantId,
        worksheetId: existing.id
      }
    });

    if (count <= 0) {
      return res.apiError(409, "Cannot publish worksheet without questions", "WORKSHEET_QUESTIONS_MISSING");
    }
  }

  const updated = await prisma.worksheet.update({
    where: { id: existing.id },
    data
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Worksheet updated", updated);
});

const reorderWorksheetQuestions = asyncHandler(async (req, res) => {
  assertCanModifyAcademic(req.auth.role);
  const { id: worksheetId } = req.params;
  const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map(String) : null;

  if (!orderedIds || orderedIds.length === 0) {
    return res.apiError(400, "orderedIds[] is required", "VALIDATION_ERROR");
  }

  const questions = await prisma.worksheetQuestion.findMany({
    where: { tenantId: req.auth.tenantId, worksheetId },
    select: { id: true }
  });

  const existingIds = new Set(questions.map((q) => q.id));
  const unique = new Set(orderedIds);

  if (unique.size !== orderedIds.length) {
    return res.apiError(400, "orderedIds must be unique", "VALIDATION_ERROR");
  }

  for (const id of orderedIds) {
    if (!existingIds.has(id)) {
      return res.apiError(400, "orderedIds contains invalid question id", "VALIDATION_ERROR");
    }
  }

  if (existingIds.size !== orderedIds.length) {
    return res.apiError(400, "orderedIds must include all worksheet questions", "VALIDATION_ERROR");
  }

  await prisma.$transaction(
    orderedIds.map((id, idx) =>
      prisma.worksheetQuestion.update({
        where: { id },
        data: { questionNumber: idx + 1 }
      })
    )
  );

  res.locals.entityId = worksheetId;
  return res.apiSuccess("Worksheet questions reordered", { worksheetId });
});

const addWorksheetQuestion = asyncHandler(async (req, res) => {
  assertCanModifyAcademic(req.auth.role);
  const { id: worksheetId } = req.params;

  const worksheet = await prisma.worksheet.findFirst({
    where: { id: worksheetId, tenantId: req.auth.tenantId },
    select: { id: true }
  });

  if (!worksheet) {
    return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
  }

  const questionBankId = req.body?.questionBankId ? String(req.body.questionBankId) : null;
  const operands = req.body?.operands && typeof req.body.operands === "object" ? req.body.operands : null;
  const operation = req.body?.operation ? String(req.body.operation).trim() : null;
  const correctAnswer = req.body?.correctAnswer === undefined ? null : Number(req.body.correctAnswer);

  let source = null;
  if (questionBankId) {
    source = await prisma.questionBank.findFirst({
      where: {
        id: questionBankId,
        tenantId: req.auth.tenantId
      },
      select: {
        id: true,
        operands: true,
        operation: true,
        correctAnswer: true
      }
    });

    if (!source) {
      return res.apiError(404, "Question bank entry not found", "QUESTION_NOT_FOUND");
    }
  }

  const finalOperands = source ? source.operands : operands;
  const finalOperation = source ? source.operation : operation;
  const finalCorrect = source ? source.correctAnswer : correctAnswer;

  if (!finalOperands || !finalOperation || !Number.isInteger(finalCorrect)) {
    return res.apiError(400, "operands, operation, correctAnswer are required", "VALIDATION_ERROR");
  }

  const maxQuestion = await prisma.worksheetQuestion.aggregate({
    where: { tenantId: req.auth.tenantId, worksheetId },
    _max: { questionNumber: true }
  });
  const nextNumber = Number(maxQuestion?._max?.questionNumber || 0);

  const created = await prisma.worksheetQuestion.create({
    data: {
      tenantId: req.auth.tenantId,
      worksheetId,
      questionBankId: source ? source.id : null,
      questionNumber: nextNumber + 1,
      operands: finalOperands,
      operation: finalOperation,
      correctAnswer: finalCorrect
    }
  });

  res.locals.entityId = created.id;
  return res.apiSuccess("Worksheet question added", created, 201);
});

const addWorksheetQuestionsBulk = asyncHandler(async (req, res) => {
  assertCanModifyAcademic(req.auth.role);
  const { id: worksheetId } = req.params;
  const questionBankIds = Array.isArray(req.body?.questionBankIds)
    ? req.body.questionBankIds.map((item) => String(item)).filter(Boolean)
    : [];

  if (!questionBankIds.length) {
    return res.apiError(400, "questionBankIds[] is required", "VALIDATION_ERROR");
  }

  const uniqueIds = [...new Set(questionBankIds)];

  const worksheet = await prisma.worksheet.findFirst({
    where: { id: worksheetId, tenantId: req.auth.tenantId },
    select: { id: true }
  });

  if (!worksheet) {
    return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
  }

  const sourceRows = await prisma.questionBank.findMany({
    where: {
      tenantId: req.auth.tenantId,
      id: { in: uniqueIds }
    },
    select: {
      id: true,
      operands: true,
      operation: true,
      correctAnswer: true
    }
  });

  if (sourceRows.length !== uniqueIds.length) {
    return res.apiError(400, "questionBankIds contains invalid ids", "VALIDATION_ERROR");
  }

  const sourceById = new Map(sourceRows.map((row) => [row.id, row]));

  const maxQuestion = await prisma.worksheetQuestion.aggregate({
    where: { tenantId: req.auth.tenantId, worksheetId },
    _max: { questionNumber: true }
  });
  const baseNumber = Number(maxQuestion?._max?.questionNumber || 0);

  const created = await prisma.worksheetQuestion.createMany({
    data: uniqueIds.map((questionBankId, index) => {
      const source = sourceById.get(questionBankId);
      return {
        tenantId: req.auth.tenantId,
        worksheetId,
        questionBankId: source.id,
        questionNumber: baseNumber + index + 1,
        operands: source.operands,
        operation: source.operation,
        correctAnswer: source.correctAnswer
      };
    })
  });

  res.locals.entityId = worksheetId;
  return res.apiSuccess("Worksheet questions added", { worksheetId, createdCount: created.count }, 201);
});

const deleteWorksheetQuestion = asyncHandler(async (req, res) => {
  assertCanModifyAcademic(req.auth.role);
  const { id: worksheetId, questionId } = req.params;

  const question = await prisma.worksheetQuestion.findFirst({
    where: {
      id: questionId,
      worksheetId,
      tenantId: req.auth.tenantId
    },
    select: {
      id: true,
      worksheetId: true,
      questionNumber: true
    }
  });

  if (!question) {
    return res.apiError(404, "Worksheet question not found", "WORKSHEET_QUESTION_NOT_FOUND");
  }

  await prisma.$transaction(async (tx) => {
    await tx.worksheetQuestion.delete({
      where: { id: question.id }
    });

    await tx.worksheetQuestion.updateMany({
      where: {
        tenantId: req.auth.tenantId,
        worksheetId: question.worksheetId,
        questionNumber: { gt: question.questionNumber }
      },
      data: {
        questionNumber: { decrement: 1 }
      }
    });
  });

  res.locals.entityId = question.id;
  return res.apiSuccess("Worksheet question deleted", { id: question.id, worksheetId: question.worksheetId });
});

const createWorksheet = asyncHandler(async (req, res) => {
  assertCanModifyAcademic(req.auth.role);

  const { title, description, difficulty, levelId, competitionCourseLevelId, competitionCoursePaperId, competitionCoursePaperBlueprintId, isPublished } = req.body;

  if (Boolean(isPublished)) {
    return res.apiError(409, "Create worksheet as draft, add questions, then publish", "WORKSHEET_PUBLISH_REQUIRES_QUESTIONS");
  }

  const normalizedLevelId = levelId ? String(levelId) : null;
  const normalizedCompetitionCourseLevelId = competitionCourseLevelId ? String(competitionCourseLevelId) : null;
  const normalizedCompetitionCoursePaperId = competitionCoursePaperId ? String(competitionCoursePaperId) : null;
  let resolvedCompetitionCourseLevelId = normalizedCompetitionCourseLevelId;

  if (normalizedCompetitionCoursePaperId) {
    const paper = await prisma.competitionCoursePaper.findFirst({
      where: { id: normalizedCompetitionCoursePaperId, tenantId: req.auth.tenantId },
      select: { id: true, competitionCourseLevelId: true }
    });

    if (!paper) {
      return res.apiError(404, "Competition course paper not found", "COMPETITION_COURSE_PAPER_NOT_FOUND");
    }

    if (normalizedCompetitionCourseLevelId && normalizedCompetitionCourseLevelId !== paper.competitionCourseLevelId) {
      return res.apiError(400, "competitionCourseLevelId does not match competitionCoursePaperId", "VALIDATION_ERROR");
    }

    resolvedCompetitionCourseLevelId = paper.competitionCourseLevelId;
  }

  if (competitionCoursePaperBlueprintId) {
    const blueprint = await prisma.competitionCoursePaperBlueprint.findFirst({
      where: { id: String(competitionCoursePaperBlueprintId), tenantId: req.auth.tenantId },
      select: { id: true, competitionCoursePaperId: true }
    });
    if (!blueprint) {
      return res.apiError(404, "Competition course paper blueprint not found", "COMPETITION_COURSE_PAPER_BLUEPRINT_NOT_FOUND");
    }
    if (normalizedCompetitionCoursePaperId && blueprint.competitionCoursePaperId !== normalizedCompetitionCoursePaperId) {
      return res.apiError(400, "competitionCoursePaperBlueprintId does not match competitionCoursePaperId", "VALIDATION_ERROR");
    }
  }

  if (!normalizedLevelId && !resolvedCompetitionCourseLevelId) {
    return res.apiError(400, "levelId or competitionCourseLevelId is required", "VALIDATION_ERROR");
  }

  if (normalizedLevelId && resolvedCompetitionCourseLevelId && !normalizedCompetitionCoursePaperId) {
    return res.apiError(400, "Use either levelId or competitionCourseLevelId, not both", "VALIDATION_ERROR");
  }

  if (resolvedCompetitionCourseLevelId) {
    const level = await prisma.competitionCourseLevel.findFirst({
      where: { id: resolvedCompetitionCourseLevelId, tenantId: req.auth.tenantId },
      select: { id: true }
    });
    if (!level) {
      return res.apiError(404, "Competition course level not found", "COMPETITION_COURSE_LEVEL_NOT_FOUND");
    }
  }

  const created = await prisma.worksheet.create({
    data: {
      tenantId: req.auth.tenantId,
      title,
      description,
      difficulty,
      levelId: normalizedLevelId,
      competitionCourseLevelId: resolvedCompetitionCourseLevelId,
      competitionCoursePaperId: normalizedCompetitionCoursePaperId,
      competitionCoursePaperBlueprintId: req.body.competitionCoursePaperBlueprintId ? String(req.body.competitionCoursePaperBlueprintId) : null,
      createdByUserId: req.auth.userId,
      isPublished: Boolean(isPublished)
    }
  });

  res.locals.entityId = created.id;
  return res.apiSuccess("Worksheet created", created, 201);
});

const deleteWorksheet = asyncHandler(async (req, res) => {
  assertCanModifyAcademic(req.auth.role);
  const { id } = req.params;

  const existing = await prisma.worksheet.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true }
  });

  if (!existing) {
    return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
  }

  const usedInExamSelections = await prisma.examEnrollmentLevelWorksheetSelection.count({
    where: {
      tenantId: req.auth.tenantId,
      baseWorksheetId: existing.id
    }
  });

  if (usedInExamSelections > 0) {
    return res.apiError(
      409,
      "Cannot delete worksheet because it is referenced in exam enrollment selections",
      "WORKSHEET_IN_USE"
    );
  }

  try {
    await prisma.worksheet.delete({
      where: { id: existing.id }
    });
  } catch (error) {
    if (error?.code === "P2003") {
      return res.apiError(
        409,
        "Cannot delete worksheet because it is referenced by other records",
        "WORKSHEET_IN_USE"
      );
    }
    throw error;
  }

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "WORKSHEET_DELETE",
    entityType: "WORKSHEET",
    entityId: existing.id
  });

  res.locals.entityId = existing.id;
  return res.apiSuccess("Worksheet deleted", { id: existing.id });
});

const duplicateWorksheet = asyncHandler(async (req, res) => {
  assertCanModifyAcademic(req.auth.role);
  const { id } = req.params;

  const existing = await prisma.worksheet.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    include: {
      competitionCoursePaper: {
        select: { id: true, competitionCourseLevelId: true, code: true, title: true, sortOrder: true, status: true, isActive: true }
      },
        questions: {
        orderBy: { questionNumber: "asc" },
        select: {
          questionBankId: true,
          questionNumber: true,
          marks: true,
          operands: true,
          operation: true,
          correctAnswer: true
        }
      }
    }
  });

  if (!existing) {
    return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
  }

  const created = await prisma.$transaction(async (tx) => {
    const worksheet = await tx.worksheet.create({
      data: {
        tenantId: req.auth.tenantId,
        title: `${existing.title} (Copy)`,
        description: existing.description,
        difficulty: existing.difficulty,
        levelId: existing.levelId,
        competitionCourseLevelId: existing.competitionCourseLevelId,
        competitionCoursePaperId: existing.competitionCoursePaperId,
        competitionCoursePaperBlueprintId: existing.competitionCoursePaperBlueprintId,
        createdByUserId: req.auth.userId,
        isPublished: false,
        timeLimitSeconds: existing.timeLimitSeconds,
        generationMode: existing.generationMode,
        templateId: existing.templateId
      }
    });

    if (existing.questions.length) {
      await tx.worksheetQuestion.createMany({
        data: existing.questions.map((question, index) => ({
          tenantId: req.auth.tenantId,
          worksheetId: worksheet.id,
          questionBankId: question.questionBankId,
          questionNumber: index + 1,
          marks: question.marks,
          operands: question.operands,
          operation: question.operation,
          correctAnswer: question.correctAnswer
        }))
      });
    }

    return worksheet;
  });

  res.locals.entityId = created.id;
  return res.apiSuccess("Worksheet duplicated", created, 201);
});

const submitWorksheetAnswers = asyncHandler(async (req, res) => {
  const { id: worksheetId } = req.params;
  const { answers, studentId } = req.body;

  const resolvedStudentId = studentId || req.auth.studentId;

  if (req.auth.role === "STUDENT") {
    if (!req.auth.studentId) {
      return res.apiError(403, "Forbidden", "STUDENT_SCOPE_REQUIRED");
    }

    if (resolvedStudentId !== req.auth.studentId) {
      return res.apiError(403, "Forbidden", "CROSS_STUDENT_SUBMISSION_DENIED");
    }

    const worksheet = await prisma.worksheet.findFirst({
      where: { id: worksheetId, tenantId: req.auth.tenantId },
      select: { id: true }
    });

    if (!worksheet) {
      return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
    }

    const student = await prisma.student.findFirst({
      where: { id: req.auth.studentId, tenantId: req.auth.tenantId, isActive: true },
      select: { id: true }
    });

    if (!student) {
      return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
    }

    const activeAssignment = await prisma.worksheetAssignment.findFirst({
      where: {
        tenantId: req.auth.tenantId,
        worksheetId,
        studentId: student.id,
        isActive: true,
        unassignedAt: null,
        OR: [{ dueDate: null }, { dueDate: { gte: new Date() } }]
      },
      select: { worksheetId: true }
    });

    if (!activeAssignment) {
      return res.apiError(403, "Worksheet is not assigned to this student", "WORKSHEET_NOT_ALLOWED");
    }
  }

  if (!resolvedStudentId) {
    return res.apiError(400, "studentId is required for submission", "STUDENT_ID_REQUIRED");
  }

  const student = await prisma.student.findFirst({
    where: {
      id: resolvedStudentId,
      tenantId: req.auth.tenantId,
      isActive: true
    },
    select: {
      id: true,
      hierarchyNodeId: true
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  if (req.auth.role !== "STUDENT") {
    if (!req.auth.hierarchyNodeId) {
      return res.apiError(403, "Forbidden", "SCOPE_FORBIDDEN");
    }

    const allowed = await hierarchyContainsNode(student.hierarchyNodeId, req.auth.hierarchyNodeId, req.auth.tenantId);
    if (!allowed) {
      return res.apiError(403, "Student is outside your scope", "SCOPE_FORBIDDEN");
    }
  }

  const result = await submitWorksheet({
    worksheetId,
    studentId: resolvedStudentId,
    tenantId: req.auth.tenantId,
    answers
  });

  const abuseFlags = result.abuseFlags || [];

  if (abuseFlags.length) {
    void (async () => {
      try {
        const superadmins = await prisma.authUser.findMany({
          where: {
            tenantId: req.auth.tenantId,
            isActive: true,
            role: "SUPERADMIN"
          },
          select: {
            id: true
          },
          take: 500
        });

        const notifications = [];
        for (const flag of abuseFlags) {
          for (const recipient of superadmins) {
            notifications.push({
              tenantId: req.auth.tenantId,
              recipientUserId: recipient.id,
              type: "ABUSE_FLAG_CREATED",
              title: "Abuse Flag Created",
              message: `Detected ${flag.flagType} for student ${resolvedStudentId}`,
              entityType: "ABUSE_FLAG",
              entityId: flag.id
            });
          }
        }

        await createBulkNotification(notifications);
      } catch {
        return;
      }
    })();
  }

  const { abuseFlags: _ignoredAbuseFlags, ...responsePayload } = result;

  return res.apiSuccess("Worksheet submitted", responsePayload);
});

export {
  listWorksheets,
  createWorksheet,
  deleteWorksheet,
  duplicateWorksheet,
  submitWorksheetAnswers,
  getWorksheet,
  updateWorksheet,
  reorderWorksheetQuestions,
  addWorksheetQuestion,
  addWorksheetQuestionsBulk,
  deleteWorksheetQuestion
};

