import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { logger } from "../lib/logger.js";
import {
  textComplete,
  imageDescribe,
  sentimentAnalysis,
  generateQuiz,
  promptLab,
  storyGen,
  mathSolver,
  summarize,
  translate,
  codeExplain,
  wordProblem,
  suggestImprovementsMeta,
  generateToolDefinition,
  runCustomTool,
  checkRateLimit,
  DAILY_LIMIT_PER_STUDENT
} from "../services/ai-playground.service.js";

const TOOLS = {
  "text-complete": textComplete,
  "image-describe": imageDescribe,
  sentiment: sentimentAnalysis,
  "quiz-gen": generateQuiz,
  "prompt-lab": promptLab,
  "story-gen": storyGen,
  "math-solver": mathSolver,
  summarizer: summarize,
  translator: translate,
  "code-explainer": codeExplain,
  "word-problem": wordProblem
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

// POST /student/ai-playground/suggest-improvements
const suggestImprovements = asyncHandler(async (req, res) => {
  const allowed = checkRateLimit(req.auth.tenantId, req.student.id);
  if (!allowed) {
    return res.apiError(429, `Daily AI limit reached (${DAILY_LIMIT_PER_STUDENT} requests/day). Try again tomorrow!`, "RATE_LIMIT_EXCEEDED");
  }

  const currentFeatures = [
    "Built-in tools: Text Completer, Image Describer, Sentiment Analyzer, AI Quiz Generator, Prompt Lab, Story Generator, Math Solver, Summarizer, Translator, Code Explainer, Word Problem Creator",
    "Custom tool creator: students describe a tool and AI generates it",
    "Chatbot Builder: rule-based chatbot with AI auto-generate rules",
    "Learn section: 6 course levels about AI, 12 field cards, fun facts",
    "History: view past AI interactions",
    "AI Coach: daily missions, readiness gauge, milestones",
    "Usage tracking: daily limit of " + DAILY_LIMIT_PER_STUDENT + " requests"
  ].join("\n- ");

  const result = await suggestImprovementsMeta(currentFeatures);

  let suggestions = [];
  try {
    const cleaned = result.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed?.suggestions)) suggestions = parsed.suggestions;
  } catch {
    suggestions = [{ title: "AI Response", description: result.text, category: "General" }];
  }

  return res.apiSuccess("AI improvement suggestions", {
    suggestions,
    tokensUsed: result.tokensUsed || 0,
    durationMs: result.durationMs || 0
  });
});

// POST /student/ai-playground/custom-tools
const createCustomTool = asyncHandler(async (req, res) => {
  const { description } = req.body;

  if (!description || !String(description).trim()) {
    return res.apiError(400, "description is required", "VALIDATION_ERROR");
  }

  const trimmed = String(description).trim().slice(0, 500);

  // Limit to 10 custom tools per student
  const existingCount = await prisma.aiCustomTool.count({
    where: { tenantId: req.auth.tenantId, studentId: req.student.id }
  });
  if (existingCount >= 10) {
    return res.apiError(400, "Maximum of 10 custom tools allowed. Delete one to create a new one.", "LIMIT_EXCEEDED");
  }

  const allowed = checkRateLimit(req.auth.tenantId, req.student.id);
  if (!allowed) {
    return res.apiError(429, `Daily AI limit reached (${DAILY_LIMIT_PER_STUDENT} requests/day). Try again tomorrow!`, "RATE_LIMIT_EXCEEDED");
  }

  const result = await generateToolDefinition(trimmed);

  let toolDef;
  try {
    const cleaned = result.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    toolDef = JSON.parse(cleaned);
  } catch {
    return res.apiError(422, "AI could not generate a valid tool definition. Try rephrasing your description.", "AI_PARSE_ERROR");
  }

  if (!toolDef.toolName || !toolDef.systemPrompt) {
    return res.apiError(422, "AI generated an incomplete tool definition. Try again with more detail.", "AI_PARSE_ERROR");
  }

  const tool = await prisma.aiCustomTool.create({
    data: {
      tenantId: req.auth.tenantId,
      studentId: req.student.id,
      toolName: String(toolDef.toolName).slice(0, 50),
      icon: String(toolDef.icon || "🔧").slice(0, 4),
      title: String(toolDef.title || toolDef.toolName).slice(0, 100),
      description: String(toolDef.description || "Custom AI tool").slice(0, 300),
      systemPrompt: String(toolDef.systemPrompt).slice(0, 2000),
      placeholder: String(toolDef.placeholder || "Type your input here...").slice(0, 200)
    }
  });

  return res.apiSuccess("Custom tool created", tool);
});

// GET /student/ai-playground/custom-tools
const listCustomTools = asyncHandler(async (req, res) => {
  const tools = await prisma.aiCustomTool.findMany({
    where: { tenantId: req.auth.tenantId, studentId: req.student.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      toolName: true,
      icon: true,
      title: true,
      description: true,
      placeholder: true,
      createdAt: true
    }
  });
  return res.apiSuccess("Custom tools", tools);
});

// DELETE /student/ai-playground/custom-tools/:id
const deleteCustomTool = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tool = await prisma.aiCustomTool.findFirst({
    where: { id, tenantId: req.auth.tenantId, studentId: req.student.id }
  });
  if (!tool) {
    return res.apiError(404, "Custom tool not found", "NOT_FOUND");
  }
  await prisma.aiCustomTool.delete({ where: { id } });
  return res.apiSuccess("Custom tool deleted");
});

// POST /student/ai-playground/custom-tools/:id/run
const runCustomToolEndpoint = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { prompt } = req.body;

  if (!prompt || !String(prompt).trim()) {
    return res.apiError(400, "prompt is required", "VALIDATION_ERROR");
  }

  const tool = await prisma.aiCustomTool.findFirst({
    where: { id, tenantId: req.auth.tenantId, studentId: req.student.id }
  });
  if (!tool) {
    return res.apiError(404, "Custom tool not found", "NOT_FOUND");
  }

  const allowed = checkRateLimit(req.auth.tenantId, req.student.id);
  if (!allowed) {
    return res.apiError(429, `Daily AI limit reached (${DAILY_LIMIT_PER_STUDENT} requests/day). Try again tomorrow!`, "RATE_LIMIT_EXCEEDED");
  }

  const trimmedPrompt = String(prompt).trim().slice(0, 2000);
  const result = await runCustomTool(tool.systemPrompt, trimmedPrompt);

  // Log usage
  prisma.aiPlaygroundLog
    .create({
      data: {
        tenantId: req.auth.tenantId,
        studentId: req.student.id,
        toolName: `custom:${tool.toolName}`,
        prompt: trimmedPrompt,
        response: result.text || "",
        tokensUsed: result.tokensUsed || 0,
        durationMs: result.durationMs || 0
      }
    })
    .catch((err) => logger.error("ai_playground_log_failed", { error: err.message }));

  return res.apiSuccess("Custom tool response", {
    tool: tool.toolName,
    response: result.text,
    tokensUsed: result.tokensUsed || 0,
    durationMs: result.durationMs || 0
  });
});

export {
  aiPlayground,
  getAiPlaygroundUsage,
  getAiPlaygroundHistory,
  suggestImprovements,
  createCustomTool,
  listCustomTools,
  deleteCustomTool,
  runCustomToolEndpoint
};
