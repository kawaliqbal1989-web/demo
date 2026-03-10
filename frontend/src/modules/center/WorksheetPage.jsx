import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { getWorksheet } from "../../services/worksheetsService";

function WorksheetPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [worksheet, setWorksheet] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    getWorksheet(id)
      .then((res) => {
        if (cancelled) return;
        setWorksheet(res?.data || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getFriendlyErrorMessage(err) || "Failed to load worksheet.");
        setWorksheet(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const questions = useMemo(() => {
    const rows = Array.isArray(worksheet?.questions) ? worksheet.questions : [];
    return rows.slice().sort((a, b) => (a.questionNumber ?? 0) - (b.questionNumber ?? 0));
  }, [worksheet]);

  if (loading) {
    return <LoadingState label="Loading worksheet..." />;
  }

  return (
    <section className="dash-section">
      <div className="dash-header">
        <div>
          <h2 style={{ margin: 0 }}>{worksheet?.title || "Worksheet"}</h2>
          <div className="dash-card__subtitle" style={{ marginTop: 6 }}>
            {worksheet?.level?.rank ? `Level ${worksheet.level.rank}` : ""}
            {worksheet?.level?.name ? ` · ${worksheet.level.name}` : ""}
            {worksheet?.isPublished ? " · PUBLISHED" : " · DRAFT"}
          </div>
        </div>

        <div className="dash-header__actions">
          <button className="button secondary" style={{ width: "auto" }} onClick={() => navigate(-1)}>
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
        <div className="dash-card__title">Questions</div>

        {questions.length ? (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Question</th>
                  <th>Correct</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => {
                  const operands = q.operands && typeof q.operands === "object" ? q.operands : {};
                  const a = operands.a ?? operands.left ?? operands.x ?? "";
                  const b = operands.b ?? operands.right ?? operands.y ?? "";
                  const prompt = `${a} ${q.operation} ${b}`.trim();

                  return (
                    <tr key={q.id}>
                      <td>{q.questionNumber}</td>
                      <td>{prompt}</td>
                      <td>{q.correctAnswer ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="muted">No questions found for this worksheet.</div>
        )}
      </div>
    </section>
  );
}

export { WorksheetPage };
