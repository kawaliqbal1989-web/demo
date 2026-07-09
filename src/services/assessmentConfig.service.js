import crypto from "crypto";
import { prisma } from "../lib/prisma.js";

const ASSESSMENT_TYPE = {
  WORKSHEET: "WORKSHEET",
  QUESTION_BANK: "QUESTION_BANK"
};

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function ensureAssessmentStorageReady() {
  if (!prisma?.examLevelAssessmentConfig || !prisma?.examGeneratedQuestionSet) {
    throw createHttpError(
      503,
      "Assessment configuration storage is not ready. Run prisma generate and apply schema updates.",
      "ASSESSMENT_CONFIG_SCHEMA_OUTDATED"
    );
  }
}

function mapAssessmentStorageError(error) {
  if (error?.code === "P2021" || error?.code === "P2022") {
    throw createHttpError(
      503,
      "Assessment configuration storage is not ready. Run schema updates and retry.",
      "ASSESSMENT_CONFIG_SCHEMA_OUTDATED"
    );
  }
  throw error;
}

function isMissingColumnError(error, columnName) {
  return String(error?.code || "") === "P2022" && String(error?.message || "").toLowerCase().includes(String(columnName || "").toLowerCase());
}

function isTemplateGroupingUnavailable(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || "").toLowerCase();
  if (isMissingColumnError(error, "templateId")) {
    return true;
  }

  // Handles stale Prisma Client cases where templateId is not known in the model metadata.
  if (name.includes("PrismaClientValidationError") && message.includes("templateid")) {
    return true;
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

function normalizeAssessmentType(value) {
  const type = String(value || "").trim().toUpperCase();
  if (type === ASSESSMENT_TYPE.WORKSHEET || type === ASSESSMENT_TYPE.QUESTION_BANK) {
    return type;
  }
  return null;
}

function normalizeQuestionBankKey(value) {
  const key = String(value || "").trim();
  if (!key) return null;
  if (key.startsWith("TEMPLATE:")) return key;
  return `TEMPLATE:${key}`;
}

function extractTemplateIdFromQuestionBankKey(questionBankKey) {
  const key = normalizeQuestionBankKey(questionBankKey);
  if (!key) return null;

  const [, rawTemplateId] = key.split(":");
  const templateId = String(rawTemplateId || "").trim();
  if (!templateId || templateId === "DEFAULT") {
    return null;
  }
  return templateId;
}

function bankKeyFromTemplateId(templateId) {
  return `TEMPLATE:${templateId || "DEFAULT"}`;
}

function getLevelScopeForLevelId({ provenanceContext = null, levelId = null }) {
  const normalizedLevelId = String(levelId || "").trim();
  const map = provenanceContext?.levelScopeByLevelId || null;
  if (map && normalizedLevelId && map[normalizedLevelId]) {
    return map[normalizedLevelId];
  }

  if (provenanceContext?.courseId || provenanceContext?.courseLevelId) {
    return {
      courseId: provenanceContext?.courseId || null,
      courseLevelId: provenanceContext?.courseLevelId || null
    };
  }

  return null;
}

function applyScopeToWhere(where, scope) {
  if (!scope) {
    return where;
  }

  return {
    ...where,
    ...(scope?.courseId ? { courseId: scope.courseId } : {}),
    ...(scope?.courseLevelId ? { courseLevelId: scope.courseLevelId } : {})
  };
}

function matchesScope(record, scope) {
  if (!scope) return true;
  if (scope?.courseId && String(record?.courseId || "") !== String(scope.courseId)) return false;
  if (scope?.courseLevelId && String(record?.courseLevelId || "") !== String(scope.courseLevelId)) return false;
  return true;
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

async function getExamCycleLevels({ tenantId, examCycleId, listId = null }) {
  const where = {
    tenantId,
    included: true,
    list: {
      is: {
        tenantId,
        examCycleId,
        type: "CENTER_COMBINED",
        ...(listId ? { id: listId } : {})
      }
    }
  };

  const items = await prisma.examEnrollmentListItem.findMany({
    where,
    select: {
      entry: {
        select: {
          enrolledLevel: {
            select: { id: true, name: true, rank: true }
          }
        }
      }
    }
  });

  const byLevelId = new Map();
  for (const item of items) {
    const level = item?.entry?.enrolledLevel;
    if (!level?.id) continue;

    const existing = byLevelId.get(level.id);
    if (existing) {
      existing.studentCount += 1;
      continue;
    }

    byLevelId.set(level.id, {
      levelId: level.id,
      levelName: level.name,
      levelRank: level.rank,
      studentCount: 1
    });
  }

  return Array.from(byLevelId.values()).sort((a, b) => {
    const ar = typeof a.levelRank === "number" ? a.levelRank : 0;
    const br = typeof b.levelRank === "number" ? b.levelRank : 0;
    if (ar !== br) return ar - br;
    return String(a.levelName || "").localeCompare(String(b.levelName || ""));
  });
}

async function getLevelWorksheets({ tenantId, levelIds, provenanceContext = null }) {
  if (!Array.isArray(levelIds) || !levelIds.length) {
    return {};
  }

  const worksheets = await prisma.worksheet.findMany({
    where: {
      tenantId,
      levelId: { in: levelIds },
      ...(provenanceContext?.courseId ? { courseId: provenanceContext.courseId } : {}),
      examCycleId: null,
      OR: [
        { generationMode: null },
        { generationMode: { not: "EXAM" } }
      ]
    },
    select: {
      id: true,
      title: true,
      levelId: true,
      courseId: true,
      courseLevelId: true,
      isPublished: true,
      _count: { select: { questions: true } }
    },
    orderBy: [{ levelId: "asc" }, { createdAt: "desc" }]
  });

  const byLevelId = {};
  for (const worksheet of worksheets) {
    const scope = getLevelScopeForLevelId({ provenanceContext, levelId: worksheet.levelId });
    if (!matchesScope(worksheet, scope)) {
      continue;
    }

    const questionCount = worksheet?._count?.questions ?? 0;
    const isPublished = Boolean(worksheet.isPublished);
    const isSelectable = isPublished && questionCount > 0;
    const unavailableReason = !isPublished
      ? "Worksheet exists but is draft/unpublished. Publish it before approval."
      : questionCount <= 0
        ? "Worksheet has no questions. Add questions before approval."
        : null;

    if (!byLevelId[worksheet.levelId]) {
      byLevelId[worksheet.levelId] = [];
    }

    byLevelId[worksheet.levelId].push({
      id: worksheet.id,
      title: worksheet.title,
      questionCount,
      isPublished,
      status: isPublished ? "PUBLISHED" : "DRAFT",
      isSelectable,
      disabled: !isSelectable,
      unavailableReason
    });
  }

  return byLevelId;
}

async function getLevelQuestionBanks({ tenantId, levelIds, provenanceContext = null }) {
  if (!Array.isArray(levelIds) || !levelIds.length) {
    return {};
  }

  const where = {
    tenantId,
    levelId: { in: levelIds },
    ...(provenanceContext?.courseId ? { courseId: provenanceContext.courseId } : {}),
    isActive: true
  };

  try {
    const rows = await prisma.questionBank.findMany({
      where,
      select: {
        id: true,
        levelId: true,
        templateId: true,
        courseId: true,
        courseLevelId: true
      }
    });

    const grouped = new Map();
    for (const row of rows) {
      const scope = getLevelScopeForLevelId({ provenanceContext, levelId: row.levelId });
      if (!matchesScope(row, scope)) {
        continue;
      }

      const key = `${row.levelId}::${String(row.templateId || "")}`;
      const existing = grouped.get(key) || {
        levelId: row.levelId,
        templateId: row.templateId || null,
        count: 0
      };
      existing.count += 1;
      grouped.set(key, existing);
    }

    const groupedRows = Array.from(grouped.values());

    const templateIds = Array.from(new Set(groupedRows.map((row) => row.templateId).filter(Boolean)));
    const templates = templateIds.length
      ? await prisma.worksheetTemplate.findMany({
          where: { tenantId, id: { in: templateIds } },
          select: { id: true, name: true }
        })
      : [];

    const templateNameById = new Map(templates.map((template) => [template.id, template.name]));

    const byLevelId = {};
    for (const row of groupedRows) {
      if (!byLevelId[row.levelId]) {
        byLevelId[row.levelId] = [];
      }

      const key = bankKeyFromTemplateId(row.templateId);
      byLevelId[row.levelId].push({
        id: key,
        name: templateNameById.get(row.templateId) || (row.templateId ? "Question Bank" : "Default Level Bank"),
        availableQuestionCount: row.count || 0
      });
    }

    for (const levelId of Object.keys(byLevelId)) {
      byLevelId[levelId].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    }

    return byLevelId;
  } catch (error) {
    // Backward-compatible fallback for tenants not yet migrated with questionBank.templateId.
    if (!isTemplateGroupingUnavailable(error)) {
      throw error;
    }

    const legacyRows = await prisma.questionBank.findMany({
      where,
      select: {
        id: true,
        levelId: true,
        courseId: true,
        courseLevelId: true
      }
    });

    const countByLevelId = new Map();
    for (const row of legacyRows) {
      const scope = getLevelScopeForLevelId({ provenanceContext, levelId: row.levelId });
      if (!matchesScope(row, scope)) {
        continue;
      }
      countByLevelId.set(row.levelId, Number(countByLevelId.get(row.levelId) || 0) + 1);
    }

    const byLevelId = {};
    for (const [levelId, count] of countByLevelId.entries()) {
      byLevelId[levelId] = [{
        id: bankKeyFromTemplateId(null),
        name: "Default Level Bank",
        availableQuestionCount: count || 0
      }];
    }

    return byLevelId;
  }
}

async function getConfig({ tenantId, examCycleId, levelIds }) {
  if (!Array.isArray(levelIds) || !levelIds.length) {
    return [];
  }

  ensureAssessmentStorageReady();

  try {
    return await prisma.examLevelAssessmentConfig.findMany({
      where: {
        tenantId,
        examCycleId,
        levelId: { in: levelIds }
      },
      select: {
        id: true,
        levelId: true,
        assessmentType: true,
        worksheetId: true,
        questionBankId: true,
        questionCount: true,
        timeLimitMinutes: true,
        createdAt: true,
        updatedAt: true
      }
    });
  } catch (error) {
    mapAssessmentStorageError(error);
  }
}

async function validateQuestionBankSelection({ tenantId, levelId, questionBankId, questionCount, provenanceContext = null }) {
  const normalizedBankKey = normalizeQuestionBankKey(questionBankId);
  if (!normalizedBankKey) {
    throw createHttpError(400, "questionBankId is required for question bank mode", "EXAM_QUESTION_BANK_REQUIRED");
  }

  const parsedQuestionCount = toPositiveInt(questionCount);
  if (!parsedQuestionCount) {
    throw createHttpError(400, "questionCount must be a positive integer", "EXAM_QUESTION_COUNT_INVALID");
  }

  const templateId = extractTemplateIdFromQuestionBankKey(normalizedBankKey);
  const levelScope = getLevelScopeForLevelId({ provenanceContext, levelId });
  const availableCount = await prisma.questionBank.count({
    where: applyScopeToWhere({
      tenantId,
      levelId,
      isActive: true,
      ...(templateId ? { templateId } : { templateId: null })
    }, levelScope)
  });

  if (availableCount <= 0) {
    throw createHttpError(409, "Selected question bank has no active questions", "EXAM_QUESTION_BANK_EMPTY");
  }

  if (parsedQuestionCount > availableCount) {
    throw createHttpError(409, "questionCount exceeds available questions", "EXAM_QUESTION_COUNT_EXCEEDS_BANK");
  }

  return {
    questionBankId: normalizedBankKey,
    questionCount: parsedQuestionCount,
    availableCount
  };
}

async function saveConfig({ tenantId, examCycleId, actorUserId, configs, allowedLevelIds, provenanceContext = null }) {
  if (!Array.isArray(configs) || configs.length === 0) {
    throw createHttpError(400, "configs[] is required", "VALIDATION_ERROR");
  }

  ensureAssessmentStorageReady();

  const allowedSet = new Set((allowedLevelIds || []).map((levelId) => String(levelId)));

  const cleaned = configs.map((config) => ({
    levelId: String(config?.levelId || "").trim(),
    assessmentType: normalizeAssessmentType(config?.assessmentType),
    worksheetId: String(config?.worksheetId || "").trim(),
    questionBankId: String(config?.questionBankId || "").trim(),
    questionCount: config?.questionCount,
    timeLimitMinutes: config?.timeLimitMinutes
  }));

  const seenLevels = new Set();
  for (const config of cleaned) {
    if (!config.levelId || !config.assessmentType) {
      throw createHttpError(400, "levelId and assessmentType are required", "VALIDATION_ERROR");
    }

    if (seenLevels.has(config.levelId)) {
      throw createHttpError(400, "Duplicate levelId in config payload", "EXAM_ASSESSMENT_CONFIG_DUPLICATE_LEVEL");
    }
    seenLevels.add(config.levelId);

    if (allowedSet.size && !allowedSet.has(config.levelId)) {
      throw createHttpError(409, "Config contains a level not participating in this request", "EXAM_ASSESSMENT_LEVEL_INVALID");
    }
  }

  const worksheetIds = Array.from(new Set(cleaned.filter((config) => config.assessmentType === ASSESSMENT_TYPE.WORKSHEET).map((config) => config.worksheetId).filter(Boolean)));

  const worksheets = worksheetIds.length
    ? await prisma.worksheet.findMany({
        where: {
          tenantId,
          id: { in: worksheetIds },
          ...(provenanceContext?.courseId ? { courseId: provenanceContext.courseId } : {})
        },
        select: {
          id: true,
          levelId: true,
          courseId: true,
          courseLevelId: true,
          isPublished: true,
          examCycleId: true,
          _count: { select: { questions: true } }
        }
      })
    : [];
  const worksheetById = new Map(worksheets.map((worksheet) => [worksheet.id, worksheet]));

  const writes = [];

  for (const config of cleaned) {
    if (config.assessmentType === ASSESSMENT_TYPE.WORKSHEET) {
      if (!config.worksheetId) {
        throw createHttpError(400, "worksheetId is required for worksheet mode", "EXAM_WORKSHEET_SELECTION_REQUIRED");
      }

      const worksheet = worksheetById.get(config.worksheetId);
      if (!worksheet) {
        throw createHttpError(409, "Selected worksheet not found", "EXAM_WORKSHEET_NOT_FOUND");
      }
      if (worksheet.levelId !== config.levelId) {
        throw createHttpError(409, "Selected worksheet level mismatch", "EXAM_WORKSHEET_LEVEL_MISMATCH");
      }
      const levelScope = getLevelScopeForLevelId({ provenanceContext, levelId: config.levelId });
      if (!matchesScope(worksheet, levelScope)) {
        throw createHttpError(409, "Selected worksheet is outside exam course scope", "EXAM_WORKSHEET_SCOPE_MISMATCH");
      }
      if (worksheet.examCycleId) {
        throw createHttpError(409, "Selected worksheet must be a base worksheet", "EXAM_WORKSHEET_SOURCE_INVALID");
      }
      if (!worksheet.isPublished) {
        throw createHttpError(409, "Selected worksheet must be published", "EXAM_WORKSHEET_NOT_PUBLISHED");
      }
      if ((worksheet._count?.questions ?? 0) <= 0) {
        throw createHttpError(409, "Selected worksheet has no questions", "EXAM_WORKSHEET_QUESTIONS_MISSING");
      }

      writes.push({
        levelId: config.levelId,
        assessmentType: ASSESSMENT_TYPE.WORKSHEET,
        worksheetId: worksheet.id,
        questionBankId: null,
        questionCount: null,
        timeLimitMinutes: null
      });
      continue;
    }

    const questionBank = await validateQuestionBankSelection({
      tenantId,
      levelId: config.levelId,
      questionBankId: config.questionBankId,
      questionCount: config.questionCount,
      provenanceContext
    });

    const timeLimitMinutes = toPositiveInt(config.timeLimitMinutes);
    if (!timeLimitMinutes) {
      throw createHttpError(400, "timeLimitMinutes must be a positive integer", "EXAM_TIME_LIMIT_INVALID");
    }

    writes.push({
      levelId: config.levelId,
      assessmentType: ASSESSMENT_TYPE.QUESTION_BANK,
      worksheetId: null,
      questionBankId: questionBank.questionBankId,
      questionCount: questionBank.questionCount,
      timeLimitMinutes
    });
  }

  try {
    await prisma.$transaction(
      writes.map((item) =>
        prisma.examLevelAssessmentConfig.upsert({
          where: {
            tenantId_examCycleId_levelId: {
              tenantId,
              examCycleId,
              levelId: item.levelId
            }
          },
          create: {
            tenantId,
            examCycleId,
            levelId: item.levelId,
            assessmentType: item.assessmentType,
            worksheetId: item.worksheetId,
            questionBankId: item.questionBankId,
            questionCount: item.questionCount,
            timeLimitMinutes: item.timeLimitMinutes,
            createdByUserId: actorUserId
          },
          update: {
            assessmentType: item.assessmentType,
            worksheetId: item.worksheetId,
            questionBankId: item.questionBankId,
            questionCount: item.questionCount,
            timeLimitMinutes: item.timeLimitMinutes,
            createdByUserId: actorUserId
          }
        })
      )
    );
  } catch (error) {
    mapAssessmentStorageError(error);
  }

  return getConfig({ tenantId, examCycleId, levelIds: writes.map((item) => item.levelId) });
}

async function validateConfig({ tenantId, examCycleId, requiredLevelIds, provenanceContext = null }) {
  const required = Array.from(new Set((requiredLevelIds || []).filter(Boolean).map((levelId) => String(levelId))));
  if (!required.length) {
    throw createHttpError(409, "No levels found for configuration validation", "EXAM_LIST_EMPTY");
  }

  ensureAssessmentStorageReady();

  let configs = [];
  try {
    configs = await prisma.examLevelAssessmentConfig.findMany({
      where: {
        tenantId,
        examCycleId,
        levelId: { in: required }
      },
      select: {
        levelId: true,
        assessmentType: true,
        worksheetId: true,
        questionBankId: true,
        questionCount: true,
        timeLimitMinutes: true
      }
    });
  } catch (error) {
    mapAssessmentStorageError(error);
  }

  const configByLevel = new Map(configs.map((config) => [config.levelId, config]));

  for (const levelId of required) {
    const config = configByLevel.get(levelId);
    if (!config) {
      throw createHttpError(409, "Missing assessment configuration for one or more levels", "EXAM_ASSESSMENT_CONFIG_INCOMPLETE");
    }

    if (config.assessmentType === ASSESSMENT_TYPE.WORKSHEET) {
      if (!config.worksheetId) {
        throw createHttpError(409, "Worksheet mapping missing for one or more levels", "EXAM_ASSESSMENT_WORKSHEET_MISSING");
      }

      const worksheet = await prisma.worksheet.findFirst({
        where: applyScopeToWhere({
          tenantId,
          id: config.worksheetId,
          levelId,
          isPublished: true,
          examCycleId: null
        }, getLevelScopeForLevelId({ provenanceContext, levelId })),
        select: { id: true }
      });

      if (!worksheet) {
        throw createHttpError(409, "Configured worksheet is invalid", "EXAM_ASSESSMENT_WORKSHEET_INVALID");
      }
      continue;
    }

    if (config.assessmentType !== ASSESSMENT_TYPE.QUESTION_BANK) {
      throw createHttpError(409, "Invalid assessment type configuration", "EXAM_ASSESSMENT_TYPE_INVALID");
    }

    await validateQuestionBankSelection({
      tenantId,
      levelId,
      questionBankId: config.questionBankId,
      questionCount: config.questionCount,
      provenanceContext
    });

    if (!toPositiveInt(config.timeLimitMinutes)) {
      throw createHttpError(409, "Question-bank configuration requires time limit", "EXAM_TIME_LIMIT_INVALID");
    }
  }

  return configs;
}

async function generateQuestionSet({ tenantId, examCycleId, studentId, levelId, provenanceContext = null }) {
  const normalizedLevelId = String(levelId || "").trim();
  const normalizedStudentId = String(studentId || "").trim();
  if (!normalizedLevelId || !normalizedStudentId) {
    throw createHttpError(400, "studentId and levelId are required", "VALIDATION_ERROR");
  }

  ensureAssessmentStorageReady();

  let config = null;
  try {
    config = await prisma.examLevelAssessmentConfig.findFirst({
      where: {
        tenantId,
        examCycleId,
        levelId: normalizedLevelId
      },
      select: {
        assessmentType: true,
        questionBankId: true,
        questionCount: true,
        timeLimitMinutes: true
      }
    });
  } catch (error) {
    mapAssessmentStorageError(error);
  }

  if (!config) {
    throw createHttpError(409, "No assessment configuration found for this level", "EXAM_ASSESSMENT_CONFIG_INCOMPLETE");
  }

  if (config.assessmentType !== ASSESSMENT_TYPE.QUESTION_BANK) {
    throw createHttpError(409, "This level is configured in worksheet mode", "EXAM_ASSESSMENT_NOT_QUESTION_BANK");
  }

  let existing = null;
  try {
    existing = await prisma.examGeneratedQuestionSet.findFirst({
      where: {
        tenantId,
        examCycleId,
        studentId: normalizedStudentId,
        levelId: normalizedLevelId
      },
      select: {
        id: true,
        questionBankId: true,
        generatedQuestionIds: true,
        generatedAt: true
      }
    });
  } catch (error) {
    mapAssessmentStorageError(error);
  }

  if (existing) {
    return {
      id: existing.id,
      levelId: normalizedLevelId,
      questionBankId: existing.questionBankId,
      generatedQuestionIds: existing.generatedQuestionIds,
      generatedAt: existing.generatedAt,
      timeLimitMinutes: config.timeLimitMinutes
    };
  }

  const questionBankId = normalizeQuestionBankKey(config.questionBankId);
  const questionCount = toPositiveInt(config.questionCount);
  if (!questionBankId || !questionCount) {
    throw createHttpError(409, "Invalid question-bank configuration", "EXAM_QUESTION_BANK_CONFIG_INVALID");
  }

  const templateId = extractTemplateIdFromQuestionBankKey(questionBankId);
  const levelScope = getLevelScopeForLevelId({ provenanceContext, levelId: normalizedLevelId });
  const pool = await prisma.questionBank.findMany({
    where: applyScopeToWhere({
      tenantId,
      levelId: normalizedLevelId,
      isActive: true,
      ...(templateId ? { templateId } : { templateId: null })
    }, levelScope),
    select: { id: true }
  });

  if (pool.length < questionCount) {
    throw createHttpError(409, "questionCount exceeds available questions", "EXAM_QUESTION_COUNT_EXCEEDS_BANK");
  }

  const shuffled = shuffleDeterministic(pool.map((item) => item.id), `${examCycleId}:${normalizedStudentId}:${normalizedLevelId}:${questionBankId}`);
  const generatedQuestionIds = shuffled.slice(0, questionCount);

  let created;
  try {
    created = await prisma.examGeneratedQuestionSet.create({
      data: {
        tenantId,
        examCycleId,
        studentId: normalizedStudentId,
        levelId: normalizedLevelId,
        questionBankId,
        generatedQuestionIds
      },
      select: {
        id: true,
        questionBankId: true,
        generatedQuestionIds: true,
        generatedAt: true
      }
    });
  } catch (error) {
    mapAssessmentStorageError(error);
  }

  return {
    id: created.id,
    levelId: normalizedLevelId,
    questionBankId: created.questionBankId,
    generatedQuestionIds: created.generatedQuestionIds,
    generatedAt: created.generatedAt,
    timeLimitMinutes: config.timeLimitMinutes
  };
}

export {
  ASSESSMENT_TYPE,
  bankKeyFromTemplateId,
  extractTemplateIdFromQuestionBankKey,
  getExamCycleLevels,
  getLevelWorksheets,
  getLevelQuestionBanks,
  getConfig,
  saveConfig,
  validateConfig,
  generateQuestionSet
};
