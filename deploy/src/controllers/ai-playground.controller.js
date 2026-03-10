import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { logger } from "../lib/logger.js";
import {
  textComplete,
  imageDescribe,
  sentimentAnalysis,
  generateQuiz,
  promptLab,
  checkRateLimit,
  DAILY_LIMIT_PER_STUDENT
} from "../services/ai-playground.service.js";

const TOOLS = {
  "text-complete": textComplete,
  "image-describe": imageDescribe,
  sentiment: sentimentAnalysis,
  "quiz-gen": generateQuiz,
  "prompt-lab": promptLab
};

// POST /student/ai-playground
const aiPlayground = asyncHandler(async (req, res) => {
  const { tool, prompt } = req.body;

  if (!tool || !prompt) {
    return res.apiError(400, "tool and prompt are required", "VALIDATION_ERROR");
  }

  const trimmedPrompt = String(prompt).trim().slice(0, 2000);
  if (!trimmedPrompt) {
    return res.apiError(400, "prompt cannot be empty", "VALIDATION_ERROR");
  }

  const handler = TOOLS[tool];
  if (!handler) {
    return res.apiError(400, `Unknown tool: ${tool}. Valid: ${Object.keys(TOOLS).join(", ")}`, "VALIDATION_ERROR");
  }

  // Rate limit
  const allowed = checkRateLimit(req.auth.tenantId, req.student.id);
  if (!allowed) {
    return res.apiError(429, `Daily AI limit reached (${DAILY_LIMIT_PER_STUDENT} requests/day). Try again tomorrow!`, "RATE_LIMIT_EXCEEDED");
  }

  const result = await handler(trimmedPrompt);

  // Log usage asynchronously — don't block response
  prisma.aiPlaygroundLog
    .create({
      data: {
        tenantId: req.auth.tenantId,
        studentId: req.student.id,
        toolName: tool,
        prompt: trimmedPrompt,
        response: result.text || "",
        tokensUsed: result.tokensUsed || 0,
        durationMs: result.durationMs || 0
      }
    })
    .catch((err) => logger.error("ai_playground_log_failed", { error: err.message }));

  return res.apiSuccess("AI response generated", {
    tool,
    response: result.text,
    tokensUsed: result.tokensUsed || 0,
    durationMs: result.durationMs || 0
  });
});

// GET /student/ai-playground/usage
const getAiPlaygroundUsage = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayCount = await prisma.aiPlaygroundLog.count({
    where: {
      tenantId: req.auth.tenantId,
      studentId: req.student.id,
      createdAt: { gte: today }
    }
  });

  const totalCount = await prisma.aiPlaygroundLog.count({
    where: {
      tenantId: req.auth.tenantId,
      studentId: req.student.id
    }
  });

  return res.apiSuccess("AI playground usage", {
    todayUsed: todayCount,
    dailyLimit: DAILY_LIMIT_PER_STUDENT,
    remaining: Math.max(0, DAILY_LIMIT_PER_STUDENT - todayCount),
    totalAllTime: totalCount
  });
});

// GET /student/ai-playground/history
const getAiPlaygroundHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);

  const logs = await prisma.aiPlaygroundLog.findMany({
    where: {
      tenantId: req.auth.tenantId,
      studentId: req.student.id
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      toolName: true,
      prompt: true,
      response: true,
      tokensUsed: true,
      durationMs: true,
      createdAt: true
    }
  });

  return res.apiSuccess("AI playground history", logs);
});

export { aiPlayground, getAiPlaygroundUsage, getAiPlaygroundHistory };
