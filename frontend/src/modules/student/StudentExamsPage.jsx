import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listStudentExamsOverview } from "../../services/studentPortalService";

function formatStatus(value) {
  if (!value) return "—";
  if (value === "APPROVED") return "Approved";
  if (value === "REJECTED") return "Rejected";
  if (value === "NOT_SELECTED") return "Not Selected by Center";
  if (value === "NOT_IN_COMBINED_LIST") return "Pending (Center not prepared)";
  if (value === "SUBMITTED_TO_FRANCHISE") return "Submitted to Franchise";
  if (value === "SUBMITTED_TO_BUSINESS_PARTNER") return "Submitted to BP";
  if (value === "SUBMITTED_TO_SUPERADMIN") return "Submitted to Superadmin";
  if (value === "SUBMITTED_TO_CENTER") return "Submitted to Center";
  return String(value);
}

function computeExamAvailability(examCycle) {
  const es = examCycle?.examStartsAt ? new Date(examCycle.examStartsAt) : null;
  const ee = examCycle?.examEndsAt ? new Date(examCycle.examEndsAt) : null;
  const now = new Date();
  if (!es || Number.isNaN(es.getTime()) || !ee || Number.isNaN(ee.getTime())) return { canStart: false, label: "—" };
  if (now.getTime() < es.getTime()) return { canStart: false, label: "Not live" };
  if (now.getTime() > ee.getTime()) return { canStart: false, label: "Closed" };
  return { canStart: true, label: null };
}

function formatWsActionLabel(ws) {
  if (!ws) return "—";
  if (ws.status === "IN_PROGRESS") return "Resume";
  if (ws.status === "SUBMITTED") return "View";
  return "Start";
}

function StudentExamsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    listStudentExamsOverview()
      .then((res) => {
        if (cancelled) return;
        const data = Array.isArray(res.data?.data) ? res.data.data : [];
        setRows(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getFriendlyErrorMessage(err) || "Failed to load exams.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <LoadingState label="Loading exams..." />;
  }

  return (
    <section className="dash-section">
      <div className="dash-header">
        <div>
          <h2 style={{ margin: 0 }}>My Exams</h2>
          <div className="dash-card__subtitle" style={{ marginTop: 6 }}>
            Exam enrollment status and assigned worksheets.
          </div>
        </div>
      </div>

      <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div className="muted" style={{ fontSize: 12 }}>
          Practice is available via Abacus Practice (Auto).
        </div>
        <div style={{ flex: 1 }} />
        <Link className="button secondary" style={{ width: "auto" }} to="/student/abacus-practice">
          Abacus Practice (Auto)
        </Link>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      <div className="card dash-card">
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Exam</th>
                <th>Status</th>
                <th>Exam</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => {
                  const exam = r?.examWorksheet;
                  const canViewResult = r?.examCycle?.resultStatus === "PUBLISHED";
                  const examAvail = computeExamAvailability(r?.examCycle);

                  return (
                    <tr key={r.entryId}>
                      <td>{r?.examCycle ? `${r.examCycle.name} (${r.examCycle.code})` : "—"}</td>
                      <td>{formatStatus(r?.enrollmentStatus)}</td>

                      <td>
                        {exam?.worksheetId && examAvail.canStart ? (
                          <Link className="button" style={{ width: "auto" }} to={`/student/worksheets/${exam.worksheetId}`}>
                            {formatWsActionLabel(exam)}
                          </Link>
                        ) : exam?.worksheetId ? (
                          <button className="button" style={{ width: "auto" }} type="button" disabled>
                            {examAvail.label || "Unavailable"}
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>

                      <td>
                        {canViewResult ? (
                          <Link className="button secondary" style={{ width: "auto" }} to={`/student/exams/${r.examCycleId}/result`}>
                            View
                          </Link>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="muted">
                    —
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export { StudentExamsPage };
