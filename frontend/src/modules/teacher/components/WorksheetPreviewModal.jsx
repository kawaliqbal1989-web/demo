import { LoadingState } from "../../../components/LoadingState";
import { formatWorksheetQuestionPreview } from "../../../utils/worksheetQuestionPreview";

function formatTimeLimit(timeLimitSeconds) {
  const seconds = Number(timeLimitSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "No time limit";
  }
  if (seconds % 60 === 0) {
    return `${Math.floor(seconds / 60)} min`;
  }
  return `${seconds}s`;
}

function WorksheetPreviewModal({ open, loading, error, worksheet, onClose }) {
  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="modal-panel"
        style={{ maxWidth: 920, width: "96vw", maxHeight: "88vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-panel__header">
          <h3 className="modal-panel__title">Worksheet Preview</h3>
          <button className="modal-panel__close" onClick={onClose} aria-label="Close">
            x
          </button>
        </div>
        <div className="modal-panel__body" style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Read-only preview. This does not assign worksheets and does not modify worksheet state.
          </div>

          {loading ? <LoadingState label="Loading worksheet preview..." /> : null}
          {!loading && error ? <div className="error">{error}</div> : null}

          {!loading && !error && worksheet ? (
            <>
              <div
                className="card"
                style={{ margin: 0, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
              >
                <div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase" }}>Worksheet title</div>
                  <div style={{ fontWeight: 600 }}>{worksheet.title || "Untitled Worksheet"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase" }}>Course</div>
                  <div>{worksheet.__courseLabel || "N/A"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase" }}>Level</div>
                  <div>{worksheet.__levelLabel || "N/A"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase" }}>Status</div>
                  <div>{worksheet.__statusLabel || "DRAFT"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase" }}>Question count</div>
                  <div>{worksheet.questions?.length || 0}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase" }}>Difficulty</div>
                  <div>{worksheet.difficulty || "N/A"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase" }}>Time limit</div>
                  <div>{formatTimeLimit(worksheet.timeLimitSeconds)}</div>
                </div>
              </div>

              <div className="card" style={{ margin: 0 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", marginBottom: 6 }}>
                  Worksheet description
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{worksheet.description || "No description available."}</div>
              </div>

              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Question</th>
                      <th>Difficulty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(worksheet.questions || []).map((question, index) => (
                      <tr key={question.id || `${index + 1}`}>
                        <td>{question.questionNumber || index + 1}</td>
                        <td>{formatWorksheetQuestionPreview(question)}</td>
                        <td>{question?.questionBank?.difficulty || worksheet.difficulty || "N/A"}</td>
                      </tr>
                    ))}
                    {!worksheet.questions?.length ? (
                      <tr>
                        <td colSpan={3} style={{ color: "var(--color-text-muted)" }}>
                          No questions available.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export { WorksheetPreviewModal };