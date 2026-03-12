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
  } else if (lower.includes("story") || lower.includes("once upon")) {
    text = `Once upon a time in a land of circuits and code, a young robot named Sparky discovered it could dream. Every night, its processors would paint vivid worlds of color and sound.\n\nSparky began writing down its dreams, and soon the whole village gathered to hear the robot's tales. "Even machines can imagine," Sparky would say, "if you give them the right data."\n\nAnd so began the age of creative machines — not to replace human stories, but to inspire new ones.\n\n— The End`;
  } else if (lower.includes("summar")) {
    text = "**Summary:**\n• The main topic is discussed with supporting evidence.\n• Key points are highlighted for quick understanding.\n• The conclusion reinforces the central message.\n\n(This is a demo summary. Configure GEMINI_API_KEY for real AI summaries.)";
  } else if (lower.includes("translat")) {
    text = "(Demo translation) The text has been translated. In a real setup with Gemini, the AI would accurately translate between 100+ languages while preserving meaning and tone.";
  } else if (lower.includes("math") || lower.includes("solve") || lower.includes("equation") || lower.includes("calculate")) {
    text = "**Step-by-step Solution:**\n\nStep 1: Identify the problem type\nStep 2: Apply the relevant formula\nStep 3: Calculate the result\nStep 4: Verify the answer\n\n**Answer:** The solution is demonstrated above.\n\n(This is a demo solution. Configure GEMINI_API_KEY for real step-by-step math solving.)";
  } else if (lower.includes("code") || lower.includes("function") || lower.includes("program") || lower.includes("script")) {
    text = "**Code Explanation:**\n\nThis code defines a set of instructions for the computer. Here's what each part does:\n\n1. **Input** — The program receives data\n2. **Processing** — It transforms the data using logic\n3. **Output** — It returns or displays the result\n\nThink of it like a recipe: ingredients go in, steps are followed, and a dish comes out!\n\n(This is a demo explanation. Configure GEMINI_API_KEY for detailed code analysis.)";
  } else if (lower.includes("word problem")) {
    text = JSON.stringify({
      problems: [
        { problem: "A bakery makes 48 cupcakes in the morning and 36 in the afternoon. If each box holds 12 cupcakes, how many boxes are needed?", hint: "First add, then divide.", answer: "7 boxes" },
        { problem: "A train travels at 60 km/h for 2.5 hours. How far does it travel?", hint: "Use: Distance = Speed × Time", answer: "150 km" },
        { problem: "Priya has ₹500. She buys 3 notebooks at ₹45 each and 2 pens at ₹20 each. How much money is left?", hint: "Calculate total cost first.", answer: "₹325" }
      ]
    });
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

// ---------------------------------------------------------------------------
// New tools — Phase 1
// ---------------------------------------------------------------------------

async function storyGen(prompt) {
  return callGemini(
    `Write a short, creative, age-appropriate story (suitable for school students ages 8-16) based on the following idea. The story should be 150-250 words with a clear beginning, middle, and end.\n\nIdea: "${prompt}"\n\nStory:`,
    { maxTokens: 400, temperature: 0.9 }
  );
}

async function mathSolver(prompt) {
  return callGemini(
    `You are a friendly math tutor for school students (ages 8-16). Solve the following math problem step by step. Show each step clearly. Use simple language. At the end, clearly state the final answer.\n\nProblem: "${prompt}"\n\nSolution:`,
    { maxTokens: 500, temperature: 0.3 }
  );
}

async function summarize(prompt) {
  return callGemini(
    `Summarize the following text into 3-5 clear bullet points. Keep it simple and understandable for school students.\n\nText: "${prompt}"\n\nSummary:`,
    { maxTokens: 300, temperature: 0.4 }
  );
}

async function translate(prompt) {
  return callGemini(
    `Translate the following text. If the target language is specified after "→" or "to", use that language. Otherwise translate to English. Provide only the translation, no explanations.\n\nText: "${prompt}"\n\nTranslation:`,
    { maxTokens: 400, temperature: 0.2 }
  );
}

async function codeExplain(prompt) {
  return callGemini(
    `Explain the following code snippet in simple terms that a school student (ages 10-16) can understand. Break it down line by line if helpful. Use analogies where possible.\n\nCode:\n${prompt}\n\nExplanation:`,
    { maxTokens: 500, temperature: 0.5 }
  );
}

async function wordProblem(prompt) {
  return callGemini(
    `Generate exactly 3 math word problems about "${prompt}" suitable for school students (ages 8-16). Each should have a problem statement, a hint, and the answer.\n\nRespond ONLY with valid JSON: {"problems": [{"problem": "...", "hint": "...", "answer": "..."}]}\n\nJSON:`,
    { maxTokens: 500, temperature: 0.7 }
  );
}

// ---------------------------------------------------------------------------
// Meta-AI: Suggest improvements for the playground itself
// ---------------------------------------------------------------------------

async function suggestImprovementsMeta(currentFeatures) {
  return callGemini(
    `You are an AI product analyst reviewing an AI Learning Playground for school students (ages 8-16). The playground currently has these features:\n\n${currentFeatures}\n\nSuggest exactly 5 concrete, actionable improvements. For each, provide a title, description, and category (one of: "New Tool", "UX Improvement", "Content", "Engagement", "Accessibility").\n\nRespond ONLY with valid JSON: {"suggestions": [{"title": "...", "description": "...", "category": "..."}]}\n\nJSON:`,
    { maxTokens: 600, temperature: 0.8 }
  );
}

// ---------------------------------------------------------------------------
// Meta-AI: Generate a custom tool definition from a student's description
// ---------------------------------------------------------------------------

async function generateToolDefinition(description) {
  return callGemini(
    `A school student wants to create a custom AI tool. They describe it as: "${description}"\n\nGenerate a tool definition. Respond ONLY with valid JSON:\n{"toolName": "short-kebab-case-name", "icon": "single emoji", "title": "Short Title (3-5 words)", "description": "One sentence describing what the tool does", "systemPrompt": "The system prompt to use when running this tool. It should instruct the AI on how to respond to user input for this specific tool. Keep it age-appropriate for school students.", "placeholder": "Example input text the student might type"}\n\nJSON:`,
    { maxTokens: 400, temperature: 0.7 }
  );
}

// ---------------------------------------------------------------------------
// Run a custom tool using its stored system prompt
// ---------------------------------------------------------------------------

async function runCustomTool(systemPrompt, userInput) {
  return callGemini(
    `${systemPrompt}\n\nUser input: "${userInput}"`,
    { maxTokens: 500, temperature: 0.7 }
  );
}

export {
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
};
