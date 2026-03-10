import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { recordAudit } from "../utils/audit.js";

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizeDifficulty(value) {
  if (!value) {
    return null;
  }
  const v = String(value).trim().toUpperCase();
  if (["EASY", "MEDIUM", "HARD"].includes(v)) {
    return v;
  }
  return null;
}

function normalizeInt(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeJson(value) {
  if (value === undefined) {
    return null;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

const listQuestionBank = asyncHandler(async (req, res) => {
  const levelId = req.query.levelId ? String(req.query.levelId) : null;
  const difficulty = normalizeDifficulty(req.query.difficulty);
  const q = req.query.q ? String(req.query.q).trim() : null;

  if (!levelId) {
    return res.apiError(400, "levelId is required", "VALIDATION_ERROR");
  }

  const where = {
    tenantId: req.auth.tenantId,
    levelId
  };

  if (difficulty) {
    where.difficulty = difficulty;
  }

  if (q) {
    where.prompt = { contains: q };
  }

  const items = await prisma.questionBank.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10000
  });

  return res.apiSuccess("Question bank fetched", { items });
});

const createQuestionBankEntry = asyncHandler(async (req, res) => {
  const levelId = normalizeString(req.body.levelId);
  const difficulty = normalizeDifficulty(req.body.difficulty);
  const prompt = normalizeString(req.body.prompt);
  const operands = safeJson(req.body.operands);
  const operation = normalizeString(req.body.operation);
  const correctAnswer = normalizeInt(req.body.correctAnswer);

  if (!levelId || !difficulty || !prompt || !operation || !Number.isInteger(correctAnswer)) {
    return res.apiError(400, "levelId, difficulty, prompt, operation, correctAnswer are required", "VALIDATION_ERROR");
  }

  if (!operands || typeof operands !== "object") {
    return res.apiError(400, "operands must be valid JSON", "VALIDATION_ERROR");
  }

  const created = await prisma.questionBank.create({
    data: {
      tenantId: req.auth.tenantId,
      levelId,
      difficulty,
      prompt,
      operands,
      operation,
      correctAnswer
    }
  });

  res.locals.entityId = created.id;
  return res.apiSuccess("Question created", created, 201);
});

const updateQuestionBankEntry = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.questionBank.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true }
  });

  if (!existing) {
    return res.apiError(404, "Question not found", "QUESTION_NOT_FOUND");
  }

  const difficulty = req.body.difficulty === undefined ? null : normalizeDifficulty(req.body.difficulty);
  const prompt = req.body.prompt === undefined ? null : normalizeString(req.body.prompt);
  const operands = req.body.operands === undefined ? null : safeJson(req.body.operands);
  const operation = req.body.operation === undefined ? null : normalizeString(req.body.operation);
  const correctAnswer = req.body.correctAnswer === undefined ? null : normalizeInt(req.body.correctAnswer);

  if (req.body.difficulty !== undefined && !difficulty) {
    return res.apiError(400, "difficulty must be EASY, MEDIUM, or HARD", "VALIDATION_ERROR");
  }

  if (req.body.correctAnswer !== undefined && !Number.isInteger(correctAnswer)) {
    return res.apiError(400, "correctAnswer must be an integer", "VALIDATION_ERROR");
  }

  if (req.body.operands !== undefined && (!operands || typeof operands !== "object")) {
    return res.apiError(400, "operands must be valid JSON", "VALIDATION_ERROR");
  }

  const updated = await prisma.questionBank.update({
    where: { id: existing.id },
    data: {
      difficulty: difficulty ?? undefined,
      prompt: prompt ?? undefined,
      operands: operands ?? undefined,
      operation: operation ?? undefined,
      correctAnswer: correctAnswer === null ? undefined : correctAnswer
    }
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Question updated", updated);
});

const deleteQuestionBankEntry = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.questionBank.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true }
  });

  if (!existing) {
    return res.apiError(404, "Question not found", "QUESTION_NOT_FOUND");
  }

  await prisma.questionBank.delete({ where: { id: existing.id } });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "QUESTION_DELETE",
    entityType: "QUESTION_BANK",
    entityId: existing.id
  });

  res.locals.entityId = existing.id;
  return res.apiSuccess("Question deleted", { id: existing.id });
});

const exportQuestionBankCsv = asyncHandler(async (req, res) => {
  const levelId = req.query.levelId ? String(req.query.levelId) : null;
  if (!levelId) {
    return res.apiError(400, "levelId is required", "VALIDATION_ERROR");
  }

  const items = await prisma.questionBank.findMany({
    where: { tenantId: req.auth.tenantId, levelId },
    orderBy: { createdAt: "desc" },
    take: 10000
  });

  const escape = (value) => {
    const s = value === null || value === undefined ? "" : String(value);
    const v = s.replace(/"/g, '""');
    return /[",\n]/.test(v) ? `"${v}"` : v;
  };

  const lines = [];
  lines.push(["id", "difficulty", "prompt", "operation", "correctAnswer", "operands"].map(escape).join(","));
  for (const row of items) {
    lines.push(
      [
        row.id,
        row.difficulty,
        row.prompt,
        row.operation,
        row.correctAnswer,
        JSON.stringify(row.operands)
      ]
        .map(escape)
        .join(",")
    );
  }

  const csv = lines.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=question-bank-${levelId}.csv`);
  return res.status(200).send(csv);
});

const importQuestionBank = asyncHandler(async (req, res) => {
  const levelId = normalizeString(req.body.levelId);
  const items = Array.isArray(req.body.items) ? req.body.items : null;

  if (!levelId || !items) {
    return res.apiError(400, "levelId and items[] are required", "VALIDATION_ERROR");
  }

  if (items.length > 500) {
    return res.apiError(400, "Maximum 500 items per import", "VALIDATION_ERROR");
  }

  const rows = [];
  for (const item of items) {
    const difficulty = normalizeDifficulty(item?.difficulty);
    const prompt = normalizeString(item?.prompt);
    const operands = item?.operands && typeof item.operands === "object" ? item.operands : null;
    const operation = normalizeString(item?.operation);
    const correctAnswer = normalizeInt(item?.correctAnswer);

    if (!difficulty || !prompt || !operation || !Number.isInteger(correctAnswer) || !operands) {
      return res.apiError(400, "Each item requires difficulty, prompt, operation, correctAnswer, operands", "VALIDATION_ERROR");
    }

    rows.push({
      tenantId: req.auth.tenantId,
      levelId,
      difficulty,
      prompt,
      operands,
      operation,
      correctAnswer
    });
  }

  const created = await prisma.questionBank.createMany({
    data: rows,
    skipDuplicates: true
  });

  return res.apiSuccess("Question bank imported", { createdCount: created.count }, 201);
});

export {
  listQuestionBank,
  createQuestionBankEntry,
  updateQuestionBankEntry,
  deleteQuestionBankEntry,
  exportQuestionBankCsv,
  importQuestionBank
};
