import { logger } from "../lib/logger.js";

/**
 * AI Narrative Service — generates role-specific AI narratives using Gemini.
 *
 * Architecture:
 * 1. Structured data (student-360, cockpit, leadership-intel) → prompt templates
 * 2. Gemini generates 1-3 paragraph narrative
 * 3. In-memory cache with TTL (avoids repeated API calls)
 * 4. Deterministic fallback when no API key configured
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Cache: key → { text, sections, generatedAt }
const narrativeCache = new Map();
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// ---------------------------------------------------------------------------
// Rate limiting — prevents Gemini API abuse (per user, per hour)
// ---------------------------------------------------------------------------
const NARRATIVE_LIMIT_PER_HOUR = Number(process.env.AI_NARRATIVE_HOURLY_LIMIT || 10);
const TENANT_LIMIT_PER_HOUR = Number(process.env.AI_NARRATIVE_TENANT_HOURLY_LIMIT || 200);
const rateLimitMap = new Map(); // key → { count, windowStart }

function checkNarrativeRateLimit(tenantId, userId) {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  // Per-user limit (check only — no increment)
  const userKey = `user:${tenantId}:${userId}`;
  const userEntry = rateLimitMap.get(userKey) || { count: 0, windowStart: now };
  if (now - userEntry.windowStart > hourMs) {
    userEntry.count = 0;
    userEntry.windowStart = now;
  }
  if (userEntry.count >= NARRATIVE_LIMIT_PER_HOUR) {
    return { allowed: false, reason: "rate_limit_user", retryAfterMs: hourMs - (now - userEntry.windowStart) };
  }

  // Per-tenant limit (check only — no increment)
  const tenantKey = `tenant:${tenantId}`;
  const tenantEntry = rateLimitMap.get(tenantKey) || { count: 0, windowStart: now };
  if (now - tenantEntry.windowStart > hourMs) {
    tenantEntry.count = 0;
    tenantEntry.windowStart = now;
  }
  if (tenantEntry.count >= TENANT_LIMIT_PER_HOUR) {
    return { allowed: false, reason: "rate_limit_tenant", retryAfterMs: hourMs - (now - tenantEntry.windowStart) };
  }

  return { allowed: true };
}

// Increment counters — call only on cache miss (before Gemini call)
function incrementNarrativeRateLimit(tenantId, userId) {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  const userKey = `user:${tenantId}:${userId}`;
  const userEntry = rateLimitMap.get(userKey) || { count: 0, windowStart: now };
  if (now - userEntry.windowStart > hourMs) { userEntry.count = 0; userEntry.windowStart = now; }
  userEntry.count++;
  rateLimitMap.set(userKey, userEntry);

  const tenantKey = `tenant:${tenantId}`;
  const tenantEntry = rateLimitMap.get(tenantKey) || { count: 0, windowStart: now };
  if (now - tenantEntry.windowStart > hourMs) { tenantEntry.count = 0; tenantEntry.windowStart = now; }
  tenantEntry.count++;
  rateLimitMap.set(tenantKey, tenantEntry);
}

// Exported for use by controller
export { checkNarrativeRateLimit };

// ---------------------------------------------------------------------------
// Usage tracking — in-memory counters for cost monitoring
// ---------------------------------------------------------------------------
const usageStats = { totalCalls: 0, geminiCalls: 0, cacheHits: 0, fallbackCalls: 0, totalTokens: 0 };

export function getNarrativeUsageStats() {
  return { ...usageStats, cacheSize: narrativeCache.size };
}

// ---------------------------------------------------------------------------
// Gemini caller (reuses pattern from ai-playground.service.js)
// ---------------------------------------------------------------------------
async function callGemini(prompt, { maxTokens = 800, temperature = 0.6 } = {}) {
  if (!GEMINI_API_KEY) {
    usageStats.fallbackCalls++;
    return null;
  }

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_LOW_AND_ABOVE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_LOW_AND_ABOVE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_LOW_AND_ABOVE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_LOW_AND_ABOVE" },
    ],
  };

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.warn("ai_narrative_gemini_error", { status: res.status, body: errText.slice(0, 300) });
      return null;
    }

    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || null;
    const tokensUsed = (json?.usageMetadata?.promptTokenCount || 0) + (json?.usageMetadata?.candidatesTokenCount || 0);
    usageStats.geminiCalls++;
    usageStats.totalTokens += tokensUsed;
    return text;
  } catch (err) {
    logger.error("ai_narrative_gemini_call_failed", { error: err.message });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------
function getCached(key) {
  const entry = narrativeCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.generatedAt > CACHE_TTL_MS) {
    narrativeCache.delete(key);
    return null;
  }
  return entry;
}

function setCache(key, data) {
  narrativeCache.set(key, { ...data, generatedAt: Date.now() });
  // Evict old entries periodically
  if (narrativeCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of narrativeCache) {
      if (now - v.generatedAt > CACHE_TTL_MS) narrativeCache.delete(k);
    }
  }
}

function getCenterName(center) {
  return center?.centerName || center?.name || center?.code || "Unknown center";
}

function getCenterScore(center) {
  if (typeof center?.score === "number") return center.score;
  if (typeof center?.total === "number") return center.total;
  return null;
}

// ---------------------------------------------------------------------------
// STUDENT NARRATIVE — Learning Coach
// ---------------------------------------------------------------------------
export async function generateStudentNarrative(student360Data, tenantId) {
  const { student, performance, risk, attendance, fees, engagement, insights } = student360Data;
  const cacheKey = `student:${tenantId}:${student?.id}`;
  const cached = getCached(cacheKey);
  if (cached) { usageStats.cacheHits++; return cached; }
  usageStats.totalCalls++;
  incrementNarrativeRateLimit(tenantId, /* userId not available here */ `student:${student?.id}`);

  const dataContext = [
    `Student: ${student?.user?.name || "Student"}, Level: ${student?.level?.name || "Unknown"}`,
    `Accuracy: ${performance?.accuracy ?? "N/A"}%, Trend: ${performance?.trend ?? 0}%`,
    `Risk Level: ${risk?.level || "HEALTHY"}, Indicators: ${(risk?.indicators || []).filter(i => i.triggered).map(i => i.label).join(", ") || "None"}`,
    `Attendance: ${attendance?.presenceRate ?? "N/A"}%, Streak: ${attendance?.streakDays ?? 0} days`,
    `Engagement: Last active ${engagement?.lastActivityDays ?? "?"} days ago, ${engagement?.practiceAttempts ?? 0} practice attempts`,
    fees?.overdueAmount > 0 ? `Fee alert: ₹${fees.overdueAmount} overdue` : "Fees: Up to date",
    insights?.strengths ? `Strengths: ${insights.strengths.join(", ")}` : "",
    insights?.improvements ? `Areas to improve: ${insights.improvements.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const prompt = `You are an encouraging AI learning coach for an abacus math student. Based on this data, write a personalized 2-3 paragraph narrative. Be warm, specific, and actionable. Use the student's actual numbers. Include: (1) a celebration of what they're doing well, (2) specific areas to focus on with practical tips, (3) an encouraging motivation. Do NOT use markdown formatting — write plain text paragraphs.

DATA:
${dataContext}

Write sections as JSON: {"summary": "one-line headline", "celebration": "paragraph about strengths", "focus": "paragraph about what to improve with tips", "motivation": "short encouraging closing"}`;

  const aiText = await callGemini(prompt, { maxTokens: 600, temperature: 0.7 });

  let result;
  if (aiText) {
    try {
      const parsed = JSON.parse(aiText.replace(/```json\n?|\n?```/g, "").trim());
      result = { type: "student", ai: true, ...parsed };
    } catch {
      result = { type: "student", ai: true, summary: "Your Learning Journey", celebration: aiText, focus: "", motivation: "" };
    }
  } else {
    // Deterministic fallback
    const riskLevel = risk?.level || "HEALTHY";
    const acc = performance?.accuracy ?? 0;
    result = {
      type: "student",
      ai: false,
      summary: riskLevel === "HEALTHY" ? "You're on a great track!" : riskLevel === "ATTENTION" ? "A few areas need your focus" : "Let's get back on track together",
      celebration: acc >= 70
        ? `Great work! Your accuracy is at ${acc}% which shows strong understanding. ${attendance?.streakDays > 3 ? `Your ${attendance.streakDays}-day attendance streak is impressive!` : ""}`
        : `You're making progress with ${engagement?.practiceAttempts || 0} practice attempts. Every step counts!`,
      focus: (risk?.indicators || []).filter(i => i.triggered).length > 0
        ? `Focus areas: ${(risk?.indicators || []).filter(i => i.triggered).map(i => i.label).join(", ")}. Try to practice a little each day — consistency beats intensity.`
        : "Keep up your current routine — you're doing well across all areas.",
      motivation: "Remember: every expert was once a beginner. Your dedication to learning abacus math is building skills that last a lifetime! 🎯",
    };
  }

  setCache(cacheKey, result);
  return result;
}

// ---------------------------------------------------------------------------
// TEACHER NARRATIVE — Intervention Copilot
// ---------------------------------------------------------------------------
export async function generateTeacherNarrative(cockpitData, tenantId) {
  const { atRiskStudents, batchHeatmap, recommendations, interventions } = cockpitData;
  const cacheKey = `teacher:${tenantId}:${cockpitData.teacherId}`;
  const cached = getCached(cacheKey);
  if (cached) { usageStats.cacheHits++; return cached; }
  usageStats.totalCalls++;
  incrementNarrativeRateLimit(tenantId, `teacher:${cockpitData.teacherId}`);

  const atRiskCount = atRiskStudents?.length || 0;
  const batchSummary = (batchHeatmap || []).map(b => `${b.batchName}: ${b.healthLabel}, avg ${b.avgScore}%, attendance ${b.avgAttendance}%`).join("; ");
  const recCount = recommendations?.length || 0;
  const pendingInterventions = (interventions || []).filter(i => i.count > 0);

  const dataContext = [
    `At-risk students: ${atRiskCount}${atRiskCount > 0 ? ` (top: ${atRiskStudents.slice(0, 3).map(s => `${s.name} [${s.riskLevel}]`).join(", ")})` : ""}`,
    `Batches: ${batchSummary || "No batch data"}`,
    `Pending recommendations: ${recCount}`,
    pendingInterventions.length > 0 ? `Alerts: ${pendingInterventions.map(i => `${i.label}: ${i.count}`).join(", ")}` : "No pending alerts",
  ].join("\n");

  const prompt = `You are an AI teaching copilot for an abacus math teacher. Based on this data, write a focused 2-3 paragraph cohort briefing. Be practical and direct. Include: (1) cohort health overview, (2) priority actions ranked by urgency, (3) a quick win suggestion. Plain text, no markdown.

DATA:
${dataContext}

JSON format: {"summary": "one-line status", "overview": "paragraph about cohort health", "priorities": "paragraph about what to do first", "quickWin": "one actionable suggestion"}`;

  const aiText = await callGemini(prompt, { maxTokens: 500, temperature: 0.5 });

  let result;
  if (aiText) {
    try {
      const parsed = JSON.parse(aiText.replace(/```json\n?|\n?```/g, "").trim());
      result = { type: "teacher", ai: true, ...parsed };
    } catch {
      result = { type: "teacher", ai: true, summary: "Cohort Briefing", overview: aiText, priorities: "", quickWin: "" };
    }
  } else {
    result = {
      type: "teacher",
      ai: false,
      summary: atRiskCount === 0 ? "All students are on track" : `${atRiskCount} student${atRiskCount > 1 ? "s" : ""} need attention`,
      overview: atRiskCount > 0
        ? `You have ${atRiskCount} at-risk student${atRiskCount > 1 ? "s" : ""} requiring intervention. ${pendingInterventions.length > 0 ? `There are ${pendingInterventions.map(i => `${i.count} ${i.label.toLowerCase()}`).join(", ")} pending.` : ""}`
        : "Your cohort is healthy with no at-risk students. Focus on maintaining engagement and pushing for excellence.",
      priorities: atRiskCount > 0
        ? `Priority: Reach out to ${atRiskStudents[0]?.name || "the highest-risk student"} first. ${recCount > 0 ? `Review ${recCount} worksheet recommendation${recCount > 1 ? "s" : ""} for struggling students.` : ""}`
        : "Consider challenging your top performers with advanced practice worksheets.",
      quickWin: recCount > 0 ? "Assign recommended worksheets to struggling students — it takes 2 minutes and directly targets weak areas." : "Schedule a quick check-in with any students you haven't heard from this week.",
    };
  }

  setCache(cacheKey, result);
  return result;
}

// ---------------------------------------------------------------------------
// CENTER NARRATIVE — Operations Assistant
// ---------------------------------------------------------------------------
export async function generateCenterNarrative(centerIntelData, tenantId) {
  const { healthScore, teacherWorkload, anomalies, feePulse } = centerIntelData;
  const cacheKey = `center:${tenantId}:${centerIntelData.centerId}`;
  const cached = getCached(cacheKey);
  if (cached) { usageStats.cacheHits++; return cached; }
  usageStats.totalCalls++;
  incrementNarrativeRateLimit(tenantId, `center:${centerIntelData.centerId}`);

  const health = healthScore || {};
  const overloaded = (teacherWorkload || []).filter(t => t.classification === "OVERLOADED");
  const anomalyCount = (anomalies?.attendanceDrops?.length || 0) + (anomalies?.staleBatches?.length || 0) + (anomalies?.chronicAbsence?.length || 0);

  const dataContext = [
    `Health Score: ${health.overall ?? "N/A"}/100 (Grade: ${health.grade || "?"})`,
    `Pillars — Attendance: ${health.attendance ?? "?"}/25, Academic: ${health.academic ?? "?"}/25, Finance: ${health.finance ?? "?"}/25, Operations: ${health.operations ?? "?"}/25`,
    overloaded.length > 0 ? `Overloaded teachers: ${overloaded.map(t => t.teacherName).join(", ")}` : "Teacher workload: balanced",
    `Anomalies detected: ${anomalyCount}${anomalies?.attendanceDrops?.length ? ` (${anomalies.attendanceDrops.length} attendance drops)` : ""}${anomalies?.staleBatches?.length ? ` (${anomalies.staleBatches.length} stale batches)` : ""}`,
    feePulse ? `Fee collection: ₹${feePulse.collected ?? 0} collected, ₹${feePulse.overdue ?? 0} overdue, trend: ${feePulse.trend ?? 0}%` : "",
  ].filter(Boolean).join("\n");

  const prompt = `You are an AI operations assistant for an abacus education center manager. Based on this data, write a 2-3 paragraph operational briefing. Be concise and action-oriented. Include: (1) center health summary, (2) top operational risks with recommended actions, (3) one optimization opportunity. Plain text, no markdown.

DATA:
${dataContext}

JSON format: {"summary": "one-line status", "health": "paragraph about center health", "risks": "paragraph about risks and actions", "opportunity": "one optimization suggestion"}`;

  const aiText = await callGemini(prompt, { maxTokens: 500, temperature: 0.5 });

  let result;
  if (aiText) {
    try {
      const parsed = JSON.parse(aiText.replace(/```json\n?|\n?```/g, "").trim());
      result = { type: "center", ai: true, ...parsed };
    } catch {
      result = { type: "center", ai: true, summary: "Center Briefing", health: aiText, risks: "", opportunity: "" };
    }
  } else {
    const grade = health.grade || "?";
    const attendancePillar = health?.pillars?.attendance?.score;
    const financePillar = health?.pillars?.finance?.score;
    const operationsPillar = health?.pillars?.operations?.score;
    result = {
      type: "center",
      ai: false,
      summary: grade === "A" || grade === "B" ? "Center performing well" : `Center health: Grade ${grade} — attention needed`,
      health: `Your center health score is ${health.total ?? "N/A"}/100 (Grade ${grade}). ${attendancePillar != null && attendancePillar < 18 ? "Attendance pillar is below target. " : ""}${financePillar != null && financePillar < 18 ? "Finance pillar needs attention. " : ""}${operationsPillar != null && operationsPillar < 18 ? "Operations pillar has room for improvement." : ""}`,
      risks: anomalyCount > 0
        ? `${anomalyCount} anomal${anomalyCount > 1 ? "ies" : "y"} detected. ${overloaded.length > 0 ? `${overloaded.length} teacher(s) are overloaded — consider redistributing students.` : ""} ${feePulse?.overdueAmount > 0 ? `₹${feePulse.overdueAmount} in overdue fees needs follow-up.` : ""}`
        : "No significant anomalies detected. Operations are running smoothly.",
      opportunity: overloaded.length > 0 ? "Rebalance teacher workloads to prevent burnout and improve student outcomes." : "Focus on fee collection to improve your finance pillar score.",
    };
  }

  setCache(cacheKey, result);
  return result;
}

// ---------------------------------------------------------------------------
// NETWORK NARRATIVE — Franchise/BP Network Advisor
// ---------------------------------------------------------------------------
export async function generateNetworkNarrative(networkPulseData, role, tenantId) {
  const { aggregate, topCenters, bottomCenters, centerScores } = networkPulseData;
  const cacheKey = `network:${tenantId}:${role}:${JSON.stringify(aggregate?.centerIds || []).slice(0, 50)}`;
  const cached = getCached(cacheKey);
  if (cached) { usageStats.cacheHits++; return cached; }
  usageStats.totalCalls++;
  incrementNarrativeRateLimit(tenantId, `network:${role}`);

  const dataContext = [
    `Network: ${aggregate?.totalCenters ?? 0} centers, ${aggregate?.totalStudents ?? 0} students, ${aggregate?.totalTeachers ?? 0} teachers`,
    `Average attendance: ${aggregate?.avgAttendance ?? "N/A"}%, Average score: ${aggregate?.avgScore ?? "N/A"}%`,
    `Overdue fees: ₹${aggregate?.totalOverdue ?? 0}`,
    topCenters?.length ? `Top centers: ${topCenters.slice(0, 3).map(c => `${getCenterName(c)} (${getCenterScore(c) ?? "n/a"})`).join(", ")}` : "",
    bottomCenters?.length ? `Underperforming: ${bottomCenters.slice(0, 3).map(c => `${getCenterName(c)} (${getCenterScore(c) ?? "n/a"})`).join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const roleLabel = role === "BP" ? "Business Partner" : "Franchise Manager";
  const prompt = `You are an AI network advisor for an abacus education ${roleLabel}. Based on this multi-center data, write a 2-3 paragraph strategic briefing. Include: (1) network health snapshot, (2) where to intervene first, (3) a growth opportunity. Plain text, no markdown.

DATA:
${dataContext}

JSON format: {"summary": "one-line status", "snapshot": "paragraph about network health", "intervention": "paragraph about where to focus", "growth": "one growth opportunity"}`;

  const aiText = await callGemini(prompt, { maxTokens: 500, temperature: 0.5 });

  let result;
  if (aiText) {
    try {
      const parsed = JSON.parse(aiText.replace(/```json\n?|\n?```/g, "").trim());
      result = { type: "network", ai: true, role, ...parsed };
    } catch {
      result = { type: "network", ai: true, role, summary: "Network Briefing", snapshot: aiText, intervention: "", growth: "" };
    }
  } else {
    result = {
      type: "network",
      ai: false,
      role,
      summary: `${aggregate?.totalCenters ?? 0} centers in your network`,
      snapshot: `Your network spans ${aggregate?.totalCenters ?? 0} centers with ${aggregate?.totalStudents ?? 0} students. Average attendance is ${aggregate?.avgAttendance ?? "N/A"}% and academic performance averages ${aggregate?.avgScore ?? "N/A"}%.`,
      intervention: bottomCenters?.length > 0
        ? `Priority: ${getCenterName(bottomCenters[0])} needs immediate attention with a health score of ${getCenterScore(bottomCenters[0]) ?? "low"}.${aggregate?.totalOverdue > 0 ? ` ₹${aggregate.totalOverdue} in overdue fees across the network.` : ""}`
        : "All centers are performing adequately. Focus on pushing top centers to the next level.",
      growth: topCenters?.length > 0 ? `Study what ${getCenterName(topCenters[0])} is doing right and replicate their practices across underperforming centers.` : "Focus on teacher training consistency across all centers.",
    };
  }

  setCache(cacheKey, result);
  return result;
}

// ---------------------------------------------------------------------------
// COMMAND CENTER NARRATIVE — Superadmin
// ---------------------------------------------------------------------------
export async function generateCommandCenterNarrative(adminData) {
  const { networkPulse, pendingApprovals, revenueData, anomalySummary } = adminData;
  const cacheKey = `superadmin:${adminData.tenantId}`;
  const cached = getCached(cacheKey);
  if (cached) { usageStats.cacheHits++; return cached; }
  usageStats.totalCalls++;
  incrementNarrativeRateLimit(adminData.tenantId, `superadmin`);

  const agg = networkPulse?.aggregate || {};
  const dataContext = [
    `Platform: ${agg.totalCenters ?? 0} centers, ${agg.totalStudents ?? 0} students, ${agg.totalTeachers ?? 0} teachers`,
    `Average attendance: ${agg.avgAttendance ?? "N/A"}%, Average score: ${agg.avgScore ?? "N/A"}%`,
    pendingApprovals ? `Pending approvals: ${pendingApprovals.totalPending ?? 0} (${pendingApprovals.overdue ?? 0} overdue)` : "",
    revenueData ? `Revenue: ₹${revenueData.collected ?? 0} collected, ₹${revenueData.overdue ?? 0} overdue, trend: ${revenueData.trend ?? 0}%` : "",
    anomalySummary ? `Anomalies: ${anomalySummary.total ?? 0} across network` : "",
    networkPulse?.bottomCenters?.length ? `Underperforming: ${networkPulse.bottomCenters.slice(0, 3).map(c => `${getCenterName(c)} (${getCenterScore(c) ?? "n/a"})`).join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const prompt = `You are an AI command-center assistant for a superadmin managing an abacus education platform. Based on this data, write a concise 2-3 paragraph executive briefing. Include: (1) platform health at a glance, (2) exceptions and urgent items, (3) strategic recommendation. Plain text, no markdown.

DATA:
${dataContext}

JSON format: {"summary": "one-line status", "health": "paragraph about platform health", "exceptions": "paragraph about urgent items", "recommendation": "one strategic recommendation"}`;

  const aiText = await callGemini(prompt, { maxTokens: 500, temperature: 0.5 });

  let result;
  if (aiText) {
    try {
      const parsed = JSON.parse(aiText.replace(/```json\n?|\n?```/g, "").trim());
      result = { type: "superadmin", ai: true, ...parsed };
    } catch {
      result = { type: "superadmin", ai: true, summary: "Platform Briefing", health: aiText, exceptions: "", recommendation: "" };
    }
  } else {
    const overdue = pendingApprovals?.overdue ?? 0;
    result = {
      type: "superadmin",
      ai: false,
      summary: overdue > 0 ? `${overdue} overdue approval${overdue > 1 ? "s" : ""} need attention` : "Platform operating normally",
      health: `The platform has ${agg.totalCenters ?? 0} active centers with ${agg.totalStudents ?? 0} students. Average attendance is ${agg.avgAttendance ?? "N/A"}% and academic scores average ${agg.avgScore ?? "N/A"}%.`,
      exceptions: overdue > 0 || (anomalySummary?.total ?? 0) > 0
        ? `${overdue > 0 ? `${overdue} approval(s) have exceeded SLA deadlines. ` : ""}${anomalySummary?.total > 0 ? `${anomalySummary.total} operational anomalies detected across the network. ` : ""}${revenueData?.overdue > 0 ? `₹${revenueData.overdue} in overdue fees.` : ""}`
        : "No critical exceptions. All systems operating within normal parameters.",
      recommendation: networkPulse?.bottomCenters?.length > 0
        ? `Focus on ${getCenterName(networkPulse.bottomCenters[0])} — targeted intervention can lift network-wide metrics.`
        : "The network is healthy. Consider expanding enrollment capacity at high-performing centers.",
    };
  }

  setCache(cacheKey, result);
  return result;
}
