import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listExamCycles } from "../../services/examCyclesService";

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatDateRange(startValue, endValue) {
  return `${formatDateTime(startValue)} -> ${formatDateTime(endValue)}`;
}

function formatCount(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric.toLocaleString() : "0";
}

function formatStatusLabel(value) {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part[0] + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeResultStatus(resultStatus) {
  const normalized = String(resultStatus || "").toUpperCase();
  if (normalized === "PUBLISHED") return "Published";
  if (normalized === "DRAFT") return "Draft";
  return "Not Published";
}

function toHealthIndicator(status) {
  if (status === "critical") return { label: "Critical", color: "#dc2626", dot: "#dc2626" };
  if (status === "warning") return { label: "Warning", color: "#ca8a04", dot: "#ca8a04" };
  return { label: "Healthy", color: "#16a34a", dot: "#16a34a" };
}

function resolveLifecycleHealth(cycle) {
  if (!cycle) return null;
  const now = Date.now();
  const enrollmentEnd = new Date(cycle.enrollmentEndAt).getTime();
  const examStart = new Date(cycle.examStartsAt).getTime();
  const examEnd = new Date(cycle.examEndsAt).getTime();
  const enrollmentStatus = now <= enrollmentEnd ? "healthy" : "warning";
  const assignmentStatus = cycle.isArchived ? "warning" : "healthy";
  const examStatus = now > examEnd ? "warning" : now >= examStart ? "healthy" : "healthy";
  const resultStatus = cycle.resultStatus === "PUBLISHED" ? "healthy" : now > examEnd ? "warning" : "healthy";
  const overall = [enrollmentStatus, assignmentStatus, examStatus, resultStatus].includes("critical")
    ? "critical"
    : [enrollmentStatus, assignmentStatus, examStatus, resultStatus].includes("warning")
      ? "warning"
      : "healthy";

  return {
    enrollmentStatus,
    assignmentStatus,
    examStatus,
    resultStatus,
    overall
  };
}

function getHierarchy(cycle) {
  return cycle?.enrollmentListSummary?.hierarchy || {};
}

function getCycleOwner(cycle) {
  return cycle?.enrollmentListSummary?.currentOwnerRole || null;
}

function getCycleStage(cycle) {
  if (!cycle) return "UNKNOWN";
  if (cycle.isArchived) return "ARCHIVED";

  const resultStatus = String(cycle.resultStatus || "").toUpperCase();
  if (resultStatus === "PUBLISHED") return "RESULT_PUBLISHED";
  if (["READY_FOR_REVIEW", "LOCKED"].includes(resultStatus)) return "RESULT_REVIEW";

  const hierarchy = getHierarchy(cycle);
  if (Number(hierarchy.businessPartnerSubmittedToSuperadmin || 0) > 0) return "SUPERADMIN_REVIEW";
  if (Number(hierarchy.franchiseSubmittedToBusinessPartner || 0) > 0) return "BP_REVIEW";
  if (Number(hierarchy.centerSubmittedToFranchise || 0) > 0) return "FRANCHISE_REVIEW";
  if (Number(hierarchy.teacherSubmittedToCenter || 0) > 0 || Number(hierarchy.centerReview || 0) > 0) return "CENTER_REVIEW";
  if (Number(hierarchy.approved || 0) > 0) return "APPROVED";

  const now = Date.now();
  const enrollmentStart = cycle.enrollmentStartAt ? new Date(cycle.enrollmentStartAt).getTime() : null;
  const enrollmentEnd = cycle.enrollmentEndAt ? new Date(cycle.enrollmentEndAt).getTime() : null;
  const examStart = cycle.examStartsAt ? new Date(cycle.examStartsAt).getTime() : null;
  const examEnd = cycle.examEndsAt ? new Date(cycle.examEndsAt).getTime() : null;

  if (enrollmentStart && enrollmentEnd && now >= enrollmentStart && now <= enrollmentEnd) return "ENROLLMENT_OPEN";
  if (examStart && examEnd && now >= examStart && now <= examEnd) return "EXAM_RUNNING";
  if (examEnd && now > examEnd) return "RESULT_PENDING";
  return "SCHEDULED";
}

function stageTone(stage) {
  if (stage === "SUPERADMIN_REVIEW") return { text: "#7c2d12", bg: "#ffedd5", border: "#fed7aa" };
  if (["BP_REVIEW", "FRANCHISE_REVIEW", "CENTER_REVIEW"].includes(stage)) return { text: "#1e40af", bg: "#dbeafe", border: "#bfdbfe" };
  if (["APPROVED", "RESULT_PUBLISHED"].includes(stage)) return { text: "#065f46", bg: "#dcfce7", border: "#bbf7d0" };
  if (["ARCHIVED", "RESULT_PENDING"].includes(stage)) return { text: "#92400e", bg: "#fef3c7", border: "#fde68a" };
  return { text: "#374151", bg: "#f3f4f6", border: "#e5e7eb" };
}

function StatusPill({ value }) {
  const tone = stageTone(value);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 24,
        padding: "3px 9px",
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.text,
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap"
      }}
    >
      {formatStatusLabel(value)}
    </span>
  );
}

function SummaryCard({ label, value, hint, tone = "#2563eb" }) {
  return (
    <div className="card" style={{ display: "grid", gap: 6, minHeight: 104, borderTop: `3px solid ${tone}` }}>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 800 }}>{formatCount(value)}</div>
      {hint ? <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{hint}</div> : null}
    </div>
  );
}

function FranchiseExamCyclesPage() {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [workflowQueue, setWorkflowQueue] = useState(null);
  const [selectedHealthCycle, setSelectedHealthCycle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ACTIVE");
  const [searchQuery, setSearchQuery] = useState("");
  const [resultFilter, setResultFilter] = useState("ALL");
  const [hierarchyFilter, setHierarchyFilter] = useState("ALL");

  const load = useCallback(async ({ limit: nextLimit = 20, offset: nextOffset = 0, filter: nextFilter = filter } = {}) => {
    setLoading(true);
    setError("");
    try {
      const data = await listExamCycles({ limit: nextLimit, offset: nextOffset, filter: nextFilter });
      setRows(data?.data?.items || []);
      setLimit(data?.data?.limit ?? nextLimit);
      setOffset(data?.data?.offset ?? nextOffset);
      setTotal(data?.data?.total ?? 0);
      setSummary(data?.data?.summary || null);
      setWorkflowQueue(data?.data?.workflowQueue || null);
    } catch (err) {
      setSummary(null);
      setWorkflowQueue(null);
      setError(getFriendlyErrorMessage(err) || "Failed to load exam cycles.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load({ limit: 20, offset: 0, filter });
  }, [load, filter]);

  const visibleRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rows.filter((cycle) => {
      const stage = getCycleStage(cycle);
      const resultStatus = String(cycle?.resultStatus || "").toUpperCase();

      if (resultFilter !== "ALL" && resultStatus !== resultFilter) return false;
      if (hierarchyFilter !== "ALL" && stage !== hierarchyFilter) return false;

      if (!query) return true;

      return [
        cycle?.code,
        cycle?.name,
        stage,
        getCycleOwner(cycle),
        cycle?.businessPartner?.name
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [rows, searchQuery, resultFilter, hierarchyFilter]);

  const healthCycle = selectedHealthCycle || visibleRows[0] || rows[0] || null;
  const lifecycleHealth = resolveLifecycleHealth(healthCycle);

  const dashboardCards = useMemo(() => {
    if (!summary || !workflowQueue) return [];

    return [
      { label: "Total Cycles", value: summary?.totalCycles ?? total, hint: `${rows.length} loaded`, tone: "#2563eb" },
      { label: "Enrollment", value: summary?.enrollment?.totalEnrollmentCount ?? 0, hint: `Normal ${formatCount(summary?.enrollment?.normalEnrollmentCount)} / Late ${formatCount(summary?.enrollment?.lateEnrollmentCount)}`, tone: "#0f766e" },
      { label: "Franchise Review", value: workflowQueue?.centerSubmittedToFranchise ?? 0, hint: "Center submissions", tone: "#7c3aed" },
      { label: "Submitted to BP", value: workflowQueue?.franchiseSubmittedToBusinessPartner ?? 0, hint: "Franchise forwarded", tone: "#9333ea" },
      { label: "Forwarded Above", value: workflowQueue?.businessPartnerSubmittedToSuperadmin ?? 0, hint: "Read-only at franchise", tone: "#ea580c" },
      { label: "Approved Lists", value: workflowQueue?.approved ?? 0, hint: "Finalized lists", tone: "#16a34a" },
      { label: "Published Results", value: summary?.publishedResultCycles ?? 0, hint: "Visible to franchise", tone: "#059669" }
    ];
  }, [summary, workflowQueue, total, rows.length]);

  if (loading && !rows.length) {
    return <LoadingState label="Loading exam cycles..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Exam Cycles</h2>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
            Review center submissions, monitor exam health, and forward approved lists to your business partner.
          </div>
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={() => void load({ limit, offset, filter })}
          style={{ width: "auto" }}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {dashboardCards.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          {dashboardCards.map((card) => (
            <SummaryCard key={card.label} {...card} />
          ))}
        </div>
      ) : null}

      {workflowQueue ? (
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <div>
            <strong>Hierarchy Queue</strong>
            <div style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 4 }}>
              Counts are scoped to your franchise hierarchy.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            {[
              ["Center", "Teacher/center stage", workflowQueue.centerReview, "#0284c7"],
              ["Franchise", "Submitted to franchise", workflowQueue.centerSubmittedToFranchise, "#7c3aed"],
              ["Business Partner", "Forwarded from franchise", workflowQueue.franchiseSubmittedToBusinessPartner, "#9333ea"],
              ["Superadmin", "Forwarded by BP", workflowQueue.businessPartnerSubmittedToSuperadmin, "#ea580c"],
              ["Approved", "Finalized lists", workflowQueue.approved, "#16a34a"]
            ].map(([role, label, value, color]) => (
              <div key={role} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 12, display: "grid", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block" }} />
                  <strong>{role}</strong>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{formatCount(value)}</div>
                <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13, flex: "1 1 220px", minWidth: 0 }}>
            Search
            <input
              className="input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Code, name, stage, owner"
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13, flex: "1 1 150px", minWidth: 0 }}>
            Lifecycle
            <select
              className="input"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                setOffset(0);
              }}
            >
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="ARCHIVED">Archived</option>
              <option value="ALL">All</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13, flex: "1 1 170px", minWidth: 0 }}>
            Hierarchy Stage
            <select className="input" value={hierarchyFilter} onChange={(event) => setHierarchyFilter(event.target.value)}>
              <option value="ALL">All stages</option>
              <option value="CENTER_REVIEW">Center review</option>
              <option value="FRANCHISE_REVIEW">Franchise review</option>
              <option value="BP_REVIEW">BP review</option>
              <option value="SUPERADMIN_REVIEW">Superadmin review</option>
              <option value="APPROVED">Approved</option>
              <option value="RESULT_REVIEW">Result review</option>
              <option value="RESULT_PUBLISHED">Result published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13, flex: "1 1 150px", minWidth: 0 }}>
            Result
            <select className="input" value={resultFilter} onChange={(event) => setResultFilter(event.target.value)}>
              <option value="ALL">All results</option>
              <option value="DRAFT">Draft</option>
              <option value="READY_FOR_REVIEW">Ready for review</option>
              <option value="LOCKED">Locked</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </label>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto" }}
            onClick={() => {
              setSearchQuery("");
              setFilter("ACTIVE");
              setResultFilter("ALL");
              setHierarchyFilter("ALL");
              setSelectedHealthCycle(null);
            }}
          >
            Reset
          </button>
          <div style={{ marginLeft: "auto", color: "var(--color-text-muted)", fontSize: 13 }}>
            Showing {visibleRows.length} of {rows.length} loaded
          </div>
        </div>
      </div>

      {healthCycle ? (
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <strong>Selected Cycle Health</strong>
          <div style={{ color: "var(--muted)" }}>
            Cycle: {healthCycle.name} ({healthCycle.code})
          </div>
          {lifecycleHealth ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                ["Enrollment", lifecycleHealth.enrollmentStatus],
                ["Assignment", lifecycleHealth.assignmentStatus],
                ["Exam", lifecycleHealth.examStatus],
                ["Result", lifecycleHealth.resultStatus],
                ["Overall", lifecycleHealth.overall]
              ].map(([label, status]) => {
                const indicator = toHealthIndicator(status);
                return (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: indicator.dot, display: "inline-block" }} />
                    <span>{label}</span>
                    <strong style={{ color: indicator.color }}>{indicator.label}</strong>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <DataTable
        emptyMessage={error ? "Unable to load exam cycles. Use Refresh to retry." : rows.length ? "No exam cycles match the selected filters." : "No exam cycles found."}
        columns={[
          { key: "code", header: "Code" },
          { key: "name", header: "Name" },
          {
            key: "stage",
            header: "Hierarchy",
            render: (r) => {
              const owner = getCycleOwner(r);
              const summaryByCycle = getHierarchy(r);
              const readOnly = r?.enrollmentListSummary?.readOnly ?? (Number(summaryByCycle.centerSubmittedToFranchise || 0) <= 0);
              return (
                <div style={{ display: "grid", gap: 4 }}>
                  <StatusPill value={getCycleStage(r)} />
                  <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                    Owner: {owner || "System"}
                  </span>
                  <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                    {readOnly ? "Read-only" : "Franchise action required"}
                  </span>
                </div>
              );
            }
          },
          {
            key: "enrollment",
            header: "Enrollment",
            render: (r) => {
              const counts = r?.enrollmentCounts || {};
              return (
                <div style={{ display: "grid", gap: 2 }}>
                  <strong>{formatCount(counts.totalEnrollmentCount)} students</strong>
                  <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                    Normal {formatCount(counts.normalEnrollmentCount)} / Late {formatCount(counts.lateEnrollmentCount)}
                  </span>
                </div>
              );
            }
          },
          {
            key: "windows",
            header: "Windows",
            render: (r) => (
              <div style={{ display: "grid", gap: 4 }}>
                <div><strong>Enroll:</strong> {formatDateRange(r.enrollmentStartAt, r.enrollmentEndAt)}</div>
                <div><strong>Exam:</strong> {formatDateRange(r.examStartsAt, r.examEndsAt)}</div>
              </div>
            )
          },
          { key: "duration", header: "Duration", render: (r) => `${r.examDurationMinutes} min` },
          {
            key: "resultStatus",
            header: "Result",
            render: (r) => (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span>{normalizeResultStatus(r.resultStatus)}</span>
                {r.isArchived ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e", background: "#fef3c7", borderRadius: 999, padding: "2px 8px" }}>
                    ARCHIVED
                  </span>
                ) : null}
              </div>
            )
          },
          {
            key: "actions",
            header: "Actions",
            render: (r) => {
              const hierarchy = getHierarchy(r);
              const pendingAtFranchise = Number(hierarchy.centerSubmittedToFranchise || 0) > 0;
              const isPublished = String(r?.resultStatus || "").toUpperCase() === "PUBLISHED";

              return (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {pendingAtFranchise ? (
                    <Link className="button secondary" style={{ width: "auto" }} to={`/franchise/exam-cycles/${r.id}/pending`}>
                      Pending
                    </Link>
                  ) : (
                    <button className="button secondary" style={{ width: "auto" }} type="button" disabled>
                      Read-only
                    </button>
                  )}
                  {isPublished ? (
                    <Link className="button secondary" style={{ width: "auto" }} to={`/franchise/exam-cycles/${r.id}/results`}>
                      Results
                    </Link>
                  ) : (
                    <button className="button secondary" style={{ width: "auto" }} type="button" disabled>
                      Not Published
                    </button>
                  )}
                  <Link className="button secondary" style={{ width: "auto" }} to={`/franchise/exam-cycles/${r.id}/late-enrollment`}>
                    Late
                  </Link>
                </div>
              );
            }
          }
        ]}
        rows={visibleRows}
        keyField="id"
      />

      <PaginationBar
        limit={limit}
        offset={offset}
        count={visibleRows.length}
        total={total}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load(next);
        }}
      />
    </section>
  );
}

export { FranchiseExamCyclesPage };
