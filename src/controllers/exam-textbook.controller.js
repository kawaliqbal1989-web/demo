import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";

const getExamTextbookLevel = asyncHandler(async (req, res) => {
  const levelId = String(req.params.levelId || "").trim();
  if (!levelId) {
    return res.apiError(400, "levelId is required", "VALIDATION_ERROR");
  }

  const level = await prisma.level.findFirst({
    where: { id: levelId, tenantId: req.auth.tenantId },
    select: { id: true, name: true, rank: true }
  });

  if (!level) {
    return res.apiError(404, "Level not found", "LEVEL_NOT_FOUND");
  }

  const data = await prisma.examTextbookData.findFirst({
    where: { tenantId: req.auth.tenantId, levelId },
    select: { id: true, levelId: true, content: true, updatedAt: true }
  });

  return res.apiSuccess("Exam textbook level", {
    level,
    textbook: data
      ? {
          id: data.id,
          levelId: data.levelId,
          content: data.content,
          updatedAt: data.updatedAt
        }
      : null
  });
});

const upsertExamTextbookLevel = asyncHandler(async (req, res) => {
  const levelId = String(req.params.levelId || "").trim();
  if (!levelId) {
    return res.apiError(400, "levelId is required", "VALIDATION_ERROR");
  }

  const level = await prisma.level.findFirst({
    where: { id: levelId, tenantId: req.auth.tenantId },
    select: { id: true, name: true, rank: true }
  });

  if (!level) {
    return res.apiError(404, "Level not found", "LEVEL_NOT_FOUND");
  }

  const content = req.body?.content;
  if (content === undefined || content === null) {
    return res.apiError(400, "content is required", "VALIDATION_ERROR");
  }

  // Accept any JSON object/array as content.
  if (typeof content !== "object") {
    return res.apiError(400, "content must be a JSON object or array", "VALIDATION_ERROR");
  }

  const saved = await prisma.examTextbookData.upsert({
    where: {
      tenantId_levelId: {
        tenantId: req.auth.tenantId,
        levelId
      }
    },
    create: {
      tenantId: req.auth.tenantId,
      levelId,
      content,
      createdByUserId: req.auth.userId
    },
    update: {
      content
    },
    select: { id: true, levelId: true, content: true, updatedAt: true }
  });

  return res.apiSuccess("Exam textbook saved", saved);
});

export { getExamTextbookLevel, upsertExamTextbookLevel };
