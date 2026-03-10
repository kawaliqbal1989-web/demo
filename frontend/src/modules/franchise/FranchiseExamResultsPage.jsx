import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { downloadBlob } from "../../utils/downloadBlob";
import { getExamResults, exportExamResultsCsv } from "../../services/examCyclesService";

function FranchiseExamResultsPage() {
  const { examCycleId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [resultStatus, setResultStatus] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getExamResults(examCycleId);
      setRows(data?.data?.results || []);
      setResultStatus(String(data?.data?.status || ""));
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load results.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [examCycleId]);

  const handleExport = async () => {
    try {
      const resp = await exportExamResultsCsv(examCycleId);
      downloadBlob(resp.data, `exam_results_${examCycleId}.csv`);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Export failed.");
    }
  };

  if (loading) {
    return <LoadingState label="Loading results..." />;
  }

  const columns = [
    { key: "studentName", header: "Student", render: (r) => r.studentName || r.student?.name || "" },
    { key: "center", header: "Center", render: (r) => r.centerName || r.center?.name || "" },
    { key: "level", header: "Level", render: (r) => r.levelName || r.level?.name || "" },
    { key: "score", header: "Score", render: (r) => String(r.score ?? r.totalScore ?? "") },
    { key: "maxScore", header: "Max", render: (r) => String(r.maxScore ?? "") },
    { key: "percentage", header: "%", render: (r) => r.percentage != null ? `${r.percentage}%` : "" },
    { key: "grade", header: "Grade", render: (r) => r.grade || "" },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status || resultStatus} /> }
  ];

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Exam Results</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Status: <StatusBadge status={resultStatus || "PENDING"} /> &nbsp;|&nbsp; Count: {rows.length}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button secondary" type="button" onClick={handleExport} style={{ width: "auto" }}>
            Export CSV
          </button>
          <button className="button secondary" type="button" onClick={() => void load()} style={{ width: "auto" }}>
            Refresh
          </button>
          <button className="button secondary" type="button" onClick={() => navigate(-1)} style={{ width: "auto" }}>
            Back
          </button>
        </div>
      </div>

      {error ? (
        <div className="card"><p className="error" style={{ margin: 0 }}>{error}</p></div>
      ) : null}

      <div className="card" style={{ overflow: "auto" }}>
        <DataTable columns={columns} rows={rows} keyField="id" />
      </div>
    </section>
  );
}

export { FranchiseExamResultsPage };
