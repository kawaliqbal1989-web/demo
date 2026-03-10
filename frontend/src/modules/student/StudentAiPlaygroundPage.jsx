import { useEffect, useState } from "react";
import { callAiPlayground, getAiPlaygroundUsage, getAiPlaygroundHistory } from "../../services/aiPlaygroundService";

/* ------------------------------------------------------------------ */
/*  Reusable tiny components                                          */
/* ------------------------------------------------------------------ */

function UsageBadge({ usage }) {
  if (!usage) return null;
  const pct = usage.dailyLimit ? Math.round(((usage.dailyLimit - usage.remaining) / usage.dailyLimit) * 100) : 0;
  return (
    <div className="card" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", padding: "10px 16px" }}>
      <div>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Today's usage</span>
        <div style={{ fontWeight: 800, fontSize: 18 }}>
          {usage.todayUsed} / {usage.dailyLimit}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 120, height: 8, background: "var(--color-bg-badge)", borderRadius: 4 }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 4,
            background: pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#22c55e",
            transition: "width .3s"
          }}
        />
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{usage.remaining} remaining</div>
    </div>
  );
}

function ToolCard({ icon, title, description, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="card"
      style={{
        cursor: "pointer",
        border: active ? "2px solid #2563eb" : "2px solid transparent",
        background: active ? "var(--color-bg-info-light)" : undefined,
        textAlign: "left",
        display: "grid",
        gap: 4,
        padding: "14px 16px",
        transition: "all .15s"
      }}
    >
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{description}</div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  AI tool definitions                                               */
/* ------------------------------------------------------------------ */

const TOOLS = [
  {
    id: "text-complete",
    icon: "✍️",
    title: "Text Completer",
    description: "Type a sentence start and AI completes it for you.",
    placeholder: "Once upon a time, a robot learned to..."
  },
  {
    id: "image-describe",
    icon: "🖼️",
    title: "Image Describer",
    description: "Describe what you see in an image and AI explains what it would detect.",
    placeholder: "I see a dog playing in a park with a red ball..."
  },
  {
    id: "sentiment",
    icon: "😊",
    title: "Sentiment Analyzer",
    description: "Paste any text and AI tells you if it's positive, negative, or neutral.",
    placeholder: "I really enjoyed the movie! The storyline was amazing."
  },
  {
    id: "quiz-gen",
    icon: "📝",
    title: "AI Quiz Generator",
    description: "Pick a topic and AI creates 5 quiz questions for you.",
    placeholder: "Solar System"
  },
  {
    id: "prompt-lab",
    icon: "🧪",
    title: "Prompt Lab",
    description: "Experiment with prompts — write anything and see how AI responds.",
    placeholder: "Explain photosynthesis to a 10-year-old in 3 sentences."
  }
];

/* ------------------------------------------------------------------ */
/*  AI use-cases educational data for the "Learn" tab                 */
/* ------------------------------------------------------------------ */

const AI_FIELDS = [
  {
    field: "Education",
    icon: "📚",
    examples: [
      "Adaptive learning — AI adjusts lesson difficulty to each student's pace",
      "Auto-grading — AI marks worksheets and essays instantly",
      "Personalized tutoring — AI chatbots answer student doubts 24/7",
      "Language translation — instant conversion between languages"
    ]
  },
  {
    field: "Healthcare",
    icon: "🏥",
    examples: [
      "X-ray & scan analysis — AI detects diseases from medical images",
      "Drug discovery — AI finds new medicines faster",
      "Health chatbots — AI helps patients describe symptoms",
      "Predicting outbreaks — AI analyzes data to predict disease spread"
    ]
  },
  {
    field: "Agriculture",
    icon: "🌾",
    examples: [
      "Crop disease detection — take a photo of a leaf and AI identifies the problem",
      "Weather prediction — AI forecasts rain/drought for farmers",
      "Soil analysis — AI recommends the best fertilizer",
      "Drone monitoring — AI-powered drones scan large farms"
    ]
  },
  {
    field: "Finance",
    icon: "💰",
    examples: [
      "Fraud detection — AI flags suspicious bank transactions",
      "Credit scoring — AI evaluates loan eligibility from data",
      "Stock market prediction — AI analyzes trends",
      "Chatbots — banks use AI assistants for customer service"
    ]
  },
  {
    field: "Transportation",
    icon: "🚗",
    examples: [
      "Self-driving cars — AI uses cameras and sensors to navigate roads",
      "Traffic prediction — AI optimizes signal timings to reduce jams",
      "Route optimization — GPS apps use AI to find fastest routes",
      "Autonomous drones — AI controls delivery drones"
    ]
  },
  {
    field: "Art & Creativity",
    icon: "🎨",
    examples: [
      "Image generation — AI creates pictures from text descriptions",
      "Music composition — AI writes melodies and beats",
      "Story writing — AI assists authors with creative writing",
      "Video editing — AI auto-edits and enhances videos"
    ]
  },
  {
    field: "Science & Research",
    icon: "🔬",
    examples: [
      "Protein folding — AI predicts 3D shapes of molecules",
      "Climate modeling — AI simulates weather patterns over decades",
      "Space exploration — AI processes telescope data to find new stars",
      "Material discovery — AI designs stronger, lighter materials"
    ]
  },
  {
    field: "Language",
    icon: "🗣️",
    examples: [
      "Translation — AI translates between 100+ languages in real-time",
      "Speech-to-text — AI converts spoken words to written text",
      "Content generation — AI writes articles, emails, and reports",
      "Grammar check — AI finds and fixes writing mistakes"
    ]
  }
];

const AI_COURSE_LEVELS = [
  {
    level: 1,
    title: "What is AI?",
    topics: [
      "What computers can and cannot do",
      "AI vs humans — strengths and weaknesses",
      "Everyday AI: voice assistants, recommendations, auto-correct",
      "Smart vs not-smart machines"
    ]
  },
  {
    level: 2,
    title: "How AI Learns",
    topics: [
      "Training data — AI needs examples to learn",
      "Patterns — AI finds hidden patterns in data",
      "Input → Process → Output",
      "Image recognition — how AI 'sees' pictures",
      "Spam filters — how email AI works"
    ]
  },
  {
    level: 3,
    title: "AI Tools in Action",
    topics: [
      "Text generation (chatbots like ChatGPT)",
      "Image generation (DALL·E, Midjourney)",
      "Speech-to-text and voice AI",
      "AI in healthcare, agriculture, and education",
      "How to use AI tools responsibly"
    ]
  },
  {
    level: 4,
    title: "Responsible AI & Future",
    topics: [
      "Bias in AI — why representation matters",
      "Privacy — how AI handles your data",
      "Deepfakes — fake videos and images",
      "Careers in AI",
      "Prompt engineering — how to talk to AI effectively"
    ]
  }
];

/* ------------------------------------------------------------------ */
/*  Chatbot builder (no AI needed — purely client-side)               */
/* ------------------------------------------------------------------ */

function ChatbotBuilder() {
  const [rules, setRules] = useState([
    { q: "hello", a: "Hi there! How can I help you?" },
    { q: "what is ai", a: "AI stands for Artificial Intelligence — it's when computers learn to think!" },
    { q: "", a: "" }
  ]);
  const [testInput, setTestInput] = useState("");
  const [chatLog, setChatLog] = useState([]);

  const updateRule = (i, field, value) => {
    setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };

  const addRule = () => setRules((prev) => [...prev, { q: "", a: "" }]);

  const testChat = () => {
    if (!testInput.trim()) return;
    const lower = testInput.toLowerCase().trim();
    const match = rules.find((r) => r.q && lower.includes(r.q.toLowerCase()));
    const response = match ? match.a : "I don't understand that. Try asking something else!";
    setChatLog((prev) => [...prev, { user: testInput, bot: response }]);
    setTestInput("");
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontWeight: 700 }}>Define Rules</div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
        Create simple "if the user says X, respond with Y" rules. Then test your chatbot below!
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {rules.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input
              className="input"
              placeholder="If user says..."
              value={r.q}
              onChange={(e) => updateRule(i, "q", e.target.value)}
            />
            <input
              className="input"
              placeholder="Bot responds..."
              value={r.a}
              onChange={(e) => updateRule(i, "a", e.target.value)}
            />
          </div>
        ))}
        <button type="button" className="button secondary" style={{ width: "auto", justifySelf: "start" }} onClick={addRule}>
          + Add Rule
        </button>
      </div>

      <div style={{ fontWeight: 700, marginTop: 8 }}>Test Your Chatbot</div>
      <div
        style={{
          background: "var(--color-bg-subtle)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          padding: 12,
          minHeight: 120,
          maxHeight: 240,
          overflowY: "auto",
          display: "grid",
          gap: 6,
          alignContent: "start"
        }}
      >
        {chatLog.length === 0 ? (
          <div style={{ color: "var(--color-text-faint)", fontSize: 13 }}>Type a message below to start...</div>
        ) : (
          chatLog.map((c, i) => (
            <div key={i}>
              <div style={{ textAlign: "right" }}>
                <span style={{ background: "#2563eb", color: "#fff", padding: "4px 10px", borderRadius: 12, fontSize: 13 }}>
                  {c.user}
                </span>
              </div>
              <div style={{ marginTop: 4 }}>
                <span style={{ background: "var(--color-bg-badge)", padding: "4px 10px", borderRadius: 12, fontSize: 13 }}>
                  🤖 {c.bot}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="input"
          placeholder="Type a message..."
          value={testInput}
          onChange={(e) => setTestInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && testChat()}
          style={{ flex: 1 }}
        />
        <button className="button" style={{ width: "auto" }} onClick={testChat}>
          Send
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quiz Player (for quiz-gen results)                                */
/* ------------------------------------------------------------------ */

function QuizPlayer({ questions }) {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);

  if (!questions || !questions.length) return null;

  const score = questions.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {questions.map((q, i) => (
        <div key={i} className="card" style={{ padding: "10px 14px" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Q{i + 1}. {q.q}
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {q.options.map((opt, oi) => {
              const isSelected = answers[i] === oi;
              const isCorrect = submitted && q.answer === oi;
              const isWrong = submitted && isSelected && q.answer !== oi;
              return (
                <label
                  key={oi}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: isCorrect ? "var(--color-bg-success-light)" : isWrong ? "var(--color-bg-danger-light)" : "transparent",
                    cursor: submitted ? "default" : "pointer"
                  }}
                >
                  <input
                    type="radio"
                    name={`q${i}`}
                    checked={isSelected}
                    disabled={submitted}
                    onChange={() => setAnswers((prev) => ({ ...prev, [i]: oi }))}
                  />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
      {!submitted ? (
        <button
          className="button"
          style={{ width: "auto", justifySelf: "start" }}
          onClick={() => setSubmitted(true)}
          disabled={Object.keys(answers).length < questions.length}
        >
          Submit Answers
        </button>
      ) : (
        <div className="card" style={{ fontWeight: 800, fontSize: 18, textAlign: "center" }}>
          Score: {score} / {questions.length} ({Math.round((score / questions.length) * 100)}%)
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */

function StudentAiPlaygroundPage() {
  const [tab, setTab] = useState("playground"); // playground | learn | chatbot-builder | history
  const [activeTool, setActiveTool] = useState(TOOLS[0].id);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    getAiPlaygroundUsage()
      .then((res) => setUsage(res?.data || null))
      .catch(() => {});
  }, []);

  const selectedTool = TOOLS.find((t) => t.id === activeTool) || TOOLS[0];

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await callAiPlayground({ tool: activeTool, prompt: prompt.trim() });
      setResult(res?.data || null);
      // Refresh usage
      getAiPlaygroundUsage()
        .then((r) => setUsage(r?.data || null))
        .catch(() => {});
    } catch (err) {
      setError(err?.response?.data?.message || "AI request failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await getAiPlaygroundHistory();
      setHistory(res?.data || []);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "history") {
      void loadHistory();
    }
  }, [tab]);

  // Try parsing quiz JSON if the tool is quiz-gen
  let parsedQuiz = null;
  if (activeTool === "quiz-gen" && result?.response) {
    try {
      const cleaned = result.response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (parsed?.questions?.length) parsedQuiz = parsed.questions;
    } catch {
      // not valid JSON, display as text
    }
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>🤖 AI Playground</h2>
        <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
          Learn about AI by using real AI tools! Experiment, explore, and discover how artificial intelligence works.
        </div>
      </div>

      <UsageBadge usage={usage} />

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {[
          { id: "playground", label: "🧪 AI Tools" },
          { id: "learn", label: "📖 Learn About AI" },
          { id: "chatbot-builder", label: "🤖 Build a Chatbot" },
          { id: "history", label: "📜 My History" }
        ].map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "button" : "button secondary"}
            style={{ width: "auto", fontSize: 13 }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---- Playground Tab ---- */}
      {tab === "playground" ? (
        <div style={{ display: "grid", gap: 12 }}>
          {/* Tool selector */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
            {TOOLS.map((t) => (
              <ToolCard
                key={t.id}
                icon={t.icon}
                title={t.title}
                description={t.description}
                active={activeTool === t.id}
                onClick={() => {
                  setActiveTool(t.id);
                  setResult(null);
                  setError("");
                  setPrompt("");
                }}
              />
            ))}
          </div>

          {/* Input area */}
          <div className="card" style={{ display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 700 }}>
              {selectedTool.icon} {selectedTool.title}
            </div>
            <textarea
              className="input"
              rows={3}
              placeholder={selectedTool.placeholder}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={2000}
              style={{ resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button className="button" style={{ width: "auto" }} onClick={handleSubmit} disabled={loading || !prompt.trim()}>
                {loading ? "Thinking..." : "Ask AI ✨"}
              </button>
              {prompt.length > 0 && (
                <span style={{ fontSize: 12, color: "var(--color-text-faint)" }}>{prompt.length}/2000</span>
              )}
            </div>
          </div>

          {/* Error */}
          {error ? <div className="card" style={{ color: "#ef4444", fontWeight: 700 }}>{error}</div> : null}

          {/* Result */}
          {result ? (
            <div className="card" style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700 }}>AI Response</div>
                <div style={{ fontSize: 11, color: "var(--color-text-faint)" }}>
                  {result.durationMs ? `${result.durationMs}ms` : ""} {result.tokensUsed ? `• ${result.tokensUsed} tokens` : ""}
                </div>
              </div>

              {parsedQuiz ? (
                <QuizPlayer questions={parsedQuiz} />
              ) : (
                <div
                  style={{
                    background: "var(--color-bg-subtle)",
                    padding: "12px 16px",
                    borderRadius: 8,
                    whiteSpace: "pre-wrap",
                    fontSize: 14,
                    lineHeight: 1.6
                  }}
                >
                  {result.response}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ---- Learn Tab ---- */}
      {tab === "learn" ? (
        <div style={{ display: "grid", gap: 16 }}>
          {/* Course levels */}
          <div className="card" style={{ display: "grid", gap: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>📘 AI for Young Learners — Course Outline</div>
            {AI_COURSE_LEVELS.map((lv) => (
              <div key={lv.level} style={{ display: "grid", gap: 4 }}>
                <div style={{ fontWeight: 700 }}>
                  Level {lv.level}: {lv.title}
                </div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {lv.topics.map((t, i) => (
                    <li key={i} style={{ fontSize: 13, color: "var(--color-text-label)" }}>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* AI in different fields */}
          <div style={{ fontWeight: 800, fontSize: 16 }}>🌍 How AI is Used in Different Fields</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
            {AI_FIELDS.map((f) => (
              <div key={f.field} className="card" style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {f.icon} {f.field}
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {f.examples.map((ex, i) => (
                    <li key={i} style={{ fontSize: 13, color: "var(--color-text-label)", marginBottom: 2 }}>
                      {ex}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ---- Chatbot Builder Tab ---- */}
      {tab === "chatbot-builder" ? (
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>🤖 Build Your Own Chatbot</div>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
              Create a simple rule-based chatbot. Define "if user says X → respond Y" rules, then test it!
              This shows how basic chatbots work vs real AI chatbots.
            </div>
          </div>
          <ChatbotBuilder />
        </div>
      ) : null}

      {/* ---- History Tab ---- */}
      {tab === "history" ? (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>My AI Playground History</div>
          {historyLoading ? <div style={{ color: "var(--color-text-muted)" }}>Loading...</div> : null}

          {!historyLoading && history.length === 0 ? (
            <div style={{ color: "var(--color-text-muted)" }}>No history yet. Start using the AI tools above!</div>
          ) : null}

          {history.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {history.map((h) => (
                <details key={h.id} style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 8 }}>
                  <summary style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontWeight: 700 }}>{h.toolName}</span>
                    <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                      {new Date(h.createdAt).toLocaleString()}
                    </span>
                  </summary>
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Prompt</div>
                      <div style={{ background: "var(--color-bg-muted)", padding: 8, borderRadius: 6, fontSize: 13 }}>
                        {h.prompt}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Response</div>
                      <div style={{ background: "var(--color-bg-subtle)", padding: 8, borderRadius: 6, fontSize: 13, whiteSpace: "pre-wrap" }}>
                        {h.response}
                      </div>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export { StudentAiPlaygroundPage };
