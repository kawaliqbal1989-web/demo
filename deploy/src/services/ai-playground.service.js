import { logger } from "../lib/logger.js";

/**
 * Lightweight AI proxy service.
 *
 * Supports Google Gemini (free tier) and falls back to a simple local
 * implementation when no API key is configured so the feature still works
 * in development without incurring costs.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const DAILY_LIMIT_PER_STUDENT = Number(process.env.AI_DAILY_LIMIT || 30);

// ---------------------------------------------------------------------------
// Rate-limit helper (in-memory; resets on server restart, good enough for dev)
// ---------------------------------------------------------------------------
const usageMap = new Map(); // key = `${tenantId}:${studentId}:${dateStr}`

function usageKey(tenantId, studentId) {
  const d = new Date().toISOString().slice(0, 10);
  return `${tenantId}:${studentId}:${d}`;
}

function checkRateLimit(tenantId, studentId) {
  const key = usageKey(tenantId, studentId);
  const count = usageMap.get(key) || 0;
  if (count >= DAILY_LIMIT_PER_STUDENT) {
    return false;
  }
  usageMap.set(key, count + 1);
  return true;
}

// ---------------------------------------------------------------------------
// Gemini caller
// ---------------------------------------------------------------------------
async function callGemini(prompt, { maxTokens = 512, temperature = 0.7 } = {}) {
  if (!GEMINI_API_KEY) {
    return callFallback(prompt);
  }

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_LOW_AND_ABOVE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_LOW_AND_ABOVE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_LOW_AND_ABOVE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_LOW_AND_ABOVE" }
    ]
  };

  const start = Date.now();

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify(body)
  });

  const duration = Date.now() - start;

  if (!res.ok) {
    const text = await res.text().catch((err) => { logger.error("gemini_response_read_failed", { error: err.message }); return ""; });
    logger.warn("gemini_api_error", { status: res.status, body: text.slice(0, 500) });
    return callFallback(prompt);
  }

  const json = await res.json();
  const text =
    json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "(No response from AI)";

  const tokensUsed =
    (json?.usageMetadata?.promptTokenCount || 0) + (json?.usageMetadata?.candidatesTokenCount || 0);

  return { text, tokensUsed, durationMs: duration };
}

// ---------------------------------------------------------------------------
// Simple offline fallback so the playground works without an API key
// ---------------------------------------------------------------------------
function callFallback(prompt) {
  const lower = prompt.toLowerCase();
  let text = "This is a demo response. Configure GEMINI_API_KEY for real AI responses.";

  if (lower.includes("sentiment")) {
    const positiveWords = ["good", "great", "love", "excellent", "happy", "wonderful", "amazing", "fantastic"];
    const negativeWords = ["bad", "terrible", "hate", "awful", "sad", "horrible", "worst", "boring"];
    const pCount = positiveWords.filter((w) => lower.includes(w)).length;
    const nCount = negativeWords.filter((w) => lower.includes(w)).length;
    if (pCount > nCount) text = JSON.stringify({ sentiment: "POSITIVE", confidence: 0.82 });
    else if (nCount > pCount) text = JSON.stringify({ sentiment: "NEGATIVE", confidence: 0.78 });
    else text = JSON.stringify({ sentiment: "NEUTRAL", confidence: 0.65 });
  } else if (lower.includes("quiz") || lower.includes("question")) {
    text = JSON.stringify({
      questions: [
        { q: "What does AI stand for?", options: ["Artificial Intelligence", "Automated Input", "Advanced Interface", "Analog Instruction"], answer: 0 },
        { q: "Which of these is an example of AI?", options: ["Calculator", "Voice Assistant", "Light Bulb", "Clock"], answer: 1 },
        { q: "What does a chatbot do?", options: ["Cooks food", "Talks to humans using text", "Plays music", "Drives a car"], answer: 1 },
        { q: "AI learns from ___", options: ["Magic", "Data", "Luck", "Guessing"], answer: 1 },
        { q: "Which company created ChatGPT?", options: ["Google", "Apple", "OpenAI", "Microsoft"], answer: 2 }
      ]
    });
  } else if (lower.includes("complete") || lower.includes("continue")) {
    text = prompt.trim() + " ... and that is how artificial intelligence is transforming the world around us, making everyday tasks smarter and more efficient.";
  } else if (lower.includes("describe") || lower.includes("image")) {
    text = "I can see a colorful image. In a real setup with Gemini Vision, I would describe the objects, colors, and context in the image.";
  }

  return { text, tokensUsed: 0, durationMs: 5 };
}

// ---------------------------------------------------------------------------
// Tool-specific wrappers
// ---------------------------------------------------------------------------

async function textComplete(prompt) {
  return callGemini(
    `Complete the following text naturally. Only output the continuation, not the original text.\n\nText: "${prompt}"\n\nContinuation:`,
    { maxTokens: 256, temperature: 0.8 }
  );
}

async function imageDescribe(imageDescription) {
  // For text-only model, student describes what they see and AI expands.
  // With Gemini Vision, this would accept actual image bytes.
  return callGemini(
    `A student is learning about AI image recognition. They say they see: "${imageDescription}". Explain what an AI image recognition system would identify in such a scene — list objects, colors, and context. Keep it educational and age-appropriate for school students.`,
    { maxTokens: 300, temperature: 0.6 }
  );
}

async function sentimentAnalysis(text) {
  return callGemini(
    `Analyze the sentiment of the following text. Respond ONLY with a JSON object: {"sentiment": "POSITIVE" | "NEGATIVE" | "NEUTRAL", "confidence": 0.0-1.0, "explanation": "one sentence"}.\n\nText: "${text}"\n\nJSON:`,
    { maxTokens: 120, temperature: 0.2 }
  );
}

async function generateQuiz(topic) {
  return callGemini(
    `Generate exactly 5 multiple-choice quiz questions about "${topic}" suitable for school students (ages 8-16). Each question should have 4 options.\n\nRespond ONLY with valid JSON: {"questions": [{"q": "...", "options": ["A","B","C","D"], "answer": 0}]} where answer is the 0-based index of the correct option.\n\nJSON:`,
    { maxTokens: 600, temperature: 0.7 }
  );
}

async function promptLab(prompt) {
  return callGemini(prompt, { maxTokens: 400, temperature: 0.7 });
}

export {
  textComplete,
  imageDescribe,
  sentimentAnalysis,
  generateQuiz,
  promptLab,
  checkRateLimit,
  DAILY_LIMIT_PER_STUDENT
};
