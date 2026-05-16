import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  listTeacherAnomalyWorkflowQueue,
  listTeacherAttendanceWorkflowQueue,
  listTeacherGradingWorkflowQueue,
  listTeacherWorkflowQueue
} from "../../services/teacherWorkflowService";

const QUEUE_MODES = [
  { key: "all", label: "All Queues", loader: listTeacherWorkflowQueue },
  { key: "attendance", label: "Attendance Queue", loader: listTeacherAttendanceWorkflowQueue },
  { key: "grading", label: "Grading Queue", loader: listTeacherGradingWorkflowQueue },
  { key: "anomalies", label: "Classroom Alerts", loader: listTeacherAnomalyWorkflowQueue }
];

const STATUS_OPTIONS = ["OPEN", "REVIEWED", "ACKNOWLEDGED", "IN_PROGRESS", "FOLLOW_UP_REQUIRED", "RESOLVED"];
const SEVERITY_OPTIONS = ["CRITICAL", "HIGH", "WARNING", "INFO"];

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

function Badge({ tone = "neutral", children }) {
  const tones = {
    neutral: {
      background: "rgba(15, 23, 42, 0.08)",
      color: "var(--color-text)"
    },
    danger: {
      background: "var(--color-bg-danger-light)",
      color: "var(--color-text-danger)"
    },
    warning: {
      background: "var(--color-bg-warning)",
      color: "var(--color-text-warning)"
    },
    success: {
      background: "rgba(34, 197, 94, 0.12)",
      color: "#166534"
    },
    info: {
      background: "var(--color-bg-info-light)",
      color: "var(--color-text-info)"
    }
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        ...(tones[tone] || tones.neutral)
      }}
    >
      {children}
    </span>
  );
}

function severityTone(value) {
  if (value === "CRITICAL") {
    return "danger";
  }
  if (value === "HIGH" || value === "WARNING") {
    return "warning";
  }
  if (value === "RESOLVED") {
    return "success";
  }
  return "info";
}

function SummaryCard({ label, value, detail }) {
  return (
    <div className="card" style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--color-text-muted)", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{detail}</div>
    </div>
  );
}

function TeacherWorkflowQueuePage() {
  const [mode, setMode] = useState("all");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [filters, setFilters] = useState({ q: "", status: "", severity: "" });
  const deferredQuery = useDeferredValue(filters.q);

  const activeMode = useMemo(() => QUEUE_MODES.find((item) => item.key === mode) || QUEUE_MODES[0], [mode]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    activeMode
      .loader({
        limit,
        offset,
        q: deferredQuery || undefined,
        status: filters.status || undefined,
        severity: filters.severity || undefined,
        sortBy: "updatedAt",
        sortOrder: "desc"
      })
      .then((response) => {
        if (cancelled) {
          return;
        }

        const data = response.data || {};
        setRows(data.items || []);
        setSummary(data.summary || null);
        setLimit(data.limit || 20);
        setOffset(data.offset || 0);
        setTotal(data.total || 0);
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(getFriendlyErrorMessage(nextError) || "Failed to load teacher workflow queues.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeMode, deferredQuery, filters.status, filters.severity, limit, offset, refreshTick]);

  const columns = [
    {
      key: "title",
      header: "Workflow",
      render: (row) => (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>{row.title}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{row.summary}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge tone="info">{row.workflowType}</Badge>
            <Badge>{row.queueType}</Badge>
            {row.batchName ? <Badge tone="neutral">{row.batchName}</Badge> : null}
            {row.studentName ? <Badge tone="neutral">{row.studentName}</Badge> : null}
          </div>
        </div>
      )
    },
    {
      key: "severity",
      header: "Severity",
      render: (row) => <Badge tone={severityTone(row.severity)}>{row.severity}</Badge>
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge tone={row.status === "RESOLVED" ? "success" : "neutral"}>{row.status}</Badge>
    },
    {
      key: "lastDetectedAt",
      header: "Last Detected",
      render: (row) => formatDateTime(row.lastDetectedAt)
    },
    {
      key: "actions",
      header: "Action",
      render: (row) => (
        <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/workflows/${row.id}`}>
          Open Workflow
        </Link>
      )
    }
  ];

  if (loading && !rows.length) {
    return <LoadingState label="Loading teacher workflow queue..." />;
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <h2 style={{ margin: 0 }}>Classroom Execution Queue</h2>
          <div style={{ color: "var(--color-text-muted)" }}>
            Execute attendance recovery, finish grading, resolve productivity blockers, and maintain immutable classroom history.
          </div>
        </div>
        <button
          className="button secondary"
          type="button"
          style={{ width: "auto" }}
          onClick={() => setRefreshTick((tick) => tick + 1)}
        >
          Refresh Queue
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {QUEUE_MODES.map((item) => (
          <button
            key={item.key}
            className={item.key === mode ? "button" : "button secondary"}
            type="button"
            style={{ width: "auto" }}
            onClick={() => {
              setMode(item.key);
              setOffset(0);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <SummaryCard label="Attendance" value={summary?.attendanceQueueCount ?? 0} detail="Delayed attendance submission, follow-up, and recovery work." />
        <SummaryCard label="Grading" value={summary?.gradingQueueCount ?? 0} detail="Worksheet review, overdue grading, and backlog execution." />
        <SummaryCard label="Classroom" value={summary?.classroomQueueCount ?? 0} detail="Operational blockers and recovery checkpoints." />
        <SummaryCard label="Anomalies" value={summary?.anomalyQueueCount ?? 0} detail="Persistent classroom anomalies needing action or closure." />
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Search</span>
            <input
              className="input"
              value={filters.q}
              onChange={(event) => {
                setOffset(0);
                setFilters((current) => ({ ...current, q: event.target.value }));
              }}
              placeholder="Workflow title, student, or batch"
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Status</span>
            <select
              className="input"
              value={filters.status}
              onChange={(event) => {
                setOffset(0);
                setFilters((current) => ({ ...current, status: event.target.value }));
              }}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Severity</span>
            <select
              className="input"
              value={filters.severity}
              onChange={(event) => {
                setOffset(0);
                setFilters((current) => ({ ...current, severity: event.target.value }));
              }}
            >
              <option value="">All severities</option>
              {SEVERITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <DataTable columns={columns} rows={rows} emptyMessage="No teacher workflows matched the current filters." />
        <PaginationBar limit={limit} offset={offset} total={total} onPageChange={(nextOffset) => setOffset(nextOffset)} />
      </div>
    </section>
  );
}

export { TeacherWorkflowQueuePage };