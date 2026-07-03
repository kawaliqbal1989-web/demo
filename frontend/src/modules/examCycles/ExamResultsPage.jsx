import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { downloadBlob } from "../../utils/downloadBlob";
import { exportExamResultsCsv, getExamResults } from "../../services/examCyclesService";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatDuration(value) {
  if (value === null || value === undefined || value === "") return "-";
  const totalSeconds = Math.max(0, Math.floor(Number(value)));
  if (!Number.isFinite(totalSeconds)) return "-";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function ExamResultsPage({ title = "Exam Results", subtitle = "Scoped exam result visibility." }) {
  const { examCycleId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [resultStatus, setResultStatus] = useState("");
  const [resultRules, setResultRules] = useState(null);
  const [search, setSearch] = useState("");
  const [candidateFilter, setCandidateFilter] = useState("ALL");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getExamResults(examCycleId);
      setRows(data?.data?.results || []);
      setResultStatus(String(data?.data?.status || ""));
      setResultRules(data?.data?.resultRules || null);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load results.");
      setRows([]);
      setResultStatus("");
      setResultRules(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examCycleId]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const candidateStatus = String(row?.candidateStatus || row?.status || "").toUpperCase();
      if (candidateFilter !== "ALL" && candidateStatus !== candidateFilter) return false;
      if (!q) return true;
      return [
        row?.studentName,
        row?.admissionNo,
        row?.centerName,
        row?.teacherName,
        row?.levelName,
        row?.rank,
        candidateStatus
      ].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [rows, search, candidateFilter]);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row?.submittedAt) acc.submitted += 1;
        if (String(row?.resultOutcome || "").toUpperCase() === "SCORED") acc.scored += 1;
        if (row?.rank !== null && row?.rank !== undefined) acc.ranked += 1;
        if (row?.isLateEnrollment) acc.late += 1;
        if (String(row?.candidateStatus || "").toUpperCase() === "ABSENT") acc.absent += 1;
        return acc;
      },
      { total: 0, submitted: 0, scored: 0, ranked: 0, late: 0, absent: 0 }
    );
  }, [rows]);

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
    { key: "rank", header: "Rank", render: (row) => row.rank != null ? `#${row.rank}` : "-" },
    {
      key: "student",
      header: "Student",
      render: (row) => (
        <div style={{ display: "grid", gap: 2 }}>
          <strong>{row.studentName || row.student?.name || "-"}</strong>
          <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{row.admissionNo || "-"}</span>
        </div>
      )
    },
    { key: "center", header: "Center", render: (row) => row.centerName || row.center?.name || "-" },
    { key: "teacher", header: "Teacher", render: (row) => row.teacherName || "-" },
    { key: "level", header: "Level", render: (row) => row.levelName || row.level?.name || "-" },
    { key: "enrollmentType", header: "Enrollment", render: (row) => row.isLateEnrollment ? "Late Enrollment" : "Regular" },
    {
      key: "score",
      header: "Score",
      render: (row) => row.correctCount != null && row.totalQuestions != null
        ? `${row.correctCount}/${row.totalQuestions}`
        : String(row.score ?? row.totalScore ?? "-")
    },
    { key: "percentage", header: "Accuracy", render: (row) => row.percentage != null ? `${row.percentage}%` : "-" },
    { key: "answers", header: "Wrong / Unanswered", render: (row) => `${row.wrongCount ?? "-"}/${row.unansweredCount ?? "-"}` },
    { key: "time", header: "Time", render: (row) => formatDuration(row.completionTimeSeconds) },
    { key: "state", header: "Result State", render: (row) => <StatusBadge status={row.resultOutcome || "PENDING"} /> },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.candidateStatus || row.status || resultStatus || "PENDING"} /> },
    { key: "submittedAt", header: "Submitted", render: (row) => formatDateTime(row.submittedAt) }
  ];

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>{subtitle}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
            Status: <StatusBadge status={resultStatus || "PENDING"} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {[
          ["Candidates", summary.total],
          ["Submitted", summary.submitted],
          ["Scored", summary.scored],
          ["Ranked", summary.ranked],
          ["Late Enrollment", summary.late],
          ["Absent", summary.absent]
        ].map(([label, value]) => (
          <div key={label} className="card" style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 800 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{Number(value || 0).toLocaleString()}</div>
          </div>
        ))}
      </div>

      {Array.isArray(resultRules?.rankingOrder) && resultRules.rankingOrder.length ? (
        <div className="card" style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          Ranking rule: {resultRules.rankingOrder.join(" -> ")}. Result state uses scored, pending, absent, and in-progress states.
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Search
            <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Student, center, teacher, level" />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Candidate Status
            <select className="input" value={candidateFilter} onChange={(event) => setCandidateFilter(event.target.value)}>
              <option value="ALL">All statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="TIMED_OUT">Timed out</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="ABSENT">Absent</option>
            </select>
          </label>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto" }}
            onClick={() => {
              setSearch("");
              setCandidateFilter("ALL");
            }}
          >
            Reset
          </button>
        </div>
        <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Showing {visibleRows.length} of {rows.length} result rows.</div>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <div className="card" style={{ overflow: "auto" }}>
        <DataTable
          columns={columns}
          rows={visibleRows}
          keyField={(row, index) => row.id || `${row.studentId || row.admissionNo || "result"}-${row.enrolledLevelId || index}`}
          emptyMessage={error ? "Results are not available for this role yet." : "No result rows match the selected filters."}
        />
      </div>
    </section>
  );
}

export { ExamResultsPage };