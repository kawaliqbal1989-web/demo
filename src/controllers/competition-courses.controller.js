import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function parseStatus(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim().toUpperCase();
  if (normalized === "ACTIVE") return "ACTIVE";
  if (normalized === "ARCHIVED" || normalized === "INACTIVE") return "ARCHIVED";
  return null;
}

function normalizeDifficulty(value) {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  return ["EASY", "MEDIUM", "HARD"].includes(normalized) ? normalized : null;
}

function parsePaperStatus(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim().toUpperCase();
  if (["DRAFT", "PUBLISHED", "ARCHIVED"].includes(normalized)) {
    return normalized;
  }

  return null;
}

function parseBlueprintStatus(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim().toUpperCase();
  if (["DRAFT", "ACTIVE", "ARCHIVED"].includes(normalized)) {
    return normalized;
  }

  return null;
}

function normalizeNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function createSeededRandom(seedValue) {
  const hashed = crypto.createHash("sha256").update(String(seedValue)).digest("hex");
  let state = parseInt(hashed.slice(0, 8), 16) || 1;

  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeterministic(items, seed) {
  const rnd = createSeededRandom(seed);
  return items
    .map((item) => ({ item, sortKey: rnd() }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((entry) => entry.item);
}

function normalizeDistributionMap(value) {
  const parsed = safeJson(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    return null;
  }

  const entries = Object.entries(parsed)
    .map(([key, raw]) => {
      const normalizedKey = String(key || "").trim().toUpperCase();
      const normalizedValue = Number(raw);
      return normalizedKey && Number.isFinite(normalizedValue) && normalizedValue >= 0
        ? [normalizedKey, normalizedValue]
        : null;
    })
    .filter(Boolean);

  if (!entries.length) {
    return null;
  }

  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (Math.abs(total - 100) > 0.0001) {
    return null;
  }

  return Object.fromEntries(entries);
}

function normalizeOperationDistributionMap(value) {
  const parsed = safeJson(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    return null;
  }

  const entries = Object.entries(parsed)
    .map(([key, raw]) => {
      const normalizedKey = normalizeOperationName(key);
      const normalizedValue = Number(raw);
      return normalizedKey && Number.isFinite(normalizedValue) && normalizedValue >= 0
        ? [normalizedKey, normalizedValue]
        : null;
    })
    .filter(Boolean);

  if (!entries.length) {
    return null;
  }

  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (Math.abs(total - 100) > 0.0001) {
    return null;
  }

  return Object.fromEntries(entries);
}

function normalizeQuestionIdArray(value) {
  const parsed = safeJson(value);
  if (!Array.isArray(parsed)) {
    return null;
  }
  const ids = parsed.map((item) => String(item || "").trim()).filter(Boolean);
  return ids.length ? [...new Set(ids)] : [];
}

function distributionToCounts(distribution, total) {
  if (!distribution) {
    return null;
  }

  const entries = Object.entries(distribution).map(([key, percentage]) => {
    const raw = (Number(percentage) / 100) * total;
    return {
      key,
      floor: Math.floor(raw),
      fraction: raw - Math.floor(raw)
    };
  });

  let allocated = entries.reduce((sum, entry) => sum + entry.floor, 0);
  const counts = Object.fromEntries(entries.map((entry) => [entry.key, entry.floor]));

  entries
    .sort((a, b) => b.fraction - a.fraction || a.key.localeCompare(b.key))
    .forEach((entry) => {
      if (allocated < total) {
        counts[entry.key] += 1;
        allocated += 1;
      }
    });

  return counts;
}

function normalizeBlueprintBucket(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || "UNCATEGORIZED";
}

function normalizeOperationName(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "SUBTRACT") return "SUB";
  if (normalized === "MULTIPLY") return "MUL";
  if (normalized === "DIVIDE") return "DIV";
  if (normalized === "MIXED") return "MIX";
  if (["ADD", "SUB", "MUL", "DIV", "MIX"].includes(normalized)) return normalized;
  return null;
}

function normalizeSequenceRule(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "EASY_TO_HARD";
  if (["RANDOM", "EASY_TO_HARD", "OPERATION_GROUPED"].includes(normalized)) {
    return normalized;
  }
  return null;
}

function normalizeBooleanOrNull(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return null;
}

function parseAllowedOperations(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : String(value).split(",").map((item) => item.trim()).filter(Boolean);
          } catch {
            return String(value).split(",").map((item) => item.trim()).filter(Boolean);
          }
        })()
      : [];

  const normalized = raw
    .map(normalizeOperationName)
    .filter(Boolean);

  return normalized.length ? [...new Set(normalized)] : [];
}

function getQuestionTerms(questionRow) {
  const operands = questionRow?.questionBank?.operands;
  if (!operands || typeof operands !== "object") {
    return [];
  }

  const terms = Array.isArray(operands.terms)
    ? operands.terms
    : Array.isArray(operands.numbers)
      ? operands.numbers
      : [operands.a, operands.b].filter((value) => value !== undefined && value !== null);

  return terms.map((value) => Number(value)).filter((value) => Number.isFinite(value));
}

function getQuestionOperation(questionRow) {
  return normalizeOperationName(questionRow?.questionBank?.operation);
}

function getDigitCount(value) {
  const absolute = Math.abs(Number(value));
  if (!Number.isFinite(absolute)) {
    return null;
  }
  const text = Number.isInteger(absolute) ? String(Math.trunc(absolute)) : String(absolute).replace("-", "").replace(".", "");
  return text.length;
}

function getDecimalPlaces(value) {
  const text = String(value);
  const parts = text.split(".");
  return parts[1] ? parts[1].length : 0;
}

function evaluateLeftToRight(questionRow) {
  const terms = getQuestionTerms(questionRow);
  if (!terms.length) {
    return null;
  }

  const operation = getQuestionOperation(questionRow);
  const operands = questionRow?.questionBank?.operands || {};
  if (operation === "ADD") {
    return terms.reduce((sum, value) => sum + value, 0);
  }
  if (operation === "SUB") {
    return terms.slice(1).reduce((sum, value) => sum - value, terms[0]);
  }
  if (operation === "MUL") {
    return terms.slice(1).reduce((sum, value) => sum * value, terms[0]);
  }
  if (operation === "DIV") {
    return terms.slice(1).reduce((sum, value) => (value === 0 ? NaN : sum / value), terms[0]);
  }
  if (operation === "MIX" && Array.isArray(operands.operators)) {
    let total = terms[0];
    for (let index = 1; index < terms.length; index += 1) {
      const op = normalizeOperationName(operands.operators[index]);
      const next = terms[index];
      if (op === "ADD") total += next;
      else if (op === "SUB") total -= next;
      else if (op === "MUL") total *= next;
      else if (op === "DIV") {
        if (next === 0) return NaN;
        total /= next;
      } else {
        return NaN;
      }
    }
    return total;
  }
  return null;
}

function getQuestionDigitSpan(questionRow) {
  const terms = getQuestionTerms(questionRow);
  if (!terms.length) {
    return null;
  }

  const digits = terms.map(getDigitCount);
  if (digits.some((value) => value === null)) {
    return null;
  }
  return { min: Math.min(...digits), max: Math.max(...digits) };
}

function getQuestionDecimalPlacesSpan(questionRow) {
  const terms = getQuestionTerms(questionRow);
  if (!terms.length) {
    return null;
  }
  return Math.max(...terms.map(getDecimalPlaces));
}

function isQuestionEligibleForBlueprint(questionRow, blueprint) {
  const operation = getQuestionOperation(questionRow);
  const terms = getQuestionTerms(questionRow);
  const correctAnswer = Number(questionRow?.questionBank?.correctAnswer);
  const allowedOperations = Array.isArray(blueprint.allowedOperations) ? blueprint.allowedOperations.map(normalizeOperationName).filter(Boolean) : null;

  if (!terms.length || !Number.isFinite(correctAnswer)) {
    return { eligible: false, reason: "QUESTION_METADATA_INVALID" };
  }

  if (allowedOperations && allowedOperations.length && !allowedOperations.includes(operation)) {
    return { eligible: false, reason: "OPERATION" };
  }

  if (blueprint.minimumTermsPerQuestion !== null && blueprint.minimumTermsPerQuestion !== undefined && terms.length < blueprint.minimumTermsPerQuestion) {
    return { eligible: false, reason: "TERMS" };
  }
  if (blueprint.maximumTermsPerQuestion !== null && blueprint.maximumTermsPerQuestion !== undefined && terms.length > blueprint.maximumTermsPerQuestion) {
    return { eligible: false, reason: "TERMS" };
  }

  const digitSpan = getQuestionDigitSpan(questionRow);
  if (!digitSpan) {
    return { eligible: false, reason: "DIGITS" };
  }
  if (blueprint.minimumDigits !== null && blueprint.minimumDigits !== undefined && digitSpan.min < blueprint.minimumDigits) {
    return { eligible: false, reason: "DIGITS" };
  }
  if (blueprint.maximumDigits !== null && blueprint.maximumDigits !== undefined && digitSpan.max > blueprint.maximumDigits) {
    return { eligible: false, reason: "DIGITS" };
  }

  if (blueprint.minimumValue !== null && blueprint.minimumValue !== undefined) {
    if (terms.some((value) => value < blueprint.minimumValue)) {
      return { eligible: false, reason: "VALUE" };
    }
  }
  if (blueprint.maximumValue !== null && blueprint.maximumValue !== undefined) {
    if (terms.some((value) => value > blueprint.maximumValue)) {
      return { eligible: false, reason: "VALUE" };
    }
  }

  if (blueprint.allowZero === false && terms.some((value) => value === 0)) {
    return { eligible: false, reason: "ZERO" };
  }

  if (blueprint.allowDecimals === false && terms.some((value) => !Number.isInteger(value))) {
    return { eligible: false, reason: "DECIMALS" };
  }
  if (blueprint.decimalPlaces !== null && blueprint.decimalPlaces !== undefined) {
    const maxDecimalPlaces = getQuestionDecimalPlacesSpan(questionRow);
    if (maxDecimalPlaces > blueprint.decimalPlaces) {
      return { eligible: false, reason: "DECIMALS" };
    }
  }

  const evaluated = evaluateLeftToRight(questionRow);
  if (blueprint.allowNegativeFinalAnswer === false && Number.isFinite(evaluated) && evaluated < 0) {
    return { eligible: false, reason: "NEGATIVE_FINAL" };
  }
  if (blueprint.allowNegativeIntermediateResult === false) {
    const operationType = operation;
    const operands = terms;
    if (operationType === "SUB" || operationType === "MIX") {
      let current = operands[0];
      if (current < 0) {
        return { eligible: false, reason: "NEGATIVE_INTERMEDIATE" };
      }
      if (operationType === "SUB") {
        for (let index = 1; index < operands.length; index += 1) {
          current -= operands[index];
          if (current < 0) {
            return { eligible: false, reason: "NEGATIVE_INTERMEDIATE" };
          }
        }
      } else if (Array.isArray(questionRow?.questionBank?.operands?.operators)) {
        for (let index = 1; index < operands.length; index += 1) {
          const op = normalizeOperationName(questionRow.questionBank.operands.operators[index]);
          const next = operands[index];
          if (op === "ADD") current += next;
          else if (op === "SUB") current -= next;
          else if (op === "MUL") current *= next;
          else if (op === "DIV") {
            if (next === 0) return { eligible: false, reason: "NEGATIVE_INTERMEDIATE" };
            current /= next;
          }
          if (current < 0) {
            return { eligible: false, reason: "NEGATIVE_INTERMEDIATE" };
          }
        }
      }
    }
  }

  return { eligible: true, operation, terms, correctAnswer };
}

function isUniqueConstraintError(error) {
  return String(error?.code || "") === "P2002";
}

function selectCompetitionCourse() {
  return {
    id: true,
    tenantId: true,
    code: true,
    name: true,
    description: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    _count: { select: { levels: true, competitions: true } }
  };
}

function selectCompetitionCourseLevel() {
  return {
    id: true,
    tenantId: true,
    competitionCourseId: true,
    levelNumber: true,
    title: true,
    description: true,
    sortOrder: true,
    isActive: true,
    createdAt: true,
    updatedAt: true
  };
}

async function findTenantCompetitionCourse({ tenantId, id }) {
  return prisma.competitionCourse.findFirst({
    where: { id, tenantId },
    select: { id: true }
  });
}

async function findTenantCompetitionCourseLevel({ tenantId, courseId, levelId }) {
  const course = await findTenantCompetitionCourse({ tenantId, id: courseId });
  if (!course) return null;
  return prisma.competitionCourseLevel.findFirst({
    where: { id: levelId, tenantId, competitionCourseId: course.id },
    select: { id: true, competitionCourseId: true }
  });
}

async function findTenantCompetitionCoursePaper({ tenantId, courseId, levelId, paperId }) {
  const level = await findTenantCompetitionCourseLevel({ tenantId, courseId, levelId });
  if (!level) return null;
  return prisma.competitionCoursePaper.findFirst({
    where: { id: paperId, tenantId, competitionCourseLevelId: level.id },
    select: { id: true, competitionCourseLevelId: true }
  });
}

async function findTenantCompetitionCoursePaperBlueprint({ tenantId, courseId, levelId, paperId, blueprintId }) {
  const paper = await findTenantCompetitionCoursePaper({ tenantId, courseId, levelId, paperId });
  if (!paper) return null;
  return prisma.competitionCoursePaperBlueprint.findFirst({
    where: { id: blueprintId, tenantId, competitionCoursePaperId: paper.id },
    select: selectCompetitionCoursePaperBlueprint()
  });
}

function selectCompetitionCoursePaper() {
  return {
    id: true,
    tenantId: true,
    competitionCourseLevelId: true,
    code: true,
    title: true,
    description: true,
    sortOrder: true,
    status: true,
    isActive: true,
    createdAt: true,
    updatedAt: true
  };
}

function selectCompetitionCoursePaperBlueprint() {
  return {
    id: true,
    tenantId: true,
    competitionCoursePaperId: true,
    title: true,
    version: true,
    status: true,
    totalQuestions: true,
    totalMarks: true,
    durationMinutes: true,
    marksPerQuestion: true,
    generationSeed: true,
    allowedOperations: true,
    minimumTermsPerQuestion: true,
    maximumTermsPerQuestion: true,
    minimumDigits: true,
    maximumDigits: true,
    minimumValue: true,
    maximumValue: true,
    allowCarry: true,
    allowBorrow: true,
    carryQuestionPercentage: true,
    borrowQuestionPercentage: true,
    allowNegativeIntermediateResult: true,
    allowNegativeFinalAnswer: true,
    allowZero: true,
    allowDecimals: true,
    decimalPlaces: true,
    sequenceRule: true,
    difficultyDistribution: true,
    categoryDistribution: true,
    operationDistribution: true,
    mandatoryQuestionIds: true,
    randomizeQuestions: true,
    randomizeOptions: true,
    instructions: true,
    sortOrder: true,
    createdAt: true,
    updatedAt: true
  };
}

function selectCompetitionCourseLevelQuestion() {
  return {
    id: true,
    tenantId: true,
    competitionCourseLevelId: true,
    questionBankId: true,
    sortOrder: true,
    marks: true,
    negativeMarks: true,
    difficultyWeight: true,
    isMandatory: true,
    isActive: true,
    displayGroup: true,
    createdAt: true,
    updatedAt: true,
    questionBank: {
      select: {
        id: true,
        difficulty: true,
        prompt: true,
        operands: true,
        operation: true,
        correctAnswer: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    }
  };
}

function flattenCompetitionCourseLevelQuestion(row) {
  return {
    ...(row.questionBank || {}),
    id: row.id,
    mappingId: row.id,
    competitionCourseLevelId: row.competitionCourseLevelId,
    questionBankId: row.questionBankId,
    sortOrder: row.sortOrder,
    marks: row.marks,
    negativeMarks: row.negativeMarks,
    difficultyWeight: row.difficultyWeight,
    isMandatory: row.isMandatory,
    isActive: row.isActive,
    displayGroup: row.displayGroup,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function upsertQuestionBankRepositoryEntry({ tx = prisma, tenantId, payload }) {
  const questionBankId = normalizeString(payload.questionBankId);
  if (questionBankId) {
    const existing = await tx.questionBank.findFirst({
      where: { id: questionBankId, tenantId },
      select: { id: true }
    });
    if (!existing) {
      const error = new Error("Question bank entry not found");
      error.statusCode = 404;
      error.errorCode = "QUESTION_NOT_FOUND";
      throw error;
    }
    return existing.id;
  }

  const difficulty = normalizeDifficulty(payload.difficulty) || "EASY";
  const prompt = normalizeString(payload.prompt);
  const operands = safeJson(payload.operands);
  const operation = normalizeString(payload.operation);
  const correctAnswer = normalizeNumber(payload.correctAnswer);

  if (!prompt || !operation || correctAnswer === null || !operands || typeof operands !== "object") {
    const error = new Error("prompt, operation, operands, correctAnswer are required");
    error.statusCode = 400;
    error.errorCode = "VALIDATION_ERROR";
    throw error;
  }

  const existing = await tx.questionBank.findFirst({
    where: { tenantId, prompt },
    select: { id: true }
  });

  if (existing) {
    await tx.questionBank.update({
      where: { id: existing.id },
      data: { difficulty, operands, operation, correctAnswer, isActive: true }
    });
    return existing.id;
  }

  const created = await tx.questionBank.create({
    data: { tenantId, difficulty, prompt, operands, operation, correctAnswer }
  });
  return created.id;
}

async function ensureCompetitionCourseLevelQuestion(tenantId, competitionCourseLevelId, questionBankId) {
  const existing = await prisma.competitionCourseLevelQuestion.findFirst({
    where: { tenantId, competitionCourseLevelId, questionBankId }
  });

  if (!existing) {
    await prisma.competitionCourseLevelQuestion.create({
      data: { tenantId, competitionCourseLevelId, questionBankId }
    });
  }
}

const listCompetitionCourses = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset, orderBy } = parsePagination(req.query);
  const q = normalizeString(req.query.q);
  const status = parseStatus(req.query.status);

  const where = { tenantId: req.auth.tenantId };
  if (q) {
    where.OR = [
      { code: { contains: q } },
      { name: { contains: q } }
    ];
  }
  if (status === "ACTIVE") where.isActive = true;
  if (status === "ARCHIVED") where.isActive = false;

  const [total, items] = await prisma.$transaction([
    prisma.competitionCourse.count({ where }),
    prisma.competitionCourse.findMany({
      where,
      orderBy,
      skip,
      take,
      select: selectCompetitionCourse()
    })
  ]);

  return res.apiSuccess("Competition courses fetched", { items, total, limit, offset });
});

const createCompetitionCourse = asyncHandler(async (req, res) => {
  const code = normalizeString(req.body.code);
  const name = normalizeString(req.body.name);
  const description = normalizeString(req.body.description);
  const status = parseStatus(req.body.status);

  if (!code || !name) {
    return res.apiError(400, "code and name are required", "VALIDATION_ERROR");
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const course = await tx.competitionCourse.create({
        data: {
          tenantId: req.auth.tenantId,
          code,
          name,
          description,
          isActive: status === "ARCHIVED" ? false : true
        },
        select: selectCompetitionCourse()
      });

      await tx.competitionCourseLevel.createMany({
        data: Array.from({ length: 8 }).map((_, index) => {
          const levelNumber = index + 1;
          return {
            tenantId: req.auth.tenantId,
            competitionCourseId: course.id,
            levelNumber,
            title: `Level ${levelNumber}`,
            sortOrder: levelNumber,
            isActive: true
          };
        }),
        skipDuplicates: true
      });

      return course;
    });

    res.locals.entityId = created.id;
    return res.apiSuccess("Competition course created", created, 201);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.apiError(409, "Competition course code already exists", "COMPETITION_COURSE_EXISTS");
    }
    throw error;
  }
});

const getCompetitionCourse = asyncHandler(async (req, res) => {
  const course = await prisma.competitionCourse.findFirst({
    where: { id: req.params.id, tenantId: req.auth.tenantId },
    select: {
      ...selectCompetitionCourse(),
      levels: {
        orderBy: [{ sortOrder: "asc" }, { levelNumber: "asc" }],
        select: selectCompetitionCourseLevel()
      }
    }
  });

  if (!course) {
    return res.apiError(404, "Competition course not found", "COMPETITION_COURSE_NOT_FOUND");
  }

  return res.apiSuccess("Competition course fetched", course);
});

const updateCompetitionCourse = asyncHandler(async (req, res) => {
  const existing = await findTenantCompetitionCourse({ tenantId: req.auth.tenantId, id: req.params.id });
  if (!existing) {
    return res.apiError(404, "Competition course not found", "COMPETITION_COURSE_NOT_FOUND");
  }

  const code = normalizeString(req.body.code);
  const name = normalizeString(req.body.name);
  const description = normalizeString(req.body.description);
  const status = parseStatus(req.body.status);

  try {
    const updated = await prisma.competitionCourse.update({
      where: { id: existing.id },
      data: {
        code: code ?? undefined,
        name: name ?? undefined,
        description: req.body.description === null ? null : description ?? undefined,
        isActive: status ? status === "ACTIVE" : undefined
      },
      select: selectCompetitionCourse()
    });

    res.locals.entityId = updated.id;
    return res.apiSuccess("Competition course updated", updated);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.apiError(409, "Competition course code already exists", "COMPETITION_COURSE_EXISTS");
    }
    throw error;
  }
});

const archiveCompetitionCourse = asyncHandler(async (req, res) => {
  const existing = await findTenantCompetitionCourse({ tenantId: req.auth.tenantId, id: req.params.id });
  if (!existing) {
    return res.apiError(404, "Competition course not found", "COMPETITION_COURSE_NOT_FOUND");
  }

  const updated = await prisma.competitionCourse.update({
    where: { id: existing.id },
    data: { isActive: false },
    select: selectCompetitionCourse()
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Competition course archived", updated);
});

const listCompetitionCourseLevels = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset } = parsePagination(req.query);
  const status = parseStatus(req.query.status);
  const course = await findTenantCompetitionCourse({ tenantId: req.auth.tenantId, id: req.params.courseId });
  if (!course) {
    return res.apiError(404, "Competition course not found", "COMPETITION_COURSE_NOT_FOUND");
  }

  const where = {
    tenantId: req.auth.tenantId,
    competitionCourseId: course.id
  };
  if (status === "ACTIVE") where.isActive = true;
  if (status === "ARCHIVED") where.isActive = false;

  const [total, items] = await prisma.$transaction([
    prisma.competitionCourseLevel.count({ where }),
    prisma.competitionCourseLevel.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { levelNumber: "asc" }],
      skip,
      take,
      select: selectCompetitionCourseLevel()
    })
  ]);

  return res.apiSuccess("Competition course levels fetched", { items, total, limit, offset });
});

const createCompetitionCourseLevel = asyncHandler(async (req, res) => {
  const course = await findTenantCompetitionCourse({ tenantId: req.auth.tenantId, id: req.params.courseId });
  if (!course) {
    return res.apiError(404, "Competition course not found", "COMPETITION_COURSE_NOT_FOUND");
  }

  const levelNumber = Number(req.body.levelNumber);
  const sortOrder = req.body.sortOrder === undefined ? levelNumber : Number(req.body.sortOrder);
  const title = normalizeString(req.body.title);
  const description = normalizeString(req.body.description);
  const status = parseStatus(req.body.status);

  if (!Number.isInteger(levelNumber) || levelNumber < 1) {
    return res.apiError(400, "levelNumber must be a positive integer", "VALIDATION_ERROR");
  }
  if (!Number.isInteger(sortOrder)) {
    return res.apiError(400, "sortOrder must be an integer", "VALIDATION_ERROR");
  }

  try {
    const created = await prisma.competitionCourseLevel.create({
      data: {
        tenantId: req.auth.tenantId,
        competitionCourseId: course.id,
        levelNumber,
        title: title || `Level ${levelNumber}`,
        description,
        sortOrder,
        isActive: status === "ARCHIVED" ? false : true
      },
      select: selectCompetitionCourseLevel()
    });

    res.locals.entityId = created.id;
    return res.apiSuccess("Competition course level created", created, 201);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.apiError(409, "Level number already exists for this competition course", "COMPETITION_COURSE_LEVEL_EXISTS");
    }
    throw error;
  }
});

const updateCompetitionCourseLevel = asyncHandler(async (req, res) => {
  const course = await findTenantCompetitionCourse({ tenantId: req.auth.tenantId, id: req.params.courseId });
  if (!course) {
    return res.apiError(404, "Competition course not found", "COMPETITION_COURSE_NOT_FOUND");
  }

  const existing = await prisma.competitionCourseLevel.findFirst({
    where: {
      id: req.params.levelId,
      competitionCourseId: course.id,
      tenantId: req.auth.tenantId
    },
    select: { id: true }
  });
  if (!existing) {
    return res.apiError(404, "Competition course level not found", "COMPETITION_COURSE_LEVEL_NOT_FOUND");
  }

  const title = normalizeString(req.body.title);
  const description = normalizeString(req.body.description);
  const sortOrder = req.body.sortOrder === undefined ? null : Number(req.body.sortOrder);
  const status = parseStatus(req.body.status);

  if (sortOrder !== null && !Number.isInteger(sortOrder)) {
    return res.apiError(400, "sortOrder must be an integer", "VALIDATION_ERROR");
  }

  const updated = await prisma.competitionCourseLevel.update({
    where: { id: existing.id },
    data: {
      title: title ?? undefined,
      description: req.body.description === null ? null : description ?? undefined,
      sortOrder: sortOrder ?? undefined,
      isActive: status ? status === "ACTIVE" : undefined
    },
    select: selectCompetitionCourseLevel()
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Competition course level updated", updated);
});

const listCompetitionCoursePapers = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset } = parsePagination(req.query);
  const course = await findTenantCompetitionCourse({ tenantId: req.auth.tenantId, id: req.params.courseId });
  if (!course) {
    return res.apiError(404, "Competition course not found", "COMPETITION_COURSE_NOT_FOUND");
  }

  const level = await prisma.competitionCourseLevel.findFirst({
    where: {
      id: req.params.levelId,
      tenantId: req.auth.tenantId,
      competitionCourseId: course.id
    },
    select: { id: true }
  });
  if (!level) {
    return res.apiError(404, "Competition course level not found", "COMPETITION_COURSE_LEVEL_NOT_FOUND");
  }

  const status = parsePaperStatus(req.query.status);
  const q = normalizeString(req.query.q);

  const where = {
    tenantId: req.auth.tenantId,
    competitionCourseLevelId: level.id
  };

  if (status) {
    where.status = status;
  }
  if (q) {
    where.OR = [
      { code: { contains: q } },
      { title: { contains: q } }
    ];
  }

  const [total, items] = await prisma.$transaction([
    prisma.competitionCoursePaper.count({ where }),
    prisma.competitionCoursePaper.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      skip,
      take,
      select: selectCompetitionCoursePaper()
    })
  ]);

  return res.apiSuccess("Competition course papers fetched", { items, total, limit, offset });
});

const createCompetitionCoursePaper = asyncHandler(async (req, res) => {
  const course = await findTenantCompetitionCourse({ tenantId: req.auth.tenantId, id: req.params.courseId });
  if (!course) {
    return res.apiError(404, "Competition course not found", "COMPETITION_COURSE_NOT_FOUND");
  }

  const level = await prisma.competitionCourseLevel.findFirst({
    where: {
      id: req.params.levelId,
      tenantId: req.auth.tenantId,
      competitionCourseId: course.id
    },
    select: { id: true }
  });
  if (!level) {
    return res.apiError(404, "Competition course level not found", "COMPETITION_COURSE_LEVEL_NOT_FOUND");
  }

  const title = normalizeString(req.body.title);
  const code = normalizeString(req.body.code);
  const description = normalizeString(req.body.description);
  const sortOrder = req.body.sortOrder === undefined ? 0 : normalizeNumber(req.body.sortOrder, 0);
  const status = parsePaperStatus(req.body.status) || "DRAFT";

  if (!title) {
    return res.apiError(400, "title is required", "VALIDATION_ERROR");
  }
  if (sortOrder === null || !Number.isInteger(sortOrder)) {
    return res.apiError(400, "sortOrder must be an integer", "VALIDATION_ERROR");
  }

  const created = await prisma.competitionCoursePaper.create({
    data: {
      tenantId: req.auth.tenantId,
      competitionCourseLevelId: level.id,
      code,
      title,
      description,
      sortOrder,
      status,
      isActive: status !== "ARCHIVED"
    },
    select: selectCompetitionCoursePaper()
  });

  res.locals.entityId = created.id;
  return res.apiSuccess("Competition course paper created", created, 201);
});

const updateCompetitionCoursePaper = asyncHandler(async (req, res) => {
  const paper = await findTenantCompetitionCoursePaper({
    tenantId: req.auth.tenantId,
    courseId: req.params.courseId,
    levelId: req.params.levelId,
    paperId: req.params.paperId
  });
  if (!paper) {
    return res.apiError(404, "Competition course paper not found", "COMPETITION_COURSE_PAPER_NOT_FOUND");
  }

  const title = req.body.title === undefined ? null : normalizeString(req.body.title);
  const code = req.body.code === undefined ? null : normalizeString(req.body.code);
  const description = req.body.description === undefined ? null : normalizeString(req.body.description);
  const sortOrder = req.body.sortOrder === undefined ? null : normalizeNumber(req.body.sortOrder, 0);
  const status = req.body.status === undefined ? null : parsePaperStatus(req.body.status);

  if (req.body.title !== undefined && !title) {
    return res.apiError(400, "title is required", "VALIDATION_ERROR");
  }
  if (req.body.sortOrder !== undefined && (sortOrder === null || !Number.isInteger(sortOrder))) {
    return res.apiError(400, "sortOrder must be an integer", "VALIDATION_ERROR");
  }
  if (req.body.status !== undefined && !status) {
    return res.apiError(400, "status must be DRAFT, PUBLISHED, or ARCHIVED", "VALIDATION_ERROR");
  }

  const updated = await prisma.competitionCoursePaper.update({
    where: { id: paper.id },
    data: {
      title: title ?? undefined,
      code: code ?? undefined,
      description: req.body.description === null ? null : description ?? undefined,
      sortOrder: sortOrder ?? undefined,
      status: status ?? undefined,
      isActive: status ? status !== "ARCHIVED" : undefined
    },
    select: selectCompetitionCoursePaper()
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Competition course paper updated", updated);
});

const archiveCompetitionCoursePaper = asyncHandler(async (req, res) => {
  const paper = await findTenantCompetitionCoursePaper({
    tenantId: req.auth.tenantId,
    courseId: req.params.courseId,
    levelId: req.params.levelId,
    paperId: req.params.paperId
  });
  if (!paper) {
    return res.apiError(404, "Competition course paper not found", "COMPETITION_COURSE_PAPER_NOT_FOUND");
  }

  const updated = await prisma.competitionCoursePaper.update({
    where: { id: paper.id },
    data: { status: "ARCHIVED", isActive: false },
    select: selectCompetitionCoursePaper()
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Competition course paper archived", updated);
});

const listCompetitionCoursePaperBlueprints = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset } = parsePagination(req.query);
  const paper = await findTenantCompetitionCoursePaper({
    tenantId: req.auth.tenantId,
    courseId: req.params.courseId,
    levelId: req.params.levelId,
    paperId: req.params.paperId
  });
  if (!paper) {
    return res.apiError(404, "Competition course paper not found", "COMPETITION_COURSE_PAPER_NOT_FOUND");
  }

  const status = parseBlueprintStatus(req.query.status);
  const q = normalizeString(req.query.q);
  const where = {
    tenantId: req.auth.tenantId,
    competitionCoursePaperId: paper.id
  };

  if (status) {
    where.status = status;
  }
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { instructions: { contains: q } }
    ];
  }

  const [total, items] = await prisma.$transaction([
    prisma.competitionCoursePaperBlueprint.count({ where }),
    prisma.competitionCoursePaperBlueprint.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { version: "asc" }, { createdAt: "asc" }],
      skip,
      take,
      select: selectCompetitionCoursePaperBlueprint()
    })
  ]);

  return res.apiSuccess("Competition course paper blueprints fetched", { items, total, limit, offset });
});

const createCompetitionCoursePaperBlueprint = asyncHandler(async (req, res) => {
  const paper = await findTenantCompetitionCoursePaper({
    tenantId: req.auth.tenantId,
    courseId: req.params.courseId,
    levelId: req.params.levelId,
    paperId: req.params.paperId
  });
  if (!paper) {
    return res.apiError(404, "Competition course paper not found", "COMPETITION_COURSE_PAPER_NOT_FOUND");
  }

  const title = normalizeString(req.body.title);
  const status = parseBlueprintStatus(req.body.status) || "DRAFT";
  const version = req.body.version === undefined ? null : normalizeNumber(req.body.version, null);
  const totalQuestions = req.body.totalQuestions === undefined ? null : normalizeNumber(req.body.totalQuestions, null);
  const totalMarks = req.body.totalMarks === undefined ? null : normalizeNumber(req.body.totalMarks, null);
  const durationMinutes = req.body.durationMinutes === undefined ? null : normalizeNumber(req.body.durationMinutes, null);
  const marksPerQuestion = req.body.marksPerQuestion === undefined ? null : normalizeNumber(req.body.marksPerQuestion, null);
  const minimumTermsPerQuestion = req.body.minimumTermsPerQuestion === undefined ? null : normalizeNumber(req.body.minimumTermsPerQuestion, null);
  const maximumTermsPerQuestion = req.body.maximumTermsPerQuestion === undefined ? null : normalizeNumber(req.body.maximumTermsPerQuestion, null);
  const minimumDigits = req.body.minimumDigits === undefined ? null : normalizeNumber(req.body.minimumDigits, null);
  const maximumDigits = req.body.maximumDigits === undefined ? null : normalizeNumber(req.body.maximumDigits, null);
  const minimumValue = req.body.minimumValue === undefined ? null : normalizeNumber(req.body.minimumValue, null);
  const maximumValue = req.body.maximumValue === undefined ? null : normalizeNumber(req.body.maximumValue, null);
  const carryQuestionPercentage = req.body.carryQuestionPercentage === undefined ? null : normalizeNumber(req.body.carryQuestionPercentage, null);
  const borrowQuestionPercentage = req.body.borrowQuestionPercentage === undefined ? null : normalizeNumber(req.body.borrowQuestionPercentage, null);
  const decimalPlaces = req.body.decimalPlaces === undefined ? null : normalizeNumber(req.body.decimalPlaces, null);
  const sortOrder = req.body.sortOrder === undefined ? 0 : normalizeNumber(req.body.sortOrder, 0);
  const sequenceRule = req.body.sequenceRule === undefined ? "EASY_TO_HARD" : normalizeSequenceRule(req.body.sequenceRule);
  const allowedOperations = parseAllowedOperations(req.body.allowedOperations);
  const allowCarry = normalizeBooleanOrNull(req.body.allowCarry);
  const allowBorrow = normalizeBooleanOrNull(req.body.allowBorrow);
  const allowNegativeIntermediateResult = normalizeBooleanOrNull(req.body.allowNegativeIntermediateResult);
  const allowNegativeFinalAnswer = normalizeBooleanOrNull(req.body.allowNegativeFinalAnswer);
  const allowZero = normalizeBooleanOrNull(req.body.allowZero);
  const allowDecimals = normalizeBooleanOrNull(req.body.allowDecimals);
  const generationSeed = normalizeString(req.body.generationSeed);

  if (!title) {
    return res.apiError(400, "title is required", "VALIDATION_ERROR");
  }
  if (version !== null && !Number.isInteger(version)) {
    return res.apiError(400, "version must be an integer", "VALIDATION_ERROR");
  }
  if (sortOrder === null || !Number.isInteger(sortOrder)) {
    return res.apiError(400, "sortOrder must be an integer", "VALIDATION_ERROR");
  }
  if (sequenceRule === null) {
    return res.apiError(400, "sequenceRule must be RANDOM, EASY_TO_HARD, or OPERATION_GROUPED", "VALIDATION_ERROR");
  }
  if (marksPerQuestion !== null && !Number.isFinite(marksPerQuestion)) {
    return res.apiError(400, "marksPerQuestion must be numeric", "VALIDATION_ERROR");
  }
  if (marksPerQuestion !== null && totalQuestions !== null && totalMarks !== null && Math.abs((marksPerQuestion * totalQuestions) - totalMarks) > 0.0001) {
    return res.apiError(400, "marksPerQuestion and totalMarks do not match totalQuestions", "VALIDATION_ERROR");
  }
  if (minimumTermsPerQuestion !== null && !Number.isInteger(minimumTermsPerQuestion)) {
    return res.apiError(400, "minimumTermsPerQuestion must be an integer", "VALIDATION_ERROR");
  }
  if (maximumTermsPerQuestion !== null && !Number.isInteger(maximumTermsPerQuestion)) {
    return res.apiError(400, "maximumTermsPerQuestion must be an integer", "VALIDATION_ERROR");
  }
  if (minimumDigits !== null && !Number.isInteger(minimumDigits)) {
    return res.apiError(400, "minimumDigits must be an integer", "VALIDATION_ERROR");
  }
  if (maximumDigits !== null && !Number.isInteger(maximumDigits)) {
    return res.apiError(400, "maximumDigits must be an integer", "VALIDATION_ERROR");
  }
  if (carryQuestionPercentage !== null && (!Number.isInteger(carryQuestionPercentage) || carryQuestionPercentage < 0 || carryQuestionPercentage > 100)) {
    return res.apiError(400, "carryQuestionPercentage must be between 0 and 100", "VALIDATION_ERROR");
  }
  if (borrowQuestionPercentage !== null && (!Number.isInteger(borrowQuestionPercentage) || borrowQuestionPercentage < 0 || borrowQuestionPercentage > 100)) {
    return res.apiError(400, "borrowQuestionPercentage must be between 0 and 100", "VALIDATION_ERROR");
  }
  if (decimalPlaces !== null && (!Number.isInteger(decimalPlaces) || decimalPlaces < 0)) {
    return res.apiError(400, "decimalPlaces must be a non-negative integer", "VALIDATION_ERROR");
  }

  const maxVersion = await prisma.competitionCoursePaperBlueprint.aggregate({
    where: { tenantId: req.auth.tenantId, competitionCoursePaperId: paper.id },
    _max: { version: true }
  });
  const nextVersion = version ?? ((maxVersion?._max?.version || 0) + 1);

  let created;
  try {
    created = await prisma.competitionCoursePaperBlueprint.create({
      data: {
        tenantId: req.auth.tenantId,
        competitionCoursePaperId: paper.id,
        title,
        version: nextVersion,
        status,
        totalQuestions,
        totalMarks,
        durationMinutes,
        marksPerQuestion,
        generationSeed,
        allowedOperations,
        minimumTermsPerQuestion,
        maximumTermsPerQuestion,
        minimumDigits,
        maximumDigits,
        minimumValue,
        maximumValue,
        allowCarry,
        allowBorrow,
        carryQuestionPercentage,
        borrowQuestionPercentage,
        allowNegativeIntermediateResult,
        allowNegativeFinalAnswer,
        allowZero,
        allowDecimals,
        decimalPlaces,
        sequenceRule,
        difficultyDistribution: req.body.difficultyDistribution === undefined ? undefined : safeJson(req.body.difficultyDistribution),
        categoryDistribution: req.body.categoryDistribution === undefined ? undefined : safeJson(req.body.categoryDistribution),
        operationDistribution: req.body.operationDistribution === undefined ? undefined : normalizeOperationDistributionMap(req.body.operationDistribution),
        mandatoryQuestionIds: req.body.mandatoryQuestionIds === undefined ? undefined : safeJson(req.body.mandatoryQuestionIds),
        randomizeQuestions: Boolean(req.body.randomizeQuestions),
        randomizeOptions: Boolean(req.body.randomizeOptions),
        instructions: normalizeString(req.body.instructions),
        sortOrder
      },
      select: selectCompetitionCoursePaperBlueprint()
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.apiError(409, "Blueprint version already exists for this paper", "COMPETITION_COURSE_PAPER_BLUEPRINT_EXISTS");
    }
    throw error;
  }

  res.locals.entityId = created.id;
  return res.apiSuccess("Competition course paper blueprint created", created, 201);
});

const updateCompetitionCoursePaperBlueprint = asyncHandler(async (req, res) => {
  const blueprint = await findTenantCompetitionCoursePaperBlueprint({
    tenantId: req.auth.tenantId,
    courseId: req.params.courseId,
    levelId: req.params.levelId,
    paperId: req.params.paperId,
    blueprintId: req.params.blueprintId
  });
  if (!blueprint) {
    return res.apiError(404, "Competition course paper blueprint not found", "COMPETITION_COURSE_PAPER_BLUEPRINT_NOT_FOUND");
  }

  const title = req.body.title === undefined ? null : normalizeString(req.body.title);
  const status = req.body.status === undefined ? null : parseBlueprintStatus(req.body.status);
  const version = req.body.version === undefined ? null : normalizeNumber(req.body.version, null);
  const totalQuestions = req.body.totalQuestions === undefined ? null : normalizeNumber(req.body.totalQuestions, null);
  const totalMarks = req.body.totalMarks === undefined ? null : normalizeNumber(req.body.totalMarks, null);
  const durationMinutes = req.body.durationMinutes === undefined ? null : normalizeNumber(req.body.durationMinutes, null);
  const marksPerQuestion = req.body.marksPerQuestion === undefined ? null : normalizeNumber(req.body.marksPerQuestion, null);
  const minimumTermsPerQuestion = req.body.minimumTermsPerQuestion === undefined ? null : normalizeNumber(req.body.minimumTermsPerQuestion, null);
  const maximumTermsPerQuestion = req.body.maximumTermsPerQuestion === undefined ? null : normalizeNumber(req.body.maximumTermsPerQuestion, null);
  const minimumDigits = req.body.minimumDigits === undefined ? null : normalizeNumber(req.body.minimumDigits, null);
  const maximumDigits = req.body.maximumDigits === undefined ? null : normalizeNumber(req.body.maximumDigits, null);
  const minimumValue = req.body.minimumValue === undefined ? null : normalizeNumber(req.body.minimumValue, null);
  const maximumValue = req.body.maximumValue === undefined ? null : normalizeNumber(req.body.maximumValue, null);
  const carryQuestionPercentage = req.body.carryQuestionPercentage === undefined ? null : normalizeNumber(req.body.carryQuestionPercentage, null);
  const borrowQuestionPercentage = req.body.borrowQuestionPercentage === undefined ? null : normalizeNumber(req.body.borrowQuestionPercentage, null);
  const decimalPlaces = req.body.decimalPlaces === undefined ? null : normalizeNumber(req.body.decimalPlaces, null);
  const sortOrder = req.body.sortOrder === undefined ? null : normalizeNumber(req.body.sortOrder, 0);
  const sequenceRule = req.body.sequenceRule === undefined ? null : normalizeSequenceRule(req.body.sequenceRule);
  const allowedOperations = req.body.allowedOperations === undefined ? undefined : parseAllowedOperations(req.body.allowedOperations);
  const allowCarry = normalizeBooleanOrNull(req.body.allowCarry);
  const allowBorrow = normalizeBooleanOrNull(req.body.allowBorrow);
  const allowNegativeIntermediateResult = normalizeBooleanOrNull(req.body.allowNegativeIntermediateResult);
  const allowNegativeFinalAnswer = normalizeBooleanOrNull(req.body.allowNegativeFinalAnswer);
  const allowZero = normalizeBooleanOrNull(req.body.allowZero);
  const allowDecimals = normalizeBooleanOrNull(req.body.allowDecimals);
  const generationSeed = req.body.generationSeed === undefined ? null : normalizeString(req.body.generationSeed);

  if (req.body.title !== undefined && !title) {
    return res.apiError(400, "title is required", "VALIDATION_ERROR");
  }
  if (req.body.status !== undefined && !status) {
    return res.apiError(400, "status must be DRAFT, ACTIVE, or ARCHIVED", "VALIDATION_ERROR");
  }
  if (req.body.version !== undefined && (version === null || !Number.isInteger(version))) {
    return res.apiError(400, "version must be an integer", "VALIDATION_ERROR");
  }
  if (req.body.sortOrder !== undefined && (sortOrder === null || !Number.isInteger(sortOrder))) {
    return res.apiError(400, "sortOrder must be an integer", "VALIDATION_ERROR");
  }
  if (req.body.sequenceRule !== undefined && sequenceRule === null) {
    return res.apiError(400, "sequenceRule must be RANDOM, EASY_TO_HARD, or OPERATION_GROUPED", "VALIDATION_ERROR");
  }
  if (req.body.marksPerQuestion !== undefined && (marksPerQuestion === null || !Number.isFinite(marksPerQuestion))) {
    return res.apiError(400, "marksPerQuestion must be numeric", "VALIDATION_ERROR");
  }
  if (req.body.marksPerQuestion !== undefined && totalQuestions !== null && totalMarks !== null && Math.abs((marksPerQuestion * totalQuestions) - totalMarks) > 0.0001) {
    return res.apiError(400, "marksPerQuestion and totalMarks do not match totalQuestions", "VALIDATION_ERROR");
  }
  if (req.body.minimumTermsPerQuestion !== undefined && (minimumTermsPerQuestion === null || !Number.isInteger(minimumTermsPerQuestion))) {
    return res.apiError(400, "minimumTermsPerQuestion must be an integer", "VALIDATION_ERROR");
  }
  if (req.body.maximumTermsPerQuestion !== undefined && (maximumTermsPerQuestion === null || !Number.isInteger(maximumTermsPerQuestion))) {
    return res.apiError(400, "maximumTermsPerQuestion must be an integer", "VALIDATION_ERROR");
  }
  if (req.body.minimumDigits !== undefined && (minimumDigits === null || !Number.isInteger(minimumDigits))) {
    return res.apiError(400, "minimumDigits must be an integer", "VALIDATION_ERROR");
  }
  if (req.body.maximumDigits !== undefined && (maximumDigits === null || !Number.isInteger(maximumDigits))) {
    return res.apiError(400, "maximumDigits must be an integer", "VALIDATION_ERROR");
  }
  if (req.body.carryQuestionPercentage !== undefined && (carryQuestionPercentage === null || !Number.isInteger(carryQuestionPercentage) || carryQuestionPercentage < 0 || carryQuestionPercentage > 100)) {
    return res.apiError(400, "carryQuestionPercentage must be between 0 and 100", "VALIDATION_ERROR");
  }
  if (req.body.borrowQuestionPercentage !== undefined && (borrowQuestionPercentage === null || !Number.isInteger(borrowQuestionPercentage) || borrowQuestionPercentage < 0 || borrowQuestionPercentage > 100)) {
    return res.apiError(400, "borrowQuestionPercentage must be between 0 and 100", "VALIDATION_ERROR");
  }
  if (req.body.decimalPlaces !== undefined && (decimalPlaces === null || !Number.isInteger(decimalPlaces) || decimalPlaces < 0)) {
    return res.apiError(400, "decimalPlaces must be a non-negative integer", "VALIDATION_ERROR");
  }

  let updated;
  try {
    updated = await prisma.competitionCoursePaperBlueprint.update({
      where: { id: blueprint.id },
      data: {
        title: title ?? undefined,
        version: version ?? undefined,
        status: status ?? undefined,
        totalQuestions: totalQuestions ?? undefined,
        totalMarks: totalMarks ?? undefined,
        durationMinutes: durationMinutes ?? undefined,
        marksPerQuestion: marksPerQuestion ?? undefined,
        generationSeed: generationSeed ?? undefined,
        allowedOperations,
        minimumTermsPerQuestion: minimumTermsPerQuestion ?? undefined,
        maximumTermsPerQuestion: maximumTermsPerQuestion ?? undefined,
        minimumDigits: minimumDigits ?? undefined,
        maximumDigits: maximumDigits ?? undefined,
        minimumValue: minimumValue ?? undefined,
        maximumValue: maximumValue ?? undefined,
        allowCarry: allowCarry,
        allowBorrow: allowBorrow,
        carryQuestionPercentage: carryQuestionPercentage ?? undefined,
        borrowQuestionPercentage: borrowQuestionPercentage ?? undefined,
        allowNegativeIntermediateResult: allowNegativeIntermediateResult,
        allowNegativeFinalAnswer: allowNegativeFinalAnswer,
        allowZero: allowZero,
        allowDecimals: allowDecimals,
        decimalPlaces: decimalPlaces ?? undefined,
        sequenceRule: sequenceRule ?? undefined,
        difficultyDistribution: req.body.difficultyDistribution === undefined ? undefined : safeJson(req.body.difficultyDistribution),
        categoryDistribution: req.body.categoryDistribution === undefined ? undefined : safeJson(req.body.categoryDistribution),
        operationDistribution: req.body.operationDistribution === undefined ? undefined : normalizeOperationDistributionMap(req.body.operationDistribution),
        mandatoryQuestionIds: req.body.mandatoryQuestionIds === undefined ? undefined : safeJson(req.body.mandatoryQuestionIds),
        randomizeQuestions: req.body.randomizeQuestions === undefined ? undefined : Boolean(req.body.randomizeQuestions),
        randomizeOptions: req.body.randomizeOptions === undefined ? undefined : Boolean(req.body.randomizeOptions),
        instructions: req.body.instructions === undefined ? undefined : normalizeString(req.body.instructions),
        sortOrder: sortOrder ?? undefined
      },
      select: selectCompetitionCoursePaperBlueprint()
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.apiError(409, "Blueprint version already exists for this paper", "COMPETITION_COURSE_PAPER_BLUEPRINT_EXISTS");
    }
    throw error;
  }

  res.locals.entityId = updated.id;
  return res.apiSuccess("Competition course paper blueprint updated", updated);
});

const archiveCompetitionCoursePaperBlueprint = asyncHandler(async (req, res) => {
  const blueprint = await findTenantCompetitionCoursePaperBlueprint({
    tenantId: req.auth.tenantId,
    courseId: req.params.courseId,
    levelId: req.params.levelId,
    paperId: req.params.paperId,
    blueprintId: req.params.blueprintId
  });
  if (!blueprint) {
    return res.apiError(404, "Competition course paper blueprint not found", "COMPETITION_COURSE_PAPER_BLUEPRINT_NOT_FOUND");
  }

  const archived = await prisma.competitionCoursePaperBlueprint.update({
    where: { id: blueprint.id },
    data: { status: "ARCHIVED" },
    select: selectCompetitionCoursePaperBlueprint()
  });

  res.locals.entityId = archived.id;
  return res.apiSuccess("Competition course paper blueprint archived", archived);
});

const generateCompetitionCoursePaperWorksheet = asyncHandler(async (req, res) => {
  const paper = await findTenantCompetitionCoursePaper({
    tenantId: req.auth.tenantId,
    courseId: req.params.courseId,
    levelId: req.params.levelId,
    paperId: req.params.paperId
  });
  if (!paper) {
    return res.apiError(404, "Competition course paper not found", "COMPETITION_COURSE_PAPER_NOT_FOUND");
  }

  const blueprint = await findTenantCompetitionCoursePaperBlueprint({
    tenantId: req.auth.tenantId,
    courseId: req.params.courseId,
    levelId: req.params.levelId,
    paperId: req.params.paperId,
    blueprintId: req.params.blueprintId
  });
  if (!blueprint) {
    return res.apiError(404, "Competition course paper blueprint not found", "COMPETITION_COURSE_PAPER_BLUEPRINT_NOT_FOUND");
  }
  if (blueprint.status !== "ACTIVE") {
    return res.apiError(409, "Blueprint must be ACTIVE to generate a worksheet", "COMPETITION_COURSE_PAPER_BLUEPRINT_INACTIVE");
  }

  const title = normalizeString(req.body.title);
  const versionInput = normalizeString(req.body.version);
  const seedInput = normalizeString(req.body.seed);

  if (!title) {
    return res.apiError(400, "title is required", "VALIDATION_ERROR");
  }

  const totalQuestions = normalizeNumber(blueprint.totalQuestions, null);
  const targetTotalMarks = normalizeNumber(blueprint.totalMarks, null);
  const durationMinutes = blueprint.durationMinutes === undefined || blueprint.durationMinutes === null
    ? null
    : normalizeNumber(blueprint.durationMinutes, null);

  if (!Number.isInteger(totalQuestions) || totalQuestions <= 0) {
    return res.apiError(400, "Blueprint totalQuestions must be a positive integer", "VALIDATION_ERROR");
  }
  if (targetTotalMarks !== null && (!Number.isFinite(targetTotalMarks) || targetTotalMarks <= 0)) {
    return res.apiError(400, "Blueprint totalMarks must be positive", "VALIDATION_ERROR");
  }
  if (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes <= 0)) {
    return res.apiError(400, "Blueprint durationMinutes must be a positive integer", "VALIDATION_ERROR");
  }

  const difficultyDistribution = blueprint.difficultyDistribution ? normalizeDistributionMap(blueprint.difficultyDistribution) : null;
  const categoryDistribution = blueprint.categoryDistribution ? normalizeDistributionMap(blueprint.categoryDistribution) : null;
  const operationDistribution = blueprint.operationDistribution ? normalizeOperationDistributionMap(blueprint.operationDistribution) : null;
  const mandatoryQuestionIds = blueprint.mandatoryQuestionIds ? normalizeQuestionIdArray(blueprint.mandatoryQuestionIds) : [];
  const hasDifficultyDistribution = !!(difficultyDistribution && Object.keys(difficultyDistribution).length > 0);
  const hasCategoryDistribution = !!(categoryDistribution && Object.keys(categoryDistribution).length > 0);
  const hasOperationDistribution = !!(operationDistribution && Object.keys(operationDistribution).length > 0);

  if (blueprint.difficultyDistribution && Object.keys(blueprint.difficultyDistribution || {}).length > 0 && !hasDifficultyDistribution) {
    return res.apiError(400, "difficultyDistribution must be a JSON object that totals 100", "VALIDATION_ERROR");
  }
  if (blueprint.categoryDistribution && Object.keys(blueprint.categoryDistribution || {}).length > 0 && !hasCategoryDistribution) {
    return res.apiError(400, "categoryDistribution must be a JSON object that totals 100", "VALIDATION_ERROR");
  }
  if (blueprint.operationDistribution && Object.keys(blueprint.operationDistribution || {}).length > 0 && !hasOperationDistribution) {
    return res.apiError(400, "operationDistribution must be a JSON object that totals 100", "VALIDATION_ERROR");
  }
  if (blueprint.mandatoryQuestionIds && !mandatoryQuestionIds) {
    return res.apiError(400, "mandatoryQuestionIds must be a JSON array", "VALIDATION_ERROR");
  }

  const levelQuestions = await prisma.competitionCourseLevelQuestion.findMany({
    where: {
      tenantId: req.auth.tenantId,
      competitionCourseLevelId: paper.competitionCourseLevelId,
      isActive: true,
      questionBank: { isActive: true }
    },
    select: {
      id: true,
      questionBankId: true,
      sortOrder: true,
      marks: true,
      displayGroup: true,
      questionBank: {
        select: {
          id: true,
          difficulty: true,
          prompt: true,
          operands: true,
          operation: true,
          correctAnswer: true,
          templateId: true
        }
      }
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });

  if (!levelQuestions.length) {
    return res.apiError(409, "No eligible questions exist in the competition course level bank", "COMPETITION_COURSE_LEVEL_QUESTION_BANK_EMPTY");
  }

  const byQuestionBankId = new Map(levelQuestions.map((row) => [row.questionBankId, row]));
  const seenMandatory = new Set();
  const mandatoryRows = [];

  for (const questionBankId of mandatoryQuestionIds) {
    if (seenMandatory.has(questionBankId)) {
      continue;
    }
    seenMandatory.add(questionBankId);
    const row = byQuestionBankId.get(questionBankId);
    if (!row) {
      return res.apiError(409, "Mandatory question is not available in the selected level bank", "COMPETITION_COURSE_PAPER_BLUEPRINT_QUESTION_MISSING");
    }
    mandatoryRows.push(row);
  }

  const eligibleEvaluation = levelQuestions.map((row) => ({
    row,
    result: isQuestionEligibleForBlueprint(row, blueprint)
  }));
  const eligibleRows = eligibleEvaluation.filter((entry) => entry.result.eligible).map((entry) => entry.row);
  const eligibleByQuestionBankId = new Map(eligibleRows.map((row) => [row.questionBankId, row]));

  if (mandatoryRows.length > totalQuestions) {
    return res.apiError(409, `requiredQuestionCount=${totalQuestions}; eligibleQuestionCount=${eligibleRows.length}; mandatory questions exceed totalQuestions`, "COMPETITION_COURSE_PAPER_BLUEPRINT_CONSTRAINT");
  }

  const missingMandatory = mandatoryRows.filter((row) => !eligibleByQuestionBankId.has(row.questionBankId));
  if (missingMandatory.length) {
    return res.apiError(409, `requiredQuestionCount=${totalQuestions}; eligibleQuestionCount=${eligibleRows.length}; mandatory question is not allowed by blueprint rules`, "COMPETITION_COURSE_PAPER_BLUEPRINT_QUESTION_MISSING");
  }

  const targetCounts = {
    difficulty: hasDifficultyDistribution ? distributionToCounts(difficultyDistribution, totalQuestions) : null,
    category: hasCategoryDistribution ? distributionToCounts(categoryDistribution, totalQuestions) : null,
    operation: hasOperationDistribution ? distributionToCounts(operationDistribution, totalQuestions) : null
  };

  const mandatoryIds = new Set(mandatoryRows.map((row) => row.questionBankId));
  const remainingPool = eligibleRows.filter((row) => !mandatoryIds.has(row.questionBankId));
  const remainingRequired = totalQuestions - mandatoryRows.length;

  const poolAvailability = {
    difficulty: null,
    category: null,
    operation: null
  };

  for (const dimension of Object.keys(poolAvailability)) {
    if (!targetCounts[dimension]) {
      continue;
    }
    poolAvailability[dimension] = remainingPool.reduce((acc, row) => {
      const key = normalizeBlueprintBucket(
        dimension === "difficulty"
          ? row.questionBank.difficulty
          : dimension === "category"
            ? (row.displayGroup || row.questionBank.templateId)
            : row.questionBank.operation
      );
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const neededCounts = Object.entries(targetCounts[dimension]).reduce((acc, [key, count]) => {
      const mandatoryContribution = mandatoryRows.reduce((sum, row) => {
        const bucket = normalizeBlueprintBucket(
          dimension === "difficulty"
            ? row.questionBank.difficulty
            : dimension === "category"
              ? (row.displayGroup || row.questionBank.templateId)
              : row.questionBank.operation
        );
        return bucket === key ? sum + 1 : sum;
      }, 0);
      acc[key] = Math.max(0, count - mandatoryContribution);
      return acc;
    }, {});

    for (const [key, needed] of Object.entries(neededCounts)) {
      if ((poolAvailability[dimension][key] || 0) < needed) {
        return res.apiError(
          409,
          `requiredQuestionCount=${totalQuestions}; eligibleQuestionCount=${eligibleRows.length}; missing ${dimension} group ${key}`,
          "COMPETITION_COURSE_PAPER_BLUEPRINT_POOL_INSUFFICIENT"
        );
      }
    }
  }

  if (remainingRequired > remainingPool.length) {
    return res.apiError(
      409,
      `requiredQuestionCount=${totalQuestions}; eligibleQuestionCount=${eligibleRows.length}; insufficient eligible questions`,
      "COMPETITION_COURSE_PAPER_BLUEPRINT_POOL_INSUFFICIENT"
    );
  }

  const attemptSeed = [versionInput || "", seedInput || "", blueprint.id].filter(Boolean).join(":") || crypto.randomUUID();
  let selectedRows = null;
  const attempts = 12;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const shuffledPool = shuffleDeterministic(remainingPool, `${attemptSeed}:${attempt}`);
    const selected = [...mandatoryRows];
    const quotas = {
      difficulty: targetCounts.difficulty ? { ...targetCounts.difficulty } : null,
      category: targetCounts.category ? { ...targetCounts.category } : null,
      operation: targetCounts.operation ? { ...targetCounts.operation } : null
    };

    for (const row of mandatoryRows) {
      const bucketValues = {
        difficulty: normalizeBlueprintBucket(row.questionBank.difficulty),
        category: normalizeBlueprintBucket(row.displayGroup || row.questionBank.templateId),
        operation: normalizeBlueprintBucket(row.questionBank.operation)
      };

      for (const [dimension, key] of Object.entries(bucketValues)) {
        const counts = quotas[dimension];
        if (counts && counts[key] !== undefined) {
          counts[key] -= 1;
        }
      }
    }

    const pool = shuffledPool.slice();
    while (selected.length < totalQuestions && pool.length) {
      let bestIndex = 0;
      let bestScore = -1;

      for (let index = 0; index < pool.length; index += 1) {
        const row = pool[index];
        const bucketValues = {
          difficulty: normalizeBlueprintBucket(row.questionBank.difficulty),
          category: normalizeBlueprintBucket(row.displayGroup || row.questionBank.templateId),
          operation: normalizeBlueprintBucket(row.questionBank.operation)
        };

        let score = 0;
        for (const [dimension, key] of Object.entries(bucketValues)) {
          const counts = quotas[dimension];
          const remaining = counts && counts[key] !== undefined ? counts[key] : 0;
          if (remaining > 0) {
            score += 1000 + remaining * 100;
          }
        }

        if (score === 0) {
          score = 1;
        }

        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }

      const [picked] = pool.splice(bestIndex, 1);
      selected.push(picked);

      const bucketValues = {
        difficulty: normalizeBlueprintBucket(picked.questionBank.difficulty),
        category: normalizeBlueprintBucket(picked.displayGroup || picked.questionBank.templateId),
        operation: normalizeBlueprintBucket(picked.questionBank.operation)
      };

      for (const [dimension, key] of Object.entries(bucketValues)) {
        const counts = quotas[dimension];
        if (counts && counts[key] !== undefined && counts[key] > 0) {
          counts[key] -= 1;
        }
      }
    }

    const fulfilled =
      selected.length === totalQuestions &&
      Object.values(quotas).every((counts) => !counts || Object.values(counts).every((value) => value <= 0));

    if (fulfilled) {
      selectedRows = selected;
      break;
    }
  }

  if (!selectedRows) {
    return res.apiError(409, "Unable to satisfy blueprint constraints with the available question bank", "COMPETITION_COURSE_PAPER_BLUEPRINT_CONSTRAINT");
  }

  const orderedRows = (() => {
    const next = [...selectedRows];
    if (blueprint.sequenceRule === "OPERATION_GROUPED") {
      const operationOrderSource = Array.isArray(blueprint.allowedOperations) && blueprint.allowedOperations.length
        ? blueprint.allowedOperations
        : ["ADD", "SUB", "MIX", "MUL", "DIV"];
      const operationOrder = new Map(operationOrderSource.map((item, index) => [normalizeOperationName(item), index]));
      return next.sort((a, b) => {
        const aOp = getQuestionOperation(a);
        const bOp = getQuestionOperation(b);
        const opDiff = (operationOrder.get(aOp) ?? 999) - (operationOrder.get(bOp) ?? 999);
        if (opDiff !== 0) return opDiff;
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      });
    }
    if (blueprint.sequenceRule === "RANDOM" || blueprint.randomizeQuestions) {
      return shuffleDeterministic(next, attemptSeed);
    }
    return next.sort((a, b) => {
      const difficultyRank = { EASY: 1, MEDIUM: 2, HARD: 3 };
      const diff = (difficultyRank[a.questionBank.difficulty] || 9) - (difficultyRank[b.questionBank.difficulty] || 9);
      if (diff !== 0) return diff;
      const opDiff = (a.questionBank.operation || "").localeCompare(b.questionBank.operation || "");
      if (opDiff !== 0) return opDiff;
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });
  })();

  const selectedDifficulty = orderedRows.reduce((acc, row) => {
    const key = normalizeBlueprintBucket(row.questionBank.difficulty);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const worksheetDifficulty = Object.entries(selectedDifficulty).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "MEDIUM";
  const resolvedMarksPerQuestion = blueprint.marksPerQuestion !== null && blueprint.marksPerQuestion !== undefined
    ? Number(blueprint.marksPerQuestion)
    : (targetTotalMarks !== null ? Number(targetTotalMarks) / totalQuestions : 1);
  const computedTotalMarks = blueprint.marksPerQuestion !== null && blueprint.marksPerQuestion !== undefined
    ? Number(blueprint.marksPerQuestion) * totalQuestions
    : (targetTotalMarks !== null ? Number(targetTotalMarks) : resolvedMarksPerQuestion * totalQuestions);

  const worksheet = await prisma.$transaction(async (tx) => {
    const created = await tx.worksheet.create({
      data: {
        tenantId: req.auth.tenantId,
        title,
        description: normalizeString(req.body.description) || blueprint.instructions || `Generated from ${paper.title} / ${blueprint.title}`,
        difficulty: worksheetDifficulty,
        competitionCourseLevelId: paper.competitionCourseLevelId,
        competitionCoursePaperId: paper.id,
        competitionCoursePaperBlueprintId: blueprint.id,
        createdByUserId: req.auth.userId,
        isPublished: false,
        generationMode: "PRACTICE",
        generationSeed: blueprint.generationSeed || attemptSeed,
        generatedAt: new Date(),
        timeLimitSeconds: durationMinutes ? durationMinutes * 60 : null
      },
      select: { id: true, title: true, competitionCoursePaperId: true, competitionCourseLevelId: true }
    });

    await tx.worksheetQuestion.createMany({
      data: orderedRows.map((row, index) => ({
        tenantId: req.auth.tenantId,
        worksheetId: created.id,
        questionBankId: row.questionBankId,
        questionNumber: index + 1,
        marks: resolvedMarksPerQuestion,
        negativeMarks: Number(row.negativeMarks ?? 0) || 0,
        operands: row.questionBank.operands,
        operation: row.questionBank.operation,
        correctAnswer: row.questionBank.correctAnswer
      }))
    });

    return created;
  });

  res.locals.entityId = worksheet.id;
  return res.apiSuccess("Competition course worksheet generated", { ...worksheet, totalMarks: computedTotalMarks, marksPerQuestion: resolvedMarksPerQuestion }, 201);
});

const listCompetitionCourseLevelQuestionBank = asyncHandler(async (req, res) => {
  const level = await findTenantCompetitionCourseLevel({
    tenantId: req.auth.tenantId,
    courseId: req.params.courseId,
    levelId: req.params.levelId
  });
  if (!level) {
    return res.apiError(404, "Competition course level not found", "COMPETITION_COURSE_LEVEL_NOT_FOUND");
  }

  const q = normalizeString(req.query.q);
  const difficulty = normalizeDifficulty(req.query.difficulty);
  const where = {
    tenantId: req.auth.tenantId,
    competitionCourseLevelId: level.id
  };

  if (difficulty || q) {
    where.questionBank = {
      ...(difficulty ? { difficulty } : {}),
      ...(q ? { prompt: { contains: q } } : {})
    };
  }

  const items = await prisma.competitionCourseLevelQuestion.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: 10000,
    select: selectCompetitionCourseLevelQuestion()
  });

  return res.apiSuccess("Competition course level question bank fetched", { items: items.map(flattenCompetitionCourseLevelQuestion) });
});

const createCompetitionCourseLevelQuestionBankEntry = asyncHandler(async (req, res) => {
  const level = await findTenantCompetitionCourseLevel({
    tenantId: req.auth.tenantId,
    courseId: req.params.courseId,
    levelId: req.params.levelId
  });
  if (!level) {
    return res.apiError(404, "Competition course level not found", "COMPETITION_COURSE_LEVEL_NOT_FOUND");
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const questionBankId = await upsertQuestionBankRepositoryEntry({ tx, tenantId: req.auth.tenantId, payload: req.body });
      return tx.competitionCourseLevelQuestion.upsert({
        where: {
          tenantId_competitionCourseLevelId_questionBankId: {
            tenantId: req.auth.tenantId,
            competitionCourseLevelId: level.id,
            questionBankId
          }
        },
        update: {
          isActive: req.body.isActive === undefined ? true : Boolean(req.body.isActive),
          sortOrder: normalizeNumber(req.body.sortOrder, 0) ?? 0,
          marks: normalizeNumber(req.body.marks, 1) ?? 1,
          negativeMarks: normalizeNumber(req.body.negativeMarks, 0) ?? 0,
          difficultyWeight: normalizeNumber(req.body.difficultyWeight, 1) ?? 1,
          isMandatory: Boolean(req.body.isMandatory),
          displayGroup: normalizeString(req.body.displayGroup)
        },
        create: {
          tenantId: req.auth.tenantId,
          competitionCourseLevelId: level.id,
          questionBankId,
          sortOrder: normalizeNumber(req.body.sortOrder, 0) ?? 0,
          marks: normalizeNumber(req.body.marks, 1) ?? 1,
          negativeMarks: normalizeNumber(req.body.negativeMarks, 0) ?? 0,
          difficultyWeight: normalizeNumber(req.body.difficultyWeight, 1) ?? 1,
          isMandatory: Boolean(req.body.isMandatory),
          isActive: req.body.isActive === undefined ? true : Boolean(req.body.isActive),
          displayGroup: normalizeString(req.body.displayGroup)
        },
        select: selectCompetitionCourseLevelQuestion()
      });
    });

    res.locals.entityId = created.id;
    return res.apiSuccess("Competition course level question mapped", flattenCompetitionCourseLevelQuestion(created), 201);
  } catch (error) {
    if (error?.statusCode) {
      return res.apiError(error.statusCode, error.message, error.errorCode);
    }
    throw error;
  }
});

const updateCompetitionCourseLevelQuestionBankEntry = asyncHandler(async (req, res) => {
  const level = await findTenantCompetitionCourseLevel({
    tenantId: req.auth.tenantId,
    courseId: req.params.courseId,
    levelId: req.params.levelId
  });
  if (!level) {
    return res.apiError(404, "Competition course level not found", "COMPETITION_COURSE_LEVEL_NOT_FOUND");
  }

  const existing = await prisma.competitionCourseLevelQuestion.findFirst({
    where: { id: req.params.mappingId, tenantId: req.auth.tenantId, competitionCourseLevelId: level.id },
    select: { id: true, questionBankId: true }
  });
  if (!existing) {
    return res.apiError(404, "Question mapping not found", "COMPETITION_COURSE_LEVEL_QUESTION_NOT_FOUND");
  }

  const questionData = {};
  if (req.body.difficulty !== undefined) questionData.difficulty = normalizeDifficulty(req.body.difficulty);
  if (req.body.prompt !== undefined) questionData.prompt = normalizeString(req.body.prompt);
  if (req.body.operands !== undefined) questionData.operands = safeJson(req.body.operands);
  if (req.body.operation !== undefined) questionData.operation = normalizeString(req.body.operation);
  if (req.body.correctAnswer !== undefined) questionData.correctAnswer = normalizeNumber(req.body.correctAnswer);

  if (Object.values(questionData).some((value) => value === null)) {
    return res.apiError(400, "Invalid question bank payload", "VALIDATION_ERROR");
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (Object.keys(questionData).length) {
      await tx.questionBank.update({
        where: { id: existing.questionBankId },
        data: questionData
      });
    }

    return tx.competitionCourseLevelQuestion.update({
      where: { id: existing.id },
      data: {
        sortOrder: req.body.sortOrder === undefined ? undefined : normalizeNumber(req.body.sortOrder, 0),
        marks: req.body.marks === undefined ? undefined : normalizeNumber(req.body.marks, 1),
        negativeMarks: req.body.negativeMarks === undefined ? undefined : normalizeNumber(req.body.negativeMarks, 0),
        difficultyWeight: req.body.difficultyWeight === undefined ? undefined : normalizeNumber(req.body.difficultyWeight, 1),
        isMandatory: req.body.isMandatory === undefined ? undefined : Boolean(req.body.isMandatory),
        isActive: req.body.isActive === undefined ? undefined : Boolean(req.body.isActive),
        displayGroup: req.body.displayGroup === undefined ? undefined : normalizeString(req.body.displayGroup)
      },
      select: selectCompetitionCourseLevelQuestion()
    });
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Competition course level question updated", flattenCompetitionCourseLevelQuestion(updated));
});

const deleteCompetitionCourseLevelQuestionBankEntry = asyncHandler(async (req, res) => {
  const level = await findTenantCompetitionCourseLevel({
    tenantId: req.auth.tenantId,
    courseId: req.params.courseId,
    levelId: req.params.levelId
  });
  if (!level) {
    return res.apiError(404, "Competition course level not found", "COMPETITION_COURSE_LEVEL_NOT_FOUND");
  }

  const deleted = await prisma.competitionCourseLevelQuestion.deleteMany({
    where: { id: req.params.mappingId, tenantId: req.auth.tenantId, competitionCourseLevelId: level.id }
  });
  if (!deleted.count) {
    return res.apiError(404, "Question mapping not found", "COMPETITION_COURSE_LEVEL_QUESTION_NOT_FOUND");
  }

  res.locals.entityId = req.params.mappingId;
  return res.apiSuccess("Competition course level question removed", { id: req.params.mappingId });
});

const exportCompetitionCourseLevelQuestionBankCsv = asyncHandler(async (req, res) => {
  const level = await findTenantCompetitionCourseLevel({
    tenantId: req.auth.tenantId,
    courseId: req.params.courseId,
    levelId: req.params.levelId
  });
  if (!level) {
    return res.apiError(404, "Competition course level not found", "COMPETITION_COURSE_LEVEL_NOT_FOUND");
  }

  const items = await prisma.questionBank.findMany({
    where: {
      tenantId: req.auth.tenantId,
      competitionCourseLevelQuestions: { some: { competitionCourseLevelId: level.id } }
    },
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
  res.setHeader("Content-Disposition", `attachment; filename=question-bank-${level.id}.csv`);
  return res.status(200).send(csv);
});

const importCompetitionCourseLevelQuestionBank = asyncHandler(async (req, res) => {
  const level = await findTenantCompetitionCourseLevel({
    tenantId: req.auth.tenantId,
    courseId: req.params.courseId,
    levelId: req.params.levelId
  });
  if (!level) {
    return res.apiError(404, "Competition course level not found", "COMPETITION_COURSE_LEVEL_NOT_FOUND");
  }

  const bodyLevelId = normalizeString(req.body.levelId);
  const items = Array.isArray(req.body.items) ? req.body.items : null;

  if (!bodyLevelId || !items) {
    return res.apiError(400, "levelId and items[] are required", "VALIDATION_ERROR");
  }

  if (bodyLevelId !== level.id) {
    return res.apiError(400, "levelId does not match the competition course level", "VALIDATION_ERROR");
  }

  if (items.length > 500) {
    return res.apiError(400, "Maximum 500 items per import", "VALIDATION_ERROR");
  }

  let createdCount = 0;
  for (const item of items) {
    const difficulty = normalizeDifficulty(item?.difficulty);
    const prompt = normalizeString(item?.prompt);
    const operands = item?.operands && typeof item.operands === "object" ? item.operands : null;
    const operation = normalizeString(item?.operation);
    const correctAnswer = normalizeNumber(item?.correctAnswer);

    if (!difficulty || !prompt || !operation || correctAnswer === null || !operands) {
      return res.apiError(400, "Each item requires difficulty, prompt, operation, correctAnswer, operands", "VALIDATION_ERROR");
    }

    let question = await prisma.questionBank.findFirst({
      where: { tenantId: req.auth.tenantId, prompt }
    });

    if (!question) {
      question = await prisma.questionBank.create({
        data: {
          tenantId: req.auth.tenantId,
          difficulty,
          prompt,
          operands,
          operation,
          correctAnswer
        }
      });
      createdCount += 1;
    }

    await ensureCompetitionCourseLevelQuestion(req.auth.tenantId, level.id, question.id);
  }

  return res.apiSuccess("Question bank imported", { createdCount }, 201);
});

const assignCompetitionCourse = asyncHandler(async (req, res) => {
  const competitionId = String(req.params.competitionId || "");
  const competitionCourseId = normalizeString(req.body.competitionCourseId);

  const competition = await prisma.competition.findFirst({
    where: { id: competitionId, tenantId: req.auth.tenantId },
    select: { id: true }
  });
  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (competitionCourseId) {
    const course = await findTenantCompetitionCourse({ tenantId: req.auth.tenantId, id: competitionCourseId });
    if (!course) {
      return res.apiError(404, "Competition course not found", "COMPETITION_COURSE_NOT_FOUND");
    }
  }

  const updated = await prisma.competition.update({
    where: { id: competition.id },
    data: { competitionCourseId },
    select: {
      id: true,
      title: true,
      competitionCourseId: true,
      competitionCourse: {
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true
        }
      }
    }
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Competition course assigned", updated);
});

export {
  archiveCompetitionCourse,
  archiveCompetitionCoursePaperBlueprint,
  assignCompetitionCourse,
  createCompetitionCourse,
  createCompetitionCoursePaper,
  createCompetitionCoursePaperBlueprint,
  createCompetitionCourseLevelQuestionBankEntry,
  createCompetitionCourseLevel,
  deleteCompetitionCourseLevelQuestionBankEntry,
  exportCompetitionCourseLevelQuestionBankCsv,
  archiveCompetitionCoursePaper,
  getCompetitionCourse,
  importCompetitionCourseLevelQuestionBank,
  generateCompetitionCoursePaperWorksheet,
  listCompetitionCoursePaperBlueprints,
  listCompetitionCoursePapers,
  listCompetitionCourseLevelQuestionBank,
  listCompetitionCourseLevels,
  listCompetitionCourses,
  updateCompetitionCourse,
  updateCompetitionCoursePaperBlueprint,
  updateCompetitionCoursePaper,
  updateCompetitionCourseLevelQuestionBankEntry,
  updateCompetitionCourseLevel
};
