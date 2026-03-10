import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { generateWorksheet } from "../services/abacus-question-generator.service.js";
import { assertCanModifyAcademic, assertCanModifyOperational } from "../services/ownership-guard.service.js";

function normalizeMoney(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return { error: "Amount must be a non-negative number" };
  }
  return Number(num.toFixed(2));
}

function computeStudentTotalFromDefault(defaultTotalFeeAmount, feeConcessionAmount) {
  if (defaultTotalFeeAmount === null || defaultTotalFeeAmount === undefined) {
    return null;
  }

  const total = Number(defaultTotalFeeAmount);
  const concession = Number(feeConcessionAmount || 0);
  return Number(Math.max(0, total - concession).toFixed(2));
}

const listLevels = asyncHandler(async (req, res) => {
  const data = await prisma.level.findMany({
    where: {
      tenantId: req.auth.tenantId
    },
    orderBy: { rank: "asc" }
  });

  return res.apiSuccess("Levels fetched", data);
});

const createLevel = asyncHandler(async (req, res) => {
  assertCanModifyAcademic(req.auth.role);

  const { name, rank, description, defaultTotalFeeAmount, defaultAdmissionFeeAmount } = req.body;

  const normalizedDefaultTotalFeeAmount = normalizeMoney(defaultTotalFeeAmount);
  if (normalizedDefaultTotalFeeAmount?.error) {
    return res.apiError(400, normalizedDefaultTotalFeeAmount.error, "VALIDATION_ERROR");
  }

  const normalizedDefaultAdmissionFeeAmount = normalizeMoney(defaultAdmissionFeeAmount);
  if (normalizedDefaultAdmissionFeeAmount?.error) {
    return res.apiError(400, normalizedDefaultAdmissionFeeAmount.error, "VALIDATION_ERROR");
  }

  const created = await prisma.level.create({
    data: {
      tenantId: req.auth.tenantId,
      name,
      rank,
      description,
      ...(normalizedDefaultTotalFeeAmount !== undefined ? { defaultTotalFeeAmount: normalizedDefaultTotalFeeAmount } : {}),
      ...(normalizedDefaultAdmissionFeeAmount !== undefined ? { defaultAdmissionFeeAmount: normalizedDefaultAdmissionFeeAmount } : {})
    }
  });

  res.locals.entityId = created.id;
  return res.apiSuccess("Level created", created, 201);
});

const updateLevelFeeDefaults = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const levelId = String(req.params.id || "").trim();
  if (!levelId) {
    return res.apiError(400, "levelId is required", "VALIDATION_ERROR");
  }

  const normalizedDefaultTotalFeeAmount = normalizeMoney(req.body?.defaultTotalFeeAmount);
  if (normalizedDefaultTotalFeeAmount?.error) {
    return res.apiError(400, normalizedDefaultTotalFeeAmount.error, "VALIDATION_ERROR");
  }

  const normalizedDefaultAdmissionFeeAmount = normalizeMoney(req.body?.defaultAdmissionFeeAmount);
  if (normalizedDefaultAdmissionFeeAmount?.error) {
    return res.apiError(400, normalizedDefaultAdmissionFeeAmount.error, "VALIDATION_ERROR");
  }

  const level = await prisma.level.findFirst({
    where: { id: levelId, tenantId: req.auth.tenantId },
    select: { id: true }
  });

  if (!level) {
    return res.apiError(404, "Level not found", "LEVEL_NOT_FOUND");
  }

  const updated = await prisma.level.update({
    where: { id: level.id },
    data: {
      ...(normalizedDefaultTotalFeeAmount !== undefined ? { defaultTotalFeeAmount: normalizedDefaultTotalFeeAmount } : {}),
      ...(normalizedDefaultAdmissionFeeAmount !== undefined ? { defaultAdmissionFeeAmount: normalizedDefaultAdmissionFeeAmount } : {})
    }
  });

  const students = await prisma.student.findMany({
    where: {
      tenantId: req.auth.tenantId,
      levelId: updated.id
    },
    select: { id: true }
  });

  await prisma.$executeRaw`
    UPDATE Student
    SET totalFeeAmount = CASE
      WHEN ${updated.defaultTotalFeeAmount} IS NULL THEN NULL
      ELSE GREATEST(0, ${updated.defaultTotalFeeAmount} - COALESCE(feeConcessionAmount, 0))
    END,
    admissionFeeAmount = ${updated.defaultAdmissionFeeAmount}
    WHERE tenantId = ${req.auth.tenantId}
      AND levelId = ${updated.id}
  `;

  const result = {
    level: updated,
    updatedStudentCount: students.length
  };

  res.locals.entityId = result.level.id;
  return res.apiSuccess("Level fee defaults updated", result);
});

const generateLevelWorksheet = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const { id: levelId } = req.params;
  const mode = String(req.query.mode || "practice").toLowerCase();
  const seed = req.query.seed ? String(req.query.seed) : null;

  if (!["practice", "exam"].includes(mode)) {
    return res.apiError(400, "Invalid mode. Use practice or exam", "INVALID_MODE");
  }

  if (mode === "exam" && !seed) {
    return res.apiError(400, "Seed is required in exam mode", "SEED_REQUIRED");
  }

  const level = await prisma.level.findFirst({
    where: {
      id: levelId,
      tenantId: req.auth.tenantId
    },
    select: {
      id: true,
      rank: true,
      name: true
    }
  });

  if (!level) {
    return res.apiError(404, "Level not found", "LEVEL_NOT_FOUND");
  }

  const seedToUse = seed || `${Date.now()}-${req.auth.userId}-${levelId}`;
  const generated = await generateWorksheet(levelId, req.auth.tenantId, seedToUse);

  const created = await prisma.$transaction(async (tx) => {
    const worksheet = await tx.worksheet.create({
      data: {
        tenantId: req.auth.tenantId,
        title: `${level.name} Generated Worksheet`,
        description: `Auto-generated worksheet for ${level.name}`,
        difficulty: level.rank <= 2 ? "EASY" : level.rank <= 4 ? "MEDIUM" : "HARD",
        levelId,
        createdByUserId: req.auth.userId,
        isPublished: false,
        templateId: generated.templateId,
        generationMode: mode === "exam" ? "EXAM" : "PRACTICE",
        generationSeed: mode === "exam" ? seedToUse : null,
        generatedAt: new Date(),
        timeLimitSeconds: generated.timeLimitSeconds
      }
    });

    await tx.worksheetQuestion.createMany({
      data: generated.questions.map((question) => ({
        tenantId: req.auth.tenantId,
        worksheetId: worksheet.id,
        questionNumber: question.questionNumber,
        questionBankId: question.questionBankId,
        operands: question.operands,
        operation: question.operation,
        correctAnswer: question.correctAnswer
      }))
    });

    return worksheet;
  });

  return res.apiSuccess("Worksheet generated", {
    worksheetId: created.id,
    questions: generated.questions.map((question) => ({
      questionNumber: question.questionNumber,
      operands: question.operands,
      operation: question.operation
    }))
  }, 201);
});

export { listLevels, createLevel, updateLevelFeeDefaults, generateLevelWorksheet };
