import crypto from "crypto";
import { prisma } from "../lib/prisma.js";

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

function hashToPositiveInt(value) {
  const hex = crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 8);
  return parseInt(hex, 16) || 1;
}

function assertTemplateIntegrity(template) {
  const computedTotal = template.easyCount + template.mediumCount + template.hardCount;
  if (computedTotal !== template.totalQuestions) {
    const error = new Error("Worksheet template has invalid difficulty distribution");
    error.statusCode = 409;
    error.errorCode = "WORKSHEET_TEMPLATE_INVALID";
    throw error;
  }
}

async function loadDifficultyChunk({ tenantId, levelId, templateId, difficulty, offset, take }) {
  return prisma.questionBank.findMany({
    where: {
      tenantId,
      levelId,
      isActive: true,
      difficulty,
      ...(templateId ? { OR: [{ templateId }, { templateId: null }] } : {})
    },
    orderBy: {
      id: "asc"
    },
    skip: offset,
    take,
    select: {
      id: true,
      operands: true,
      operation: true,
      correctAnswer: true
    }
  });
}

async function selectQuestionsForDifficulty({
  seed,
  tenantId,
  levelId,
  templateId,
  difficulty,
  requiredCount,
  usedQuestionIds
}) {
  if (requiredCount <= 0) {
    return [];
  }

  const totalAvailable = await prisma.questionBank.count({
    where: {
      tenantId,
      levelId,
      isActive: true,
      difficulty,
      ...(templateId ? { OR: [{ templateId }, { templateId: null }] } : {})
    }
  });

  if (totalAvailable < requiredCount) {
    const error = new Error(`Insufficient ${difficulty} questions in question bank`);
    error.statusCode = 409;
    error.errorCode = "QUESTION_BANK_INSUFFICIENT";
    throw error;
  }

  const deterministicOffset = hashToPositiveInt(`${seed}:${difficulty}:${levelId}`) % totalAvailable;
  const firstTake = Math.min(requiredCount, totalAvailable - deterministicOffset);

  const firstBatch = await loadDifficultyChunk({
    tenantId,
    levelId,
    templateId,
    difficulty,
    offset: deterministicOffset,
    take: firstTake
  });

  const remaining = requiredCount - firstBatch.length;
  const secondBatch =
    remaining > 0
      ? await loadDifficultyChunk({
          tenantId,
          levelId,
          templateId,
          difficulty,
          offset: 0,
          take: remaining
        })
      : [];

  const selected = [];
  for (const question of [...firstBatch, ...secondBatch]) {
    if (usedQuestionIds.has(question.id)) {
      continue;
    }
    usedQuestionIds.add(question.id);
    selected.push(question);
    if (selected.length === requiredCount) {
      break;
    }
  }

  if (selected.length !== requiredCount) {
    const error = new Error(`Unable to select non-duplicate ${difficulty} questions`);
    error.statusCode = 409;
    error.errorCode = "QUESTION_SELECTION_CONFLICT";
    throw error;
  }

  return selected;
}

async function generateWorksheet(levelId, tenantId, seedOptional = null) {
  const levelRule = await prisma.levelRule.findUnique({
    where: {
      tenantId_levelId: {
        tenantId,
        levelId
      }
    }
  });

  if (!levelRule) {
    const error = new Error("Level rule not configured");
    error.statusCode = 404;
    error.errorCode = "LEVEL_RULE_NOT_FOUND";
    throw error;
  }

  const template = await prisma.worksheetTemplate.findUnique({
    where: {
      tenantId_levelId: {
        tenantId,
        levelId
      }
    },
    select: {
      id: true,
      totalQuestions: true,
      easyCount: true,
      mediumCount: true,
      hardCount: true,
      timeLimitSeconds: true,
      isActive: true
    }
  });

  if (!template || !template.isActive) {
    const error = new Error("Worksheet template not configured for level");
    error.statusCode = 404;
    error.errorCode = "WORKSHEET_TEMPLATE_NOT_FOUND";
    throw error;
  }

  assertTemplateIntegrity(template);

  const seed = seedOptional || `${tenantId}:${levelId}:${Date.now()}`;
  const usedQuestionIds = new Set();

  const [easyQuestions, mediumQuestions, hardQuestions] = await Promise.all([
    selectQuestionsForDifficulty({
      seed,
      tenantId,
      levelId,
      templateId: template.id,
      difficulty: "EASY",
      requiredCount: template.easyCount,
      usedQuestionIds
    }),
    selectQuestionsForDifficulty({
      seed,
      tenantId,
      levelId,
      templateId: template.id,
      difficulty: "MEDIUM",
      requiredCount: template.mediumCount,
      usedQuestionIds
    }),
    selectQuestionsForDifficulty({
      seed,
      tenantId,
      levelId,
      templateId: template.id,
      difficulty: "HARD",
      requiredCount: template.hardCount,
      usedQuestionIds
    })
  ]);

  const combined = [...easyQuestions, ...mediumQuestions, ...hardQuestions];
  const seededRandom = createSeededRandom(seed);
  const shuffled = combined
    .map((item) => ({ item, sortKey: seededRandom() }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((entry) => entry.item);

  const questions = shuffled.map((question, index) => ({
    questionNumber: index + 1,
    questionBankId: question.id,
    operands: question.operands,
    operation: question.operation,
    correctAnswer: question.correctAnswer
  }));

  return {
    templateId: template.id,
    questions,
    totalQuestions: template.totalQuestions,
    timeLimitSeconds: template.timeLimitSeconds || levelRule.timeLimitSeconds || 600
  };
}

export { generateWorksheet };
