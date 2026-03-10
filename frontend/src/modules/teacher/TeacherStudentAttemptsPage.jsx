import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { downloadBlob } from "../../utils/downloadBlob";
import { exportTeacherStudentAttemptsCsv, getTeacherStudentAttempts } from "../../services/teacherPortalService";

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatScore(row) {
  if (row.score === null || row.score === undefined) return "—";
  if (row.correctCount !== null && row.correctCount !== undefined && row.totalQuestions !== null && row.totalQuestions !== undefined) {
    return `${row.score} (${row.correctCount}/${row.totalQuestions})`;
  }
  return String(row.score);
}

function formatResult(row) {
  if (row.passed === true) return "PASSED";
  if (row.passed === false) return "FAILED";
  return row.status || "—";
}

function TeacherStudentAttemptsPage() {
  const { studentId } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [passedFilter, setPassedFilter] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = async ({
    nextLimit = limit,
    nextOffset = offset,
    nextStatus = statusFilter,
    nextPassed = passedFilter,
    nextFrom = fromDate,
    nextTo = toDate
  } = {}) => {
    setLoading(true);
    setError("");
    try {
      const res = await getTeacherStudentAttempts(studentId, {
        limit: nextLimit,
        offset: nextOffset,
        status: nextStatus === "ALL" ? undefined : nextStatus,
        passed: nextPassed === "ALL" ? undefined : nextPassed,
        from: nextFrom || undefined,
        to: nextTo || undefined
      });
      setData(res?.data || null);
      setLimit(nextLimit);
      setOffset(nextOffset);
      setStatusFilter(nextStatus);
      setPassedFilter(nextPassed);
      setFromDate(nextFrom);
      setToDate(nextTo);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load attempts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ nextLimit: 50, nextOffset: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const onExport = async () => {
    setExporting(true);
    setError("");
    try {
      const resp = await exportTeacherStudentAttemptsCsv(studentId, {
        limit,
        offset,
        status: statusFilter === "ALL" ? undefined : statusFilter,
        passed: passedFilter === "ALL" ? undefined : passedFilter,
        from: fromDate || undefined,
        to: toDate || undefined
      });
      const studentCode = data?.student?.admissionNo || studentId;
      downloadBlob(resp.data, `teacher_student_attempts_${studentCode}.csv`);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to export attempts CSV.");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading attempts..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Attempts</h2>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {data?.student ? `Student: ${data.student.fullName} (${data.student.admissionNo})` : "Student attempts"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link className="button secondary" style={{ width: "auto" }} to="/teacher/students">
          Back to Students
        </Link>
        <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => void onExport()} disabled={exporting}>
          {exporting ? "Exporting..." : "Export CSV"}
        </button>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Status</label>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="PENDING">PENDING</option>
              <option value="REVIEWED">REVIEWED</option>
              <option value="REJECTED">REJECTED</option>
            </select>
          </div>

          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Passed</label>
            <select className="input" value={passedFilter} onChange={(e) => setPassedFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="true">Passed</option>
              <option value="false">Not Passed</option>
            </select>
          </div>

          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>From</label>
            <input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>

          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>To</label>
            <input className="input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>

          <button
            className="button"
            type="button"
            style={{ width: "auto" }}
            onClick={() =>
              void load({
                nextLimit: limit,
                nextOffset: 0,
                nextStatus: statusFilter,
                nextPassed: passedFilter,
                nextFrom: fromDate,
                nextTo: toDate
              })
            }
          >
            Apply
          </button>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto" }}
            onClick={() =>
              void load({
                nextLimit: limit,
                nextOffset: 0,
                nextStatus: "ALL",
                nextPassed: "ALL",
                nextFrom: "",
                nextTo: ""
              })
            }
          >
            Reset
          </button>
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <DataTable
        columns={[
          { key: "worksheet", header: "Worksheet", render: (r) => r.worksheetTitle || "—" },
          { key: "difficulty", header: "Difficulty", render: (r) => r.difficulty || "—" },
          { key: "score", header: "Score", render: (r) => formatScore(r) },
          { key: "result", header: "Result", render: (r) => formatResult(r) },
          { key: "submitted", header: "Submitted", render: (r) => formatDateTime(r.submittedAt) }
        ]}
        rows={Array.isArray(data?.items) ? data.items : []}
        keyField="id"
      />

      <PaginationBar
        limit={limit}
        offset={offset}
        count={Array.isArray(data?.items) ? data.items.length : 0}
        total={typeof data?.total === "number" ? data.total : undefined}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load({
            nextLimit: next.limit,
            nextOffset: next.offset,
            nextStatus: statusFilter,
            nextPassed: passedFilter,
            nextFrom: fromDate,
            nextTo: toDate
          });
        }}
      />
    </section>
  );
}

export { TeacherStudentAttemptsPage };
