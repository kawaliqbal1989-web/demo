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

function toPositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

async function resolveCourseLevelContext({ tenantId, courseId, levelNumber, levelId }) {
  if (!courseId && !levelNumber) {
    return null;
  }

  if (!courseId || !levelNumber || !levelId) {
    const error = new Error("courseId, levelNumber, and levelId are required for exam workspace scope");
    error.statusCode = 400;
    error.errorCode = "VALIDATION_ERROR";
    throw error;
  }

  const normalizedLevelNumber = toPositiveInt(levelNumber);
  if (!normalizedLevelNumber) {
    const error = new Error("levelNumber must be a positive integer");
    error.statusCode = 400;
    error.errorCode = "VALIDATION_ERROR";
    throw error;
  }

  const course = await prisma.course.findFirst({
    where: {
      id: String(courseId),
      tenantId
    },
    select: {
      id: true,
      scope: true
    }
  });

  if (!course) {
    const error = new Error("Course not found");
    error.statusCode = 404;
    error.errorCode = "COURSE_NOT_FOUND";
    throw error;
  }

  const courseLevel = await prisma.courseLevel.findFirst({
    where: {
      tenantId,
      courseId: course.id,
      levelNumber: normalizedLevelNumber
    },
    select: { id: true, levelNumber: true }
  });

  if (!courseLevel) {
    const error = new Error("Course level not found");
    error.statusCode = 404;
    error.errorCode = "COURSE_LEVEL_NOT_FOUND";
    throw error;
  }

  const level = await prisma.level.findFirst({
    where: {
      id: String(levelId),
      tenantId
    },
    select: {
      id: true,
      rank: true
    }
  });

  if (!level) {
    const error = new Error("Academic level not found");
    error.statusCode = 404;
    error.errorCode = "LEVEL_NOT_FOUND";
    throw error;
  }

  if (Number(level.rank) !== normalizedLevelNumber) {
    const error = new Error("Exam course level does not match academic level rank");
    error.statusCode = 409;
    error.errorCode = "EXAM_LEVEL_MAPPING_MISMATCH";
    throw error;
  }

  return {
    courseId: course.id,
    courseLevelId: courseLevel.id,
    scope: String(course.scope || "GENERAL").toUpperCase(),
    levelNumber: courseLevel.levelNumber
  };
}

function applyWorksheetContextFilter({ where, context, includeLegacyGeneral }) {
  if (!context) {
    return;
  }

  if (context.scope === "EXAM") {
    where.courseId = context.courseId;
    where.courseLevelId = context.courseLevelId;
    return;
  }

  const clause = {
    OR: includeLegacyGeneral
      ? [
          {
            courseId: context.courseId,
            courseLevelId: context.courseLevelId
          },
          {
            courseId: null,
            courseLevelId: null
          }
        ]
      : [
          {
            courseId: context.courseId,
            courseLevelId: context.courseLevelId
          }
        ]
  };

  if (!where.AND) {
    where.AND = [clause];
    return;
  }

  if (Array.isArray(where.AND)) {
    where.AND.push(clause);
    return;
  }

  where.AND = [where.AND, clause];
}

function appendExcludeExamGenerationModeFilter(where) {
  const clause = {
    OR: [
      { generationMode: null },
      { generationMode: { not: "EXAM" } }
    ]
  };

  if (!where.AND) {
    where.AND = [clause];
    return;
  }

  if (Array.isArray(where.AND)) {
    where.AND.push(clause);
    return;
  }

  where.AND = [where.AND, clause];
}

function worksheetMatchesContext({ worksheet, context, allowLegacyGeneral = false }) {
  if (!context) {
    return true;
  }

  const isExact = worksheet?.courseId === context.courseId && worksheet?.courseLevelId === context.courseLevelId;
  if (isExact) {
    return true;
  }

  if (context.scope === "GENERAL" && allowLegacyGeneral) {
    return !worksheet?.courseId && !worksheet?.courseLevelId;
  }

  return false;
}

function questionBankMatchesWorksheetContext({ questionBank, worksheet, context }) {
  if (!questionBank || !worksheet) {
    return false;
  }

  if (questionBank.courseId && questionBank.courseLevelId) {
    return questionBank.courseId === worksheet.courseId && questionBank.courseLevelId === worksheet.courseLevelId;
  }

  if (context?.scope === "EXAM") {
    return false;
  }

  return true;
}

const listWorksheets = asyncHandler(async (req, res) => {
  const { take, skip, orderBy } = parsePagination(req.query);
  const levelId = req.query.levelId ? String(req.query.levelId) : null;
  const courseId = req.query.courseId ? String(req.query.courseId) : null;
  const levelNumber = req.query.levelNumber ? String(req.query.levelNumber) : null;
  const published = req.query.published === undefined ? null : String(req.query.published).trim().toLowerCase();
  const difficulty = req.query.difficulty ? String(req.query.difficulty).trim().toUpperCase() : null;
  const q = req.query.q ? String(req.query.q).trim() : null;
  const examSelectionEligible = ["1", "true", "yes"].includes(String(req.query.examSelectionEligible || "").trim().toLowerCase());

  const where = {
    tenantId: req.auth.tenantId,
    ...(levelId ? { levelId } : {})
  };

  const context = await resolveCourseLevelContext({
    tenantId: req.auth.tenantId,
    courseId,
    levelNumber,
    levelId
  });

  if (courseId || levelNumber) {
    applyWorksheetContextFilter({ where, context, includeLegacyGeneral: true });
  }

  const appendNotFilter = (clause) => {
    if (!clause) return;
    if (!where.NOT) {
      where.NOT = [clause];
      return;
    }

    if (Array.isArray(where.NOT)) {
      where.NOT.push(clause);
      return;
    }

    where.NOT = [where.NOT, clause];
  };

  const maxLevelRank = await resolveActorLevelCap({
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
    appendExcludeExamGenerationModeFilter(where);
  } else {
    where.examCycleId = null;
    appendExcludeExamGenerationModeFilter(where);
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
        createdByUserId: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
        level: { select: { id: true, name: true, rank: true } },
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
  const courseId = req.query.courseId ? String(req.query.courseId) : null;
  const levelNumber = req.query.levelNumber ? String(req.query.levelNumber) : null;

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

  const context = await resolveCourseLevelContext({
    tenantId: req.auth.tenantId,
    courseId,
    levelNumber,
    levelId: worksheet.levelId
  });

  if (!worksheetMatchesContext({ worksheet, context, allowLegacyGeneral: true })) {
    return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
  }

  if (Number.isFinite(maxLevelRank) && Number(worksheet?.level?.rank || 0) > maxLevelRank) {
    return res.apiError(403, "Level visibility denied", "LEVEL_SCOPE_DENIED");
  }

  const role = String(req.auth?.role || "").toUpperCase();
  const isExamWorksheet = Boolean(worksheet?.examCycleId) || String(worksheet?.generationMode || "").toUpperCase() === "EXAM";

  if ((role === "CENTER" || role === "TEACHER") && isExamWorksheet) {
    return res.apiError(403, "Exam worksheet access is restricted on this endpoint", "EXAM_WORKSHEET_ACCESS_DENIED");
  }

  return res.apiSuccess("Worksheet fetched", worksheet);
});

const updateWorksheet = asyncHandler(async (req, res) => {
  assertCanModifyAcademic(req.auth.role);
  const { id } = req.params;
  const courseId = req.body?.courseId ? String(req.body.courseId) : null;
  const levelNumber = req.body?.levelNumber ? String(req.body.levelNumber) : null;

  const existing = await prisma.worksheet.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: {
      id: true,
      levelId: true,
      courseId: true,
      courseLevelId: true
    }
  });

  if (!existing) {
    return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
  }

  let context = null;
  if (courseId || levelNumber) {
    context = await resolveCourseLevelContext({
      tenantId: req.auth.tenantId,
      courseId,
      levelNumber,
      levelId: existing.levelId
    });

    if (!worksheetMatchesContext({ worksheet: existing, context, allowLegacyGeneral: true })) {
      return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
    }
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
    data: {
      ...data,
      courseId: context ? context.courseId : undefined,
      courseLevelId: context ? context.courseLevelId : undefined
    }
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Worksheet updated", updated);
});

const reorderWorksheetQuestions = asyncHandler(async (req, res) => {
  assertCanModifyAcademic(req.auth.role);
  const { id: worksheetId } = req.params;
  const courseId = req.body?.courseId ? String(req.body.courseId) : null;
  const levelNumber = req.body?.levelNumber ? String(req.body.levelNumber) : null;
  const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map(String) : null;

  if (!orderedIds || orderedIds.length === 0) {
    return res.apiError(400, "orderedIds[] is required", "VALIDATION_ERROR");
  }

  if (courseId || levelNumber) {
    const worksheetScope = await prisma.worksheet.findFirst({
      where: { id: worksheetId, tenantId: req.auth.tenantId },
      select: { id: true, levelId: true, courseId: true, courseLevelId: true }
    });

    if (!worksheetScope) {
      return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
    }

    const context = await resolveCourseLevelContext({
      tenantId: req.auth.tenantId,
      courseId,
      levelNumber,
      levelId: worksheetScope.levelId
    });

    if (!worksheetMatchesContext({ worksheet: worksheetScope, context, allowLegacyGeneral: true })) {
      return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
    }
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
  const courseId = req.body?.courseId ? String(req.body.courseId) : null;
  const levelNumber = req.body?.levelNumber ? String(req.body.levelNumber) : null;

  const worksheet = await prisma.worksheet.findFirst({
    where: { id: worksheetId, tenantId: req.auth.tenantId },
    select: { id: true, levelId: true, courseId: true, courseLevelId: true }
  });

  if (!worksheet) {
    return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
  }

  const context = await resolveCourseLevelContext({
    tenantId: req.auth.tenantId,
    courseId,
    levelNumber,
    levelId: worksheet.levelId
  });

  if (!worksheetMatchesContext({ worksheet, context, allowLegacyGeneral: true })) {
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
        courseId: true,
        courseLevelId: true,
        operands: true,
        operation: true,
        correctAnswer: true
      }
    });

    if (!source) {
      return res.apiError(404, "Question bank entry not found", "QUESTION_NOT_FOUND");
    }
    if (!questionBankMatchesWorksheetContext({ questionBank: source, worksheet, context })) {
      return res.apiError(409, "Question bank entry scope mismatch", "QUESTION_SCOPE_MISMATCH");
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
  const courseId = req.body?.courseId ? String(req.body.courseId) : null;
  const levelNumber = req.body?.levelNumber ? String(req.body.levelNumber) : null;
  const questionBankIds = Array.isArray(req.body?.questionBankIds)
    ? req.body.questionBankIds.map((item) => String(item)).filter(Boolean)
    : [];

  if (!questionBankIds.length) {
    return res.apiError(400, "questionBankIds[] is required", "VALIDATION_ERROR");
  }

  const uniqueIds = [...new Set(questionBankIds)];

  const worksheet = await prisma.worksheet.findFirst({
    where: { id: worksheetId, tenantId: req.auth.tenantId },
    select: { id: true, levelId: true, courseId: true, courseLevelId: true }
  });

  if (!worksheet) {
    return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
  }

  const context = await resolveCourseLevelContext({
    tenantId: req.auth.tenantId,
    courseId,
    levelNumber,
    levelId: worksheet.levelId
  });

  if (!worksheetMatchesContext({ worksheet, context, allowLegacyGeneral: true })) {
    return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
  }

  const sourceRows = await prisma.questionBank.findMany({
    where: {
      tenantId: req.auth.tenantId,
      id: { in: uniqueIds }
    },
    select: {
      id: true,
      courseId: true,
      courseLevelId: true,
      operands: true,
      operation: true,
      correctAnswer: true
    }
  });

  if (sourceRows.length !== uniqueIds.length) {
    return res.apiError(400, "questionBankIds contains invalid ids", "VALIDATION_ERROR");
  }

  for (const source of sourceRows) {
    if (!questionBankMatchesWorksheetContext({ questionBank: source, worksheet, context })) {
      return res.apiError(409, "Question bank entry scope mismatch", "QUESTION_SCOPE_MISMATCH");
    }
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
  const courseId = req.query.courseId ? String(req.query.courseId) : null;
  const levelNumber = req.query.levelNumber ? String(req.query.levelNumber) : null;

  if (courseId || levelNumber) {
    const worksheetScope = await prisma.worksheet.findFirst({
      where: { id: worksheetId, tenantId: req.auth.tenantId },
      select: { id: true, levelId: true, courseId: true, courseLevelId: true }
    });

    if (!worksheetScope) {
      return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
    }

    const context = await resolveCourseLevelContext({
      tenantId: req.auth.tenantId,
      courseId,
      levelNumber,
      levelId: worksheetScope.levelId
    });

    if (!worksheetMatchesContext({ worksheet: worksheetScope, context, allowLegacyGeneral: true })) {
      return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
    }
  }

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

  const { title, description, difficulty, levelId, isPublished } = req.body;
  const courseId = req.body?.courseId ? String(req.body.courseId) : null;
  const levelNumber = req.body?.levelNumber ? String(req.body.levelNumber) : null;

  if (Boolean(isPublished)) {
    return res.apiError(409, "Create worksheet as draft, add questions, then publish", "WORKSHEET_PUBLISH_REQUIRES_QUESTIONS");
  }

  const context = await resolveCourseLevelContext({
    tenantId: req.auth.tenantId,
    courseId,
    levelNumber,
    levelId
  });

  const created = await prisma.worksheet.create({
    data: {
      tenantId: req.auth.tenantId,
      title,
      description,
      difficulty,
      levelId,
      courseId: context?.courseId || null,
      courseLevelId: context?.courseLevelId || null,
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
  const courseId = req.query.courseId ? String(req.query.courseId) : null;
  const levelNumber = req.query.levelNumber ? String(req.query.levelNumber) : null;

  const existing = await prisma.worksheet.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: {
      id: true,
      levelId: true,
      courseId: true,
      courseLevelId: true,
      generationMode: true,
      examCycleId: true
    }
  });

  if (!existing) {
    return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
  }

  if (courseId || levelNumber) {
    const context = await resolveCourseLevelContext({
      tenantId: req.auth.tenantId,
      courseId,
      levelNumber,
      levelId: existing.levelId
    });

    if (!worksheetMatchesContext({ worksheet: existing, context, allowLegacyGeneral: true })) {
      return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
    }
  }

  if (
    String(existing.generationMode || "").toUpperCase() === "EXAM" ||
    existing.examCycleId
  ) {
    return res.apiError(
      409,
      "Generated exam worksheets cannot be deleted manually",
      "WORKSHEET_IN_USE"
    );
  }

  const tenantId = req.auth.tenantId;
  const worksheetId = existing.id;
  const [
    assessmentConfigCount,
    enrollmentSelectionCount,
    assignmentCount,
    submissionCount,
    assessmentPaperCount,
    competitionCount,
    mockTestCount,
    reassignmentCount
  ] = await Promise.all([
    prisma.examLevelAssessmentConfig.count({
      where: { tenantId, worksheetId }
    }),
    prisma.examEnrollmentLevelWorksheetSelection.count({
      where: { tenantId, baseWorksheetId: worksheetId }
    }),
    prisma.worksheetAssignment.count({
      where: { tenantId, worksheetId }
    }),
    prisma.worksheetSubmission.count({
      where: { tenantId, worksheetId }
    }),
    prisma.assessmentPaper.count({
      where: {
        tenantId,
        OR: [
          { worksheetId },
          { sourceWorksheetId: worksheetId }
        ]
      }
    }),
    prisma.legacyCompetitionWorksheetLink.count({
      where: { tenantId, worksheetId }
    }),
    prisma.mockTest.count({
      where: { tenantId, worksheetId }
    }),
    prisma.worksheetReassignmentRequest.count({
      where: {
        tenantId,
        OR: [
          { currentWorksheetId: worksheetId },
          { newWorksheetId: worksheetId }
        ]
      }
    })
  ]);

  const deletionBlockers = [
    {
      count: assessmentConfigCount,
      message: "Cannot delete worksheet because it is selected in a Paper Builder configuration"
    },
    {
      count: enrollmentSelectionCount,
      message: "Cannot delete worksheet because it is referenced in an exam enrollment approval"
    },
    {
      count: assignmentCount,
      message: "Cannot delete worksheet because it has been assigned to students"
    },
    {
      count: submissionCount,
      message: "Cannot delete worksheet because it has student attempts or submissions"
    },
    {
      count: assessmentPaperCount,
      message: "Cannot delete worksheet because it is used by an assessment paper"
    },
    {
      count: competitionCount,
      message: "Cannot delete worksheet because it is used by a competition"
    },
    {
      count: mockTestCount,
      message: "Cannot delete worksheet because it is used by a mock test"
    },
    {
      count: reassignmentCount,
      message: "Cannot delete worksheet because it is referenced by a reassignment request"
    }
  ];
  const blocker = deletionBlockers.find((item) => item.count > 0);

  if (blocker) {
    return res.apiError(409, blocker.message, "WORKSHEET_IN_USE");
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
      questions: {
        orderBy: { questionNumber: "asc" },
        select: {
          questionBankId: true,
          questionNumber: true,
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

