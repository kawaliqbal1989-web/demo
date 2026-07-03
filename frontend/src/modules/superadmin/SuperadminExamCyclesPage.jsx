import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  listExamCycles,
  getExamCycleArchiveImpact,
  archiveExamCycle,
  restoreExamCycle,
  getExamCycleDeleteImpact,
  getExamCycleAuditCheck,
  deleteExamCycle
} from "../../services/examCyclesService";

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatDateRange(startValue, endValue) {
  return `${formatDateTime(startValue)} → ${formatDateTime(endValue)}`;
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
  const certificateStatus = cycle.resultStatus === "PUBLISHED" ? "healthy" : "warning";
  const overall = [enrollmentStatus, assignmentStatus, examStatus, resultStatus, certificateStatus].includes("critical")
    ? "critical"
    : [enrollmentStatus, assignmentStatus, examStatus, resultStatus, certificateStatus].includes("warning")
      ? "warning"
      : "healthy";

  return {
    enrollmentStatus,
    assignmentStatus,
    examStatus,
    resultStatus,
    certificateStatus,
    overall
  };
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

function getEnrollmentTotal(cycle) {
  return Number(cycle?.enrollmentCounts?.totalEnrollmentCount || 0);
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

function SuperadminExamCyclesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routeHierarchyFilter = searchParams.get("focus") === "late" ? "LATE_ONLY" : "ALL";
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ACTIVE");
  const [searchQuery, setSearchQuery] = useState("");
  const [resultFilter, setResultFilter] = useState("ALL");
  const [hierarchyFilter, setHierarchyFilter] = useState(routeHierarchyFilter);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveImpactLoading, setArchiveImpactLoading] = useState(false);
  const [archiveImpactData, setArchiveImpactData] = useState(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveConfirmCode, setArchiveConfirmCode] = useState("");
  const [archivePassword, setArchivePassword] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restorePassword, setRestorePassword] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [selectedHealthCycle, setSelectedHealthCycle] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteImpact, setDeleteImpact] = useState(null);
  const [deleteImpactLoading, setDeleteImpactLoading] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteConfirmCode, setDeleteConfirmCode] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [auditCycleId, setAuditCycleId] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditData, setAuditData] = useState(null);

  const load = useCallback(async ({ limit: nextLimit = 20, offset: nextOffset = 0, filter: nextFilter = filter } = {}) => {
    setLoading(true);
    setError("");
    try {
      const data = await listExamCycles({ limit: nextLimit, offset: nextOffset, filter: nextFilter });
      setRows(data?.data?.items || []);
      setLimit(data?.data?.limit ?? nextLimit);
      setOffset(data?.data?.offset ?? nextOffset);
      setTotal(data?.data?.total ?? 0);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load exam cycles.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load({ limit: 20, offset: 0, filter });
  }, [load, filter]);

  useEffect(() => {
    setHierarchyFilter(routeHierarchyFilter);
  }, [routeHierarchyFilter]);

  const hierarchyTotals = useMemo(() => {
    return rows.reduce((acc, cycle) => {
      const h = getHierarchy(cycle);
      acc.teacherSubmittedToCenter += Number(h.teacherSubmittedToCenter || 0);
      acc.centerSubmittedToFranchise += Number(h.centerSubmittedToFranchise || 0);
      acc.franchiseSubmittedToBusinessPartner += Number(h.franchiseSubmittedToBusinessPartner || 0);
      acc.businessPartnerSubmittedToSuperadmin += Number(h.businessPartnerSubmittedToSuperadmin || 0);
      acc.approved += Number(h.approved || 0);
      acc.rejected += Number(h.rejected || 0);
      acc.totalEnrollment += getEnrollmentTotal(cycle);
      return acc;
    }, {
      teacherSubmittedToCenter: 0,
      centerSubmittedToFranchise: 0,
      franchiseSubmittedToBusinessPartner: 0,
      businessPartnerSubmittedToSuperadmin: 0,
      approved: 0,
      rejected: 0,
      totalEnrollment: 0
    });
  }, [rows]);

  const stageCounts = useMemo(() => {
    return rows.reduce((acc, cycle) => {
      const stage = getCycleStage(cycle);
      acc[stage] = (acc[stage] || 0) + 1;
      return acc;
    }, {});
  }, [rows]);

  const visibleRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rows.filter((cycle) => {
      const stage = getCycleStage(cycle);
      const resultStatus = String(cycle?.resultStatus || "").toUpperCase();
      if (resultFilter !== "ALL" && resultStatus !== resultFilter) return false;
      if (hierarchyFilter === "LATE_ONLY" && Number(cycle?.enrollmentCounts?.lateEnrollmentCount || 0) <= 0) return false;
      if (hierarchyFilter !== "ALL" && hierarchyFilter !== "LATE_ONLY" && stage !== hierarchyFilter) return false;
      if (!query) return true;

      return [
        cycle?.code,
        cycle?.name,
        cycle?.businessPartner?.code,
        cycle?.businessPartner?.name,
        stage,
        getCycleOwner(cycle)
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [rows, searchQuery, resultFilter, hierarchyFilter]);

  const dashboardCards = useMemo(() => ([
    { label: "Total Cycles", value: total, hint: `${rows.length} loaded`, tone: "#2563eb" },
    { label: "Enrollment", value: hierarchyTotals.totalEnrollment, hint: "Students in loaded cycles", tone: "#0f766e" },
    { label: "Center Review", value: hierarchyTotals.teacherSubmittedToCenter, hint: "Teacher lists submitted", tone: "#0284c7" },
    { label: "Franchise Review", value: hierarchyTotals.centerSubmittedToFranchise, hint: "Center lists submitted", tone: "#7c3aed" },
    { label: "BP Review", value: hierarchyTotals.franchiseSubmittedToBusinessPartner, hint: "Franchise lists submitted", tone: "#9333ea" },
    { label: "Superadmin Review", value: hierarchyTotals.businessPartnerSubmittedToSuperadmin, hint: "Ready for approval", tone: "#ea580c" },
    { label: "Approved Lists", value: hierarchyTotals.approved, hint: "Worksheet package ready", tone: "#16a34a" },
    { label: "Published Results", value: stageCounts.RESULT_PUBLISHED || 0, hint: "Cycles published", tone: "#059669" }
  ]), [hierarchyTotals, rows.length, stageCounts, total]);

  const openArchiveDialog = useCallback(async (cycle) => {
    setArchiveTarget(cycle || null);
    setArchiveDialogOpen(true);
    setArchiveImpactLoading(true);
    setArchiveImpactData(null);
    setArchiveConfirmCode("");
    setArchivePassword("");
    setArchiveReason("");
    try {
      const response = await getExamCycleArchiveImpact(cycle.id);
      setArchiveImpactData(response?.data || null);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to load archive impact.");
    } finally {
      setArchiveImpactLoading(false);
    }
  }, []);

  const showArchiveImpact = useCallback(async (cycle) => {
    setArchiveImpactLoading(true);
    try {
      const response = await getExamCycleArchiveImpact(cycle.id);
      setArchiveImpactData(response?.data || null);
      setSelectedHealthCycle(cycle);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to load archive impact.");
    } finally {
      setArchiveImpactLoading(false);
    }
  }, []);

  const handleArchiveConfirm = useCallback(async () => {
    if (!archiveTarget) return;
    setArchiveBusy(true);
    try {
      await archiveExamCycle(archiveTarget.id, {
        password: archivePassword,
        confirmCode: archiveConfirmCode,
        archiveReason
      });
      toast.success(`Archived exam cycle ${archiveTarget.code}`);
      setArchiveDialogOpen(false);
      setArchiveTarget(null);
      setArchiveImpactData(null);
      await load({ limit, offset, filter });
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Archive failed.");
    } finally {
      setArchiveBusy(false);
    }
  }, [archiveTarget, archivePassword, archiveConfirmCode, archiveReason, load, limit, offset, filter]);

  const openRestoreDialog = useCallback((cycle) => {
    setRestoreTarget(cycle || null);
    setRestorePassword("");
    setRestoreDialogOpen(true);
  }, []);

  const handleRestoreConfirm = useCallback(async () => {
    if (!restoreTarget) return;
    setRestoreBusy(true);
    try {
      await restoreExamCycle(restoreTarget.id, { password: restorePassword });
      toast.success(`Restored exam cycle ${restoreTarget.code}`);
      setRestoreDialogOpen(false);
      setRestoreTarget(null);
      await load({ limit, offset, filter });
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Restore failed.");
    } finally {
      setRestoreBusy(false);
    }
  }, [restoreTarget, restorePassword, load, limit, offset, filter]);

  const openDeleteDialog = useCallback(async (cycle) => {
    setDeleteTarget(cycle || null);
    setDeleteImpact(null);
    setDeleteConfirmCode("");
    setDeletePassword("");
    setDeleteImpactLoading(true);
    setDeleteDialogOpen(true);
    try {
      const response = await getExamCycleDeleteImpact(cycle.id);
      setDeleteImpact(response?.data || null);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load delete impact.");
      toast.error(getFriendlyErrorMessage(err) || "Failed to load delete impact.");
    } finally {
      setDeleteImpactLoading(false);
    }
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteExamCycle(deleteTarget.id, {
        password: deletePassword,
        confirmCode: deleteConfirmCode
      });
      toast.success(`Deleted exam cycle ${deleteTarget.code || deleteTarget.name}`);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      setDeleteImpact(null);
      setDeleteConfirmCode("");
      setDeletePassword("");
      if (auditCycleId === deleteTarget.id) {
        setAuditCycleId("");
        setAuditData(null);
      }
      await load({ limit, offset });
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Delete failed.");
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, load, limit, offset, auditCycleId, deletePassword, deleteConfirmCode]);

  const handleAuditCheck = useCallback(async (cycleId) => {
    setAuditCycleId(cycleId);
    setAuditLoading(true);
    try {
      const response = await getExamCycleAuditCheck(cycleId);
      setAuditData(response?.data || null);
    } catch (err) {
      setAuditData(null);
      toast.error(getFriendlyErrorMessage(err) || "Failed to load audit check.");
    } finally {
      setAuditLoading(false);
    }
  }, []);

  if (loading && !rows.length) {
    return <LoadingState label="Loading exam cycles..." />;
  }

  const impactSummary = deleteImpact?.summary;
  const impactFlags = deleteImpact?.flags;
  const impactBlockers = deleteImpact?.blockers || [];
  const impactWarnings = deleteImpact?.warnings || [];

  const deleteMessage = deleteImpactLoading
    ? "Loading impact check..."
    : [
        impactSummary
          ? `Impact: lists ${impactSummary.listCount}, approved lists ${impactSummary.approvedListCount}, entries ${impactSummary.entryCount}, worksheets ${impactSummary.worksheetCount}, submissions ${impactSummary.submissionCount}.`
          : "Impact details unavailable.",
        impactBlockers.length ? `Blockers: ${impactBlockers.join(" ")}` : "",
        impactWarnings.length ? `Warnings: ${impactWarnings.join(" ")}` : "",
        "Enter your superadmin password to confirm hard delete."
      ]
        .filter(Boolean)
        .join(" ");

  const deleteCodeTarget = String(deleteTarget?.code || "");
  const isDeleteFormValid =
    Boolean(deletePassword.trim())
    && Boolean(deleteConfirmCode.trim())
    && deleteConfirmCode.trim().toUpperCase() === deleteCodeTarget.toUpperCase()
    && Boolean(impactFlags?.canDelete)
    && !deleteImpactLoading;

  const archiveCodeTarget = String(archiveTarget?.code || "");
  const isArchiveValid =
    archiveReason.trim().length >= 20
    && archivePassword.trim().length > 0
    && archiveConfirmCode.trim().toUpperCase() === archiveCodeTarget.toUpperCase();

  const healthCycle = selectedHealthCycle || rows[0] || null;
  const lifecycleHealth = resolveLifecycleHealth(healthCycle);

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Exam Cycles</h2>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
            Superadmin rollout view across teacher, center, franchise, BP, and approval stages.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate("/superadmin/exam-results")}
            style={{ width: "auto" }}
          >
            Result Control Center
          </button>

          <button
            className="button"
            type="button"
            onClick={() => navigate("/superadmin/exam-cycles/new")}
            style={{ width: "auto" }}
          >
            Create Exam Cycle
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {dashboardCards.map((card) => (
          <SummaryCard key={card.label} {...card} />
        ))}
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <strong>Hierarchy Queue</strong>
            <div style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 4 }}>
              Counts are list-level handoffs inside the currently loaded exam cycles.
            </div>
          </div>
          <button className="button secondary" type="button" onClick={() => void load({ limit, offset })} style={{ width: "auto" }} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          {[
            ["Center", "Teacher lists", hierarchyTotals.teacherSubmittedToCenter, "#0284c7"],
            ["Franchise", "Center submissions", hierarchyTotals.centerSubmittedToFranchise, "#7c3aed"],
            ["Business Partner", "Franchise submissions", hierarchyTotals.franchiseSubmittedToBusinessPartner, "#9333ea"],
            ["Superadmin", "BP submissions", hierarchyTotals.businessPartnerSubmittedToSuperadmin, "#ea580c"],
            ["Approved", "Finalized lists", hierarchyTotals.approved, "#16a34a"]
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

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13, minWidth: 220 }}>
            Search
            <input
              className="input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Code, name, BP, owner"
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13, minWidth: 150 }}>
            Lifecycle
            <select
              className="input"
              value={filter}
              onChange={(event) => {
                const next = event.target.value;
                setFilter(next);
                setOffset(0);
              }}
            >
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="ARCHIVED">Archived</option>
              <option value="ALL">All</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13, minWidth: 170 }}>
            Hierarchy Stage
            <select className="input" value={hierarchyFilter} onChange={(event) => setHierarchyFilter(event.target.value)}>
              <option value="ALL">All stages</option>
              <option value="LATE_ONLY">Late requests</option>
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
          <label style={{ display: "grid", gap: 4, fontSize: 13, minWidth: 150 }}>
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
              setResultFilter("ALL");
              setHierarchyFilter("ALL");
            }}
          >
            Reset
          </button>
          <div style={{ marginLeft: "auto", color: "var(--color-text-muted)", fontSize: 13 }}>
            Showing {visibleRows.length} of {rows.length} loaded
          </div>
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <strong>Selected Cycle Health</strong>
        <div style={{ color: "var(--muted)" }}>
          {healthCycle ? `Cycle: ${healthCycle.name} (${healthCycle.code})` : "No cycle selected"}
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
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 145 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: indicator.dot, display: "inline-block" }} />
                  <span>{label}</span>
                  <strong style={{ color: indicator.color }}>{indicator.label}</strong>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

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
            key: "businessPartner",
            header: "Business Partner",
            render: (r) => (
              <div style={{ display: "grid", gap: 2 }}>
                <strong>{r?.businessPartner?.code || "Unassigned"}</strong>
                <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{r?.businessPartner?.name || "No business partner linked"}</span>
              </div>
            )
          },
          {
            key: "stage",
            header: "Hierarchy",
            render: (r) => {
              const owner = getCycleOwner(r);
              return (
                <div style={{ display: "grid", gap: 4 }}>
                  <StatusPill value={getCycleStage(r)} />
                  <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                    Owner: {owner || "System"}
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
              <div style={{ display: "grid", gap: 4, minWidth: 220 }}>
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
                <span>{r.resultStatus}</span>
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
            render: (r) => (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", minWidth: 360 }}>
                <Link className="button secondary" style={{ width: "auto" }} to={`/superadmin/exam-cycles/${r.id}/pending`}>
                  Pending
                </Link>
                <Link className="button secondary" style={{ width: "auto" }} to={`/superadmin/exam-cycles/${r.id}/results`}>
                  Results
                </Link>
                <Link className="button secondary" style={{ width: "auto" }} to={`/superadmin/exam-cycles/${r.id}/late-enrollment`}>
                  Late
                </Link>
                <button
                  className="button secondary"
                  style={{ width: "auto" }}
                  type="button"
                  onClick={() => {
                    setSelectedHealthCycle(r);
                    void showArchiveImpact(r);
                  }}
                  disabled={archiveImpactLoading}
                >
                  Impact
                </button>
                {!r.isArchived ? (
                  <button
                    className="button secondary"
                    style={{ width: "auto", color: "#92400e" }}
                    type="button"
                    onClick={() => void openArchiveDialog(r)}
                    disabled={archiveBusy}
                  >
                    Archive
                  </button>
                ) : (
                  <button
                    className="button secondary"
                    style={{ width: "auto", color: "#065f46" }}
                    type="button"
                    onClick={() => openRestoreDialog(r)}
                    disabled={restoreBusy}
                  >
                    Restore
                  </button>
                )}
                <button
                  className="button secondary"
                  style={{ width: "auto" }}
                  type="button"
                  onClick={() => {
                    setSelectedHealthCycle(r);
                    void handleAuditCheck(r.id);
                  }}
                  disabled={auditLoading && auditCycleId === r.id}
                >
                  {auditLoading && auditCycleId === r.id ? "Checking..." : "Audit"}
                </button>
                <button
                  className="button secondary"
                  style={{ width: "auto", color: "#dc2626" }}
                  type="button"
                  onClick={() => void openDeleteDialog(r)}
                  disabled={deleteBusy}
                >
                  Delete
                </button>
              </div>
            )
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

      {auditData ? (
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>
              Audit Check: {auditData?.examCycle?.name} ({auditData?.examCycle?.code})
            </h3>
            <button
              type="button"
              className="button secondary"
              style={{ width: "auto" }}
              onClick={() => {
                setAuditData(null);
                setAuditCycleId("");
              }}
            >
              Close
            </button>
          </div>

          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontWeight: 600 }}>Health Checks</div>
            {Object.entries(auditData?.healthChecks || {}).map(([key, value]) => (
              <div key={key} style={{ color: value ? "#dc2626" : "#16a34a" }}>
                {key}: {value ? "Issue" : "OK"}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 600 }}>Timeline</div>
            {(auditData?.timeline || []).length ? (
              (auditData.timeline || []).map((event) => (
                <div key={event.id} style={{ borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: 6 }}>
                  <strong>{event.action}</strong>
                  <div style={{ color: "var(--muted)" }}>
                    {formatDateTime(event.createdAt)} by {event?.user?.username || event?.user?.email || "system"}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: "var(--muted)" }}>No timeline events found.</div>
            )}
          </div>
        </div>
      ) : null}

      {archiveImpactData ? (
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>
              Archive Impact: {archiveImpactData?.examCycle?.name} ({archiveImpactData?.examCycle?.code})
            </strong>
            <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => setArchiveImpactData(null)}>
              Close
            </button>
          </div>
          <div style={{ display: "grid", gap: 4, color: "var(--muted)" }}>
            <div>Enrollment count: {archiveImpactData?.summary?.enrollmentCount ?? 0}</div>
            <div>Approved enrollment count: {archiveImpactData?.summary?.approvedEnrollmentCount ?? 0}</div>
            <div>Result count: {archiveImpactData?.summary?.resultCount ?? 0}</div>
            <div>Worksheet count: {archiveImpactData?.summary?.worksheetCount ?? 0}</div>
            <div>Certificate count: {archiveImpactData?.summary?.certificateCount ?? 0}</div>
            <div>Active dependencies: {JSON.stringify(archiveImpactData?.activeDependencies || {})}</div>
            <div>Warnings: {(archiveImpactData?.warnings || []).join(" | ") || "None"}</div>
          </div>
        </div>
      ) : null}

      {archiveDialogOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 50
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: 540, display: "grid", gap: 10 }}>
            <h3 style={{ margin: 0 }}>Archive {archiveTarget?.name || "exam cycle"}</h3>
            <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
              {archiveImpactLoading ? "Loading archive impact..." : "Archive removes this cycle from active workflows and default selectors while preserving history."}
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Cycle Code</label>
              <input className="input" value={archiveConfirmCode} onChange={(event) => setArchiveConfirmCode(event.target.value)} placeholder={archiveCodeTarget ? `Type ${archiveCodeTarget}` : "Type cycle code"} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Password</label>
              <input className="input" type="password" value={archivePassword} onChange={(event) => setArchivePassword(event.target.value)} placeholder="Enter superadmin password" />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Archive Reason (min 20 chars)</label>
              <textarea className="input" value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} rows={3} placeholder="Explain why this cycle is being archived..." />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                className="button secondary"
                type="button"
                style={{ width: "auto" }}
                onClick={() => {
                  if (archiveBusy) return;
                  setArchiveDialogOpen(false);
                  setArchiveTarget(null);
                }}
              >
                Cancel
              </button>
              <button className="button" type="button" style={{ width: "auto" }} disabled={!isArchiveValid || archiveBusy} onClick={() => void handleArchiveConfirm()}>
                {archiveBusy ? "Archiving..." : "Archive"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {restoreDialogOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 50
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: 480, display: "grid", gap: 10 }}>
            <h3 style={{ margin: 0 }}>Restore {restoreTarget?.name || "exam cycle"}</h3>
            <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
              Restore reactivates workflows and makes the cycle visible in active selectors.
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Password</label>
              <input className="input" type="password" value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} placeholder="Enter superadmin password" />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                className="button secondary"
                type="button"
                style={{ width: "auto" }}
                onClick={() => {
                  if (restoreBusy) return;
                  setRestoreDialogOpen(false);
                  setRestoreTarget(null);
                }}
              >
                Cancel
              </button>
              <button className="button" type="button" style={{ width: "auto" }} disabled={!restorePassword.trim() || restoreBusy} onClick={() => void handleRestoreConfirm()}>
                {restoreBusy ? "Restoring..." : "Restore"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteDialogOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 50
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: 520, display: "grid", gap: 12 }}>
            <h3 style={{ margin: 0 }}>Delete {deleteTarget?.name || "exam cycle"}</h3>
            <p style={{ margin: 0, color: "var(--color-text-muted)" }}>{deleteMessage}</p>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Type exam cycle code to confirm</label>
              <input
                className="input"
                placeholder={deleteCodeTarget ? `Type ${deleteCodeTarget}` : "Type cycle code"}
                value={deleteConfirmCode}
                onChange={(event) => setDeleteConfirmCode(event.target.value)}
                autoFocus
              />
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Expected: {deleteCodeTarget || "N/A"}</div>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Superadmin password</label>
              <input
                className="input"
                type="password"
                placeholder="Enter your current password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                className="button secondary"
                type="button"
                style={{ width: "auto" }}
                onClick={() => {
                  if (deleteBusy) return;
                  setDeleteDialogOpen(false);
                  setDeleteTarget(null);
                  setDeleteImpact(null);
                  setDeleteConfirmCode("");
                  setDeletePassword("");
                }}
              >
                Cancel
              </button>
              <button
                className="button"
                type="button"
                style={{ width: "auto" }}
                disabled={!isDeleteFormValid || deleteBusy}
                onClick={() => {
                  if (!impactFlags?.canDelete) {
                    toast.error(impactBlockers[0] || "Delete is blocked for this exam cycle.");
                    return;
                  }
                  void handleDeleteConfirm();
                }}
              >
                {deleteBusy ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export { SuperadminExamCyclesPage };
