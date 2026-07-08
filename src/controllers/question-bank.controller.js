import { createHash } from "node:crypto";
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

function normalizeNumber(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw.length) {
    return null;
  }
  const parsed = Number(raw);
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

function toPositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function normalizeCourseScope(value) {
  if (!value) {
    return null;
  }
  const v = String(value).trim().toUpperCase();
  if (v === "EXAM" || v === "GENERAL") {
    return v;
  }
  return null;
}

function normalizeOperation(value) {
  const raw = normalizeString(value);
  if (!raw) {
    return "ADD";
  }
  const v = raw.toUpperCase();
  const map = {
    "+": "ADD",
    "ADD": "ADD",
    "ADDITION": "ADD",
    "PLUS": "ADD",
    "SUM": "ADD",
    "-": "SUB",
    "SUB": "SUB",
    "SUBTRACTION": "SUB",
    "MINUS": "SUB",
    "X": "MUL",
    "*": "MUL",
    "MUL": "MUL",
    "MULTIPLY": "MUL",
    "MULTIPLICATION": "MUL",
    "/": "DIV",
    "÷": "DIV",
    "DIV": "DIV",
    "DIVIDE": "DIV",
    "DIVISION": "DIV",
    "MIX": "MIX",
    "MIXED": "MIX"
  };
  return map[v] || v;
}

function deriveOperandsFromPrompt(prompt) {
  const source = normalizeString(prompt);
  if (!source) {
    return { terms: [], operators: [] };
  }

  const termMatches = source.match(/-?\d+(?:\.\d+)?/g) || [];
  const terms = termMatches
    .map((token) => Number(token))
    .filter((token) => Number.isFinite(token));

  if (!terms.length) {
    return { terms: [], operators: [] };
  }

  const symbolMatches = source.match(/[+\-xX*\/÷×]/g) || [];
  const mapSymbol = (symbol) => {
    if (symbol === "+") return "ADD";
    if (symbol === "-") return "SUB";
    if (symbol === "x" || symbol === "X" || symbol === "*" || symbol === "×") return "MUL";
    if (symbol === "/" || symbol === "÷") return "DIV";
    return "ADD";
  };

  const operators = [""];
  for (let index = 1; index < terms.length; index += 1) {
    operators.push(mapSymbol(symbolMatches[index - 1]));
  }

  return { terms, operators };
}

function buildPromptScopeKey({ courseId, courseLevelId, prompt }) {
  const scopeCourseId = normalizeString(courseId) || "LEGACY";
  const scopeCourseLevelId = normalizeString(courseLevelId) || "LEGACY";
  const normalizedPrompt = normalizeString(prompt) || "";
  return createHash("sha256").update(`${scopeCourseId}|${scopeCourseLevelId}|${normalizedPrompt}`).digest("hex");
}

async function findQuestionBankDuplicate({ tenantId, levelId, prompt, courseId, courseLevelId, excludeId = null }) {
  const where = {
    tenantId,
    levelId,
    prompt,
    courseId: normalizeString(courseId),
    courseLevelId: normalizeString(courseLevelId),
    ...(excludeId ? { id: { not: excludeId } } : {})
  };

  return prisma.questionBank.findFirst({
    where,
    select: { id: true }
  });
}

async function resolveCourseLevelContext({ tenantId, courseId, levelNumber, levelId, expectedScope = null }) {
  if (!courseId && !levelNumber) {
    if (expectedScope) {
      const error = new Error("courseId, levelNumber, and levelId are required for scoped question bank import");
      error.statusCode = 400;
      error.errorCode = "VALIDATION_ERROR";
      throw error;
    }
    return null;
  }

  if (!courseId || !levelNumber || !levelId) {
    const error = new Error("courseId, levelNumber, and levelId are required for scoped question bank import");
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

  const scope = String(course.scope || "GENERAL").toUpperCase();
  if (expectedScope && scope !== expectedScope) {
    const error = new Error(`Selected course scope must be ${expectedScope} for this import`);
    error.statusCode = 409;
    error.errorCode = "COURSE_SCOPE_MISMATCH";
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
    scope,
    levelNumber: courseLevel.levelNumber
  };
}

function buildQuestionBankWhere({ tenantId, levelId, difficulty, q, context, includeLegacyGeneral }) {
  const where = {
    tenantId,
    levelId,
    isActive: true
  };

  if (difficulty) {
    where.difficulty = difficulty;
  }

  if (q) {
    where.prompt = { contains: q };
  }

  if (!context) {
    return where;
  }

  if (context.scope === "EXAM") {
    where.courseId = context.courseId;
    where.courseLevelId = context.courseLevelId;
    return where;
  }

  where.AND = [
    {
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
    }
  ];

  return where;
}

function questionBankMatchesContext({ item, context, allowLegacyGeneral = false }) {
  if (!context) {
    return true;
  }

  const isExact = item?.courseId === context.courseId && item?.courseLevelId === context.courseLevelId;
  if (isExact) {
    return true;
  }

  if (context.scope === "GENERAL" && allowLegacyGeneral) {
    return !item?.courseId && !item?.courseLevelId;
  }

  return false;
}

const listQuestionBank = asyncHandler(async (req, res) => {
  const levelId = req.query.levelId ? String(req.query.levelId) : null;
  const courseId = req.query.courseId ? String(req.query.courseId) : null;
  const levelNumber = req.query.levelNumber ? String(req.query.levelNumber) : null;
  const difficulty = normalizeDifficulty(req.query.difficulty);
  const q = req.query.q ? String(req.query.q).trim() : null;

  if (!levelId) {
    return res.apiError(400, "levelId is required", "VALIDATION_ERROR");
  }

  const context = await resolveCourseLevelContext({
    tenantId: req.auth.tenantId,
    courseId,
    levelNumber,
    levelId
  });

  const where = buildQuestionBankWhere({
    tenantId: req.auth.tenantId,
    levelId,
    difficulty,
    q,
    context,
    includeLegacyGeneral: true
  });

  const items = await prisma.questionBank.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10000
  });

  return res.apiSuccess("Question bank fetched", { items });
});

const createQuestionBankEntry = asyncHandler(async (req, res) => {
  const levelId = normalizeString(req.body.levelId);
  const courseId = normalizeString(req.body.courseId);
  const levelNumber = normalizeString(req.body.levelNumber);
  const difficulty = normalizeDifficulty(req.body.difficulty);
  const prompt = normalizeString(req.body.prompt);
  const operands = safeJson(req.body.operands);
  const operation = normalizeString(req.body.operation);
  const correctAnswer = normalizeNumber(req.body.correctAnswer);

  if (!levelId || !difficulty || !prompt || !operation || correctAnswer === null) {
    return res.apiError(400, "levelId, difficulty, prompt, operation, correctAnswer are required", "VALIDATION_ERROR");
  }

  if (!operands || typeof operands !== "object") {
    return res.apiError(400, "operands must be valid JSON", "VALIDATION_ERROR");
  }

  const context = await resolveCourseLevelContext({
    tenantId: req.auth.tenantId,
    courseId,
    levelNumber,
    levelId
  });

  const scopedCourseId = context?.courseId || null;
  const scopedCourseLevelId = context?.courseLevelId || null;
  const duplicate = await findQuestionBankDuplicate({
    tenantId: req.auth.tenantId,
    levelId,
    prompt,
    courseId: scopedCourseId,
    courseLevelId: scopedCourseLevelId
  });

  if (duplicate) {
    return res.apiError(409, "Duplicate prompt already exists in this course level question bank", "DUPLICATE_QUESTION_BANK_PROMPT");
  }

  const created = await prisma.questionBank.create({
    data: {
      tenantId: req.auth.tenantId,
      levelId,
      difficulty,
      prompt,
      operands,
      operation,
      correctAnswer,
      courseId: scopedCourseId,
      courseLevelId: scopedCourseLevelId,
      promptScopeKey: buildPromptScopeKey({
        courseId: scopedCourseId,
        courseLevelId: scopedCourseLevelId,
        prompt
      })
    }
  });

  res.locals.entityId = created.id;
  return res.apiSuccess("Question created", created, 201);
});

const updateQuestionBankEntry = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const courseId = normalizeString(req.body.courseId);
  const levelNumber = normalizeString(req.body.levelNumber);

  const existing = await prisma.questionBank.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: {
      id: true,
      levelId: true,
      prompt: true,
      courseId: true,
      courseLevelId: true
    }
  });

  if (!existing) {
    return res.apiError(404, "Question not found", "QUESTION_NOT_FOUND");
  }

  let context = null;
  if (courseId || levelNumber) {
    context = await resolveCourseLevelContext({
      tenantId: req.auth.tenantId,
      courseId,
      levelNumber,
      levelId: existing.levelId
    });

    if (!questionBankMatchesContext({ item: existing, context, allowLegacyGeneral: true })) {
      return res.apiError(404, "Question not found", "QUESTION_NOT_FOUND");
    }
  }

  const difficulty = req.body.difficulty === undefined ? null : normalizeDifficulty(req.body.difficulty);
  const prompt = req.body.prompt === undefined ? null : normalizeString(req.body.prompt);
  const operands = req.body.operands === undefined ? null : safeJson(req.body.operands);
  const operation = req.body.operation === undefined ? null : normalizeString(req.body.operation);
  const correctAnswer = req.body.correctAnswer === undefined ? null : normalizeNumber(req.body.correctAnswer);

  if (req.body.difficulty !== undefined && !difficulty) {
    return res.apiError(400, "difficulty must be EASY, MEDIUM, or HARD", "VALIDATION_ERROR");
  }

  if (req.body.correctAnswer !== undefined && correctAnswer === null) {
    return res.apiError(400, "correctAnswer must be a valid number", "VALIDATION_ERROR");
  }

  if (req.body.operands !== undefined && (!operands || typeof operands !== "object")) {
    return res.apiError(400, "operands must be valid JSON", "VALIDATION_ERROR");
  }

  const nextPrompt = prompt ?? existing.prompt;
  const nextCourseId = context ? context.courseId : existing.courseId;
  const nextCourseLevelId = context ? context.courseLevelId : existing.courseLevelId;
  const duplicate = await findQuestionBankDuplicate({
    tenantId: req.auth.tenantId,
    levelId: existing.levelId,
    prompt: nextPrompt,
    courseId: nextCourseId,
    courseLevelId: nextCourseLevelId,
    excludeId: existing.id
  });

  if (duplicate) {
    return res.apiError(409, "Duplicate prompt already exists in this course level question bank", "DUPLICATE_QUESTION_BANK_PROMPT");
  }

  const updated = await prisma.questionBank.update({
    where: { id: existing.id },
    data: {
      difficulty: difficulty ?? undefined,
      prompt: prompt ?? undefined,
      operands: operands ?? undefined,
      operation: operation ?? undefined,
      correctAnswer: correctAnswer === null ? undefined : correctAnswer,
      courseId: context ? context.courseId : undefined,
      courseLevelId: context ? context.courseLevelId : undefined,
      promptScopeKey: buildPromptScopeKey({
        courseId: nextCourseId,
        courseLevelId: nextCourseLevelId,
        prompt: nextPrompt
      })
    }
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Question updated", updated);
});

const deleteQuestionBankEntry = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const courseId = req.query.courseId ? String(req.query.courseId) : null;
  const levelNumber = req.query.levelNumber ? String(req.query.levelNumber) : null;

  const existing = await prisma.questionBank.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: {
      id: true,
      levelId: true,
      courseId: true,
      courseLevelId: true
    }
  });

  if (!existing) {
    return res.apiError(404, "Question not found", "QUESTION_NOT_FOUND");
  }

  if (courseId || levelNumber) {
    const context = await resolveCourseLevelContext({
      tenantId: req.auth.tenantId,
      courseId,
      levelNumber,
      levelId: existing.levelId
    });

    if (!questionBankMatchesContext({ item: existing, context, allowLegacyGeneral: true })) {
      return res.apiError(404, "Question not found", "QUESTION_NOT_FOUND");
    }
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
  const courseId = req.query.courseId ? String(req.query.courseId) : null;
  const levelNumber = req.query.levelNumber ? String(req.query.levelNumber) : null;
  if (!levelId) {
    return res.apiError(400, "levelId is required", "VALIDATION_ERROR");
  }

  const context = await resolveCourseLevelContext({
    tenantId: req.auth.tenantId,
    courseId,
    levelNumber,
    levelId
  });

  const where = buildQuestionBankWhere({
    tenantId: req.auth.tenantId,
    levelId,
    difficulty: null,
    q: null,
    context,
    includeLegacyGeneral: true
  });

  const items = await prisma.questionBank.findMany({
    where,
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
  const courseId = normalizeString(req.body.courseId);
  const levelNumber = normalizeString(req.body.levelNumber);
  const workspaceScope = normalizeCourseScope(req.body.workspaceScope || req.body.scope);
  const items = Array.isArray(req.body.items) ? req.body.items : null;

  if (!levelId || !items) {
    return res.apiError(400, "levelId and items[] are required", "VALIDATION_ERROR");
  }

  if ((req.body.workspaceScope || req.body.scope) && !workspaceScope) {
    return res.apiError(400, "workspaceScope must be EXAM or GENERAL", "VALIDATION_ERROR");
  }

  if (workspaceScope && (!courseId || !levelNumber)) {
    return res.apiError(400, "courseId and levelNumber are required for scoped question bank import", "VALIDATION_ERROR");
  }

  if (items.length > 500) {
    return res.apiError(400, "Maximum 500 items per import", "VALIDATION_ERROR");
  }

  const context = await resolveCourseLevelContext({
    tenantId: req.auth.tenantId,
    courseId,
    levelNumber,
    levelId,
    expectedScope: workspaceScope
  });

  const rows = [];
  const importErrors = [];
  const seenScopePromptKeys = new Set();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const difficulty = normalizeDifficulty(item?.difficulty) || "EASY";
    const prompt = normalizeString(item?.prompt ?? item?.question ?? item?.questionText);
    const operation = normalizeOperation(item?.operation ?? item?.operationType ?? item?.type);
    const correctAnswer = normalizeNumber(item?.correctAnswer ?? item?.answer);
    const operands = item?.operands && typeof item.operands === "object" ? item.operands : deriveOperandsFromPrompt(prompt);

    if (!prompt) {
      return res.apiError(400, `Row ${index + 1}: question/prompt is required`, "VALIDATION_ERROR");
    }

    if (correctAnswer === null) {
      return res.apiError(400, `Row ${index + 1}: answer/correctAnswer is required`, "VALIDATION_ERROR");
    }

    if (!operation) {
      return res.apiError(400, `Row ${index + 1}: operation is required`, "VALIDATION_ERROR");
    }

    if (!operands || typeof operands !== "object") {
      return res.apiError(400, `Row ${index + 1}: operands must be an object when provided`, "VALIDATION_ERROR");
    }

    const scopedCourseId = context?.courseId || null;
    const scopedCourseLevelId = context?.courseLevelId || null;
    const promptScopeKey = buildPromptScopeKey({
      courseId: scopedCourseId,
      courseLevelId: scopedCourseLevelId,
      prompt
    });

    if (seenScopePromptKeys.has(promptScopeKey)) {
      importErrors.push(`Row ${index + 1}: duplicate prompt in import payload for selected course level`);
      continue;
    }

    const duplicate = await findQuestionBankDuplicate({
      tenantId: req.auth.tenantId,
      levelId,
      prompt,
      courseId: scopedCourseId,
      courseLevelId: scopedCourseLevelId
    });

    if (duplicate) {
      importErrors.push(`Row ${index + 1}: prompt already exists in selected course level`);
      continue;
    }

    seenScopePromptKeys.add(promptScopeKey);

    rows.push({
      tenantId: req.auth.tenantId,
      levelId,
      difficulty,
      prompt,
      promptScopeKey,
      operands,
      operation,
      correctAnswer,
      courseId: scopedCourseId,
      courseLevelId: scopedCourseLevelId
    });
  }

  if (!rows.length) {
    return res.apiError(409, "All import rows were duplicates in selected course level", "QUESTION_BANK_IMPORT_DUPLICATE");
  }

  const created = await prisma.questionBank.createMany({
    data: rows,
    skipDuplicates: true
  });

  const inferredSkipped = Math.max(0, rows.length - created.count);
  const totalSkipped = importErrors.length + inferredSkipped;

  return res.apiSuccess(
    "Question bank imported",
    {
      importedCount: created.count,
      requestedCount: items.length,
      skippedCount: totalSkipped,
      errors: importErrors
    },
    201
  );
});

export {
  listQuestionBank,
  createQuestionBankEntry,
  updateQuestionBankEntry,
  deleteQuestionBankEntry,
  exportQuestionBankCsv,
  importQuestionBank
};
