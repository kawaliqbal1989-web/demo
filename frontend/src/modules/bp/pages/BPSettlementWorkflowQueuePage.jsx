import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, PaginationBar } from "../../../components/DataTable";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
import { PageHeader } from "../../../components/PageHeader";
import { useSettlementWorkflowQueue } from "../hooks/useSettlementWorkflowQueue";
import { useSettlementWorkflowSummary } from "../hooks/useSettlementWorkflowSummary";
import {
  WorkflowBadge,
  formatWorkflowCurrency,
  formatWorkflowDateTime,
  getWorkflowScopeLabel,
  humanizeWorkflowToken
} from "../components/SettlementWorkflowPrimitives";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "PENDING_REVIEW", label: "Pending Review" },
  { value: "REVIEWED", label: "Reviewed" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ESCALATED", label: "Escalated" },
  { value: "PAID", label: "Paid" }
];

const SORT_BY_OPTIONS = [
  { value: "updatedAt", label: "Updated At" },
  { value: "lastWorkflowActionAt", label: "Last Workflow Action" },
  { value: "generatedAt", label: "Generated At" },
  { value: "payoutDueAt", label: "Payout Due" }
];

const SORT_ORDER_OPTIONS = [
  { value: "desc", label: "Newest First" },
  { value: "asc", label: "Oldest First" }
];

const QUEUE_MODES = {
  APPROVAL: "APPROVAL",
  ESCALATIONS: "ESCALATIONS",
  OVERDUE: "OVERDUE",
  PAYOUT: "PAYOUT",
  REJECTED_REOPEN: "REJECTED_REOPEN",
  CUSTOM: "CUSTOM"
};

function BPSettlementWorkflowQueuePage() {
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [pendingActionOnly, setPendingActionOnly] = useState(true);
  const [escalationOnly, setEscalationOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [queueMode, setQueueMode] = useState(QUEUE_MODES.APPROVAL);
  const [refreshTick, setRefreshTick] = useState(0);
  const deferredSearch = useDeferredValue(searchQuery);

  const queueFilters = useMemo(
    () => ({
      limit,
      offset,
      pendingActionOnly,
      escalationOnly,
      overdueOnly,
      q: deferredSearch,
      sortBy,
      sortOrder,
      ...(statusFilter ? { status: [statusFilter] } : {})
    }),
    [deferredSearch, escalationOnly, limit, offset, overdueOnly, pendingActionOnly, sortBy, sortOrder, statusFilter]
  );

  const queue = useSettlementWorkflowQueue(queueFilters, { refreshTick });
  const summary = useSettlementWorkflowSummary({ refreshTick });

  function setCustomFilters(updater) {
    setQueueMode(QUEUE_MODES.CUSTOM);
    setOffset(0);
    updater();
  }

  function applyQueueMode(nextMode) {
    setQueueMode(nextMode);
    setOffset(0);

    switch (nextMode) {
      case QUEUE_MODES.APPROVAL:
        setPendingActionOnly(true);
        setEscalationOnly(false);
        setOverdueOnly(false);
        setStatusFilter("");
        setSortBy("updatedAt");
        setSortOrder("desc");
        break;
      case QUEUE_MODES.ESCALATIONS:
        setPendingActionOnly(false);
        setEscalationOnly(true);
        setOverdueOnly(false);
        setStatusFilter("ESCALATED");
        setSortBy("lastWorkflowActionAt");
        setSortOrder("desc");
        break;
      case QUEUE_MODES.OVERDUE:
        setPendingActionOnly(true);
        setEscalationOnly(false);
        setOverdueOnly(true);
        setStatusFilter("");
        setSortBy("payoutDueAt");
        setSortOrder("asc");
        break;
      case QUEUE_MODES.PAYOUT:
        setPendingActionOnly(false);
        setEscalationOnly(false);
        setOverdueOnly(false);
        setStatusFilter("APPROVED");
        setSortBy("payoutDueAt");
        setSortOrder("asc");
        break;
      case QUEUE_MODES.REJECTED_REOPEN:
        setPendingActionOnly(false);
        setEscalationOnly(false);
        setOverdueOnly(false);
        setStatusFilter("REJECTED");
        setSortBy("lastWorkflowActionAt");
        setSortOrder("desc");
        break;
      default:
        break;
    }
  }

  const columns = useMemo(
    () => [
      {
        key: "period",
        header: "Period",
        render: (row) => (
          <div style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 700 }}>{row.periodLabel}</span>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{getWorkflowScopeLabel(row)}</span>
          </div>
        )
      },
      {
        key: "amounts",
        header: "Amounts",
        render: (row) => (
          <div style={{ display: "grid", gap: 4 }}>
            <span>Gross: {formatWorkflowCurrency(row.grossAmount)}</span>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Partner: {formatWorkflowCurrency(row.partnerEarnings)}</span>
          </div>
        )
      },
      {
        key: "status",
        header: "Workflow",
        render: (row) => (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <WorkflowBadge value={row.status} />
              <WorkflowBadge value={row.currentActionRole || "UNASSIGNED"} tone="info" />
            </div>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Updated {formatWorkflowDateTime(row.lastWorkflowActionAt || row.updatedAt)}
            </span>
          </div>
        )
      },
      {
        key: "exceptions",
        header: "Operational Flags",
        render: (row) => (
          <div style={{ display: "grid", gap: 8 }}>
            {row.activeEscalation ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <WorkflowBadge value={row.activeEscalation.escalationType} tone="warning" />
                <WorkflowBadge value={row.activeEscalation.severity} tone="warning" />
              </div>
            ) : (
              <span style={{ color: "var(--color-text-muted)" }}>No active escalation</span>
            )}
            {row.activeTask ? (
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {humanizeWorkflowToken(row.activeTask.taskType)} due {formatWorkflowDateTime(row.activeTask.dueAt)}
              </span>
            ) : null}
          </div>
        )
      },
      {
        key: "allowedActions",
        header: "Allowed Actions",
        render: (row) => (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {row.allowedActions.length ? row.allowedActions.map((action) => <WorkflowBadge key={action} value={action} tone="info" />) : <span style={{ color: "var(--color-text-muted)" }}>No actions</span>}
          </div>
        )
      },
      {
        key: "detail",
        header: "",
        render: (row) => (
          <Link to={`/bp/settlements/${row.id}`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 700 }}>
            Open workflow
          </Link>
        )
      }
    ],
    []
  );

  const summaryCards = useMemo(
    () => [
      { key: "pendingReviewCount", label: "Pending Review", value: summary.counts.pendingReviewCount },
      { key: "approvalQueueCount", label: "Approval Queue", value: summary.counts.approvalQueueCount },
      { key: "overdueCount", label: "Overdue", value: summary.counts.overdueCount },
      { key: "escalationCount", label: "Escalations", value: summary.counts.escalationCount },
      { key: "payoutPendingCount", label: "Payout Pending", value: summary.counts.payoutPendingCount }
    ],
    [summary.counts]
  );

  const queueModeButtons = useMemo(
    () => [
      { key: QUEUE_MODES.APPROVAL, label: "Approval Queue", count: summary.counts.approvalQueueCount },
      { key: QUEUE_MODES.ESCALATIONS, label: "Escalation Queue", count: summary.counts.escalationCount },
      { key: QUEUE_MODES.OVERDUE, label: "Overdue Queue", count: summary.counts.overdueCount },
      { key: QUEUE_MODES.PAYOUT, label: "Payout Queue", count: summary.counts.payoutPendingCount },
      { key: QUEUE_MODES.REJECTED_REOPEN, label: "Rejected / Reopen", count: summary.counts.pendingReviewCount }
    ],
    [summary.counts]
  );

  const refreshAll = () => {
    setRefreshTick((current) => current + 1);
  };

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <PageHeader
        title="Settlement Workflow Queue"
        subtitle="Server-driven BP settlement approvals, escalations, and payout readiness."
        actions={
          <button className="button secondary" type="button" style={{ width: "auto" }} onClick={refreshAll}>
            Refresh Queue
          </button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {summaryCards.map((card) => (
          <div key={card.key} className="card" style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{card.label}</span>
            <span style={{ fontSize: 28, fontWeight: 800 }}>{card.value}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Operational Queues</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {queueModeButtons.map((mode) => (
            <button
              key={mode.key}
              className={queueMode === mode.key ? "button" : "button secondary"}
              type="button"
              style={{ width: "auto" }}
              onClick={() => applyQueueMode(mode.key)}
            >
              {mode.label} ({mode.count})
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Queue Filters</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Search</span>
            <input
              className="input"
              value={searchQuery}
              placeholder="Period, franchise, center"
              onChange={(event) => {
                setCustomFilters(() => {
                  setSearchQuery(event.target.value);
                });
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Status</span>
            <select
              className="input"
              value={statusFilter}
              onChange={(event) => {
                setCustomFilters(() => {
                  setStatusFilter(event.target.value);
                });
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Sort By</span>
            <select
              className="input"
              value={sortBy}
              onChange={(event) => {
                setCustomFilters(() => {
                  setSortBy(event.target.value);
                });
              }}
            >
              {SORT_BY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Sort Order</span>
            <select
              className="input"
              value={sortOrder}
              onChange={(event) => {
                setCustomFilters(() => {
                  setSortOrder(event.target.value);
                });
              }}
            >
              {SORT_ORDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={pendingActionOnly}
              onChange={(event) => {
                setCustomFilters(() => {
                  setPendingActionOnly(event.target.checked);
                });
              }}
            />
            Pending action only
          </label>

          <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={escalationOnly}
              onChange={(event) => {
                setCustomFilters(() => {
                  setEscalationOnly(event.target.checked);
                });
              }}
            />
            Escalations only
          </label>

          <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(event) => {
                setCustomFilters(() => {
                  setOverdueOnly(event.target.checked);
                });
              }}
            />
            Overdue only
          </label>
        </div>
      </div>

      {queue.loading && !queue.items.length ? <LoadingState label="Loading settlement workflow queue..." /> : null}

      {!queue.loading && queue.error && !queue.items.length ? (
        <ErrorState
          title="Could not load the workflow queue"
          message={queue.error.message || "The queue could not be fetched."}
          onRetry={refreshAll}
        />
      ) : null}

      {!queue.loading && !queue.error && !queue.items.length ? (
        <EmptyState
          icon="🏦"
          title="No settlements match this queue"
          description="Try relaxing the filters or refreshing the workflow queue."
          action={{ label: "Refresh Queue", onClick: refreshAll }}
        />
      ) : null}

      {queue.items.length ? (
        <>
          <div className="card">
            <DataTable columns={columns} rows={queue.items} keyField="id" />
          </div>

          <PaginationBar
            limit={queue.limit}
            offset={queue.offset}
            count={queue.items.length}
            total={queue.total}
            onChange={(next) => {
              setLimit(next.limit);
              setOffset(next.offset);
            }}
          />
        </>
      ) : null}
    </section>
  );
}

export { BPSettlementWorkflowQueuePage };