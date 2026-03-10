import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { getTeacherStudentPracticeReport } from "../../services/teacherPortalService";

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function TeacherStudentPracticeReportPage() {
  const { studentId } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    getTeacherStudentPracticeReport(studentId, { limit: 100 })
      .then((res) => {
        if (cancelled) return;
        setData(res?.data || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getFriendlyErrorMessage(err) || "Failed to load practice report.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (loading) {
    return <LoadingState label="Loading practice report..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Practice Report</h2>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {data?.student ? `Student: ${data.student.fullName} (${data.student.admissionNo})` : "Student practice report"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link className="button secondary" style={{ width: "auto" }} to="/teacher/students">
          Back to Students
        </Link>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <div className="card" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div><strong>Total Attempts</strong>: {data?.totalAttempts ?? 0}</div>
        <div><strong>Avg Score</strong>: {data?.avgScore ?? "—"}</div>
        <div><strong>Min Score</strong>: {data?.minScore ?? "—"}</div>
        <div><strong>Max Score</strong>: {data?.maxScore ?? "—"}</div>
      </div>

      <DataTable
        columns={[
          { key: "worksheetTitle", header: "Worksheet", render: (r) => r.worksheetTitle || "—" },
          { key: "score", header: "Score", render: (r) => (r.score === null || r.score === undefined ? "—" : r.score) },
          {
            key: "correct",
            header: "Correct/Total",
            render: (r) => (r.correctCount === null || r.total === null ? "—" : `${r.correctCount}/${r.total}`)
          },
          { key: "submittedAt", header: "Submitted", render: (r) => formatDateTime(r.submittedAt) }
        ]}
        rows={Array.isArray(data?.recent) ? data.recent : []}
        keyField="worksheetId"
      />
    </section>
  );
}

export { TeacherStudentPracticeReportPage };
