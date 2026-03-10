import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  startStudentMockTestAttempt,
  submitStudentMockTestAttempt
} from "../../services/studentPortalService";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function formatSeconds(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function buildPrompt(question) {
  if (question?.prompt) {
    return question.prompt;
  }

  const operands = question?.operands && typeof question.operands === "object" ? question.operands : {};
  if (typeof operands.expr === "string" && operands.expr.trim()) {
    return operands.expr.trim();
  }

  if (Array.isArray(operands.nums)) {
    return operands.nums.join(" ");
  }

  return question?.operation || "—";
}

function StudentMockTestAttemptPage() {
  const { mockTestId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [attempt, setAttempt] = useState(null);
  const [mockTest, setMockTest] = useState(null);
  const [answersByQuestionId, setAnswersByQuestionId] = useState({});
  const [result, setResult] = useState(null);

  const [remainingSeconds, setRemainingSeconds] = useState(null);

  const isLocked = useMemo(() => {
    const status = String(attempt?.status || "");
    return status === "SUBMITTED" || status === "TIMED_OUT" || Boolean(result);
  }, [attempt?.status, result]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setResult(null);

    startStudentMockTestAttempt(mockTestId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        const payload = response?.data?.data || null;
        setAttempt({
          attemptId: payload?.attemptId,
          status: payload?.status,
          startedAt: payload?.startedAt,
          endsAt: payload?.endsAt,
          serverNow: payload?.serverNow
        });
        setMockTest(payload?.mockTest || null);
        setAnswersByQuestionId(payload?.answersByQuestionId && typeof payload.answersByQuestionId === "object" ? payload.answersByQuestionId : {});
        if (payload?.submittedResult) {
          setResult(payload.submittedResult);
        }
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setError(getFriendlyErrorMessage(err) || "Failed to start mock test attempt.");
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
  }, [mockTestId]);

  useEffect(() => {
    const endsAt = attempt?.endsAt ? new Date(attempt.endsAt) : null;
    if (!endsAt || Number.isNaN(endsAt.getTime())) {
      setRemainingSeconds(null);
      return;
    }

    const tick = () => {
      const remain = Math.max(0, Math.floor((endsAt.getTime() - Date.now()) / 1000));
      setRemainingSeconds(remain);
      if (remain === 0 && String(attempt?.status || "") === "IN_PROGRESS") {
        setAttempt((prev) => (prev ? { ...prev, status: "TIMED_OUT" } : prev));
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [attempt?.endsAt, attempt?.status]);

  const questions = Array.isArray(mockTest?.questions) ? mockTest.questions : [];

  const onSubmit = async () => {
    if (!mockTestId || isLocked) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await submitStudentMockTestAttempt(mockTestId, { answersByQuestionId });
      const payload = response?.data?.data || null;
      setAttempt((prev) => (prev ? { ...prev, status: payload?.status || prev.status } : prev));
      setResult({
        status: payload?.status,
        marks: payload?.marks,
        maxMarks: payload?.maxMarks,
        percentage: payload?.percentage,
        correctCount: payload?.correctCount,
        totalQuestions: payload?.totalQuestions,
        submittedAt: payload?.submittedAt
      });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to submit mock test.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading mock test attempt..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>{mockTest?.title || "Mock Test Attempt"}</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Max Marks: {mockTest?.maxMarks ?? "—"}
            {mockTest?.timeLimitSeconds ? ` • Time Limit: ${formatSeconds(mockTest.timeLimitSeconds)}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {remainingSeconds !== null ? (
            <div className="card" style={{ padding: "6px 10px", fontWeight: 700 }}>
              Time Left: {formatSeconds(remainingSeconds)}
            </div>
          ) : null}
          <button className="button secondary" style={{ width: "auto" }} onClick={() => navigate("/student/mock-tests")}>
            Back
          </button>
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      {result ? (
        <div className="card" style={{ display: "grid", gap: 6 }}>
          <h3 style={{ margin: 0 }}>Result</h3>
          <div><strong>Status:</strong> {result.status || "—"}</div>
          <div><strong>Marks:</strong> {result.marks == null ? "—" : `${result.marks} / ${result.maxMarks ?? mockTest?.maxMarks ?? "—"}`}</div>
          <div><strong>Percentage:</strong> {result.percentage == null ? "—" : `${result.percentage}%`}</div>
          <div><strong>Correct:</strong> {result.correctCount == null ? "—" : `${result.correctCount} / ${result.totalQuestions ?? "—"}`}</div>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Questions</h3>
        {!questions.length ? <div style={{ color: "var(--color-text-muted)" }}>No questions configured.</div> : null}

        {questions.map((question) => {
          const questionId = question.questionId;
          return (
            <div key={questionId} style={{ display: "grid", gap: 8, borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
              <div style={{ fontWeight: 700 }}>Q{question.questionNumber}</div>
              <div>{buildPrompt(question)}</div>
              <input
                className="input"
                inputMode="numeric"
                placeholder="Enter answer"
                value={answersByQuestionId?.[questionId]?.value ?? ""}
                disabled={isLocked}
                onChange={(e) => {
                  const value = e.target.value;
                  setAnswersByQuestionId((prev) => ({
                    ...prev,
                    [questionId]: { value }
                  }));
                }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="button" disabled={submitting || isLocked || !questions.length} onClick={onSubmit}>
          {submitting ? "Submitting..." : "Submit Mock Test"}
        </button>
      </div>
    </section>
  );
}

export { StudentMockTestAttemptPage };
