import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  listFranchiseWorkflowAnomalyQueue,
  listFranchiseWorkflowEscalationQueue,
  listFranchiseWorkflowQueue,
  listFranchiseWorkflowReviewQueue
} from "../../services/franchiseService";

const QUEUE_MODES = [
  { key: "all", label: "All Workflows", loader: listFranchiseWorkflowQueue },
  { key: "reviews", label: "Review Queue", loader: listFranchiseWorkflowReviewQueue },
  { key: "anomalies", label: "Anomaly Queue", loader: listFranchiseWorkflowAnomalyQueue },
  { key: "escalations", label: "Escalation Queue", loader: listFranchiseWorkflowEscalationQueue }
];

const STATUS_OPTIONS = ["OPEN", "REVIEWED", "ACKNOWLEDGED", "ACTION_REQUESTED", "ESCALATED", "RESOLVED"];
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

function FranchiseWorkflowQueuePage() {
  const [mode, setMode] = useState("all");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [filters, setFilters] = useState({
    q: "",
    status: "",
    severity: ""
  });

  const activeMode = useMemo(() => QUEUE_MODES.find((item) => item.key === mode) || QUEUE_MODES[0], [mode]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    activeMode
      .loader({
        limit,
        offset,
        q: filters.q || undefined,
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
          setError(getFriendlyErrorMessage(nextError) || "Failed to load operational workflows.");
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
  }, [activeMode, filters.q, filters.severity, filters.status, limit, offset, refreshTick]);

  const columns = [
    {
      key: "title",
      header: "Issue",
      render: (row) => (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>{row.title}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{row.summary}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge tone="info">{row.notificationType}</Badge>
            <Badge>{row.queueType}</Badge>
          </div>
        </div>
      )
    },
    {
      key: "centerName",
      header: "Center",
      render: (row) => (
        <div style={{ display: "grid", gap: 4 }}>
          <div>{row.centerName || "Franchise-wide"}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{row.centerCode || row.centerId || "-"}</div>
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
      key: "lastTriggeredAt",
      header: "Last Triggered",
      render: (row) => formatDateTime(row.lastTriggeredAt)
    },
    {
      key: "actions",
      header: "Action",
      render: (row) => (
        <Link className="button secondary" style={{ width: "auto" }} to={`/franchise/workflows/${row.id}`}>
          Open Workflow
        </Link>
      )
    }
  ];

  if (loading && !rows.length) {
    return <LoadingState label="Loading franchise workflows..." />;
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <h2 style={{ margin: 0 }}>Operational Workflow Governance</h2>
          <div style={{ color: "var(--color-text-muted)" }}>
            Review anomaly queues, escalate center risk, and preserve immutable workflow history.
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
        <SummaryCard
          label="Review Queue"
          value={summary?.reviewQueueCount ?? 0}
          detail="New and re-opened issues waiting for franchise review."
        />
        <SummaryCard
          label="Anomaly Queue"
          value={summary?.anomalyQueueCount ?? 0}
          detail="Acknowledged or center-action issues still under governance."
        />
        <SummaryCard
          label="Escalation Queue"
          value={summary?.escalationQueueCount ?? 0}
          detail="Escalated center risks requiring acknowledgement, forwarding, or resolution."
        />
        <SummaryCard
          label="Resolved"
          value={summary?.resolvedCount ?? 0}
          detail="Historical items closed by franchise action or source-notification lifecycle."
        />
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
              placeholder="Issue title, summary, or center"
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
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      <div className="card">
        <DataTable columns={columns} rows={rows} keyField="id" emptyMessage="No workflows match the current queue filters." />
      </div>

      <PaginationBar
        limit={limit}
        offset={offset}
        count={rows.length}
        total={total}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
        }}
      />
    </section>
  );
}

export { FranchiseWorkflowQueuePage };