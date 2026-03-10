import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { getStudentExamResult } from "../../services/studentPortalService";

function StudentExamResultPage() {
  const { examCycleId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    getStudentExamResult(examCycleId)
      .then((res) => {
        if (cancelled) return;
        setPayload(res.data?.data || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getFriendlyErrorMessage(err) || "Failed to load exam result.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [examCycleId]);

  if (loading) {
    return <LoadingState label="Loading exam result..." />;
  }

  const exam = payload?.examCycle;
  const sub = payload?.submission;

  return (
    <section className="dash-section" style={{ display: "grid", gap: 12 }}>
      <div className="dash-header">
        <div>
          <h2 style={{ margin: 0 }}>Exam Result</h2>
          <div className="dash-card__subtitle" style={{ marginTop: 6 }}>
            {exam ? `${exam.name} (${exam.code})` : "—"}
          </div>
        </div>

        <div className="dash-header__actions">
          <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      <div className="card dash-card">
        <div className="info-grid">
          <div className="info-grid__label">Status</div>
          <div className="info-grid__value">{exam?.resultStatus || "—"}</div>

          <div className="info-grid__label">Submitted At</div>
          <div className="info-grid__value">
            {sub?.finalSubmittedAt ? new Date(sub.finalSubmittedAt).toLocaleString() : "—"}
          </div>

          <div className="info-grid__label">Score</div>
          <div className="info-grid__value">{sub?.score == null ? "—" : `${sub.score}%`}</div>

          <div className="info-grid__label">Correct</div>
          <div className="info-grid__value">{sub?.correctCount ?? "—"}</div>

          <div className="info-grid__label">Total Questions</div>
          <div className="info-grid__value">{sub?.totalQuestions ?? "—"}</div>

          <div className="info-grid__label">Time (seconds)</div>
          <div className="info-grid__value">{sub?.completionTimeSeconds ?? "—"}</div>
        </div>
      </div>
    </section>
  );
}

export { StudentExamResultPage };
