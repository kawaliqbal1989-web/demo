import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../../auth/AuthContext";
import {
  getStudentMe,
  getStudentMyCourse,
  getStudentWorksheet,
  startOrResumeStudentWorksheetAttempt,
  saveStudentAttemptAnswers,
  submitStudentAttempt
} from "../../services/studentPortalService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { VirtualAbacus } from "../../components/VirtualAbacus";
import { generateWorksheetResultPdf } from "../../utils/pdfExport";

const QUESTION_FONT_MIN_PX = 12;
const QUESTION_FONT_MAX_PX = 28;

function draftKey(attemptId) {
  return `student_attempt_draft_${attemptId}`;
}

function formatSeconds(secs) {
  const safe = Number.isFinite(Number(secs)) ? Math.max(0, Math.floor(Number(secs))) : 0;
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatAnswerValue(value) {
  if (value === "" || value === null || value === undefined) {
    return "—";
  }
  return String(value);
}

function computeServerOffsetMs(serverNow) {
  const d = serverNow ? new Date(serverNow) : null;
  if (!d || Number.isNaN(d.getTime())) return 0;
  return d.getTime() - Date.now();
}

function deriveFrozenTimerSeconds({ timerMode, completionTimeSeconds, timeLimitSeconds, status }) {
  const safeCompletion = Number.isFinite(Number(completionTimeSeconds))
    ? Math.max(0, Math.floor(Number(completionTimeSeconds)))
    : null;
  const safeLimit = Number.isFinite(Number(timeLimitSeconds)) && Number(timeLimitSeconds) > 0
    ? Math.max(0, Math.floor(Number(timeLimitSeconds)))
    : null;

  if (timerMode === "COUNTDOWN") {
    if (safeCompletion !== null && safeLimit !== null) {
      return Math.max(0, safeLimit - safeCompletion);
    }
    return String(status || "").toUpperCase() === "TIMED_OUT" ? 0 : null;
  }

  return safeCompletion;
}

function formatColumnSumPrompt(nums) {
  const safeNums = Array.isArray(nums) ? nums.filter((n) => typeof n === "number" && Number.isFinite(n)) : [];
  if (!safeNums.length) {
    return "";
  }

  const [first, ...rest] = safeNums;
  let out = String(first);
  for (const n of rest) {
    if (n >= 0) {
      out += ` + ${n}`;
    } else {
      out += ` - ${Math.abs(n)}`;
    }
  }
  return out;
}

function getQuestionTerms(q) {
  const operands = q?.operands && typeof q.operands === "object" ? q.operands : {};
  if (Array.isArray(operands?.nums)) {
    return operands.nums;
  }
  if (Array.isArray(operands?.terms)) {
    return operands.terms;
  }
  return [];
}

function formatQuestionPrompt(q) {
  const operation = q?.operation ? String(q.operation).trim().toUpperCase() : "";
  const operands = q?.operands && typeof q.operands === "object" ? q.operands : {};

  if (typeof operands.expr === "string" && operands.expr.trim()) {
    return operands.expr.trim();
  }

  if (operation === "COLUMN_SUM") {
    const expr = formatColumnSumPrompt(getQuestionTerms(q));
    return expr || "COLUMN_SUM";
  }

  const OP_SYM = { ADD: "+", SUB: "-", MUL: "×", DIV: "÷" };
  const terms = getQuestionTerms(q);

  if (operation === "MIX" && terms.length >= 2) {
    const operators = Array.isArray(operands?.operators) ? operands.operators : [];
    return terms
      .map((term, index) => {
        if (index === 0) return String(Number(term));
        const op = operators[index] || "ADD";
        return `${OP_SYM[op] || op} ${Number(term)}`;
      })
      .join(" ");
  }

  if (terms.length >= 2) {
    if (operation === "ADD") {
      return terms
        .map((term, index) => {
          const value = Number(term);
          if (index === 0) return String(value);
          return value < 0 ? `- ${Math.abs(value)}` : `+ ${value}`;
        })
        .join(" ");
    }
    const sign = OP_SYM[operation] || operation;
    return terms.map((t) => String(Number(t))).join(` ${sign} `);
  }

  const a = operands.a ?? operands.left ?? operands.x ?? "";
  const b = operands.b ?? operands.right ?? operands.y ?? "";
  const sign = OP_SYM[operation] || operation;

  if (a !== "" || b !== "") {
    return `${a} ${sign} ${b}`.trim();
  }

  return operation || "—";
}

function formatCenterLabel(name, code) {
  const safeName = String(name || "").trim();
  const safeCode = String(code || "").trim();
  if (safeName && safeCode) {
    return `${safeName} (${safeCode})`;
  }
  return safeName || safeCode || null;
}

function formatCourseLevelLabel({ courseLevelLabel, courseCode, levelTitle, courseName }) {
  if (courseLevelLabel) {
    return courseLevelLabel;
  }
  if (courseCode && levelTitle) {
    return `${courseCode} / ${levelTitle}`;
  }
  return courseName || levelTitle || courseCode || null;
}

function StudentWorksheetAttemptPage() {
  const { worksheetId } = useParams();
  const navigate = useNavigate();
  const auth = useContext(AuthContext);
  const logout = auth?.logout;

  const [worksheet, setWorksheet] = useState(null);
  const [worksheetPreview, setWorksheetPreview] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [answersByQuestionId, setAnswersByQuestionId] = useState({});
  const [inlineErrorsByQuestionId, setInlineErrorsByQuestionId] = useState({});
  const [result, setResult] = useState(null);
  const [studentProfile, setStudentProfile] = useState(null);
  const [studentCourseSummary, setStudentCourseSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [multiTabLocked, setMultiTabLocked] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(null);
  const [showAbacus, setShowAbacus] = useState(false);
  const [startConfirmed, setStartConfirmed] = useState(false);
  const [questionFontPx, setQuestionFontPx] = useState(() => {
    try {
      const raw = localStorage.getItem("student_ws_question_font_px");
      const n = Number(raw);
      if (!Number.isFinite(n)) return 16;
          return Math.min(QUESTION_FONT_MAX_PX, Math.max(QUESTION_FONT_MIN_PX, Math.round(n)));
    } catch {
      return 16;
    }
  });

  const attemptId = attempt?.attemptId || null;
  const serverOffsetMsRef = useRef(0);
  const versionRef = useRef(0);
  const saveTimerRef = useRef(null);
  const inflightSaveRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const submittingRef = useRef(false);
  const autoSubmitTriggeredRef = useRef(false);
  const autoSubmitRetryCountRef = useRef(0);
  const autoSubmitRetryTimerRef = useRef(null);
  const latestAnswersRef = useRef({});
  const tabIdRef = useRef(`${Date.now()}_${Math.floor(Math.random() * 100000)}`);

  useEffect(() => {
    latestAnswersRef.current = answersByQuestionId;
  }, [answersByQuestionId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setResult(null);
    setSaveMessage("");
    setConfirmOpen(false);
    setMultiTabLocked(false);
    setInlineErrorsByQuestionId({});
    setWorksheet(null);
    setWorksheetPreview(null);
    setAttempt(null);
    setAnswersByQuestionId({});
    setStartConfirmed(false);
    autoSubmitTriggeredRef.current = false;
    autoSubmitRetryCountRef.current = 0;
    submittingRef.current = false;
    pendingSaveRef.current = false;
    inflightSaveRef.current = false;
    if (autoSubmitRetryTimerRef.current) {
      window.clearTimeout(autoSubmitRetryTimerRef.current);
      autoSubmitRetryTimerRef.current = null;
    }

    getStudentWorksheet(worksheetId)
      .then((worksheetRes) => {
        if (cancelled) {
          return;
        }
        setWorksheetPreview(worksheetRes.data?.data || null);
      })
      .catch((e) => {
        if (cancelled) {
          return;
        }
        setError(getFriendlyErrorMessage(e) || "Failed to load worksheet.");
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (autoSubmitRetryTimerRef.current) {
        window.clearTimeout(autoSubmitRetryTimerRef.current);
        autoSubmitRetryTimerRef.current = null;
      }
    };
  }, [worksheetId]);

  useEffect(() => {
    let cancelled = false;
    setStudentProfile(null);
    setStudentCourseSummary(null);

    Promise.allSettled([getStudentMe(), getStudentMyCourse()])
      .then(([profileRes, courseRes]) => {
        if (cancelled) {
          return;
        }

        setStudentProfile(profileRes.status === "fulfilled" ? profileRes.value?.data?.data || null : null);
        setStudentCourseSummary(courseRes.status === "fulfilled" ? courseRes.value?.data?.data || null : null);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setStudentProfile(null);
        setStudentCourseSummary(null);
      });

    return () => {
      cancelled = true;
    };
  }, [worksheetId]);

  useEffect(() => {
    if (!startConfirmed) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    startOrResumeStudentWorksheetAttempt(worksheetId)
      .then((startRes) => {
        if (cancelled) {
          return;
        }
        const payload = startRes.data?.data || null;
        setWorksheet(payload?.worksheet || worksheetPreview || null);
        setAttempt(
          payload
            ? {
                attemptId: payload.attemptId,
                worksheetId: payload.worksheetId,
                status: payload.status,
                startedAt: payload.startedAt,
                endsAt: payload.endsAt,
                serverNow: payload.serverNow,
                timerMode: payload.attemptTimerMode,
                worksheetKind: payload.worksheetKind
              }
            : null
        );

        serverOffsetMsRef.current = computeServerOffsetMs(payload?.serverNow);
        versionRef.current = Number(payload?.version || 0);
        const serverAnswers = payload?.answersByQuestionId && typeof payload.answersByQuestionId === "object" ? payload.answersByQuestionId : {};
        setAnswersByQuestionId(serverAnswers);
        setResult(payload?.result || null);

        try {
          const raw = localStorage.getItem(draftKey(payload?.attemptId));
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
              setAnswersByQuestionId((prev) => ({ ...prev, ...parsed }));
              pendingSaveRef.current = true;
            }
          }
        } catch {
          // ignore draft load failures
        }
      })
      .catch((e) => {
        if (cancelled) {
          return;
        }
        const status = e?.response?.status;
        if (status === 409) {
          setError("This worksheet is already submitted.");
          return;
        }

        setError(getFriendlyErrorMessage(e) || "Failed to load worksheet.");
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [startConfirmed, worksheetId, worksheetPreview]);

  useEffect(() => {
    if (!attemptId) return;
    try {
      localStorage.setItem(draftKey(attemptId), JSON.stringify(answersByQuestionId));
    } catch {
      // ignore
    }
  }, [answersByQuestionId, attemptId]);

  useEffect(() => {
    try {
      localStorage.setItem("student_ws_question_font_px", String(questionFontPx));
    } catch {
      // ignore
    }
  }, [questionFontPx]);

  const questionRows = useMemo(() => {
    return Array.isArray(worksheet?.questions) ? worksheet.questions : [];
  }, [worksheet]);

  const totalQuestions = questionRows.length;

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [worksheetId]);

  const answeredCount = useMemo(() => {
    let c = 0;
    for (const q of questionRows) {
      const qid = q.questionId || q.id;
      if (!qid) continue;
      const v = answersByQuestionId?.[qid]?.value;
      if (v !== "" && v !== null && v !== undefined) {
        c += 1;
      }
    }
    return c;
  }, [questionRows, answersByQuestionId]);

  const scoreSoFar = useMemo(() => {
    // Only available when API provides correctAnswer (PRACTICE worksheets). For EXAM, correctAnswer is null.
    let correct = 0;
    let totalWithKey = 0;
    for (const q of questionRows) {
      const qid = q.questionId || q.id;
      if (!qid) continue;
      const key = q?.correctAnswer;
      if (key === null || key === undefined) {
        continue;
      }
      const keyNum = Number(key);
      if (!Number.isFinite(keyNum)) {
        continue;
      }
      totalWithKey += 1;
      const raw = answersByQuestionId?.[qid]?.value;
      const ans = Number(raw);
      if (!Number.isFinite(ans)) {
        continue;
      }
      if (Math.trunc(ans) === Math.trunc(keyNum)) {
        correct += 1;
      }
    }
    return { correct, totalWithKey };
  }, [questionRows, answersByQuestionId]);

  const activeQuestion = totalQuestions ? questionRows[Math.min(Math.max(activeIndex, 0), totalQuestions - 1)] : null;

  const isColumnSumGrid = useMemo(() => {
    if (!questionRows.length) return false;
    return questionRows.every((q) => {
      const op = String(q?.operation || "").toUpperCase();
      if (op !== "ADD" && op !== "SUB" && op !== "COLUMN_SUM") return false;
      const terms = getQuestionTerms(q);
      return Array.isArray(terms) && terms.length > 0;
    });
  }, [questionRows]);

  const isWrongAnswer = (q) => {
    if (!result) return false;
    const qid = q?.questionId || q?.id;
    if (!qid) return false;
    const key = q?.correctAnswer;
    if (key === null || key === undefined) return false; // EXAM or no key
    const raw = answersByQuestionId?.[qid]?.value;
    if (raw === "" || raw === null || raw === undefined) return false;
    const ans = Number(raw);
    const keyNum = Number(key);
    if (!Number.isFinite(ans) || !Number.isFinite(keyNum)) return false;
    return Math.trunc(ans) !== Math.trunc(keyNum);
  };

  const renderStandardQuestionCard = (q) => {
    const qid = q.questionId || q.id;
    const prompt = formatQuestionPrompt(q);
    const inlineError = qid ? inlineErrorsByQuestionId[qid] : null;
    const wrong = isWrongAnswer(q);

    return (
      <div key={qid || q.questionNumber} className="card" data-qid={qid || undefined}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700 }}>Question {q.questionNumber}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Optional</div>
        </div>

        <div style={{ marginTop: 10, fontSize: questionFontPx, lineHeight: 1.35 }}>{prompt}</div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>
            Answer
          </label>
          <input
            className="input"
            inputMode="numeric"
            value={qid ? (answersByQuestionId?.[qid]?.value ?? "") : ""}
            onChange={(e) => {
              if (!qid) return;
              const value = e.target.value;
              setAnswersByQuestionId((prev) => ({
                ...prev,
                [qid]: { value }
              }));
              setInlineErrorsByQuestionId((prev) => {
                if (!prev[qid]) return prev;
                const next = { ...prev };
                delete next[qid];
                return next;
              });
              scheduleSave();
            }}
            aria-label={`Answer for question ${q.questionNumber}`}
            disabled={isLocked}
            style={wrong ? { borderColor: "var(--color-text-danger)" } : undefined}
          />
          {inlineError ? (
            <div className="error" style={{ fontSize: 12, marginTop: 8 }} role="alert">
              {inlineError}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const renderColumnSumCard = (q) => {
    const qid = q.questionId || q.id;
    const nums = getQuestionTerms(q);
    const inlineError = qid ? inlineErrorsByQuestionId[qid] : null;
    const wrong = isWrongAnswer(q);

    return (
      <div key={qid || q.questionNumber} className="card ws-colsum-card" data-qid={qid || undefined}>
        <div className="ws-colsum-card__num">{q.questionNumber}</div>
        <div className="ws-colsum-card__mid">
          <div className="ws-colsum-card__numbers" style={{ fontSize: questionFontPx }} aria-label={`Question ${q.questionNumber} column`}>
            {Array.isArray(nums)
              ? nums
                  .filter((n) => typeof n === "number" && Number.isFinite(n))
                  .map((n, idx) => (
                    <div key={idx}>{String(n)}</div>
                  ))
              : null}
          </div>
          <div className="ws-colsum-card__line" />
        </div>

        <div>
          <input
            className="input ws-colsum-input"
            inputMode="numeric"
            value={qid ? (answersByQuestionId?.[qid]?.value ?? "") : ""}
            onChange={(e) => {
              if (!qid) return;
              const value = e.target.value;
              setAnswersByQuestionId((prev) => ({
                ...prev,
                [qid]: { value }
              }));
              setInlineErrorsByQuestionId((prev) => {
                if (!prev[qid]) return prev;
                const next = { ...prev };
                delete next[qid];
                return next;
              });
              scheduleSave();
            }}
            aria-label={`Answer for question ${q.questionNumber}`}
            disabled={isLocked}
            style={wrong ? { borderColor: "var(--color-text-danger)" } : undefined}
          />
          {inlineError ? (
            <div className="error" style={{ fontSize: 12, marginTop: 8 }} role="alert">
              {inlineError}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const attemptStatus = attempt?.status ? String(attempt.status) : "NOT_STARTED";
  const isLocked = Boolean(result) || multiTabLocked || attemptStatus === "SUBMITTED" || attemptStatus === "TIMED_OUT";
  const attemptTimerMode = String(attempt?.timerMode || worksheet?.attemptTimerMode || "ELAPSED").trim().toUpperCase();
  const isCountdownMode = attemptTimerMode === "COUNTDOWN";
  const timeLimitSeconds = Number.isFinite(Number(worksheet?.timeLimitSeconds)) && Number(worksheet.timeLimitSeconds) > 0
    ? Number(worksheet.timeLimitSeconds)
    : null;

  const endsAtMs = useMemo(() => {
    const d = attempt?.endsAt ? new Date(attempt.endsAt) : null;
    if (d && !Number.isNaN(d.getTime())) {
      return d.getTime();
    }

    const started = attempt?.startedAt ? new Date(attempt.startedAt) : null;
    const limit = worksheet?.timeLimitSeconds;
    const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : null;
    if (started && !Number.isNaN(started.getTime()) && safeLimit) {
      return started.getTime() + safeLimit * 1000;
    }

    return null;
  }, [attempt?.endsAt, attempt?.startedAt, worksheet?.timeLimitSeconds]);

  useEffect(() => {
    if (result) {
      setElapsedSeconds(
        deriveFrozenTimerSeconds({
          timerMode: attemptTimerMode,
          completionTimeSeconds: result?.resultBreakdown?.completionTime,
          timeLimitSeconds,
          status: result?.status
        })
      );
      return;
    }

    const startedAtMs = attempt?.startedAt ? new Date(attempt.startedAt).getTime() : null;
    if (!startedAtMs || Number.isNaN(startedAtMs)) {
      setElapsedSeconds(null);
      return;
    }

    const tick = () => {
      const serverNowMs = Date.now() + (serverOffsetMsRef.current || 0);
      const elapsed = Math.max(0, Math.floor((serverNowMs - startedAtMs) / 1000));
      const remaining = endsAtMs ? Math.max(0, Math.ceil((endsAtMs - serverNowMs) / 1000)) : null;
      setElapsedSeconds(isCountdownMode && remaining !== null ? remaining : elapsed);
      if (endsAtMs && serverNowMs >= endsAtMs && attemptStatus === "IN_PROGRESS") {
        setAttempt((prev) => (prev ? { ...prev, status: "TIMED_OUT" } : prev));
        if (isCountdownMode && !autoSubmitTriggeredRef.current) {
          autoSubmitTriggeredRef.current = true;
          setSaveMessage("Time is up. Auto-submitting…");
          void runSubmit({ dueToTimeout: true });
        }
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [attempt?.startedAt, attemptStatus, attemptTimerMode, endsAtMs, isCountdownMode, result, timeLimitSeconds]);

  useEffect(() => {
    if (!attemptId) return;
    if (typeof BroadcastChannel === "undefined") return;

    const bc = new BroadcastChannel(`attempt_editor_${attemptId}`);
    const announce = () => {
      bc.postMessage({ type: "HELLO", attemptId, tabId: tabIdRef.current });
    };

    bc.onmessage = (ev) => {
      const msg = ev?.data;
      if (!msg || msg.attemptId !== attemptId) return;
      if (msg.tabId === tabIdRef.current) return;
      if (msg.type === "HELLO") {
        setMultiTabLocked(true);
      }
    };

    announce();
    const ping = window.setInterval(announce, 5000);
    return () => {
      window.clearInterval(ping);
      bc.close();
    };
  }, [attemptId]);

  const triggerTimeoutAutoSubmit = ({ retry = false } = {}) => {
    if (!attemptId || !isCountdownMode || result || submittingRef.current) {
      return;
    }
    if (!retry && autoSubmitTriggeredRef.current) {
      return;
    }
    if (retry && autoSubmitRetryCountRef.current >= 3) {
      return;
    }

    autoSubmitTriggeredRef.current = true;
    if (retry) {
      autoSubmitRetryCountRef.current += 1;
      setSaveMessage("Auto-submit retrying…");
    } else {
      setSaveMessage("Time is up. Auto-submitting…");
    }
    void runSubmit({ dueToTimeout: true });
  };

  const flushSave = async () => {
    if (!attemptId) return;
    if (isLocked) return;
    if (inflightSaveRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    inflightSaveRef.current = true;
    pendingSaveRef.current = false;
    setSaveMessage("Saving…");

    try {
      const res = await saveStudentAttemptAnswers(attemptId, {
        version: versionRef.current,
        answersByQuestionId
      });

      const payload = res.data?.data || {};
      serverOffsetMsRef.current = computeServerOffsetMs(payload.serverNow);
      versionRef.current = Number(payload.version || versionRef.current);
      setAttempt((prev) => (prev ? { ...prev, status: payload.status, endsAt: payload.endsAt || prev.endsAt, serverNow: payload.serverNow } : prev));
      setSaveMessage(payload.savedAt ? `Saved at ${new Date(payload.savedAt).toLocaleTimeString()}` : "Saved");
      try {
        localStorage.removeItem(draftKey(attemptId));
      } catch {
        // ignore
      }
    } catch (e) {
      const status = e?.response?.status;
      const code = e?.response?.data?.errorCode || e?.response?.data?.error_code;
      if (code === "ATTEMPT_ENDED") {
        setSaveMessage("Attempt ended");
        setAttempt((prev) => (prev ? { ...prev, status: "TIMED_OUT" } : prev));
        if (isCountdownMode && !result) {
          triggerTimeoutAutoSubmit();
        }
      } else if (status === 401 || code === "INVALID_ACCESS_TOKEN" || code === "AUTH_REQUIRED") {
        setSaveMessage("Session expired. Please login again.");
        pendingSaveRef.current = false;
        if (saveTimerRef.current) {
          window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        // Avoid retry-spam; prefer AuthProvider logout if available.
        if (typeof logout === "function") {
          void logout();
        } else {
          try {
            localStorage.removeItem("abacus_access_token");
            localStorage.removeItem("abacus_refresh_token");
          } catch {
            // ignore
          }
          navigate("/login", { replace: true });
        }
      } else {
        setSaveMessage("Offline: will retry");
        pendingSaveRef.current = true;
      }
    } finally {
      inflightSaveRef.current = false;
      if (pendingSaveRef.current) {
        window.setTimeout(() => void flushSave(), 1500);
      }
    }
  };

  const scheduleSave = () => {
    if (!attemptId) return;
    if (isLocked) return;
    pendingSaveRef.current = true;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      void flushSave();
    }, 800);
  };

  useEffect(() => {
    const onOnline = () => {
      if (pendingSaveRef.current) {
        void flushSave();
      }
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [attemptId, isLocked]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      if (pendingSaveRef.current) {
        void flushSave();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [attemptId, isLocked]);

  useEffect(() => {
    const onBeforeUnload = () => {
      if (pendingSaveRef.current) {
        void flushSave();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [attemptId, isLocked]);

  useEffect(() => {
    if (!attemptId || !isCountdownMode || result) {
      return;
    }
    if (attemptStatus === "TIMED_OUT") {
      triggerTimeoutAutoSubmit();
    }
  }, [attemptId, attemptStatus, isCountdownMode, result]);

  const runSubmit = async ({ dueToTimeout = false } = {}) => {
    if (!attemptId || submittingRef.current) return;

    submittingRef.current = true;
    setConfirmOpen(false);
    setSubmitting(true);
    setError("");

    try {
      const res = await submitStudentAttempt(attemptId, {
        answersByQuestionId: latestAnswersRef.current
      });
      const payload = res.data?.data || null;
      setResult(payload);
      setAttempt((prev) => (prev ? { ...prev, status: payload?.status || (dueToTimeout ? "TIMED_OUT" : "SUBMITTED") } : prev));
      autoSubmitRetryCountRef.current = 0;
      setSaveMessage(dueToTimeout ? "Auto-submitted" : "Submitted");
      pendingSaveRef.current = false;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (autoSubmitRetryTimerRef.current) {
        window.clearTimeout(autoSubmitRetryTimerRef.current);
        autoSubmitRetryTimerRef.current = null;
      }
      try {
        localStorage.removeItem(draftKey(attemptId));
      } catch {
        // ignore
      }
    } catch (e) {
      const code = e?.response?.data?.errorCode || e?.response?.data?.error_code;
      if (code === "ATTEMPT_ENDED") {
        setAttempt((prev) => (prev ? { ...prev, status: "TIMED_OUT" } : prev));
        setError(dueToTimeout ? "Time is up. Refresh the page to see the final result." : "Attempt ended.");
      } else if (code === "ANSWERS_REQUIRED") {
        setError("Please answer at least one question.");
      } else {
        if (dueToTimeout && autoSubmitRetryCountRef.current < 3) {
          autoSubmitTriggeredRef.current = false;
          if (autoSubmitRetryTimerRef.current) {
            window.clearTimeout(autoSubmitRetryTimerRef.current);
          }
          autoSubmitRetryTimerRef.current = window.setTimeout(() => {
            autoSubmitRetryTimerRef.current = null;
            triggerTimeoutAutoSubmit({ retry: true });
          }, 1500);
          setError("Time is up. Auto-submit retrying…");
        } else {
          setError(dueToTimeout ? "Time is up. Auto-submit failed. Refresh the page." : "Submit failed. Please try again.");
        }
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const onSubmit = async () => {
    if (!attemptId) {
      setError("Missing attempt. Reload the page.");
      return;
    }

    if (isLocked) return;

    const hasAnyAnswer = questionRows.some((q) => {
      const qid = q.questionId || q.id;
      if (!qid) return false;
      const raw = answersByQuestionId?.[qid]?.value;
      return !(raw === "" || raw === null || raw === undefined);
    });

    setInlineErrorsByQuestionId({});
    if (!hasAnyAnswer) {
      setError("Please answer at least one question.");
      return;
    }

    setConfirmOpen(true);
  };

  const doSubmitConfirmed = async () => {
    await runSubmit();
  };

  if (loading) {
    return (
      <div className="card">
        <p style={{ margin: 0, color: "var(--color-text-muted)" }}>Loading worksheet…</p>
      </div>
    );
  }

  if (!startConfirmed && worksheetPreview) {
    const previewQuestionCount = Array.isArray(worksheetPreview.questions) ? worksheetPreview.questions.length : 0;
    const previewTimeLimit = Number.isFinite(Number(worksheetPreview.timeLimitSeconds))
      ? formatSeconds(worksheetPreview.timeLimitSeconds)
      : "No limit";

    return (
      <div className="card" style={{ display: "grid", gap: 16, maxWidth: 760, margin: "0 auto" }}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 8 }}>{worksheetPreview.title || "Worksheet"}</h2>
          <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
            Read the instructions before you start. The worksheet timer and attempt will begin only after you continue.
          </p>
        </div>

        <div style={{ display: "grid", gap: 10, padding: 16, border: "1px solid var(--color-border-strong)", borderRadius: 12, background: "var(--color-bg-subtle)" }}>
          <div><strong>Questions:</strong> {previewQuestionCount}</div>
          <div><strong>Time Limit:</strong> {previewTimeLimit}</div>
          {worksheetPreview.description ? <div><strong>Description:</strong> {worksheetPreview.description}</div> : null}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Disclaimer</div>
          <div style={{ color: "var(--color-text-muted)", lineHeight: 1.5 }}>
            By starting this worksheet, you confirm that you are ready to begin now, you will complete it yourself, and the timer will continue once the worksheet starts.
          </div>
          <div style={{ color: "var(--color-text-muted)", lineHeight: 1.5 }}>
            Do not refresh, close the tab, or open the worksheet in multiple tabs while attempting it.
          </div>
        </div>

        {error ? (
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => navigate("/student/worksheets")}>
            Back
          </button>
          <button className="button" style={{ width: "auto" }} onClick={() => setStartConfirmed(true)}>
            I Understand, Start Worksheet
          </button>
        </div>
      </div>
    );
  }

  if (!worksheet) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Worksheet</h2>
        <p className="error" style={{ margin: 0 }}>
          {error || "Worksheet not available."}
        </p>
        <div style={{ marginTop: 12 }}>
          <button className="button secondary" onClick={() => navigate("/student/worksheets")}
            >Back</button>
        </div>
      </div>
    );
  }

  const frozenSubmittedTime = Number(result?.resultBreakdown?.completionTime);
  const takenTimeText = Number.isFinite(frozenSubmittedTime)
    ? formatSeconds(frozenSubmittedTime)
    : elapsedSeconds === null
      ? "—"
      : formatSeconds(elapsedSeconds);
  const countdownTimeText = Number.isFinite(frozenSubmittedTime)
    ? formatSeconds(deriveFrozenTimerSeconds({
        timerMode: attemptTimerMode,
        completionTimeSeconds: frozenSubmittedTime,
        timeLimitSeconds,
        status: result?.status
      }))
    : elapsedSeconds === null
      ? "—"
      : formatSeconds(elapsedSeconds);
  const timerText = result ? takenTimeText : countdownTimeText;
  const timerLabel = result ? "Taken Time" : (isCountdownMode ? "Count Down" : "Timer");
  const timerSummaryLabel = result ? "Taken Time" : (isCountdownMode ? "Count Down" : "Time Used");
  const totalTimeText = timeLimitSeconds ? formatSeconds(timeLimitSeconds) : "—";
  const statusText = multiTabLocked
    ? "OPEN_IN_ANOTHER_TAB"
    : attemptStatus === "TIMED_OUT"
      ? "TIMED_OUT"
      : attemptStatus === "SUBMITTED"
        ? "SUBMITTED"
        : attemptStatus === "IN_PROGRESS"
          ? "IN_PROGRESS"
          : "NOT_STARTED";

  const headerSaveText = submitting
    ? (isCountdownMode && attemptStatus === "TIMED_OUT" ? "Auto-submitting…" : "Submitting…")
    : isLocked
      ? "Locked"
      : saveMessage || (pendingSaveRef.current ? "Unsaved changes" : "");

  const submittedCorrect = result?.resultBreakdown?.correctCount;
  const submittedTotal = result?.total;
  const submittedAttemptedTime = result?.resultBreakdown?.completionTime;
  const submittedAtText = result?.submittedAt ? new Date(result.submittedAt).toLocaleString() : null;
  const headerScoreText = Number.isFinite(Number(submittedCorrect)) && Number.isFinite(Number(submittedTotal))
    ? `${submittedCorrect}/${submittedTotal}`
    : (scoreSoFar.totalWithKey ? `${scoreSoFar.correct}/${scoreSoFar.totalWithKey}` : null);

    const decreaseQuestionFont = () => {
      setQuestionFontPx((prev) => Math.max(QUESTION_FONT_MIN_PX, prev - 1));
    };

    const increaseQuestionFont = () => {
      setQuestionFontPx((prev) => Math.min(QUESTION_FONT_MAX_PX, prev + 1));
    };

  const isExamWorksheet = String(worksheet?.generationMode || "").toUpperCase() === "EXAM";
  const useExamPageStyling = isColumnSumGrid;
  const worksheetTitle = String(worksheet?.title || "Worksheet");
  const currentEnrollment = studentCourseSummary?.currentEnrollment || null;
  const currentCourse = studentCourseSummary?.myCourse || null;
  const studentName = String(studentProfile?.fullName || auth?.displayName || "Student").trim() || "Student";
  const studentCode = studentProfile?.studentCode || null;
  const teacherName = currentEnrollment?.assignedTeacherName || currentCourse?.teacher || null;
  const centerLabel =
    formatCenterLabel(currentEnrollment?.centerName, currentEnrollment?.centerCode) ||
    formatCenterLabel(currentCourse?.center?.name, currentCourse?.center?.code) ||
    formatCenterLabel(studentProfile?.centerName, studentProfile?.centerCode);
  const batchName = currentEnrollment?.batchName || null;
  const courseLevelLabel = formatCourseLevelLabel({
    courseLevelLabel: currentEnrollment?.courseLevelLabel,
    courseCode: currentCourse?.courseCode || studentProfile?.courseCode,
    levelTitle: currentEnrollment?.levelTitle || currentCourse?.currentLevel || studentProfile?.levelTitle,
    courseName: currentCourse?.courseName || studentProfile?.courseName
  });
  const reviewRows = questionRows.map((q) => {
    const qid = q.questionId || q.id;
    const studentAnswer = answersByQuestionId?.[qid]?.value;
    const correctAnswer = q?.correctAnswer;
    const hasKey = correctAnswer !== null && correctAnswer !== undefined;
    const hasStudentAnswer = !(studentAnswer === "" || studentAnswer === null || studentAnswer === undefined);
    const studentNum = Number(studentAnswer);
    const correctNum = Number(correctAnswer);
    const isCorrect = hasKey && Number.isFinite(studentNum) && Number.isFinite(correctNum)
      ? Math.trunc(studentNum) === Math.trunc(correctNum)
      : false;
    const resultStatus = !hasStudentAnswer
      ? "Not Attempted"
      : isCorrect
        ? "Right"
        : "Wrong";
    const resultTone = resultStatus === "Right"
      ? { background: "var(--color-bg-success-light)", borderColor: "#86efac", color: "var(--color-text-success)" }
      : resultStatus === "Not Attempted"
        ? { background: "var(--color-bg-subtle)", borderColor: "var(--color-border-strong)", color: "var(--color-text-secondary)" }
        : { background: "var(--color-bg-danger-light)", borderColor: "var(--color-border-danger)", color: "var(--color-text-danger)" };

    return {
      questionId: qid || q.questionNumber,
      questionNumber: q.questionNumber,
      prompt: formatQuestionPrompt(q),
      studentAnswer,
      correctAnswer,
      hasKey,
      isCorrect,
      resultStatus,
      resultTone
    };
  });

  const handleDownloadPdf = () => {
    const questions = reviewRows.map((row) => ({
      questionNumber: row.questionNumber,
      prompt: row.prompt,
      studentAnswer: formatAnswerValue(row.studentAnswer),
      correctAnswer: row.hasKey ? formatAnswerValue(row.correctAnswer) : "—",
      resultStatus: row.resultStatus
    }));

    const doc = generateWorksheetResultPdf({
      studentName,
      studentCode,
      teacherName,
      centerLabel,
      batchName,
      courseLevelLabel,
      worksheetTitle: worksheet?.title || "Worksheet",
      score: result?.score,
      totalQuestions: result?.total,
      correctCount: result?.resultBreakdown?.correctCount || 0,
      submittedAt: result?.submittedAt || new Date().toISOString(),
      totalTimeText: timeLimitSeconds ? totalTimeText : undefined,
      takenTimeText: Number.isFinite(Number(submittedAttemptedTime)) ? formatSeconds(submittedAttemptedTime) : timerText,
      questions
    });
    doc.save(`Worksheet_Result_${worksheet?.title || "report"}.pdf`);
  };

  return (
    <div className={useExamPageStyling ? "ws-attempt-page ws-attempt-page--exam" : "ws-attempt-page"}>
      <div className={useExamPageStyling ? "ws-attempt-page__panel" : ""} style={{ display: "grid", gap: 12, paddingBottom: 110 }}>
        <div className={useExamPageStyling ? "ws-exam-shell" : ""}>
        <div
          className={useExamPageStyling ? "card ws-exam-header" : "card"}
          style={{
            position: useExamPageStyling ? "static" : "sticky",
            top: useExamPageStyling ? "auto" : 0,
            zIndex: 5,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center"
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {/* Back button: compact for exam styling, full for standard */}
            <button
              className={useExamPageStyling ? "button secondary" : "button secondary"}
              style={useExamPageStyling ? { width: "36px", height: "36px", padding: 6, display: "inline-flex", alignItems: "center", justifyContent: "center" } : { width: "auto" }}
              onClick={() => navigate("/student/worksheets") }
              aria-label="Back to worksheets"
            >
              {useExamPageStyling ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              ) : (
                "Back"
              )}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>Font</span>
              <button
                className="button secondary"
                type="button"
                style={{ width: "auto", fontSize: 12, padding: "4px 8px" }}
                onClick={decreaseQuestionFont}
                disabled={loading || questionFontPx <= QUESTION_FONT_MIN_PX}
                aria-label="Decrease question font size"
                title="Decrease question font size"
              >
                A-
              </button>
              {!useExamPageStyling ? (
                <input
                  type="range"
                  min={QUESTION_FONT_MIN_PX}
                  max={QUESTION_FONT_MAX_PX}
                  step={1}
                  value={questionFontPx}
                  onChange={(e) => setQuestionFontPx(Math.min(QUESTION_FONT_MAX_PX, Math.max(QUESTION_FONT_MIN_PX, Number(e.target.value) || 16)))}
                  aria-label="Question font size"
                  disabled={loading}
                  style={{ width: 140 }}
                />
              ) : null}
              <button
                className="button secondary"
                type="button"
                style={{ width: "auto", fontSize: 12, padding: "4px 8px" }}
                onClick={increaseQuestionFont}
                disabled={loading || questionFontPx >= QUESTION_FONT_MAX_PX}
                aria-label="Increase question font size"
                title="Increase question font size"
              >
                A+
              </button>
              <span className="muted" style={{ fontSize: 12, width: 32, textAlign: "right" }}>{questionFontPx}px</span>
            </div>

            {!useExamPageStyling ? (
              <button
                className={showAbacus ? "button" : "button secondary"}
                type="button"
                style={{ width: "auto", fontSize: 12, padding: "4px 10px" }}
                onClick={() => setShowAbacus((v) => !v)}
                title={showAbacus ? "Hide virtual abacus" : "Show virtual abacus"}
              >
                🧮 {showAbacus ? "Hide Abacus" : "Abacus"}
              </button>
            ) : null}

            <div>
              <div className={useExamPageStyling ? "ws-exam-title" : ""} style={{ fontWeight: 700 }}>{worksheetTitle}</div>
              <div style={{ fontSize: 12, marginTop: 6 }} className="muted">
                {useExamPageStyling
                  ? `Worksheet · ${totalQuestions} Questions`
                  : (
                    <>
                      Status: <strong className="attempt-header-strong">{statusText}</strong> · {timerSummaryLabel}: <strong className="attempt-header-strong">{timerText}</strong>
                      {headerScoreText ? (
                        <>
                          {" "}· Score: <strong className="attempt-header-strong">{headerScoreText}</strong>
                        </>
                      ) : null}
                      {" "}· Save: <span className="muted">{headerSaveText || "—"}</span>
                    </>
                  )}
              </div>
              {useExamPageStyling && headerSaveText ? (
                <div style={{ fontSize: 11, marginTop: 2 }} className="muted">Save: {headerSaveText}</div>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div className="ws-countdown-pill">
              {timerLabel}: <strong className="attempt-header-strong" style={{ fontWeight: 700 }}>{timerText}</strong>
            </div>
            {useExamPageStyling ? (
              <button
                className="button ws-end-test"
                style={{ width: "auto" }}
                onClick={() => void onSubmit()}
                disabled={isLocked || submitting || !questionRows.length}
              >
                {isExamWorksheet ? "End Test" : submitting ? "Submitting…" : "Submit"}
              </button>
            ) : null}
          </div>
        </div>

      {!useExamPageStyling ? (
        <div className="card" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Answered: <strong style={{ color: "var(--color-text-primary)" }}>{answeredCount}/{totalQuestions}</strong>
            <span style={{ marginLeft: 10 }}>Flagged: <strong style={{ color: "var(--color-text-primary)" }}>0</strong></span>
          </div>
        </div>
      ) : null}

      {showAbacus ? (
        <div className="card" style={{ overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong style={{ fontSize: 14 }}>🧮 Virtual Abacus</strong>
            <button className="button secondary" type="button" style={{ width: "auto", fontSize: 11, padding: "2px 8px" }} onClick={() => setShowAbacus(false)}>✕ Close</button>
          </div>
          <VirtualAbacus columns={13} fractionalRods={6} />
        </div>
      ) : null}

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      {result ? (
        <div className="card" role="status" aria-live="polite">
          <h3 style={{ marginTop: 0 }}>{result?.status === "TIMED_OUT" ? "Time Up" : "Submitted"}</h3>
          <div style={{ display: "grid", gap: 8 }}>
            <p style={{ margin: 0 }}>
              Score: <strong>{Number.isFinite(Number(result.score)) ? `${result.score}%` : "—"}</strong>
              {Number.isFinite(Number(result.resultBreakdown?.correctCount)) && Number.isFinite(Number(result.total)) ? (
                <>
                  {" "}({result.resultBreakdown.correctCount}/{result.total})
                </>
              ) : null}
            </p>
            <p style={{ margin: 0 }}>
              Taken Time: <strong>{Number.isFinite(Number(submittedAttemptedTime)) ? formatSeconds(submittedAttemptedTime) : timerText}</strong>
            </p>
            {timeLimitSeconds ? (
              <p style={{ margin: 0 }}>
                Total Time: <strong>{totalTimeText}</strong>
              </p>
            ) : null}
            {submittedAtText ? (
              <p style={{ margin: 0 }}>
                Submitted At: <strong>{submittedAtText}</strong>
              </p>
            ) : null}
          </div>

          {!isExamWorksheet ? (
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <h4 style={{ margin: 0 }}>Correct Answers</h4>
              <div style={{ display: "grid", gap: 8 }}>
                {reviewRows.map((row) => (
                  <div key={row.questionId} className="card" style={{ padding: 12, background: row.resultTone.background, borderColor: row.resultTone.borderColor }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <strong>Question {row.questionNumber}</strong>
                      <strong style={{ color: row.resultTone.color }}>{row.resultStatus}</strong>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 14 }}>{row.prompt}</div>
                    <div style={{ marginTop: 8, fontSize: 13 }}>
                      Your Answer: <strong>{formatAnswerValue(row.studentAnswer)}</strong>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13 }}>
                      Correct Answer: <strong>{row.hasKey ? formatAnswerValue(row.correctAnswer) : "—"}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <button
            className="button secondary"
            type="button"
            style={{ width: "auto", marginTop: 10, fontSize: 12 }}
            onClick={handleDownloadPdf}
          >
            📄 Download PDF
          </button>
        </div>
      ) : null}

      {!questionRows.length ? (
        <div className="card">
          <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
            No questions are available for this worksheet yet.
          </p>
        </div>
      ) : null}

      {isColumnSumGrid ? (
        <div className="ws-colsum-grid" aria-label="Worksheet questions">
          {questionRows.map(renderColumnSumCard)}
        </div>
      ) : null}

      {!isColumnSumGrid ? (
        <div style={{ display: "grid", gap: 12 }} aria-label="Worksheet questions">
          {questionRows.map(renderStandardQuestionCard)}
        </div>
      ) : null}

      {!useExamPageStyling ? (
        <div
          className="card"
          style={{
            position: "sticky",
            bottom: 0,
            zIndex: 5,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center"
          }}
        >
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {isLocked ? "Locked" : "Ready"}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              className="button"
              style={{ width: "auto" }}
              onClick={() => void onSubmit()}
              disabled={isLocked || submitting || !questionRows.length}
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>
      ) : null}

      {useExamPageStyling ? (
        <div
          className="card ws-exam-footer"
          style={{
            position: "sticky",
            bottom: 0,
            zIndex: 6,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center"
          }}
        >
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{isLocked ? "Locked" : "Ready"}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              className="button ws-end-test"
              style={{ width: "auto" }}
              onClick={() => void onSubmit()}
              disabled={isLocked || submitting || !questionRows.length}
            >
              {isExamWorksheet ? "End Test" : submitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>
      ) : null}

      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm submit"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16
          }}
        >
          <div className="card" style={{ maxWidth: 420, width: "100%" }}>
            <h3 style={{ marginTop: 0 }}>{isExamWorksheet ? "End test?" : "Submit worksheet?"}</h3>
            <p style={{ marginTop: 0, color: "var(--color-text-muted)" }}>
              You won’t be able to edit answers after {isExamWorksheet ? "ending" : "submitting"}.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button className="button secondary" style={{ width: "auto" }} onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
              <button className="button" style={{ width: "auto" }} onClick={() => void doSubmitConfirmed()}>
                {isExamWorksheet ? "End test" : "Confirm submit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
        </div>
      </div>
    </div>
  );
}

export { StudentWorksheetAttemptPage };
