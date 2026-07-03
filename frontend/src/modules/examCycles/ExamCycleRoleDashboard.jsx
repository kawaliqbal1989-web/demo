import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listExamCycles } from "../../services/examCyclesService";

const STAGE_LABELS = {
  SCHEDULED: "Scheduled",
  ENROLLMENT_OPEN: "Enrollment Open",
  CENTER_REVIEW: "Center Review",
  FRANCHISE_REVIEW: "Franchise Review",
  BP_REVIEW: "BP Review",
  SUPERADMIN_REVIEW: "Superadmin Review",
  APPROVED: "Approved",
  EXAM_RUNNING: "Exam Running",
  RESULT_PENDING: "Result Pending",
  RESULT_REVIEW: "Result Review",
  RESULT_PUBLISHED: "Result Published",
  ARCHIVED: "Archived"
};

const ROLE_CONFIGS = {
  BP: {
    title: "Exam Cycles",
    subtitle: "Review franchise submissions, late requests, and published results.",
    hierarchy: "Franchise -> Business Partner -> Superadmin",
    pendingLabel: "Pending Lists",
    pendingHint: "Franchise submissions",
    basePath: "/bp/exam-cycles"
  },
  FRANCHISE: {
    title: "Exam Cycles",
    subtitle: "Review center submissions and forward combined lists to Business Partner.",
    hierarchy: "Center -> Franchise -> Business Partner",
    pendingLabel: "Pending Lists",
    pendingHint: "Center submissions",
    basePath: "/franchise/exam-cycles"
  },
  CENTER: {
    title: "Exam Cycles",
    subtitle: "Prepare combined enrollment lists, track teacher submissions, and request late enrollment.",
    hierarchy: "Teacher -> Center -> Franchise",
    manageLabel: "Manage Enrollment",
    basePath: "/center/exam-cycles"
  },
  TEACHER: {
    title: "Exam Cycles",
    subtitle: "Enroll assigned students and submit your list to the center.",
    hierarchy: "Teacher -> Center",
    manageLabel: "Manage Enrollment",
    basePath: "/teacher/exam-cycles"
  }
};

function formatCount(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric.toLocaleString() : "0";
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatDateRange(start, end) {
  return `${formatDateTime(start)} -> ${formatDateTime(end)}`;
}

function getHierarchy(cycle) {
  return cycle?.enrollmentListSummary?.hierarchy || {};
}

function getEnrollmentCounts(cycle) {
  return cycle?.enrollmentCounts || {};
}

function getAvailableActions(cycle, role) {
  const apiActions = cycle?.availableActions || {};
  const isPublished = String(cycle?.resultStatus || "").toUpperCase() === "PUBLISHED";
  const isArchived = Boolean(cycle?.isArchived);
  const isSuperadmin = role === "SUPERADMIN";

  return {
    manageEnrollment: apiActions.manageEnrollment ?? (!isArchived && ["CENTER", "TEACHER"].includes(role)),
    pendingLists: apiActions.pendingLists ?? (!isArchived && ["BP", "FRANCHISE", "SUPERADMIN"].includes(role)),
    lateEnrollment: apiActions.lateEnrollment ?? (!isArchived && ["BP", "FRANCHISE", "CENTER", "SUPERADMIN"].includes(role)),
    results: apiActions.results ?? (isSuperadmin || isPublished),
    resultsLockedReason: apiActions.resultsLockedReason ?? (isSuperadmin || isPublished ? null : "Results are not published yet.")
  };
}

function getCycleStage(cycle) {
  if (!cycle) return "SCHEDULED";
  if (cycle.isArchived) return "ARCHIVED";

  const resultStatus = String(cycle.resultStatus || "").toUpperCase();
  if (resultStatus === "PUBLISHED") return "RESULT_PUBLISHED";
  if (["READY_FOR_REVIEW", "LOCKED"].includes(resultStatus)) return "RESULT_REVIEW";

  const hierarchy = getHierarchy(cycle);
  if (Number(hierarchy.businessPartnerSubmittedToSuperadmin || 0) > 0) return "SUPERADMIN_REVIEW";
  if (Number(hierarchy.franchiseSubmittedToBusinessPartner || 0) > 0) return "BP_REVIEW";
  if (Number(hierarchy.centerSubmittedToFranchise || 0) > 0) return "FRANCHISE_REVIEW";
  if (Number(hierarchy.teacherSubmittedToCenter || 0) > 0) return "CENTER_REVIEW";
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

function getStageTone(stage) {
  if (stage === "RESULT_PUBLISHED" || stage === "APPROVED") return { bg: "#dcfce7", color: "#166534", border: "#bbf7d0" };
  if (stage === "SUPERADMIN_REVIEW") return { bg: "#ffedd5", color: "#9a3412", border: "#fed7aa" };
  if (["BP_REVIEW", "FRANCHISE_REVIEW", "CENTER_REVIEW"].includes(stage)) return { bg: "#dbeafe", color: "#1d4ed8", border: "#bfdbfe" };
  if (["ARCHIVED", "RESULT_PENDING"].includes(stage)) return { bg: "#fef3c7", color: "#92400e", border: "#fde68a" };
  return { bg: "#f3f4f6", color: "#374151", border: "#e5e7eb" };
}

function StatusPill({ stage }) {
  const tone = getStageTone(stage);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        width: "fit-content",
        minHeight: 24,
        padding: "3px 9px",
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.color,
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: "nowrap"
      }}
    >
      {STAGE_LABELS[stage] || stage}
    </span>
  );
}

function SummaryCard({ label, value, hint, tone = "#2563eb", active = false, onClick }) {
  const card = (
    <div
      className="card"
      style={{
        display: "grid",
        gap: 6,
        minHeight: 104,
        borderTop: `3px solid ${tone}`,
        borderColor: active ? tone : undefined,
        background: active ? `${tone}12` : undefined
      }}
    >
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 900 }}>{formatCount(value)}</div>
      {hint ? <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{hint}</div> : null}
    </div>
  );

  if (!onClick) return card;
  return (
    <button type="button" onClick={onClick} style={{ all: "unset", cursor: "pointer", display: "block" }}>
      {card}
    </button>
  );
}

function buildTotals(rows) {
  return rows.reduce(
    (acc, cycle) => {
      const h = getHierarchy(cycle);
      const counts = getEnrollmentCounts(cycle);
      acc.totalCycles += 1;
      acc.totalEnrollment += Number(counts.totalEnrollmentCount || 0);
      acc.lateEnrollment += Number(counts.lateEnrollmentCount || 0);
      acc.teacherDraft += Number(h.teacherDraft || 0);
      acc.teacherSubmittedToCenter += Number(h.teacherSubmittedToCenter || 0);
      acc.centerDraft += Number(h.centerDraft || 0);
      acc.centerSubmittedToFranchise += Number(h.centerSubmittedToFranchise || 0);
      acc.franchiseSubmittedToBusinessPartner += Number(h.franchiseSubmittedToBusinessPartner || 0);
      acc.businessPartnerSubmittedToSuperadmin += Number(h.businessPartnerSubmittedToSuperadmin || 0);
      acc.approved += Number(h.approved || 0);
      acc.rejected += Number(h.rejected || 0);
      if (String(cycle?.resultStatus || "").toUpperCase() === "PUBLISHED") acc.published += 1;
      return acc;
    },
    {
      totalCycles: 0,
      totalEnrollment: 0,
      lateEnrollment: 0,
      teacherDraft: 0,
      teacherSubmittedToCenter: 0,
      centerDraft: 0,
      centerSubmittedToFranchise: 0,
      franchiseSubmittedToBusinessPartner: 0,
      businessPartnerSubmittedToSuperadmin: 0,
      approved: 0,
      rejected: 0,
      published: 0
    }
  );
}

function buildCards({ role, rows, total }) {
  const totals = buildTotals(rows);
  const common = [
    { key: "ALL", label: "Total Cycles", value: total ?? totals.totalCycles, hint: `${rows.length} loaded`, tone: "#2563eb" },
    { key: "ENROLLMENT", label: "Enrollment", value: totals.totalEnrollment, hint: "Scoped students", tone: "#0f766e" },
    { key: "LATE_ONLY", label: "Late Requests", value: totals.lateEnrollment, hint: "Approved late entries", tone: "#b45309" },
    { key: "RESULT_PUBLISHED", label: "Published Results", value: totals.published, hint: "Visible result cycles", tone: "#059669" }
  ];

  if (role === "BP") {
    return [
      ...common,
      { key: "BP_REVIEW", label: "BP Review", value: totals.franchiseSubmittedToBusinessPartner, hint: "Franchise submissions", tone: "#9333ea" },
      { key: "SUPERADMIN_REVIEW", label: "Sent Upward", value: totals.businessPartnerSubmittedToSuperadmin, hint: "Submitted to Superadmin", tone: "#ea580c" },
      { key: "APPROVED", label: "Approved", value: totals.approved, hint: "Finalized lists", tone: "#16a34a" }
    ];
  }

  if (role === "FRANCHISE") {
    return [
      ...common,
      { key: "FRANCHISE_REVIEW", label: "Franchise Review", value: totals.centerSubmittedToFranchise, hint: "Center submissions", tone: "#7c3aed" },
      { key: "BP_REVIEW", label: "Sent to BP", value: totals.franchiseSubmittedToBusinessPartner, hint: "Forwarded lists", tone: "#9333ea" },
      { key: "REJECTED", label: "Returned", value: totals.rejected, hint: "Needs correction", tone: "#dc2626" }
    ];
  }

  if (role === "CENTER") {
    return [
      ...common,
      { key: "CENTER_REVIEW", label: "Teacher Submitted", value: totals.teacherSubmittedToCenter, hint: "Ready to combine", tone: "#0284c7" },
      { key: "FRANCHISE_REVIEW", label: "Sent to Franchise", value: totals.centerSubmittedToFranchise, hint: "Center lists forwarded", tone: "#7c3aed" },
      { key: "REJECTED", label: "Returned", value: totals.rejected, hint: "Needs correction", tone: "#dc2626" }
    ];
  }

  return [
    ...common,
    { key: "TEACHER_DRAFT", label: "Draft Lists", value: totals.teacherDraft, hint: "Not submitted", tone: "#64748b" },
    { key: "CENTER_REVIEW", label: "Submitted", value: totals.teacherSubmittedToCenter, hint: "With center", tone: "#0284c7" },
    { key: "REJECTED", label: "Returned", value: totals.rejected, hint: "Can edit again", tone: "#dc2626" }
  ];
}

function rowMatchesMetric(cycle, metric) {
  if (!metric || metric === "ALL") return true;
  const h = getHierarchy(cycle);
  const counts = getEnrollmentCounts(cycle);
  if (metric === "ENROLLMENT") return Number(counts.totalEnrollmentCount || 0) > 0;
  if (metric === "LATE_ONLY") return Number(counts.lateEnrollmentCount || 0) > 0;
  if (metric === "TEACHER_DRAFT") return Number(h.teacherDraft || 0) > 0;
  if (metric === "REJECTED") return Number(h.rejected || 0) > 0;
  return getCycleStage(cycle) === metric;
}

function ExamCycleActions({ cycle, role, config }) {
  const actions = getAvailableActions(cycle, role);
  const basePath = config.basePath;

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", minWidth: 220 }}>
      {actions.manageEnrollment ? (
        <Link className="button secondary" style={{ width: "auto" }} to={`${basePath}/${cycle.id}`}>
          {config.manageLabel || "Manage"}
        </Link>
      ) : null}
      {actions.pendingLists ? (
        <Link className="button secondary" style={{ width: "auto" }} to={`${basePath}/${cycle.id}/pending`}>
          {config.pendingLabel || "Pending Lists"}
        </Link>
      ) : null}
      {actions.lateEnrollment ? (
        <Link className="button secondary" style={{ width: "auto" }} to={`${basePath}/${cycle.id}/late-enrollment`}>
          Late Requests
        </Link>
      ) : null}
      {actions.results ? (
        <Link className="button secondary" style={{ width: "auto" }} to={`${basePath}/${cycle.id}/results`}>
          Results
        </Link>
      ) : (
        <button
          className="button secondary"
          type="button"
          disabled
          title={actions.resultsLockedReason || "Results are locked"}
          style={{ width: "auto" }}
        >
          Results Locked
        </button>
      )}
    </div>
  );
}

function ExamCycleRoleDashboard({ role }) {
  const config = ROLE_CONFIGS[role] || ROLE_CONFIGS.BP;
  const [searchParams] = useSearchParams();
  const routeFocusFilter = searchParams.get("focus") === "late" ? "LATE_ONLY" : "ALL";

  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState("ACTIVE");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState(routeFocusFilter);
  const [resultFilter, setResultFilter] = useState("ALL");

  const load = async (next = { limit, offset, filter: lifecycleFilter }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listExamCycles(next);
      setRows(data?.data?.items || []);
      setLimit(data?.data?.limit ?? next.limit);
      setOffset(data?.data?.offset ?? next.offset);
      setTotal(data?.data?.total ?? 0);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load exam cycles.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ limit: 20, offset: 0, filter: lifecycleFilter });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifecycleFilter]);

  useEffect(() => {
    setStageFilter(routeFocusFilter);
  }, [routeFocusFilter]);

  const cards = useMemo(() => buildCards({ role, rows, total }), [role, rows, total]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((cycle) => {
      if (!rowMatchesMetric(cycle, stageFilter)) return false;
      const resultStatus = String(cycle?.resultStatus || "").toUpperCase();
      if (resultFilter !== "ALL" && resultStatus !== resultFilter) return false;
      if (!q) return true;
      return [
        cycle?.code,
        cycle?.name,
        cycle?.businessPartner?.code,
        cycle?.businessPartner?.name,
        getCycleStage(cycle),
        cycle?.enrollmentListSummary?.currentOwnerRole
      ].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [rows, search, stageFilter, resultFilter]);

  if (loading && !rows.length) {
    return <LoadingState label="Loading exam cycles..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>{config.title}</h2>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>{config.subtitle}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>Hierarchy: {config.hierarchy}</div>
        </div>
        <button className="button secondary" type="button" onClick={() => void load({ limit, offset, filter: lifecycleFilter })} style={{ width: "auto" }} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 12 }}>
        {cards.map(({ key, ...card }) => (
          <SummaryCard
            key={key}
            {...card}
            active={stageFilter === key}
            onClick={() => setStageFilter(key)}
          />
        ))}
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Search
            <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Code, name, partner, status" />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Lifecycle
            <select
              className="input"
              value={lifecycleFilter}
              onChange={(event) => {
                setOffset(0);
                setLifecycleFilter(event.target.value);
              }}
            >
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="ARCHIVED">Archived</option>
              <option value="ALL">All</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Workflow
            <select className="input" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
              <option value="ALL">All workflow</option>
              <option value="ENROLLMENT">Has enrollment</option>
              <option value="LATE_ONLY">Late requests</option>
              <option value="CENTER_REVIEW">Center review</option>
              <option value="FRANCHISE_REVIEW">Franchise review</option>
              <option value="BP_REVIEW">BP review</option>
              <option value="SUPERADMIN_REVIEW">Superadmin review</option>
              <option value="APPROVED">Approved</option>
              <option value="RESULT_REVIEW">Result review</option>
              <option value="RESULT_PUBLISHED">Result published</option>
              <option value="REJECTED">Returned</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
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
              setSearch("");
              setStageFilter("ALL");
              setResultFilter("ALL");
            }}
          >
            Reset
          </button>
        </div>
        <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          Showing {visibleRows.length} of {rows.length} loaded cycles. {config.pendingHint || "Use actions to continue workflow."}
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <DataTable
        emptyMessage={error ? "Unable to load exam cycles. Use Refresh to retry." : "No exam cycles match the selected filters."}
        columns={[
          {
            key: "exam",
            header: "Exam",
            render: (cycle) => (
              <div style={{ display: "grid", gap: 2 }}>
                <strong>{cycle?.name || "Untitled exam"}</strong>
                <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{cycle?.code || "-"}</span>
              </div>
            )
          },
          {
            key: "workflow",
            header: "Workflow",
            render: (cycle) => (
              <div style={{ display: "grid", gap: 4 }}>
                <StatusPill stage={getCycleStage(cycle)} />
                <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                  Owner: {cycle?.enrollmentListSummary?.currentOwnerRole || "System"}
                </span>
              </div>
            )
          },
          {
            key: "enrollment",
            header: "Enrollment",
            render: (cycle) => {
              const counts = getEnrollmentCounts(cycle);
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
            key: "handoff",
            header: "Handoff",
            render: (cycle) => {
              const h = getHierarchy(cycle);
              return (
                <div style={{ display: "grid", gap: 2, minWidth: 150 }}>
                  <span>Teacher: {formatCount(h.teacherSubmittedToCenter)}</span>
                  <span>Center: {formatCount(h.centerSubmittedToFranchise)}</span>
                  <span>BP: {formatCount(h.franchiseSubmittedToBusinessPartner)}</span>
                  <span>Approved: {formatCount(h.approved)}</span>
                </div>
              );
            }
          },
          {
            key: "windows",
            header: "Windows",
            render: (cycle) => (
              <div style={{ display: "grid", gap: 4, minWidth: 220 }}>
                <div><strong>Enroll:</strong> {formatDateRange(cycle.enrollmentStartAt, cycle.enrollmentEndAt)}</div>
                <div><strong>Exam:</strong> {formatDateRange(cycle.examStartsAt, cycle.examEndsAt)}</div>
              </div>
            )
          },
          {
            key: "result",
            header: "Result",
            render: (cycle) => <StatusPill stage={String(cycle?.resultStatus || "DRAFT").toUpperCase()} />
          },
          {
            key: "actions",
            header: "Actions",
            render: (cycle) => <ExamCycleActions cycle={cycle} role={role} config={config} />
          }
        ]}
        rows={visibleRows}
        keyField="id"
      />

      <PaginationBar
        limit={limit}
        offset={offset}
        count={rows.length}
        total={total}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load({ ...next, filter: lifecycleFilter });
        }}
      />
    </section>
  );
}

export {
  ExamCycleRoleDashboard,
  getAvailableActions,
  getCycleStage,
  buildCards,
  formatDateRange,
  ROLE_CONFIGS
};
