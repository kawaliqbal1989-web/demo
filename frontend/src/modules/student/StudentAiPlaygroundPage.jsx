import { useEffect, useState, useCallback } from "react";
import {
  callAiPlayground,
  getAiPlaygroundUsage,
  getAiPlaygroundHistory,
  suggestPlaygroundImprovements,
  createCustomTool,
  listCustomTools,
  deleteCustomTool,
  runCustomTool
} from "../../services/aiPlaygroundService";
import { getCoachDashboard } from "../../services/studentCoachService";
import { PageHeader } from "../../components/PageHeader";
import { DailyMission, ReadinessGauge, PerformanceExplainer, MilestoneCard } from "../../components/StudentCoach";

/* ------------------------------------------------------------------ */
/*  Reusable tiny components                                          */
/* ------------------------------------------------------------------ */

function UsageBadge({ usage }) {
  if (!usage) return null;
  const pct = usage.dailyLimit ? Math.round(((usage.dailyLimit - usage.remaining) / usage.dailyLimit) * 100) : 0;
  return (
    <div className="ai-pg__usage-badge card">
      <div>
        <span className="ai-pg__usage-label">Today's usage</span>
        <div className="ai-pg__usage-value">{usage.todayUsed} / {usage.dailyLimit}</div>
      </div>
      <div className="ai-pg__usage-bar">
        <div className="ai-pg__usage-fill" style={{ width: `${pct}%`, background: pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#22c55e" }} />
      </div>
      <div className="ai-pg__usage-remaining">{usage.remaining} remaining</div>
    </div>
  );
}

function ToolCard({ icon, title, description, active, onClick, badge }) {
  return (
    <button onClick={onClick} className={`ai-pg__tool-card card${active ? " ai-pg__tool-card--active" : ""}`}>
      <div className="ai-pg__tool-icon">{icon}</div>
      <div className="ai-pg__tool-title">{title}{badge ? <span className="ai-pg__tool-badge">{badge}</span> : null}</div>
      <div className="ai-pg__tool-desc">{description}</div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  AI tool definitions (11 built-in)                                 */
/* ------------------------------------------------------------------ */

const TOOLS = [
  { id: "text-complete", icon: "✍️", title: "Text Completer", description: "Type a sentence start and AI completes it.", placeholder: "Once upon a time, a robot learned to...", category: "Creative" },
  { id: "story-gen", icon: "📖", title: "Story Generator", description: "Give a topic and AI writes a short story.", placeholder: "A brave astronaut discovers a planet made of candy", category: "Creative" },
  { id: "prompt-lab", icon: "🧪", title: "Prompt Lab", description: "Write any prompt and see how AI responds.", placeholder: "Explain photosynthesis to a 10-year-old in 3 sentences.", category: "Creative" },
  { id: "math-solver", icon: "🔢", title: "Math Solver", description: "Paste a math problem for step-by-step solving.", placeholder: "If 3x + 7 = 22, what is x?", category: "Academic" },
  { id: "quiz-gen", icon: "📝", title: "Quiz Generator", description: "Pick a topic and AI creates quiz questions.", placeholder: "Solar System", category: "Academic" },
  { id: "word-problem", icon: "🧩", title: "Word Problems", description: "Enter a topic to generate math word problems.", placeholder: "Shopping and discounts", category: "Academic" },
  { id: "code-explainer", icon: "💻", title: "Code Explainer", description: "Paste code and AI explains it simply.", placeholder: "for i in range(10):\n  print(i * 2)", category: "Academic" },
  { id: "sentiment", icon: "😊", title: "Sentiment Analyzer", description: "Paste text and AI detects the mood.", placeholder: "I really enjoyed the movie! The storyline was amazing.", category: "Analysis" },
  { id: "summarizer", icon: "📋", title: "Summarizer", description: "Paste long text and get bullet-point summary.", placeholder: "Paste a paragraph or article here...", category: "Analysis" },
  { id: "translator", icon: "🌍", title: "Translator", description: "Translate text between languages.", placeholder: "Hello, how are you? → Hindi", category: "Analysis" },
  { id: "image-describe", icon: "🖼️", title: "Image Describer", description: "Describe what you see and AI expands.", placeholder: "I see a dog playing in a park with a red ball...", category: "Analysis" }
];

const TOOL_CATEGORIES = ["Creative", "Academic", "Analysis"];

/* ------------------------------------------------------------------ */
/*  Educational data for Learn tab                                    */
/* ------------------------------------------------------------------ */

const AI_COURSE_LEVELS = [
  { level: 1, title: "What is AI?", topics: ["What computers can and cannot do", "AI vs humans — strengths and weaknesses", "Everyday AI: voice assistants, recommendations, auto-correct", "Smart vs not-smart machines"] },
  { level: 2, title: "How AI Learns", topics: ["Training data — AI needs examples to learn", "Patterns — AI finds hidden patterns in data", "Input → Process → Output", "Image recognition — how AI 'sees' pictures", "Spam filters — how email AI works"] },
  { level: 3, title: "AI Tools in Action", topics: ["Text generation (chatbots like ChatGPT)", "Image generation (DALL·E, Midjourney)", "Speech-to-text and voice AI", "AI in healthcare, agriculture, and education", "How to use AI tools responsibly"] },
  { level: 4, title: "Responsible AI & Future", topics: ["Bias in AI — why representation matters", "Privacy — how AI handles your data", "Deepfakes — fake videos and images", "Careers in AI", "Prompt engineering — how to talk to AI effectively"] },
  { level: 5, title: "Building with AI", topics: ["How AI APIs work — sending requests, getting responses", "Training your own mini-model (concept)", "Prompt engineering techniques — zero-shot, few-shot, chain-of-thought", "Building an AI-powered app (concept walkthrough)", "Fine-tuning vs pre-trained models"] },
  { level: 6, title: "AI Ethics & Society", topics: ["Deepfakes and misinformation — how to spot them", "Bias auditing — ensuring fairness in AI systems", "AI regulation — laws and guidelines around the world", "The future of work — jobs AI will create and change", "Your role in shaping AI's future"] }
];

const AI_FIELDS = [
  { field: "Education", icon: "📚", examples: ["Adaptive learning — AI adjusts difficulty to each student", "Auto-grading — AI marks worksheets instantly", "Personalized tutoring — AI chatbots answer doubts 24/7", "Language translation — instant conversion between languages"] },
  { field: "Healthcare", icon: "🏥", examples: ["X-ray analysis — AI detects diseases from scans", "Drug discovery — AI finds new medicines faster", "Health chatbots — AI helps describe symptoms", "Predicting outbreaks — AI forecasts disease spread"] },
  { field: "Agriculture", icon: "🌾", examples: ["Crop disease detection from leaf photos", "Weather prediction for farmers", "Soil analysis and fertilizer recommendation", "Drone monitoring of large farms"] },
  { field: "Finance", icon: "💰", examples: ["Fraud detection — flagging suspicious transactions", "Credit scoring from data analysis", "Stock market trend prediction", "AI customer service chatbots for banks"] },
  { field: "Transportation", icon: "🚗", examples: ["Self-driving cars using cameras and sensors", "Traffic signal optimization to reduce jams", "GPS route optimization", "Autonomous delivery drones"] },
  { field: "Art & Creativity", icon: "🎨", examples: ["Image generation from text descriptions", "Music composition by AI", "Story writing assistance", "Auto-editing and enhancing videos"] },
  { field: "Science & Research", icon: "🔬", examples: ["Protein folding — predicting molecule shapes", "Climate modeling over decades", "Space exploration — finding new stars", "Designing stronger, lighter materials"] },
  { field: "Language", icon: "🗣️", examples: ["Real-time translation in 100+ languages", "Speech-to-text conversion", "Content generation — articles, emails, reports", "Grammar checking and writing improvement"] },
  { field: "Cybersecurity", icon: "🔒", examples: ["Detecting malware and phishing attempts", "Network intrusion detection", "Automated vulnerability scanning", "Behavioral analysis to spot hackers"] },
  { field: "Entertainment", icon: "🎮", examples: ["NPCs with realistic behavior in games", "Content recommendation (Netflix, YouTube)", "AI-generated music and sound effects", "Procedural world generation in games"] },
  { field: "Environment", icon: "🌎", examples: ["Tracking deforestation via satellite images", "Predicting natural disasters", "Optimizing energy usage in buildings", "Wildlife conservation using camera traps"] },
  { field: "Robotics", icon: "🤖", examples: ["Warehouse robots sorting packages", "Surgical robots assisting doctors", "Rescue robots in disaster zones", "Robot companions for elderly care"] }
];

const AI_FUN_FACTS = [
  "The term 'Artificial Intelligence' was first coined in 1956 at a conference at Dartmouth College.",
  "AI can now write poetry, compose music, and even create paintings that sell for thousands of dollars.",
  "Google's AI once beat the world champion of the board game Go — a game with more possible moves than atoms in the universe!",
  "The first chatbot, ELIZA, was created in 1966 and could simulate a psychotherapist.",
  "AI needs about 10× more energy to learn something than a human brain does.",
  "Siri, Alexa, and Google Assistant use a type of AI called Natural Language Processing (NLP).",
  "AI can detect some diseases from medical images more accurately than human doctors.",
  "Self-driving cars use over 60 sensors and process 1 terabyte of data per day.",
  "GPT-4 was trained on text from millions of books, websites, and articles.",
  "AI can now generate realistic human faces that don't belong to any real person."
];

/* ------------------------------------------------------------------ */
/*  Chatbot Builder                                                   */
/* ------------------------------------------------------------------ */

const CHATBOT_LS_KEY = "ai-playground-chatbot-rules";

function loadRules() {
  try {
    const saved = localStorage.getItem(CHATBOT_LS_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return [
    { q: "hello", a: "Hi there! How can I help you?" },
    { q: "what is ai", a: "AI stands for Artificial Intelligence — it's when computers learn to think!" },
    { q: "", a: "" }
  ];
}

function ChatbotBuilder({ onGenerateRules }) {
  const [rules, setRules] = useState(loadRules);
  const [testInput, setTestInput] = useState("");
  const [chatLog, setChatLog] = useState([]);
  const [genLoading, setGenLoading] = useState(false);
  const [genTopic, setGenTopic] = useState("");

  const saveRules = (newRules) => {
    setRules(newRules);
    try { localStorage.setItem(CHATBOT_LS_KEY, JSON.stringify(newRules)); } catch { /* ignore */ }
  };

  const updateRule = (i, field, value) => {
    saveRules(rules.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };

  const addRule = () => saveRules([...rules, { q: "", a: "" }]);
  const removeRule = (i) => saveRules(rules.filter((_, idx) => idx !== i));

  const testChat = () => {
    if (!testInput.trim()) return;
    const lower = testInput.toLowerCase().trim();
    const match = rules.find((r) => r.q && lower.includes(r.q.toLowerCase()));
    const response = match ? match.a : "I don't understand that. Try asking something else!";
    setChatLog((prev) => [...prev, { user: testInput, bot: response }]);
    setTestInput("");
  };

  const handleGenerate = async () => {
    if (!genTopic.trim() || !onGenerateRules) return;
    setGenLoading(true);
    try {
      const result = await onGenerateRules(genTopic.trim());
      if (result?.length) {
        saveRules([...rules.filter((r) => r.q), ...result, { q: "", a: "" }]);
      }
    } catch { /* ignore */ }
    setGenLoading(false);
  };

  return (
    <div className="ai-pg__chatbot">
      <div className="ai-pg__chatbot-header">
        <div className="ai-pg__section-title">🤖 Build Your Own Chatbot</div>
        <div className="ai-pg__section-subtitle">Create "if user says X → respond Y" rules, then test it! This shows how basic chatbots work vs real AI chatbots.</div>
      </div>

      <div className="ai-pg__chatbot-generate">
        <input className="input" placeholder="Enter a topic (e.g. 'Space')..." value={genTopic} onChange={(e) => setGenTopic(e.target.value)} style={{ flex: 1 }} />
        <button className="button secondary" style={{ width: "auto", whiteSpace: "nowrap" }} onClick={handleGenerate} disabled={genLoading || !genTopic.trim()}>
          {genLoading ? "Generating..." : "✨ Auto-Generate Rules"}
        </button>
      </div>

      <div className="ai-pg__chatbot-rules">
        <div style={{ fontWeight: 700, fontSize: 13 }}>Rules</div>
        {rules.map((r, i) => (
          <div key={i} className="ai-pg__chatbot-rule-row">
            <input className="input" placeholder="If user says..." value={r.q} onChange={(e) => updateRule(i, "q", e.target.value)} />
            <input className="input" placeholder="Bot responds..." value={r.a} onChange={(e) => updateRule(i, "a", e.target.value)} />
            <button className="button secondary" style={{ width: "auto", padding: "4px 8px", fontSize: 12 }} onClick={() => removeRule(i)} title="Remove rule">✕</button>
          </div>
        ))}
        <button type="button" className="button secondary" style={{ width: "auto", justifySelf: "start" }} onClick={addRule}>+ Add Rule</button>
      </div>

      <div className="ai-pg__chatbot-test">
        <div style={{ fontWeight: 700, fontSize: 13 }}>Test Your Chatbot</div>
        <div className="ai-pg__chatbot-log">
          {chatLog.length === 0 ? (
            <div className="ai-pg__chatbot-empty">Type a message below to start...</div>
          ) : (
            chatLog.map((c, i) => (
              <div key={i} className="ai-pg__chatbot-exchange">
                <div className="ai-pg__chatbot-user"><span>{c.user}</span></div>
                <div className="ai-pg__chatbot-bot"><span>🤖 {c.bot}</span></div>
              </div>
            ))
          )}
        </div>
        <div className="ai-pg__chatbot-input-row">
          <input className="input" placeholder="Type a message..." value={testInput} onChange={(e) => setTestInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && testChat()} style={{ flex: 1 }} />
          <button className="button" style={{ width: "auto" }} onClick={testChat}>Send</button>
          {chatLog.length > 0 && <button className="button secondary" style={{ width: "auto" }} onClick={() => setChatLog([])}>Clear</button>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quiz Player                                                       */
/* ------------------------------------------------------------------ */

function QuizPlayer({ questions }) {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  if (!questions || !questions.length) return null;
  const score = questions.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0);

  return (
    <div className="ai-pg__quiz">
      {questions.map((q, i) => (
        <div key={i} className="card ai-pg__quiz-item">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Q{i + 1}. {q.q}</div>
          <div style={{ display: "grid", gap: 4 }}>
            {q.options.map((opt, oi) => {
              const isSelected = answers[i] === oi;
              const isCorrect = submitted && q.answer === oi;
              const isWrong = submitted && isSelected && q.answer !== oi;
              return (
                <label key={oi} className={`ai-pg__quiz-option${isCorrect ? " ai-pg__quiz-option--correct" : ""}${isWrong ? " ai-pg__quiz-option--wrong" : ""}`}>
                  <input type="radio" name={`q${i}`} checked={isSelected} disabled={submitted} onChange={() => setAnswers((prev) => ({ ...prev, [i]: oi }))} />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
      {!submitted ? (
        <button className="button" style={{ width: "auto", justifySelf: "start" }} onClick={() => setSubmitted(true)} disabled={Object.keys(answers).length < questions.length}>Submit Answers</button>
      ) : (
        <div className="card ai-pg__quiz-score">Score: {score} / {questions.length} ({Math.round((score / questions.length) * 100)}%)</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Word Problem Player                                               */
/* ------------------------------------------------------------------ */

function WordProblemPlayer({ problems }) {
  const [revealed, setRevealed] = useState({});
  if (!problems || !problems.length) return null;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {problems.map((p, i) => (
        <div key={i} className="card" style={{ padding: "12px 16px", display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>Problem {i + 1}</div>
          <div style={{ fontSize: 14 }}>{p.problem}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>💡 Hint: {p.hint}</div>
          {revealed[i] ? (
            <div style={{ fontWeight: 700, color: "var(--color-success)" }}>Answer: {p.answer}</div>
          ) : (
            <button className="button secondary" style={{ width: "auto", fontSize: 12 }} onClick={() => setRevealed((prev) => ({ ...prev, [i]: true }))}>Show Answer</button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */

function StudentAiPlaygroundPage() {
  const [tab, setTab] = useState("dashboard");
  const [activeTool, setActiveTool] = useState(TOOLS[0].id);
  const [activeCustomToolId, setActiveCustomToolId] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState(null);

  // History
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("");

  // Coach
  const [coach, setCoach] = useState(null);
  const [coachLoading, setCoachLoading] = useState(true);

  // Custom tools
  const [customTools, setCustomTools] = useState([]);
  const [customToolDesc, setCustomToolDesc] = useState("");
  const [customToolLoading, setCustomToolLoading] = useState(false);

  // Suggestions
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  // Fun fact
  const [factIndex] = useState(() => Math.floor(Math.random() * AI_FUN_FACTS.length));

  useEffect(() => {
    getAiPlaygroundUsage().then((res) => setUsage(res?.data || null)).catch(() => {});
    getCoachDashboard().then((res) => setCoach(res.data?.data || null)).catch(() => {}).finally(() => setCoachLoading(false));
    listCustomTools().then((res) => setCustomTools(res?.data || [])).catch(() => {});
  }, []);

  const refreshUsage = () => {
    getAiPlaygroundUsage().then((r) => setUsage(r?.data || null)).catch(() => {});
  };

  const selectedBuiltinTool = TOOLS.find((t) => t.id === activeTool) || TOOLS[0];
  const selectedCustomTool = customTools.find((t) => t.id === activeCustomToolId);
  const isCustomMode = !!activeCustomToolId;

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      let res;
      if (isCustomMode) {
        res = await runCustomTool(activeCustomToolId, prompt.trim());
      } else {
        res = await callAiPlayground({ tool: activeTool, prompt: prompt.trim() });
      }
      setResult(res?.data || null);
      refreshUsage();
    } catch (err) {
      setError(err?.response?.data?.message || "AI request failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomTool = async () => {
    if (!customToolDesc.trim()) return;
    setCustomToolLoading(true);
    try {
      const res = await createCustomTool({ description: customToolDesc.trim() });
      if (res?.data) {
        setCustomTools((prev) => [res.data, ...prev]);
        setCustomToolDesc("");
        refreshUsage();
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to create custom tool.");
    } finally {
      setCustomToolLoading(false);
    }
  };

  const handleDeleteCustomTool = async (id) => {
    try {
      await deleteCustomTool(id);
      setCustomTools((prev) => prev.filter((t) => t.id !== id));
      if (activeCustomToolId === id) {
        setActiveCustomToolId(null);
        setResult(null);
      }
    } catch { /* ignore */ }
  };

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await getAiPlaygroundHistory();
      setHistory(res?.data || []);
    } catch { /* ignore */ }
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "my-lab") void loadHistory();
  }, [tab, loadHistory]);

  const handleSuggest = async () => {
    setSuggestLoading(true);
    try {
      const res = await suggestPlaygroundImprovements();
      setSuggestions(res?.data?.suggestions || []);
      refreshUsage();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to get suggestions.");
    }
    setSuggestLoading(false);
  };

  const handleGenerateChatbotRules = async (topic) => {
    const res = await callAiPlayground({
      tool: "prompt-lab",
      prompt: `Generate 6 simple chatbot Q&A rules about "${topic}" for a school student's chatbot builder. Respond ONLY with valid JSON: {"rules": [{"q": "keyword or phrase user would type", "a": "chatbot response"}]}\n\nJSON:`
    });
    refreshUsage();
    try {
      const cleaned = (res?.data?.response || "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed?.rules)) return parsed.rules;
    } catch { /* ignore */ }
    return [];
  };

  // Parse special result formats
  let parsedQuiz = null;
  let parsedWordProblems = null;
  if (result?.response) {
    const toolId = isCustomMode ? "" : activeTool;
    if (toolId === "quiz-gen") {
      try {
        const cleaned = result.response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (parsed?.questions?.length) parsedQuiz = parsed.questions;
      } catch { /* not JSON */ }
    }
    if (toolId === "word-problem") {
      try {
        const cleaned = result.response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (parsed?.problems?.length) parsedWordProblems = parsed.problems;
      } catch { /* not JSON */ }
    }
  }

  const filteredHistory = historyFilter
    ? history.filter((h) => h.toolName.toLowerCase().includes(historyFilter.toLowerCase()) || h.prompt.toLowerCase().includes(historyFilter.toLowerCase()))
    : history;

  const TABS = [
    { id: "dashboard", label: "🧠 Dashboard" },
    { id: "tools", label: "🧪 AI Tools" },
    { id: "learn", label: "📖 Learn & Build" },
    { id: "my-lab", label: "🔬 My Lab" }
  ];

  return (
    <section className="ai-pg">
      <PageHeader title="🤖 AI Learning Lab" subtitle="Your personal AI coach, tools, and learning space — all powered by intelligence." />

      <UsageBadge usage={usage} />

      <div className="ai-pg__tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`ai-pg__tab${tab === t.id ? " ai-pg__tab--active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {error ? <div className="card ai-pg__error">{error}<button className="ai-pg__error-dismiss" onClick={() => setError("")}>✕</button></div> : null}

      {/* ================================================================ */}
      {/*  DASHBOARD TAB                                                   */}
      {/* ================================================================ */}
      {tab === "dashboard" ? (
        <div className="ai-pg__dashboard">
          <DailyMission missions={coach?.dailyMission} loading={coachLoading} />

          <div className="ai-pg__dash-quick">
            <div className="ai-pg__section-title">Quick Launch</div>
            <div className="ai-pg__dash-quick-grid">
              {TOOLS.slice(0, 6).map((t) => (
                <button key={t.id} className="card ai-pg__dash-quick-btn" onClick={() => { setTab("tools"); setActiveTool(t.id); setActiveCustomToolId(null); }}>
                  <span className="ai-pg__dash-quick-icon">{t.icon}</span>
                  <span className="ai-pg__dash-quick-label">{t.title}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="coach-grid">
            <ReadinessGauge readiness={coach?.readiness} loading={coachLoading} />
            <MilestoneCard milestones={coach?.milestones} loading={coachLoading} />
          </div>
          <PerformanceExplainer data={coach?.performanceExplainer} loading={coachLoading} />
        </div>
      ) : null}

      {/* ================================================================ */}
      {/*  AI TOOLS TAB                                                    */}
      {/* ================================================================ */}
      {tab === "tools" ? (
        <div className="ai-pg__tools-tab">
          {TOOL_CATEGORIES.map((cat) => (
            <div key={cat} className="ai-pg__tool-category">
              <div className="ai-pg__category-label">{cat}</div>
              <div className="ai-pg__tool-grid">
                {TOOLS.filter((t) => t.category === cat).map((t) => (
                  <ToolCard key={t.id} icon={t.icon} title={t.title} description={t.description} active={!isCustomMode && activeTool === t.id} onClick={() => { setActiveTool(t.id); setActiveCustomToolId(null); setResult(null); setError(""); setPrompt(""); }} />
                ))}
              </div>
            </div>
          ))}

          {customTools.length > 0 ? (
            <div className="ai-pg__tool-category">
              <div className="ai-pg__category-label">Custom</div>
              <div className="ai-pg__tool-grid">
                {customTools.map((t) => (
                  <ToolCard key={t.id} icon={t.icon} title={t.title} description={t.description} badge="Custom" active={activeCustomToolId === t.id} onClick={() => { setActiveCustomToolId(t.id); setResult(null); setError(""); setPrompt(""); }} />
                ))}
              </div>
            </div>
          ) : null}

          {/* Input area */}
          <div className="card ai-pg__input-panel">
            <div className="ai-pg__input-header">
              <span className="ai-pg__input-tool-name">{isCustomMode ? `${selectedCustomTool?.icon || "🔧"} ${selectedCustomTool?.title || "Custom Tool"}` : `${selectedBuiltinTool.icon} ${selectedBuiltinTool.title}`}</span>
              {isCustomMode ? <button className="button secondary" style={{ width: "auto", fontSize: 11, padding: "2px 8px" }} onClick={() => handleDeleteCustomTool(activeCustomToolId)}>Delete Tool</button> : null}
            </div>
            <textarea className="input" rows={3} placeholder={isCustomMode ? (selectedCustomTool?.placeholder || "Type your input...") : selectedBuiltinTool.placeholder} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={2000} style={{ resize: "vertical" }} />
            <div className="ai-pg__input-actions">
              <button className="button" style={{ width: "auto" }} onClick={handleSubmit} disabled={loading || !prompt.trim()}>
                {loading ? "Thinking..." : "Ask AI ✨"}
              </button>
              {prompt.length > 0 && <span className="ai-pg__char-count">{prompt.length}/2000</span>}
            </div>
          </div>

          {/* Result */}
          {result ? (
            <div className="card ai-pg__result">
              <div className="ai-pg__result-header">
                <div style={{ fontWeight: 700 }}>AI Response</div>
                <div className="ai-pg__result-meta">
                  {result.durationMs ? `${result.durationMs}ms` : ""}{result.tokensUsed ? ` • ${result.tokensUsed} tokens` : ""}
                </div>
              </div>
              {parsedQuiz ? <QuizPlayer questions={parsedQuiz} /> : parsedWordProblems ? <WordProblemPlayer problems={parsedWordProblems} /> : (
                <div className="ai-pg__result-text">{result.response}</div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ================================================================ */}
      {/*  LEARN & BUILD TAB                                                */}
      {/* ================================================================ */}
      {tab === "learn" ? (
        <div className="ai-pg__learn-tab">
          {/* Fun fact banner */}
          <div className="card ai-pg__fun-fact">
            <span className="ai-pg__fun-fact-icon">💡</span>
            <div><strong>Did You Know?</strong> {AI_FUN_FACTS[factIndex]}</div>
          </div>

          {/* Course levels */}
          <div className="card ai-pg__learn-section">
            <div className="ai-pg__section-title">📘 AI for Young Learners — Course Outline</div>
            <div className="ai-pg__course-levels">
              {AI_COURSE_LEVELS.map((lv) => (
                <details key={lv.level} className="ai-pg__course-level">
                  <summary className="ai-pg__course-summary">
                    <span className="ai-pg__course-badge">L{lv.level}</span> {lv.title}
                  </summary>
                  <ul className="ai-pg__course-topics">
                    {lv.topics.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </details>
              ))}
            </div>
          </div>

          {/* AI fields */}
          <div className="ai-pg__learn-section">
            <div className="ai-pg__section-title">🌍 How AI is Used in Different Fields</div>
            <div className="ai-pg__fields-grid">
              {AI_FIELDS.map((f) => (
                <details key={f.field} className="card ai-pg__field-card">
                  <summary className="ai-pg__field-summary">{f.icon} {f.field}</summary>
                  <ul className="ai-pg__field-examples">
                    {f.examples.map((ex, i) => <li key={i}>{ex}</li>)}
                  </ul>
                </details>
              ))}
            </div>
          </div>

          {/* Chatbot builder */}
          <div className="card ai-pg__learn-section">
            <ChatbotBuilder onGenerateRules={handleGenerateChatbotRules} />
          </div>
        </div>
      ) : null}

      {/* ================================================================ */}
      {/*  MY LAB TAB                                                       */}
      {/* ================================================================ */}
      {tab === "my-lab" ? (
        <div className="ai-pg__lab-tab">
          {/* Tool creator */}
          <div className="card ai-pg__lab-creator">
            <div className="ai-pg__section-title">🛠️ Create a Custom AI Tool</div>
            <div className="ai-pg__section-subtitle">Describe what you want your tool to do, and AI will build it for you. You can create up to 10 custom tools.</div>
            <div className="ai-pg__lab-creator-row">
              <textarea className="input" rows={2} placeholder="e.g. A tool that writes poems about animals, a tool that explains science experiments..." value={customToolDesc} onChange={(e) => setCustomToolDesc(e.target.value)} maxLength={500} style={{ flex: 1, resize: "vertical" }} />
              <button className="button" style={{ width: "auto", alignSelf: "end" }} onClick={handleCreateCustomTool} disabled={customToolLoading || !customToolDesc.trim()}>
                {customToolLoading ? "Creating..." : "Create Tool ✨"}
              </button>
            </div>
            {customTools.length > 0 ? (
              <div className="ai-pg__lab-tools-list">
                <div style={{ fontWeight: 700, fontSize: 13 }}>Your Custom Tools ({customTools.length}/10)</div>
                {customTools.map((t) => (
                  <div key={t.id} className="ai-pg__lab-tool-item">
                    <span>{t.icon} {t.title}</span>
                    <span className="ai-pg__lab-tool-desc">{t.description}</span>
                    <div className="ai-pg__lab-tool-actions">
                      <button className="button secondary" style={{ width: "auto", fontSize: 11, padding: "2px 8px" }} onClick={() => { setTab("tools"); setActiveCustomToolId(t.id); setResult(null); setPrompt(""); }}>Use</button>
                      <button className="button secondary" style={{ width: "auto", fontSize: 11, padding: "2px 8px", color: "#ef4444" }} onClick={() => handleDeleteCustomTool(t.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* AI Suggestions */}
          <div className="card ai-pg__lab-suggest">
            <div className="ai-pg__section-title">💡 Ask AI to Improve This Page</div>
            <div className="ai-pg__section-subtitle">Let AI analyze the current playground and suggest new features, tools, or improvements.</div>
            <button className="button" style={{ width: "auto" }} onClick={handleSuggest} disabled={suggestLoading}>
              {suggestLoading ? "Analyzing..." : "Get AI Suggestions ✨"}
            </button>
            {suggestions.length > 0 ? (
              <div className="ai-pg__suggest-grid">
                {suggestions.map((s, i) => (
                  <div key={i} className="card ai-pg__suggest-card">
                    <div className="ai-pg__suggest-category">{s.category}</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.title}</div>
                    <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{s.description}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* History */}
          <div className="card ai-pg__lab-history">
            <div className="ai-pg__section-title">📜 My AI Playground History</div>
            <input className="input" placeholder="Filter by tool name or prompt..." value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)} style={{ maxWidth: 400 }} />
            {historyLoading ? <div className="muted">Loading...</div> : null}
            {!historyLoading && filteredHistory.length === 0 ? <div className="muted">No history yet. Start using the AI tools!</div> : null}
            {filteredHistory.length > 0 ? (
              <div className="ai-pg__history-list">
                {filteredHistory.map((h) => (
                  <details key={h.id} className="ai-pg__history-item">
                    <summary className="ai-pg__history-summary">
                      <span style={{ fontWeight: 700 }}>{h.toolName}</span>
                      <span className="ai-pg__history-date">{new Date(h.createdAt).toLocaleString()}</span>
                    </summary>
                    <div className="ai-pg__history-detail">
                      <div>
                        <div className="ai-pg__history-label">Prompt</div>
                        <div className="ai-pg__history-content">{h.prompt}</div>
                      </div>
                      <div>
                        <div className="ai-pg__history-label">Response</div>
                        <div className="ai-pg__history-content ai-pg__history-content--response">{h.response}</div>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export { StudentAiPlaygroundPage };
