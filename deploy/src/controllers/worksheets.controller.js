import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { submitWorksheet } from "../services/worksheet-submission.service.js";
import { createBulkNotification } from "../services/notification.service.js";
import { assertCanModifyAcademic } from "../services/ownership-guard.service.js";
import { parsePagination } from "../utils/pagination.js";
import { recordAudit } from "../utils/audit.js";

const listWorksheets = asyncHandler(async (req, res) => {
  const { take, skip, orderBy } = parsePagination(req.query);
  const levelId = req.query.levelId ? String(req.query.levelId) : null;
  const published = req.query.published === undefined ? null : String(req.query.published).trim().toLowerCase();
  const difficulty = req.query.difficulty ? String(req.query.difficulty).trim().toUpperCase() : null;
  const q = req.query.q ? String(req.query.q).trim() : null;

  const where = {
    tenantId: req.auth.tenantId,
    ...(levelId ? { levelId } : {})
  };

  if (published === "true") {
    where.isPublished = true;
  }
  if (published === "false") {
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
    data.map((w) => ({
      ...w,
      questionCount: w?._count?.questions ?? 0,
      submissionCount: w?._count?.submissions ?? 0,
      _count: undefined
    }))
  );
});

const getWorksheet = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const worksheet = await prisma.worksheet.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId
    },
    include: {
      level: { select: { id: true, name: true, rank: true } },
      questions: {
        orderBy: { questionNumber: "asc" }
      }
    }
  });

  if (!worksheet) {
    return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
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

  const { title, description, difficulty, levelId, isPublished } = req.body;

  if (Boolean(isPublished)) {
    return res.apiError(409, "Create worksheet as draft, add questions, then publish", "WORKSHEET_PUBLISH_REQUIRES_QUESTIONS");
  }

  const created = await prisma.worksheet.create({
    data: {
      tenantId: req.auth.tenantId,
      title,
      description,
      difficulty,
      levelId,
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
      where: { id: worksheetId, tenantId: req.auth.tenantId, isPublished: true },
      select: { id: true, levelId: true }
    });

    if (!worksheet) {
      return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
    }

    const student = await prisma.student.findFirst({
      where: { id: req.auth.studentId, tenantId: req.auth.tenantId, isActive: true },
      select: { id: true, levelId: true }
    });

    if (!student) {
      return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
    }

    if (worksheet.levelId !== student.levelId) {
      const activeEnrollment = await prisma.enrollment.findFirst({
        where: {
          tenantId: req.auth.tenantId,
          studentId: student.id,
          status: "ACTIVE",
          levelId: worksheet.levelId
        },
        select: { id: true }
      });

      if (!activeEnrollment) {
        return res.apiError(403, "Not enrolled for this worksheet", "WORKSHEET_NOT_ALLOWED");
      }
    }
  }

  if (!resolvedStudentId) {
    return res.apiError(400, "studentId is required for submission", "STUDENT_ID_REQUIRED");
  }

  const student = await prisma.student.findFirst({
    where: {
      id: resolvedStudentId,
      tenantId: req.auth.tenantId
    },
    select: {
      id: true
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
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

