import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listStudentExamsOverview } from "../../services/studentPortalService";

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatDuration(seconds) {
  const safe = Number.isFinite(Number(seconds)) ? Math.max(0, Math.floor(Number(seconds))) : null;
  if (safe === null) return "-";
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  if (remainder === 0) return `${minutes} min`;
  return `${minutes}m ${remainder}s`;
}

function toLabel(value) {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part[0] + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeEnrollmentStatus(value) {
  if (!value) return "UNKNOWN";
  if (value === "NOT_SELECTED") return "NOT_SELECTED";
  if (value === "NOT_IN_COMBINED_LIST") return "NOT_IN_COMBINED_LIST";
  return String(value).toUpperCase();
}

function normalizeAttemptStatus(value) {
  const status = String(value || "NOT_STARTED").toUpperCase();
  if (["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "TIMED_OUT"].includes(status)) {
    return status;
  }
  return "NOT_STARTED";
}

function getScheduleStatus(examCycle) {
  const start = examCycle?.examStartsAt ? new Date(examCycle.examStartsAt).getTime() : null;
  const end = examCycle?.examEndsAt ? new Date(examCycle.examEndsAt).getTime() : null;
  const now = Date.now();

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "UNKNOWN";
  }
  if (now < start) return "UPCOMING";
  if (now > end) return "CLOSED";
  return "OPEN";
}

function StatusPill({ label, tone = "neutral" }) {
  const palette = {
    success: { bg: "#dcfce7", border: "#bbf7d0", text: "#166534" },
    info: { bg: "#dbeafe", border: "#bfdbfe", text: "#1d4ed8" },
    warning: { bg: "#fef3c7", border: "#fde68a", text: "#92400e" },
    danger: { bg: "#fee2e2", border: "#fecaca", text: "#991b1b" },
    neutral: { bg: "#f3f4f6", border: "#e5e7eb", text: "#374151" }
  };
  const theme = palette[tone] || palette.neutral;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        border: `1px solid ${theme.border}`,
        background: theme.bg,
        color: theme.text,
        whiteSpace: "nowrap"
      }}
    >
      {label}
    </span>
  );
}

function SummaryCard({ label, value, hint, tone = "#2563eb" }) {
  return (
    <div className="card" style={{ display: "grid", gap: 6, minHeight: 104, borderTop: `3px solid ${tone}` }}>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 800 }}>{value}</div>
      {hint ? <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{hint}</div> : null}
    </div>
  );
}

function StudentExamsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [examStatusFilter, setExamStatusFilter] = useState("ALL");
  const [attemptStatusFilter, setAttemptStatusFilter] = useState("ALL");
  const [resultStatusFilter, setResultStatusFilter] = useState("ALL");

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

  const enhancedRows = useMemo(
    () =>
      rows.map((row) => {
        const examWorksheet = row?.examWorksheet || null;
        const examCycle = row?.examCycle || null;
        const assignmentStatus = examWorksheet ? "ASSIGNED" : "NOT_ASSIGNED";
        const attemptStatus = examWorksheet ? normalizeAttemptStatus(examWorksheet?.status) : "NONE";
        const scheduleStatus = getScheduleStatus(examCycle);
        const resultStatus = String(examCycle?.resultStatus || "").toUpperCase() === "PUBLISHED" ? "PUBLISHED" : "NOT_PUBLISHED";

        return {
          ...row,
          examWorksheet,
          assignmentStatus,
          attemptStatus,
          scheduleStatus,
          resultStatus,
          enrollmentStatusNormalized: normalizeEnrollmentStatus(row?.enrollmentStatus)
        };
      }),
    [rows]
  );

  const summary = useMemo(() => {
    const assignedExams = enhancedRows.filter((row) => row.assignmentStatus === "ASSIGNED").length;
    const readyToStart = enhancedRows.filter((row) => row.assignmentStatus === "ASSIGNED" && row.scheduleStatus === "OPEN" && row.attemptStatus === "NOT_STARTED").length;
    const inProgress = enhancedRows.filter((row) => row.attemptStatus === "IN_PROGRESS").length;
    const submitted = enhancedRows.filter((row) => ["SUBMITTED", "TIMED_OUT"].includes(row.attemptStatus)).length;
    const resultsPublished = enhancedRows.filter((row) => row.resultStatus === "PUBLISHED").length;
    const upcoming = enhancedRows.filter((row) => row.assignmentStatus === "ASSIGNED" && row.scheduleStatus === "UPCOMING").length;
    const closed = enhancedRows.filter((row) => row.assignmentStatus === "ASSIGNED" && row.scheduleStatus === "CLOSED").length;

    return {
      assignedExams,
      readyToStart,
      inProgress,
      submitted,
      resultsPublished,
      upcoming,
      closed
    };
  }, [enhancedRows]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return enhancedRows.filter((row) => {
      if (examStatusFilter !== "ALL") {
        if (examStatusFilter === "ASSIGNED" && row.assignmentStatus !== "ASSIGNED") return false;
        if (examStatusFilter === "NOT_ASSIGNED" && row.assignmentStatus !== "NOT_ASSIGNED") return false;
        if (["UPCOMING", "OPEN", "CLOSED"].includes(examStatusFilter) && row.scheduleStatus !== examStatusFilter) return false;
      }

      if (attemptStatusFilter !== "ALL" && row.attemptStatus !== attemptStatusFilter) {
        return false;
      }

      if (resultStatusFilter !== "ALL" && row.resultStatus !== resultStatusFilter) {
        return false;
      }

      if (!query) return true;
      return [
        row?.examCycle?.name,
        row?.examCycle?.code,
        row?.examWorksheet?.title,
        row?.assignmentStatus,
        row?.attemptStatus,
        row?.resultStatus
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [enhancedRows, searchQuery, examStatusFilter, attemptStatusFilter, resultStatusFilter]);

  const noEnrollment = !loading && !error && enhancedRows.length === 0;
  const enrolledNoAssignment =
    !loading &&
    !error &&
    enhancedRows.length > 0 &&
    enhancedRows.every((row) => row.assignmentStatus === "NOT_ASSIGNED");

  if (loading) return <LoadingState label="Loading exams..." />;

  return (
    <section className="dash-section" style={{ display: "grid", gap: 12 }}>
      <div className="dash-header">
        <div>
          <h2 style={{ margin: 0 }}>My Exams</h2>
          <div className="dash-card__subtitle" style={{ marginTop: 6 }}>
            View your assigned Exams, attempt status, schedules, and published results.
          </div>
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Abacus Practice</div>
        <div className="muted" style={{ fontSize: 12 }}>
          Practice is separate from official Exams and does not affect official Exam attempt status.
        </div>
        <div>
          <Link className="button secondary" style={{ width: "auto" }} to="/student/abacus-practice">
            Abacus Practice (Auto)
          </Link>
        </div>
      </div>

      {!error ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <SummaryCard label="Assigned Exams" value={summary.assignedExams} tone="#2563eb" />
          <SummaryCard label="Ready to Start" value={summary.readyToStart} tone="#0284c7" />
          <SummaryCard label="In Progress" value={summary.inProgress} tone="#16a34a" />
          <SummaryCard label="Submitted" value={summary.submitted} tone="#0f766e" />
          <SummaryCard label="Results Published" value={summary.resultsPublished} tone="#7c3aed" />
          <SummaryCard label="Upcoming" value={summary.upcoming} tone="#f59e0b" />
          <SummaryCard label="Closed" value={summary.closed} tone="#6b7280" />
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13, flex: "1 1 240px", minWidth: 0 }}>
            Search
            <input
              className="input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Exam name, code, or worksheet"
            />
          </label>

          <label style={{ display: "grid", gap: 4, fontSize: 13, flex: "1 1 150px", minWidth: 0 }}>
            Exam Status
            <select className="input" value={examStatusFilter} onChange={(event) => setExamStatusFilter(event.target.value)}>
              <option value="ALL">All</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="NOT_ASSIGNED">Not Assigned</option>
              <option value="UPCOMING">Upcoming</option>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 4, fontSize: 13, flex: "1 1 150px", minWidth: 0 }}>
            Attempt Status
            <select className="input" value={attemptStatusFilter} onChange={(event) => setAttemptStatusFilter(event.target.value)}>
              <option value="ALL">All</option>
              <option value="NOT_STARTED">Not Started</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="TIMED_OUT">Timed Out</option>
              <option value="NONE">No Attempt</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 4, fontSize: 13, flex: "1 1 150px", minWidth: 0 }}>
            Result Status
            <select className="input" value={resultStatusFilter} onChange={(event) => setResultStatusFilter(event.target.value)}>
              <option value="ALL">All</option>
              <option value="NOT_PUBLISHED">Not Published</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </label>

          <button
            className="button secondary"
            type="button"
            style={{ width: "auto" }}
            onClick={() => {
              setSearchQuery("");
              setExamStatusFilter("ALL");
              setAttemptStatusFilter("ALL");
              setResultStatusFilter("ALL");
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            Unable to load Exams. Please refresh or try again. {error}
          </p>
        </div>
      ) : noEnrollment ? (
        <div className="card">
          <p style={{ margin: 0 }}>You are not currently enrolled in any Exams.</p>
        </div>
      ) : enrolledNoAssignment ? (
        <div className="card">
          <p style={{ margin: 0 }}>Your Exam enrollment is approved, but the worksheet has not been assigned yet.</p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0 }}>No Exams match the selected filters.</p>
        </div>
      ) : null}

      {!error && filteredRows.length > 0 ? (
        <div className="card dash-card" style={{ overflowX: "auto" }}>
          <DataTable
            keyField="entryId"
            rows={filteredRows}
            columns={[
              {
                key: "exam",
                header: "Exam",
                render: (r) => (
                  <div style={{ display: "grid", gap: 2 }}>
                    <strong>{r?.examCycle?.name || "-"}</strong>
                    <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{r?.examCycle?.code || "-"}</span>
                    {r?.examWorksheet?.title ? (
                      <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{r.examWorksheet.title}</span>
                    ) : null}
                  </div>
                )
              },
              {
                key: "schedule",
                header: "Schedule",
                render: (r) => (
                  <div style={{ display: "grid", gap: 3 }}>
                    <span>Start: {formatDateTime(r?.examCycle?.examStartsAt)}</span>
                    <span>End: {formatDateTime(r?.examCycle?.examEndsAt)}</span>
                    <StatusPill
                      label={toLabel(r.scheduleStatus)}
                      tone={r.scheduleStatus === "OPEN" ? "success" : r.scheduleStatus === "UPCOMING" ? "warning" : "neutral"}
                    />
                  </div>
                )
              },
              {
                key: "duration",
                header: "Duration",
                render: (r) => formatDuration(r?.examWorksheet?.durationSeconds)
              },
              {
                key: "assignment",
                header: "Assignment Status",
                render: (r) => {
                  if (r.assignmentStatus === "ASSIGNED") return <StatusPill label="Assigned" tone="success" />;
                  if (r.enrollmentStatusNormalized === "NOT_SELECTED") return <StatusPill label="Not Selected" tone="warning" />;
                  if (r.enrollmentStatusNormalized === "NOT_IN_COMBINED_LIST") return <StatusPill label="Pending Assignment" tone="warning" />;
                  return <StatusPill label="Not Assigned" tone="neutral" />;
                }
              },
              {
                key: "attempt",
                header: "Attempt Status",
                render: (r) => {
                  if (r.attemptStatus === "NONE") return <StatusPill label="No Attempt" tone="neutral" />;
                  if (r.attemptStatus === "IN_PROGRESS") return <StatusPill label="In Progress" tone="info" />;
                  if (r.attemptStatus === "SUBMITTED") return <StatusPill label="Submitted" tone="success" />;
                  if (r.attemptStatus === "TIMED_OUT") return <StatusPill label="Timed Out" tone="danger" />;
                  return <StatusPill label="Not Started" tone="neutral" />;
                }
              },
              {
                key: "result",
                header: "Result Status",
                render: (r) =>
                  r.resultStatus === "PUBLISHED" ? (
                    <StatusPill label="Published" tone="success" />
                  ) : (
                    <StatusPill label="Not Published" tone="neutral" />
                  )
              },
              {
                key: "actions",
                header: "Action",
                render: (r) => {
                  const worksheetId = r?.examWorksheet?.worksheetId;

                  if (!worksheetId) {
                    return (
                      <button className="button secondary" style={{ width: "auto" }} type="button" disabled>
                        Not Assigned
                      </button>
                    );
                  }

                  if (r.resultStatus === "PUBLISHED") {
                    return (
                      <Link className="button secondary" style={{ width: "auto" }} to={`/student/exams/${r.examCycleId}/result`}>
                        View Result
                      </Link>
                    );
                  }

                  if (r.attemptStatus === "IN_PROGRESS" && r.scheduleStatus === "OPEN") {
                    return (
                      <Link className="button" style={{ width: "auto" }} to={`/student/worksheets/${worksheetId}`}>
                        Resume Exam
                      </Link>
                    );
                  }

                  if (r.attemptStatus === "NOT_STARTED") {
                    if (r.scheduleStatus === "OPEN") {
                      return (
                        <Link className="button" style={{ width: "auto" }} to={`/student/worksheets/${worksheetId}`}>
                          Start Exam
                        </Link>
                      );
                    }

                    return (
                      <Link className="button secondary" style={{ width: "auto" }} to={`/student/worksheets/${worksheetId}`}>
                        View Instructions
                      </Link>
                    );
                  }

                  if (["SUBMITTED", "TIMED_OUT"].includes(r.attemptStatus)) {
                    return (
                      <Link className="button secondary" style={{ width: "auto" }} to={`/student/worksheets/${worksheetId}`}>
                        View Submission
                      </Link>
                    );
                  }

                  return (
                    <button className="button secondary" style={{ width: "auto" }} type="button" disabled>
                      Not Published
                    </button>
                  );
                }
              }
            ]}
            emptyMessage="No Exams match the selected filters."
          />
        </div>
      ) : null}

      {!error && filteredRows.length > 0 && filteredRows.every((row) => row.assignmentStatus === "ASSIGNED" && row.scheduleStatus === "UPCOMING") ? (
        <div className="card">
          <p style={{ margin: 0 }}>Your Exam is assigned and will become available when the schedule opens.</p>
        </div>
      ) : null}
    </section>
  );
}

export { StudentExamsPage };
