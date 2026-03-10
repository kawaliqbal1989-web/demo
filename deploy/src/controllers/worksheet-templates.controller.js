import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";

function normalizeInt(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBoolean(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const v = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(v)) {
    return true;
  }
  if (["false", "0", "no"].includes(v)) {
    return false;
  }
  return null;
}

function validateTemplateCounts({ totalQuestions, easyCount, mediumCount, hardCount }) {
  const nums = [totalQuestions, easyCount, mediumCount, hardCount];
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) {
    const error = new Error("Question counts must be non-negative integers");
    error.statusCode = 400;
    error.errorCode = "VALIDATION_ERROR";
    throw error;
  }

  if (totalQuestions <= 0) {
    const error = new Error("totalQuestions must be greater than 0");
    error.statusCode = 400;
    error.errorCode = "VALIDATION_ERROR";
    throw error;
  }

  const sum = easyCount + mediumCount + hardCount;
  if (sum !== totalQuestions) {
    const error = new Error("easyCount + mediumCount + hardCount must equal totalQuestions");
    error.statusCode = 400;
    error.errorCode = "TEMPLATE_COUNT_MISMATCH";
    throw error;
  }
}

const getWorksheetTemplate = asyncHandler(async (req, res) => {
  const { id: levelId } = req.params;

  const template = await prisma.worksheetTemplate.findFirst({
    where: {
      tenantId: req.auth.tenantId,
      levelId
    }
  });

  return res.apiSuccess("Worksheet template fetched", template);
});

const upsertWorksheetTemplate = asyncHandler(async (req, res) => {
  const { id: levelId } = req.params;

  const name = req.body?.name ? String(req.body.name).trim() : null;
  const totalQuestions = normalizeInt(req.body?.totalQuestions);
  const easyCount = normalizeInt(req.body?.easyCount);
  const mediumCount = normalizeInt(req.body?.mediumCount);
  const hardCount = normalizeInt(req.body?.hardCount);
  const timeLimitSeconds = normalizeInt(req.body?.timeLimitSeconds);
  const isActive = normalizeBoolean(req.body?.isActive);

  if (!name) {
    return res.apiError(400, "name is required", "VALIDATION_ERROR");
  }

  if ([totalQuestions, easyCount, mediumCount, hardCount, timeLimitSeconds].some((n) => n === null)) {
    return res.apiError(400, "totalQuestions, easyCount, mediumCount, hardCount, timeLimitSeconds are required", "VALIDATION_ERROR");
  }

  if (!Number.isInteger(timeLimitSeconds) || timeLimitSeconds < 30 || timeLimitSeconds > 7200) {
    return res.apiError(400, "timeLimitSeconds must be between 30 and 7200", "VALIDATION_ERROR");
  }

  validateTemplateCounts({
    totalQuestions,
    easyCount,
    mediumCount,
    hardCount
  });

  const updated = await prisma.worksheetTemplate.upsert({
    where: {
      tenantId_levelId: {
        tenantId: req.auth.tenantId,
        levelId
      }
    },
    create: {
      tenantId: req.auth.tenantId,
      levelId,
      name,
      totalQuestions,
      easyCount,
      mediumCount,
      hardCount,
      timeLimitSeconds,
      isActive: isActive === null ? true : isActive
    },
    update: {
      name,
      totalQuestions,
      easyCount,
      mediumCount,
      hardCount,
      timeLimitSeconds,
      isActive: isActive === null ? undefined : isActive
    }
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Worksheet template saved", updated, 201);
});

export { getWorksheetTemplate, upsertWorksheetTemplate };
