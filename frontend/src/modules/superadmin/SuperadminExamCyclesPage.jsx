import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { QuestionBankWorkspacePage } from "../common/QuestionBankWorkspacePage";
import { SuperadminExamResultsControlCenterPage } from "./SuperadminExamResultsControlCenterPage";
import { SuperadminCourseLevelQuestionBankPage } from "./SuperadminCourseLevelQuestionBankPage";
import { SuperadminCourseLevelWorksheetsPage } from "./SuperadminCourseLevelWorksheetsPage";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  listExamCycles,
  listExamCourses,
  createExamCourse,
  getExamCycleAssessmentConfig,
  saveExamCycleAssessmentConfig,
  generateExamCycleQuestionSet,
  getExamCycleArchiveImpact,
  archiveExamCycle,
  restoreExamCycle,
  getExamCycleDeleteImpact,
  getExamCycleAuditCheck,
  getExamCycleQuestionPreview,
  deleteExamCycle
} from "../../services/examCyclesService";
import { archiveCourse, deleteCourse, updateCourse } from "../../services/coursesService";
import { deleteWorksheet } from "../../services/worksheetsService";

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

const SUPERADMIN_EXAM_TABS = [
  { key: "exam-cycles", label: "Exam Cycles" },
  { key: "exam-courses", label: "Exam Courses" },
  { key: "question-bank", label: "Question Bank" },
  { key: "paper-builder", label: "Paper Builder" },
  { key: "worksheets", label: "Worksheets" },
  { key: "enrollment", label: "Enrollment" },
  { key: "results", label: "Results" }
];

function resolveSuperadminExamTab(searchParams) {
  const tab = String(searchParams.get("tab") || "").trim().toLowerCase();
  const hasKnownTab = SUPERADMIN_EXAM_TABS.some((entry) => entry.key === tab);
  if (hasKnownTab) return tab;
  if (searchParams.get("focus") === "late") return "enrollment";
  return "exam-cycles";
}

function normalizeExamCycleLifecycleState(cycle = {}) {
  const candidates = [
    cycle?.lifecycleStatus,
    cycle?.status,
    cycle?.state,
    cycle?.workflowStage,
    cycle?.resultStatus,
    cycle?.stage
  ];

  const editableStatuses = new Set(["DRAFT", "CONFIGURING", "RETURNED", "REOPENED", "NEW"]);
  const lockedStatuses = new Set(["APPROVED", "FINISHED", "COMPLETED", "RESULT_PUBLISHED", "RESULTPUBLISHED", "CLOSED", "ARCHIVED", "LOCKED", "READY_FOR_REVIEW", "PUBLISHED"]);

  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim().toUpperCase();
    if (!normalized) continue;
    if (editableStatuses.has(normalized)) return "EDITABLE";
    if (lockedStatuses.has(normalized)) return "LOCKED";
  }

  return cycle?.isArchived ? "LOCKED" : "EDITABLE";
}

function isExamCycleEditable(cycle = {}) {
  return normalizeExamCycleLifecycleState(cycle) === "EDITABLE";
}

function SuperadminExamCyclesWorkspacePanel({ routeHierarchyFilter = "ALL" } = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  const [questionPreviewLoading, setQuestionPreviewLoading] = useState(false);
  const [questionPreview, setQuestionPreview] = useState(null);

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

  const selectedExamCourseId = String(searchParams.get("examCourseId") || "").trim();
  const selectedExamLevelNumber = String(searchParams.get("examLevelNumber") || "").trim();

  const buildPendingRouteTarget = useCallback((examCycleId) => {
    const params = new URLSearchParams();
    if (selectedExamCourseId) {
      params.set("examCourseId", selectedExamCourseId);
    }
    if (selectedExamLevelNumber) {
      params.set("examLevelNumber", selectedExamLevelNumber);
    }

    return {
      pathname: `/superadmin/exam-cycles/${examCycleId}/pending`,
      search: params.toString() ? `?${params.toString()}` : ""
    };
  }, [selectedExamCourseId, selectedExamLevelNumber]);

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

  const handleQuestionPreview = useCallback(async (levelId) => {
    if (!auditCycleId || !levelId) return;
    setQuestionPreviewLoading(true);
    setQuestionPreview(null);
    try {
      const response = await getExamCycleQuestionPreview(auditCycleId, { levelId });
      setQuestionPreview(response?.data || null);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to load question preview.");
    } finally {
      setQuestionPreviewLoading(false);
    }
  }, [auditCycleId]);


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
    && deleteConfirmCode.trim() === deleteCodeTarget
    && Boolean(impactFlags?.canDelete)
    && !deleteImpactLoading;

  const archiveCodeTarget = String(archiveTarget?.code || "");
  const isArchiveValid =
    archiveReason.trim().length >= 20
    && archivePassword.trim().length > 0
    && archiveConfirmCode.trim() === archiveCodeTarget;

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
            onClick={() => navigate("/superadmin/exam-cycles?tab=results")}
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
                <Link
                  className="button secondary"
                  style={{ width: "auto" }}
                  to={buildPendingRouteTarget(r.id)}
                  state={{
                    examCycleContext: {
                      examCycleId: r.id,
                      examCycleCode: r.code,
                      examCycleTitle: r.name,
                      examCourseId: selectedExamCourseId || null,
                      examLevelNumber: selectedExamLevelNumber || null
                    }
                  }}
                >
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
                setQuestionPreview(null);
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

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700 }}>Academic Configuration Audit</div>
                <div style={{ color: "var(--color-text-muted)", fontSize: 12, marginTop: 2 }}>
                  Level-wise source, question count, duration, assignment coverage, and answer-key readiness.
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
                <span>Levels: <strong>{auditData?.academicAudit?.summary?.levelCount ?? 0}</strong></span>
                <span>Ready: <strong>{auditData?.academicAudit?.summary?.readyLevelCount ?? 0}</strong></span>
                <span>Assigned: <strong>{auditData?.academicAudit?.summary?.assignedStudentCount ?? 0}</strong></span>
                <span>Missing: <strong>{auditData?.academicAudit?.summary?.missingAssignmentCount ?? 0}</strong></span>
              </div>
            </div>

            {(auditData?.academicAudit?.levels || []).length ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                  <thead>
                    <tr>
                      {["Level", "Source", "Questions", "Duration", "Students", "Assigned Worksheets", "Answer Key", "Status", "Action"].map((header) => (
                        <th key={header} style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--color-border)", fontSize: 12 }}>
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(auditData.academicAudit.levels || []).map((level) => {
                      const statusColor = level.readiness === "READY" ? "#166534" : level.readiness === "NOT_READY" ? "#dc2626" : "#92400e";
                      const actualCounts = Array.isArray(level.actualQuestionCounts) && level.actualQuestionCounts.length
                        ? level.actualQuestionCounts.join(", ")
                        : "—";
                      return (
                        <tr key={level.levelId}>
                          <td style={{ padding: "10px", borderBottom: "1px solid var(--color-border)" }}>
                            <strong>{level.levelName || `Level ${level.levelRank || ""}`}</strong>
                            <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>Rank {level.levelRank ?? "—"}</div>
                          </td>
                          <td style={{ padding: "10px", borderBottom: "1px solid var(--color-border)" }}>
                            <div>{formatStatusLabel(level.assessmentType || "NOT_CONFIGURED")}</div>
                            <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>{level.sourceName || "—"}</div>
                          </td>
                          <td style={{ padding: "10px", borderBottom: "1px solid var(--color-border)" }}>
                            <div>Configured: <strong>{level.configuredQuestionCount || 0}</strong></div>
                            <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>Assigned: {actualCounts}</div>
                          </td>
                          <td style={{ padding: "10px", borderBottom: "1px solid var(--color-border)" }}>
                            {level.configuredDurationMinutes || 0} min
                          </td>
                          <td style={{ padding: "10px", borderBottom: "1px solid var(--color-border)" }}>
                            <div>{level.assignedStudentCount}/{level.enrolledStudentCount}</div>
                            {level.missingAssignmentCount > 0 ? (
                              <div style={{ color: "#dc2626", fontSize: 11 }}>{level.missingAssignmentCount} missing</div>
                            ) : null}
                          </td>
                          <td style={{ padding: "10px", borderBottom: "1px solid var(--color-border)" }}>
                            {level.assignedWorksheetCount || 0}
                          </td>
                          <td style={{ padding: "10px", borderBottom: "1px solid var(--color-border)" }}>
                            {level.missingAnswerKeyCount > 0 ? (
                              <span style={{ color: "#dc2626" }}>{level.missingAnswerKeyCount} missing</span>
                            ) : (
                              <span style={{ color: "#166534" }}>Valid</span>
                            )}
                          </td>
                          <td style={{ padding: "10px", borderBottom: "1px solid var(--color-border)" }}>
                            <strong style={{ color: statusColor }}>{formatStatusLabel(level.readiness)}</strong>
                            {(level.issues || []).length ? (
                              <div style={{ color: "var(--color-text-muted)", fontSize: 11, maxWidth: 280 }}>
                                {(level.issues || []).join(" ")}
                              </div>
                            ) : null}
                          </td>
                          <td style={{ padding: "10px", borderBottom: "1px solid var(--color-border)" }}>
                            <button
                              type="button"
                              className="button secondary"
                              style={{ width: "auto" }}
                              disabled={questionPreviewLoading}
                              onClick={() => void handleQuestionPreview(level.levelId)}
                            >
                              {questionPreviewLoading ? "Loading..." : "Preview Questions"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ color: "var(--color-text-muted)" }}>No participating levels or academic configuration found.</div>
            )}
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

      {questionPreview ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 70
          }}
        >
          <div className="card" style={{ width: "min(960px, 100%)", maxHeight: "90vh", overflow: "auto", display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <h3 style={{ margin: 0 }}>Question Preview · {questionPreview?.level?.name || "Level"}</h3>
                <div style={{ color: "var(--color-text-muted)", fontSize: 12, marginTop: 4 }}>
                  {formatStatusLabel(questionPreview?.previewType || "")}
                  {questionPreview?.student ? ` · ${questionPreview.student.admissionNo || ""} ${questionPreview.student.firstName || ""} ${questionPreview.student.lastName || ""}` : ""}
                </div>
              </div>
              <button type="button" className="button secondary" style={{ width: "auto" }} onClick={() => setQuestionPreview(null)}>
                Close
              </button>
            </div>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
              <span>Questions: <strong>{questionPreview?.worksheet?.questionCount ?? 0}</strong></span>
              <span>Duration: <strong>{questionPreview?.worksheet?.timeLimitMinutes ?? "—"} min</strong></span>
              <span>Worksheet: <strong>{questionPreview?.worksheet?.title || "Question Bank"}</strong></span>
              {questionPreview?.assignedAt ? <span>Assigned: <strong>{formatDateTime(questionPreview.assignedAt)}</strong></span> : null}
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {(questionPreview?.worksheet?.questions || []).map((question) => (
                <div key={question.id || question.questionNumber} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 12, display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <strong>Q{question.questionNumber}</strong>
                    <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                      {question.operation || "Question"}
                    </span>
                  </div>
                  <div style={{ fontSize: 15 }}>
                    {Array.isArray(question.operands)
                      ? question.operands.join(` ${question.operation || ""} `)
                      : typeof question.operands === "object" && question.operands !== null
                        ? JSON.stringify(question.operands)
                        : String(question.operands ?? "Question content unavailable")}
                  </div>
                  <div style={{ color: "#166534", fontWeight: 700 }}>
                    Correct answer: {String(question.correctAnswer ?? "Missing")}
                  </div>
                  {question.questionBankId ? (
                    <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>Source question: {question.questionBankId}</div>
                  ) : null}
                </div>
              ))}
            </div>
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
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Expected: {archiveCodeTarget || "N/A"}</div>
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

function SuperadminExamCoursesWorkspacePanel() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savingCourse, setSavingCourse] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState("");
  const [busyActionCourseId, setBusyActionCourseId] = useState("");
  const [courseForm, setCourseForm] = useState({
    code: "",
    name: "",
    status: "ACTIVE",
    description: ""
  });

  const buildExamWorkspaceTabHref = useCallback((tab, courseId, levelNumber) => {
    const params = new URLSearchParams({
      tab: String(tab || ""),
      examCourseId: String(courseId || ""),
      examLevelNumber: String(levelNumber || "")
    });
    return `/superadmin/exam-cycles?${params.toString()}`;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listExamCourses();
      setRows(Array.isArray(data?.data?.items) ? data.data.items : []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load exam courses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreateCourse = useCallback(async () => {
    const code = String(courseForm.code || "").trim();
    const name = String(courseForm.name || "").trim();
    const status = String(courseForm.status || "ACTIVE").toUpperCase() === "INACTIVE" ? "ARCHIVED" : "ACTIVE";
    const description = String(courseForm.description || "").trim();

    if (!code || !name) {
      toast.error("Code and name are required.");
      return;
    }

    setSavingCourse(true);
    try {
      if (editingCourseId) {
        await updateCourse({
          id: editingCourseId,
          name,
          status,
          description: description || null
        });
        toast.success("Exam course updated.");
      } else {
        await createExamCourse({
          code,
          name,
          status,
          description: description || null
        });
        toast.success("Exam course created.");
      }
      setEditingCourseId("");
      setCourseForm({ code: "", name: "", status: "ACTIVE", description: "" });
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || (editingCourseId ? "Failed to update exam course." : "Failed to create exam course."));
    } finally {
      setSavingCourse(false);
    }
  }, [courseForm, editingCourseId, load]);

  const handleDeactivateCourse = useCallback(async (course) => {
    if (!course?.id || course?.isActive !== true) {
      return;
    }

    setBusyActionCourseId(course.id);
    try {
      await archiveCourse(course.id);
      toast.success("Exam course deactivated.");
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to deactivate exam course.");
    } finally {
      setBusyActionCourseId("");
    }
  }, [load]);

  const handleDeleteCourse = useCallback(async (course) => {
    if (!course?.id) {
      return;
    }

    const confirmed = window.confirm(`Delete course "${course.name}" permanently?`);
    if (!confirmed) {
      return;
    }

    setBusyActionCourseId(course.id);
    try {
      await deleteCourse(course.id);
      toast.success("Exam course deleted.");
      if (editingCourseId === course.id) {
        setEditingCourseId("");
        setCourseForm({ code: "", name: "", status: "ACTIVE", description: "" });
      }
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to delete exam course.");
    } finally {
      setBusyActionCourseId("");
    }
  }, [editingCourseId, load]);

  const filteredRows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((course) => {
      const statusText = course?.isActive ? "ACTIVE" : "INACTIVE";
      const matchesStatus = !statusFilter || statusText === statusFilter;
      const matchesQuery = !query
        || String(course?.code || "").toLowerCase().includes(query)
        || String(course?.name || "").toLowerCase().includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [rows, q, statusFilter]);

  const pagedRows = useMemo(() => {
    return filteredRows.slice(offset, offset + limit);
  }, [filteredRows, offset, limit]);

  useEffect(() => {
    if (offset >= filteredRows.length && filteredRows.length > 0) {
      setOffset(Math.max(0, Math.floor((filteredRows.length - 1) / limit) * limit));
    }
    if (!filteredRows.length && offset !== 0) {
      setOffset(0);
    }
  }, [filteredRows.length, limit, offset]);

  if (loading && !rows.length) {
    return <LoadingState label="Loading exam courses..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Courses</h3>
          <div style={{ marginTop: 4, color: "var(--color-text-muted)", fontSize: 13 }}>
            Create and manage exam workspace courses.
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <label>
            Course Code
            <input
              className="input"
              value={courseForm.code}
              onChange={(event) => setCourseForm((prev) => ({ ...prev, code: event.target.value }))}
              placeholder="EX-GBLS-2026"
            />
          </label>
          <label>
            Course Name
            <input
              className="input"
              value={courseForm.name}
              onChange={(event) => setCourseForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Exam GBLS 2026"
            />
          </label>
          <label>
            Status
            <select
              className="select"
              value={courseForm.status}
              onChange={(event) => setCourseForm((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </label>
          <label>
            Description
            <input
              className="input"
              value={courseForm.description}
              onChange={(event) => setCourseForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Short description"
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-start" }}>
          <button
            type="button"
            className="button"
            style={{ width: "auto" }}
            disabled={savingCourse}
            onClick={() => void handleCreateCourse()}
          >
            {savingCourse ? "Saving..." : editingCourseId ? "Save Course" : "Create Course"}
          </button>
          <button
            type="button"
            className="button secondary"
            style={{ width: "auto" }}
            disabled={savingCourse}
            onClick={() => {
              setEditingCourseId("");
              setCourseForm({ code: "", name: "", status: "ACTIVE", description: "" });
            }}
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

      <div>
        <h3 style={{ margin: 0 }}>Course List</h3>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
          Review and manage exam courses and levels.
        </p>
      </div>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setOffset(0);
          }}
          style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
        >
          <input
            className="input"
            placeholder="Search code or name"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            style={{ width: 280 }}
          />
          <select
            className="select"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setOffset(0);
            }}
            style={{ width: 160 }}
          >
            <option value="">All Status</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
          <button className="button secondary" type="submit" style={{ width: "auto" }}>
            Search
          </button>
        </form>

        <div style={{ flex: 1 }} />
        <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <DataTable
        columns={[
          { key: "code", header: "Code" },
          { key: "name", header: "Name" },
          {
            key: "levels",
            header: "Exam Levels",
            render: (course) => {
              const levels = Array.isArray(course?.levels)
                ? [...course.levels].sort((a, b) => Number(a?.levelNumber || 0) - Number(b?.levelNumber || 0))
                : [];

              if (!levels.length) {
                return <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>No exam levels configured.</span>;
              }

              return (
                <div style={{ display: "grid", gap: 8, minWidth: 360 }}>
                  {levels.map((level) => (
                    <div
                      key={level.id || `${course.id}-${level.levelNumber}`}
                      style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", minWidth: 120 }}>
                        Level {level.levelNumber}{level.title ? ` · ${level.title}` : ""}
                      </span>
                      <Link
                        className="button secondary"
                        style={{ width: "auto" }}
                        to={buildExamWorkspaceTabHref("question-bank", course.id, level.levelNumber)}
                      >
                        Question Bank
                      </Link>
                      <Link
                        className="button secondary"
                        style={{ width: "auto" }}
                        to={buildExamWorkspaceTabHref("paper-builder", course.id, level.levelNumber)}
                      >
                        Paper Builder
                      </Link>
                      <Link
                        className="button secondary"
                        style={{ width: "auto" }}
                        to={buildExamWorkspaceTabHref("worksheets", course.id, level.levelNumber)}
                      >
                        Worksheets
                      </Link>
                    </div>
                  ))}
                </div>
              );
            }
          },
          {
            key: "status",
            header: "Status",
            render: (course) => (
              <span
                style={{
                  display: "inline-flex",
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  color: course?.isActive ? "#166534" : "#374151",
                  background: course?.isActive ? "#dcfce7" : "#e5e7eb"
                }}
              >
                {course?.isActive ? "ACTIVE" : "INACTIVE"}
              </span>
            )
          },
          {
            key: "actions",
            header: "Actions",
            render: (course) => {
              const isBusy = busyActionCourseId === course.id;
              return (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="button secondary"
                    type="button"
                    style={{ width: "auto" }}
                    onClick={() => {
                      setEditingCourseId(course.id);
                      setCourseForm({
                        code: course.code || "",
                        name: course.name || "",
                        status: course.isActive ? "ACTIVE" : "INACTIVE",
                        description: course.description || ""
                      });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    style={{ width: "auto" }}
                    onClick={() => navigate(`/superadmin/courses/${course.id}/levels?source=exam-courses`)}
                  >
                    Level
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    style={{ width: "auto" }}
                    disabled={isBusy || course?.isActive === false}
                    onClick={() => void handleDeactivateCourse(course)}
                  >
                    Deactive
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    style={{ width: "auto" }}
                    disabled={isBusy}
                    onClick={() => void handleDeleteCourse(course)}
                  >
                    Delete
                  </button>
                </div>
              );
            }
          }
        ]}
        rows={pagedRows}
        keyField="id"
        emptyMessage={loading ? "Loading exam courses..." : "No exam courses found."}
      />

      <PaginationBar
        limit={limit}
        offset={offset}
        count={pagedRows.length}
        total={filteredRows.length}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
        }}
      />
    </section>
  );
}

function normalizePaperBuilderDraft(item = {}) {
  return {
    levelId: String(item.levelId || ""),
    assessmentType: String(item.assessmentType || "WORKSHEET"),
    worksheetId: item.worksheetId ? String(item.worksheetId) : "",
    questionBankId: item.questionBankId ? String(item.questionBankId) : "",
    questionCount: item.questionCount ?? "",
    timeLimitMinutes: item.timeLimitMinutes ?? ""
  };
}

function buildPaperBuilderDraftFromAssessment(assessmentPayload = {}) {
  const levels = Array.isArray(assessmentPayload?.levels) ? assessmentPayload.levels : [];
  const existingConfigs = Array.isArray(assessmentPayload?.configs) ? assessmentPayload.configs : [];
  const worksheetsByLevelId = assessmentPayload?.worksheetsByLevelId || {};
  const questionBanksByLevelId = assessmentPayload?.questionBanksByLevelId || {};
  const configByLevelId = new Map(existingConfigs.map((config) => [config.levelId, config]));

  return levels.map((level) => {
    const existing = configByLevelId.get(level.levelId);
    if (existing) {
      return normalizePaperBuilderDraft(existing);
    }

    const wsOptions = Array.isArray(worksheetsByLevelId[level.levelId]) ? worksheetsByLevelId[level.levelId] : [];
    const bankOptions = Array.isArray(questionBanksByLevelId[level.levelId]) ? questionBanksByLevelId[level.levelId] : [];

    // Prefer question-bank mode when worksheet mode would be unusable.
    if (!wsOptions.length && bankOptions.length) {
      return normalizePaperBuilderDraft({
        levelId: level.levelId,
        assessmentType: "QUESTION_BANK",
        questionBankId: bankOptions.length === 1 ? bankOptions[0].id : ""
      });
    }

    return normalizePaperBuilderDraft({
      levelId: level.levelId,
      assessmentType: "WORKSHEET"
    });
  });
}

function getPaperBuilderValidation(assessmentPayload = {}, draftConfig = []) {
  const levels = Array.isArray(assessmentPayload?.levels) ? assessmentPayload.levels : [];
  const worksheetsByLevelId = assessmentPayload?.worksheetsByLevelId || {};
  const questionBanksByLevelId = assessmentPayload?.questionBanksByLevelId || {};
  const draftByLevelId = new Map((draftConfig || []).map((item) => [item.levelId, item]));

  const errorsByLevelId = {};
  let validCount = 0;

  for (const level of levels) {
    const current = draftByLevelId.get(level.levelId);
    const errors = [];

    if (!current) {
      errors.push("Missing configuration");
    } else if (current.assessmentType === "WORKSHEET") {
      if (!current.worksheetId) {
        errors.push("Select a worksheet");
      }
      const wsOptions = Array.isArray(worksheetsByLevelId[level.levelId]) ? worksheetsByLevelId[level.levelId] : [];
      if (!wsOptions.length) {
        errors.push("No worksheet options available for this level");
      }
      const selectedWorksheet = wsOptions.find((worksheet) => worksheet.id === current.worksheetId);
      const worksheetQuestionCount = Number(selectedWorksheet?.questionCount || 0);

      const count = Number(current.questionCount);
      if (!Number.isInteger(count) || count <= 0) {
        errors.push("Question count must be a positive integer");
      }
      if (selectedWorksheet && Number.isInteger(count) && count > worksheetQuestionCount) {
        errors.push(`Question count cannot exceed ${worksheetQuestionCount}`);
      }

      const limit = Number(current.timeLimitMinutes);
      if (!Number.isInteger(limit) || limit <= 0) {
        errors.push("Time limit must be a positive integer");
      }
    } else if (current.assessmentType === "QUESTION_BANK") {
      if (!current.questionBankId) {
        errors.push("Select a question bank");
      }

      const count = Number(current.questionCount);
      if (!Number.isInteger(count) || count <= 0) {
        errors.push("Question count must be a positive integer");
      }

      const limit = Number(current.timeLimitMinutes);
      if (!Number.isInteger(limit) || limit <= 0) {
        errors.push("Time limit must be a positive integer");
      }

      const banks = Array.isArray(questionBanksByLevelId[level.levelId]) ? questionBanksByLevelId[level.levelId] : [];
      if (!banks.length) {
        errors.push("No active question bank options available for this level");
      }
      const selectedBank = banks.find((bank) => bank.id === current.questionBankId);
      if (selectedBank && Number.isInteger(count) && count > selectedBank.availableQuestionCount) {
        errors.push(`Question count cannot exceed ${selectedBank.availableQuestionCount}`);
      }
    } else {
      errors.push("Select assessment type");
    }

    if (!errors.length) {
      validCount += 1;
    }

    errorsByLevelId[level.levelId] = errors;
  }

  return {
    errorsByLevelId,
    isComplete: levels.length > 0 && validCount === levels.length
  };
}

function SuperadminPaperBuilderWorkspacePanel({ examCourse, examCourseLevel, selectedExamCycleId, onExamCycleChange }) {
  const [examCycleOptions, setExamCycleOptions] = useState([]);
  const [cyclesLoading, setCyclesLoading] = useState(false);
  const [cyclesError, setCyclesError] = useState("");

  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentError, setAssessmentError] = useState("");
  const [assessmentPayload, setAssessmentPayload] = useState(null);
  const [draftConfig, setDraftConfig] = useState([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [deletingWorksheetId, setDeletingWorksheetId] = useState("");

  const [studentId, setStudentId] = useState("");
  const [generateBusy, setGenerateBusy] = useState(false);
  const [generatedQuestionSet, setGeneratedQuestionSet] = useState(null);
  const activeAssessmentContextRef = useRef("");
  const assessmentRequestIdRef = useRef(0);
  const [loadedAssessmentContextKey, setLoadedAssessmentContextKey] = useState("");

  const examContext = useMemo(() => ({
    courseId: examCourse?.id,
    levelNumber: examCourseLevel?.levelNumber
  }), [examCourse?.id, examCourseLevel?.levelNumber]);

  const paperBuilderContextKey = useMemo(() => {
    return `${String(selectedExamCycleId || "")}::${String(examContext.courseId || "")}::${String(examContext.levelNumber || "")}`;
  }, [selectedExamCycleId, examContext.courseId, examContext.levelNumber]);

  const loadCycleOptions = useCallback(async () => {
    setCyclesLoading(true);
    setCyclesError("");
    try {
      const data = await listExamCycles({ limit: 100, offset: 0, filter: "ALL" });
      const items = Array.isArray(data?.data?.items) ? data.data.items : [];
      const selectedCycleId = String(selectedExamCycleId || "").trim();
      const selectedCycle = items.find((cycle) => String(cycle.id) === selectedCycleId) || null;
      const editableCycleItems = items.filter((cycle) => isExamCycleEditable(cycle));
      const lockedCycleItems = items.filter((cycle) => !isExamCycleEditable(cycle));
      const orderedItems = [];
      const seenIds = new Set();

      const pushCycle = (cycle) => {
        if (!cycle?.id || seenIds.has(String(cycle.id))) return;
        seenIds.add(String(cycle.id));
        orderedItems.push(cycle);
      };

      editableCycleItems.forEach(pushCycle);
      if (selectedCycle && !isExamCycleEditable(selectedCycle)) {
        pushCycle(selectedCycle);
      }
      lockedCycleItems.forEach(pushCycle);
      if (!selectedCycleId && orderedItems.length) {
        const defaultCycle = editableCycleItems[0] || selectedCycle || orderedItems[0] || null;
        if (defaultCycle?.id) {
          onExamCycleChange(String(defaultCycle.id));
        }
      }

      setExamCycleOptions(orderedItems);
    } catch (err) {
      setCyclesError(getFriendlyErrorMessage(err) || "Failed to load exam cycles.");
    } finally {
      setCyclesLoading(false);
    }
  }, [selectedExamCycleId, onExamCycleChange]);

  const loadAssessmentConfig = useCallback(async (contextKey = activeAssessmentContextRef.current) => {
    const requestId = ++assessmentRequestIdRef.current;
    if (!selectedExamCycleId || !examContext.courseId || !examContext.levelNumber) {
      if (requestId === assessmentRequestIdRef.current && activeAssessmentContextRef.current === contextKey) {
        setAssessmentPayload(null);
        setDraftConfig([]);
        setLoadedAssessmentContextKey("");
        setAssessmentLoading(false);
      }
      return;
    }

    if (activeAssessmentContextRef.current === contextKey) {
      setAssessmentLoading(true);
      setAssessmentError("");
    }
    try {
      const response = await getExamCycleAssessmentConfig(selectedExamCycleId, {
        courseId: examContext.courseId,
        levelNumber: examContext.levelNumber
      });
      if (requestId !== assessmentRequestIdRef.current || activeAssessmentContextRef.current !== contextKey) {
        return;
      }
      const payload = response?.data || {};
      setAssessmentPayload(payload);
      setDraftConfig(buildPaperBuilderDraftFromAssessment(payload));
      setLoadedAssessmentContextKey(contextKey);
    } catch (err) {
      if (requestId !== assessmentRequestIdRef.current || activeAssessmentContextRef.current !== contextKey) {
        return;
      }
      setAssessmentPayload(null);
      setDraftConfig([]);
      setLoadedAssessmentContextKey("");
      setAssessmentError(getFriendlyErrorMessage(err) || "Failed to load paper builder configuration.");
    } finally {
      if (requestId === assessmentRequestIdRef.current && activeAssessmentContextRef.current === contextKey) {
        setAssessmentLoading(false);
      }
    }
  }, [selectedExamCycleId, examContext.courseId, examContext.levelNumber]);

  useEffect(() => {
    void loadCycleOptions();
  }, [loadCycleOptions]);

  useEffect(() => {
    if (!selectedExamCycleId || !examCycleOptions.length) {
      return;
    }
    const hasSelected = examCycleOptions.some((cycle) => String(cycle.id) === String(selectedExamCycleId));
    if (!hasSelected) {
      const fallback = examCycleOptions.find((cycle) => isExamCycleEditable(cycle)) || examCycleOptions[0] || null;
      if (fallback?.id) {
        onExamCycleChange(String(fallback.id));
      }
    }
  }, [selectedExamCycleId, examCycleOptions, onExamCycleChange]);

  useEffect(() => {
    activeAssessmentContextRef.current = paperBuilderContextKey;
    setAssessmentPayload(null);
    setDraftConfig([]);
    setAssessmentError("");
    setGeneratedQuestionSet(null);
    setStudentId("");
    setDeletingWorksheetId("");
    setLoadedAssessmentContextKey("");

    if (!selectedExamCycleId || !examContext.courseId || !examContext.levelNumber) {
      setAssessmentLoading(false);
      return;
    }

    void loadAssessmentConfig(paperBuilderContextKey);
  }, [paperBuilderContextKey, selectedExamCycleId, examContext.courseId, examContext.levelNumber, loadAssessmentConfig]);

  const selectedCycle = useMemo(() => {
    return examCycleOptions.find((cycle) => String(cycle.id) === String(selectedExamCycleId)) || null;
  }, [examCycleOptions, selectedExamCycleId]);
  const isCycleLocked = Boolean(selectedCycle && !isExamCycleEditable(selectedCycle));

  const draftByLevelId = useMemo(() => {
    return new Map((draftConfig || []).map((item) => [item.levelId, item]));
  }, [draftConfig]);

  const validation = useMemo(() => {
    return getPaperBuilderValidation(assessmentPayload || {}, draftConfig || []);
  }, [assessmentPayload, draftConfig]);

  const availableSummary = useMemo(() => {
    const levels = Array.isArray(assessmentPayload?.levels) ? assessmentPayload.levels : [];
    const worksheetsByLevelId = assessmentPayload?.worksheetsByLevelId || {};
    const questionBanksByLevelId = assessmentPayload?.questionBanksByLevelId || {};

    return levels.map((level) => {
      const wsOptions = Array.isArray(worksheetsByLevelId[level.levelId]) ? worksheetsByLevelId[level.levelId] : [];
      const bankOptions = Array.isArray(questionBanksByLevelId[level.levelId]) ? questionBanksByLevelId[level.levelId] : [];
      const totalBankQuestions = bankOptions.reduce((sum, bank) => sum + Number(bank?.availableQuestionCount || 0), 0);
      const availableWorksheetOptions = wsOptions.filter((worksheet) => worksheet?.disabled !== true).length;
      return {
        levelId: level.levelId,
        worksheetOptions: availableWorksheetOptions,
        worksheetTotal: wsOptions.length,
        questionBankOptions: bankOptions.length,
        totalBankQuestions
      };
    });
  }, [assessmentPayload]);

  const savedConfigByWorksheetId = useMemo(() => {
    const configs = Array.isArray(assessmentPayload?.configs) ? assessmentPayload.configs : [];
    return new Map(
      configs
        .filter((config) => config?.assessmentType === "WORKSHEET" && config?.worksheetId)
        .map((config) => [String(config.worksheetId), config])
    );
  }, [assessmentPayload]);

  const selectedWorksheetIds = useMemo(() => {
    const ids = new Set(savedConfigByWorksheetId.keys());
    for (const config of draftConfig || []) {
      if (config?.assessmentType === "WORKSHEET" && config?.worksheetId) {
        ids.add(String(config.worksheetId));
      }
    }
    return ids;
  }, [draftConfig, savedConfigByWorksheetId]);

  const createdWorksheets = useMemo(() => {
    const levels = Array.isArray(assessmentPayload?.levels) ? assessmentPayload.levels : [];
    const worksheetsByLevelId = assessmentPayload?.worksheetsByLevelId || {};
    const rows = [];
    const seen = new Set();

    for (const level of levels) {
      const worksheetOptions = Array.isArray(worksheetsByLevelId[level.levelId])
        ? worksheetsByLevelId[level.levelId]
        : [];

      for (const worksheet of worksheetOptions) {
        const worksheetId = String(worksheet?.id || "");
        const generationMode = String(worksheet?.generationMode || "").trim().toUpperCase();
        const isGeneratedStudentWorksheet = Boolean(
          worksheet?.isGeneratedStudentWorksheet
          || worksheet?.generatedForStudentId
          || generationMode === "EXAM"
        );

        if (!worksheetId || seen.has(worksheetId) || isGeneratedStudentWorksheet) {
          continue;
        }

        seen.add(worksheetId);
        rows.push({
          ...worksheet,
          id: worksheetId,
          levelId: level.levelId,
          levelName: level.levelName || `Level ${level.levelRank || ""}`.trim()
        });
      }
    }

    return rows;
  }, [assessmentPayload]);

  const setDraftLevelConfig = useCallback((levelId, patch) => {
    setDraftConfig((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      return current.map((item) => (item.levelId === levelId ? { ...item, ...patch } : item));
    });
  }, []);

  const isAssessmentContextReady = Boolean(
    selectedExamCycleId
    && examContext.courseId
    && examContext.levelNumber
    && loadedAssessmentContextKey === paperBuilderContextKey
    && !assessmentLoading
  );

  const handleSaveConfig = useCallback(async () => {
    if (!selectedExamCycleId || !examContext.courseId || !examContext.levelNumber || !isAssessmentContextReady) {
      return;
    }
    if (!validation.isComplete) {
      setAssessmentError("Fix paper builder validation errors before saving.");
      return;
    }

    setSavingConfig(true);
    setAssessmentError("");
    try {
      await saveExamCycleAssessmentConfig(
        selectedExamCycleId,
        {
          configs: draftConfig.map((item) => ({
            levelId: item.levelId,
            assessmentType: item.assessmentType,
            worksheetId: item.assessmentType === "WORKSHEET" ? item.worksheetId : null,
            questionBankId: item.assessmentType === "QUESTION_BANK" ? item.questionBankId : null,
            questionCount: Number(item.questionCount),
            timeLimitMinutes: Number(item.timeLimitMinutes)
          }))
        },
        {
          courseId: examContext.courseId,
          levelNumber: examContext.levelNumber
        }
      );

      toast.success("Paper builder configuration saved.");
      await loadAssessmentConfig(activeAssessmentContextRef.current || paperBuilderContextKey);
    } catch (err) {
      setAssessmentError(getFriendlyErrorMessage(err) || "Failed to save paper builder configuration.");
    } finally {
      setSavingConfig(false);
    }
  }, [
    selectedExamCycleId,
    examContext.courseId,
    examContext.levelNumber,
    validation.isComplete,
    draftConfig,
    loadAssessmentConfig,
    isAssessmentContextReady,
    paperBuilderContextKey
  ]);

  const handleDeleteCreatedWorksheet = useCallback(async (worksheet) => {
    if (!worksheet?.id || !examContext.courseId || !examContext.levelNumber || !isAssessmentContextReady) {
      return;
    }

    if (isCycleLocked) {
      toast.error("Worksheets cannot be deleted from a locked exam cycle.");
      return;
    }

    if (selectedWorksheetIds.has(String(worksheet.id))) {
      toast.error("Replace this worksheet in Paper Builder and save the new configuration before deleting it.");
      return;
    }

    if (worksheet.canDelete === false) {
      toast.error(worksheet.deleteBlockReason || worksheet.unavailableReason || "This worksheet is already in use and cannot be deleted.");
      return;
    }

    const confirmed = window.confirm(
      `Delete worksheet "${worksheet.title || "Untitled worksheet"}"? Only an unused worksheet can be deleted.`
    );
    if (!confirmed) return;

    setDeletingWorksheetId(String(worksheet.id));
    setAssessmentError("");
    try {
      await deleteWorksheet(worksheet.id, {
        courseId: examContext.courseId,
        levelNumber: examContext.levelNumber
      });
      toast.success("Worksheet deleted.");
      await loadAssessmentConfig(activeAssessmentContextRef.current || paperBuilderContextKey);
    } catch (err) {
      const message = getFriendlyErrorMessage(err) || "Failed to delete worksheet.";
      setAssessmentError(message);
      toast.error(message);
    } finally {
      setDeletingWorksheetId("");
    }
  }, [
    examContext.courseId,
    examContext.levelNumber,
    isAssessmentContextReady,
    isCycleLocked,
    selectedWorksheetIds,
    loadAssessmentConfig,
    paperBuilderContextKey
  ]);

  const handleGenerateQuestionSet = useCallback(async () => {
    if (!selectedExamCycleId || !examContext.courseId || !examContext.levelNumber || !isAssessmentContextReady) {
      return;
    }
    const normalizedStudentId = String(studentId || "").trim();
    if (!normalizedStudentId) {
      toast.error("Student ID is required to generate question set.");
      return;
    }

    const targetLevel = Array.isArray(assessmentPayload?.levels) ? assessmentPayload.levels[0] : null;
    if (!targetLevel?.levelId) {
      toast.error("No in-scope level found for question-set generation.");
      return;
    }

    setGenerateBusy(true);
    try {
      const response = await generateExamCycleQuestionSet(
        selectedExamCycleId,
        {
          studentId: normalizedStudentId,
          levelId: targetLevel.levelId
        },
        {
          courseId: examContext.courseId,
          levelNumber: examContext.levelNumber
        }
      );

      if (activeAssessmentContextRef.current !== paperBuilderContextKey) {
        return;
      }
      setGeneratedQuestionSet(response?.data || null);
      toast.success("Question set generated.");
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to generate question set.");
    } finally {
      setGenerateBusy(false);
    }
  }, [
    selectedExamCycleId,
    examContext.courseId,
    examContext.levelNumber,
    studentId,
    assessmentPayload,
    isAssessmentContextReady,
    paperBuilderContextKey
  ]);

  const levels = Array.isArray(assessmentPayload?.levels) ? assessmentPayload.levels : [];
  const primaryLevel = levels[0] || null;
  const primaryDraft = primaryLevel ? draftByLevelId.get(primaryLevel.levelId) : null;
  const isPrimaryQuestionBankMode = Boolean(primaryDraft && primaryDraft.assessmentType === "QUESTION_BANK");
  const worksheetModeGenerationMessage = "Question set generation is available for Question Bank mode. Worksheet mode is managed through worksheet assignment/approval flow.";

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Paper Builder</h3>
        <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          Configure level-wise exam paper rules, save assessment setup, and generate deterministic question sets in EXAM scope only.
        </div>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Exam Cycle
            <select
              className="input"
              value={selectedExamCycleId}
              onChange={(event) => onExamCycleChange(event.target.value)}
              disabled={cyclesLoading}
            >
              <option value="">Select exam cycle</option>
              {examCycleOptions.map((cycle) => {
                const cycleLocked = !isExamCycleEditable(cycle);
                return (
                  <option key={cycle.id} value={cycle.id} disabled={cycleLocked}>
                    {cycle.code} · {cycle.name}{cycleLocked ? " (READ-ONLY)" : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <span>Exam Context</span>
            <div style={{ padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-background-muted)" }}>
              {examCourse?.code} · {examCourse?.name} · Level {examCourseLevel?.levelNumber}
            </div>
          </div>
        </div>
        {cyclesError ? <div className="error">{cyclesError}</div> : null}
        {selectedCycle ? (
          <div style={{ display: "grid", gap: 4, color: "var(--color-text-muted)", fontSize: 12 }}>
            <div>Selected cycle window: {formatDateRange(selectedCycle.examStartsAt, selectedCycle.examEndsAt)}</div>
            {isCycleLocked ? (
              <div style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>Read-only preview for this locked exam cycle.</div>
            ) : null}
          </div>
        ) : null}
      </div>

      {!selectedExamCycleId ? (
        <div className="card" style={{ color: "var(--color-text-muted)" }}>
          Select an exam cycle to load paper builder configuration.
        </div>
      ) : null}

      {assessmentLoading ? <LoadingState label="Loading paper builder configuration..." /> : null}

      {assessmentError ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>{assessmentError}</p>
        </div>
      ) : null}

      {selectedExamCycleId && !assessmentLoading && !assessmentError ? (
        <>
          <div className="card" style={{ display: "grid", gap: 10 }}>
            <strong>Available Pool Summary</strong>
            {!availableSummary.length ? (
              <div style={{ color: "var(--color-text-muted)" }}>No in-scope levels found for this cycle and exam context.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                {availableSummary.map((entry) => (
                  <div key={entry.levelId} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 4 }}>
                    <div style={{ fontWeight: 700 }}>Level Pool</div>
                    <div style={{ fontSize: 13 }}>
                      Worksheets: {entry.worksheetOptions} available
                      {entry.worksheetTotal !== entry.worksheetOptions ? ` / ${entry.worksheetTotal} total` : ""}
                    </div>
                    <div style={{ fontSize: 13 }}>Question banks: {entry.questionBankOptions}</div>
                    <div style={{ fontSize: 13 }}>Available exam questions: {entry.totalBankQuestions}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 4 }}>
                <strong>Created Worksheets</strong>
                <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                  Source worksheets available in this exam course and level. Generated student worksheets are not shown.
                </span>
              </div>
              <button
                type="button"
                className="button secondary"
                style={{ width: "auto" }}
                onClick={() => void loadAssessmentConfig(activeAssessmentContextRef.current || paperBuilderContextKey)}
                disabled={assessmentLoading || savingConfig || Boolean(deletingWorksheetId) || !isAssessmentContextReady}
              >
                Refresh Worksheets
              </button>
            </div>

            {!createdWorksheets.length ? (
              <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
                No source worksheets are available for this exam context. Create one from the Worksheets tab.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {createdWorksheets.map((worksheet) => {
                  const savedConfig = savedConfigByWorksheetId.get(String(worksheet.id)) || null;
                  const isSelected = selectedWorksheetIds.has(String(worksheet.id));
                  const backendBlocked = worksheet.canDelete === false;
                  const deleteBlocked = isCycleLocked || isSelected || backendBlocked;
                  const deleteBlockReason = isCycleLocked
                    ? "Exam cycle is read-only."
                    : isSelected
                      ? "Currently selected in Paper Builder. Replace it and save first."
                      : backendBlocked
                        ? worksheet.deleteBlockReason || "Worksheet is already in use."
                        : "";
                  const configuredQuestionCount = Number(savedConfig?.questionCount || 0);
                  const availableQuestionCount = Number(worksheet.questionCount || 0);
                  const timeLimitMinutes = Number(
                    savedConfig?.timeLimitMinutes
                    || worksheet.timeLimitMinutes
                    || (Number(worksheet.timeLimitSeconds || 0) > 0
                      ? Math.ceil(Number(worksheet.timeLimitSeconds) / 60)
                      : 0)
                  );

                  return (
                    <div
                      key={worksheet.id}
                      style={{
                        display: "grid",
                        gap: 8,
                        padding: 12,
                        border: "1px solid var(--color-border)",
                        borderRadius: 10
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <strong>{worksheet.title || "Untitled worksheet"}</strong>
                            <span style={{ fontSize: 12, fontWeight: 700 }}>
                              {worksheet.status || (worksheet.isPublished ? "PUBLISHED" : "DRAFT")}
                            </span>
                            {worksheet.sourceType ? (
                              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                                {worksheet.sourceType === "PAPER_BUILDER" ? "Exam-cycle worksheet" : "Source worksheet"}
                              </span>
                            ) : null}
                          </div>
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", color: "var(--color-text-muted)", fontSize: 12 }}>
                            <span>Questions: {availableQuestionCount}</span>
                            {configuredQuestionCount > 0 ? (
                              <span style={{ color: "var(--color-text)", fontWeight: 700 }}>
                                Configured: {configuredQuestionCount} of {availableQuestionCount}
                              </span>
                            ) : (
                              <span>Not configured</span>
                            )}
                            {timeLimitMinutes > 0 ? <span>Time: {timeLimitMinutes} minutes</span> : null}
                            {worksheet.createdAt ? <span>Created: {formatDateTime(worksheet.createdAt)}</span> : null}
                          </div>
                          {worksheet.unavailableReason ? (
                            <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{worksheet.unavailableReason}</span>
                          ) : null}
                          {deleteBlockReason ? (
                            <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{deleteBlockReason}</span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="button secondary"
                          style={{ width: "auto", color: "#dc2626" }}
                          disabled={deleteBlocked || Boolean(deletingWorksheetId)}
                          title={deleteBlockReason || "Delete this unused worksheet"}
                          onClick={() => void handleDeleteCreatedWorksheet(worksheet)}
                        >
                          {deletingWorksheetId === String(worksheet.id) ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card" style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <strong>Level Rule Configuration</strong>
              <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                Operation and difficulty splits are not supported by current backend contract.
              </div>
            </div>

            {!levels.length ? (
              <div style={{ color: "var(--color-text-muted)" }}>No configurable levels available.</div>
            ) : null}

            {levels.map((level) => {
              const levelId = level.levelId;
              const wsOptions = assessmentPayload?.worksheetsByLevelId?.[levelId] || [];
              const bankOptions = assessmentPayload?.questionBanksByLevelId?.[levelId] || [];
              const current = draftByLevelId.get(levelId) || {
                levelId,
                assessmentType: "WORKSHEET",
                worksheetId: "",
                questionBankId: "",
                questionCount: "",
                timeLimitMinutes: ""
              };
              const levelErrors = validation.errorsByLevelId[levelId] || [];
              const selectedWorksheet = wsOptions.find((item) => item.id === current.worksheetId) || null;
              const selectedBank = bankOptions.find((item) => item.id === current.questionBankId) || null;
              const configuredTotalQuestions = Number(current.questionCount || 0);

              return (
                <div key={levelId} style={{ display: "grid", gap: 8, border: "1px solid var(--color-border)", borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{level.levelName || levelId}</strong>
                    <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Students: {level.studentCount}</span>
                    <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Rank: {String(level.levelRank ?? "")}</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>Total Questions: {Number.isFinite(configuredTotalQuestions) ? configuredTotalQuestions : 0}</span>
                  </div>

                  <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                    Assessment Type
                    <select
                      className="input"
                      value={current.assessmentType}
                      disabled={isCycleLocked}
                      onChange={(event) => {
                        const nextType = event.target.value;
                        setDraftLevelConfig(levelId, {
                          assessmentType: nextType,
                          worksheetId: "",
                          questionBankId: "",
                          questionCount: "",
                          timeLimitMinutes: ""
                        });
                      }}
                    >
                      <option value="WORKSHEET">Worksheet</option>
                      <option value="QUESTION_BANK">Question Bank</option>
                    </select>
                  </label>

                  {current.assessmentType === "WORKSHEET" ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                        Worksheet
                        <select
                          className="input"
                          value={current.worksheetId || ""}
                          disabled={isCycleLocked}
                          onChange={(event) => {
                            const nextWorksheetId = event.target.value;
                            const nextWorksheet = wsOptions.find((item) => item.id === nextWorksheetId) || null;
                            const worksheetQuestionCount = Number(nextWorksheet?.questionCount || 0);
                            const defaultCycleTimeLimit = Number(selectedCycle?.examDurationMinutes || 0);

                            setDraftLevelConfig(levelId, {
                              worksheetId: nextWorksheetId,
                              questionCount: worksheetQuestionCount > 0 ? worksheetQuestionCount : "",
                              timeLimitMinutes: Number.isInteger(defaultCycleTimeLimit) && defaultCycleTimeLimit > 0
                                ? defaultCycleTimeLimit
                                : ""
                            });
                          }}
                        >
                          <option value="">Select worksheet</option>
                          {wsOptions.map((worksheet) => (
                            <option key={worksheet.id} value={worksheet.id} disabled={worksheet.disabled === true}>
                              {worksheet.title} (Q: {worksheet.questionCount}, {worksheet.status || (worksheet.isPublished ? "PUBLISHED" : "DRAFT")})
                              {worksheet.disabled === true ? " — unavailable" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                          Question Count
                          <input
                            className="input"
                            type="number"
                            min={1}
                            value={current.questionCount}
                            disabled={isCycleLocked}
                            onChange={(event) => setDraftLevelConfig(levelId, { questionCount: event.target.value })}
                          />
                        </label>
                        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                          Time Limit (Minutes)
                          <input
                            className="input"
                            type="number"
                            min={1}
                            value={current.timeLimitMinutes}
                            disabled={isCycleLocked}
                            onChange={(event) => setDraftLevelConfig(levelId, { timeLimitMinutes: event.target.value })}
                          />
                        </label>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                        {selectedWorksheet
                          ? selectedWorksheet.unavailableReason || `Available in selected worksheet: ${selectedWorksheet.questionCount}`
                          : "Select a worksheet to view available count."}
                      </div>
                      {!wsOptions.length ? (
                        <div style={{ display: "grid", gap: 2 }}>
                          <span className="error" style={{ margin: 0 }}>No exam worksheets available for this level.</span>
                          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Create an exam worksheet from the Worksheets tab first.</span>
                        </div>
                      ) : null}
                      {!wsOptions.length && bankOptions.length ? (
                        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No worksheets available. Use Question Bank mode or create an exam worksheet first.</span>
                      ) : null}
                    </div>
                  ) : null}

                  {current.assessmentType === "QUESTION_BANK" ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                        Question Bank
                        <select
                          className="input"
                          value={current.questionBankId || ""}
                          disabled={isCycleLocked}
                          onChange={(event) => setDraftLevelConfig(levelId, { questionBankId: event.target.value })}
                        >
                          <option value="">Select question bank</option>
                          {bankOptions.map((bank) => (
                            <option key={bank.id} value={bank.id}>
                              {bank.name} (Questions: {bank.availableQuestionCount})
                            </option>
                          ))}
                        </select>
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                          Question Count
                          <input
                            className="input"
                            type="number"
                            min={1}
                            value={current.questionCount}
                            disabled={isCycleLocked}
                            onChange={(event) => setDraftLevelConfig(levelId, { questionCount: event.target.value })}
                          />
                        </label>
                        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                          Time Limit (Minutes)
                          <input
                            className="input"
                            type="number"
                            min={1}
                            value={current.timeLimitMinutes}
                            disabled={isCycleLocked}
                            onChange={(event) => setDraftLevelConfig(levelId, { timeLimitMinutes: event.target.value })}
                          />
                        </label>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                        {selectedBank ? `Available in selected bank: ${selectedBank.availableQuestionCount}` : "Select a question bank to view available count."}
                      </div>
                    </div>
                  ) : null}

                  {levelErrors.length ? (
                    <div style={{ display: "grid", gap: 2 }}>
                      {levelErrors.map((message) => (
                        <span key={message} className="error" style={{ margin: 0 }}>{message}</span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Configuration valid</span>
                  )}
                </div>
              );
            })}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                type="button"
                className="button secondary"
                style={{ width: "auto" }}
                onClick={() => void loadAssessmentConfig(activeAssessmentContextRef.current || paperBuilderContextKey)}
                disabled={assessmentLoading || savingConfig || !selectedExamCycleId || !examContext.courseId || !examContext.levelNumber}
              >
                Refresh
              </button>
              <button
                type="button"
                className="button"
                style={{ width: "auto" }}
                onClick={() => void handleSaveConfig()}
                disabled={isCycleLocked || !validation.isComplete || savingConfig || assessmentLoading || !levels.length || !isAssessmentContextReady}
              >
                {savingConfig ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </div>

          <div className="card" style={{ display: "grid", gap: 10 }}>
            <strong>Preview / Generate Question Set</strong>
            <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
              {isPrimaryQuestionBankMode
                ? "Generates deterministic per-student question sets for QUESTION_BANK mode."
                : worksheetModeGenerationMessage}
            </div>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                Student ID
                <input
                  className="input"
                  value={studentId}
                  onChange={(event) => setStudentId(event.target.value)}
                  placeholder="Enter enrolled student ID"
                />
              </label>
              <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
                <span>Worksheet Generation</span>
                <button
                  type="button"
                  className="button secondary"
                  style={{ width: "auto", justifySelf: "start" }}
                  disabled
                  title="Worksheet assignment is triggered during superadmin pending-list approval workflow."
                >
                  Managed In Approval Flow
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className="button"
                style={{ width: "auto" }}
                onClick={() => void handleGenerateQuestionSet()}
                disabled={isCycleLocked || generateBusy || !String(studentId || "").trim() || !levels.length || !isPrimaryQuestionBankMode || !isAssessmentContextReady}
              >
                {generateBusy ? "Generating..." : "Generate Question Set"}
              </button>
            </div>

            {generatedQuestionSet ? (
              <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 4 }}>
                <div><strong>Question Set ID:</strong> {generatedQuestionSet.id}</div>
                <div><strong>Question Bank:</strong> {generatedQuestionSet.questionBankId || "—"}</div>
                <div><strong>Generated Questions:</strong> {Array.isArray(generatedQuestionSet.generatedQuestionIds) ? generatedQuestionSet.generatedQuestionIds.length : 0}</div>
                <div><strong>Time Limit (Minutes):</strong> {generatedQuestionSet.timeLimitMinutes ?? "—"}</div>
                <div><strong>Generated At:</strong> {formatDateTime(generatedQuestionSet.generatedAt)}</div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function SuperadminExamCyclesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo(() => resolveSuperadminExamTab(searchParams), [searchParams]);
  const routeHierarchyFilter = searchParams.get("focus") === "late" ? "LATE_ONLY" : "ALL";
  const hasLegacyCourseContext = Boolean(searchParams.get("courseId") || searchParams.get("levelNumber"));
  const [examCourses, setExamCourses] = useState([]);
  const [examCoursesLoading, setExamCoursesLoading] = useState(false);
  const [examCoursesError, setExamCoursesError] = useState("");

  const selectedExamCourseId = String(searchParams.get("examCourseId") || "");
  const selectedExamLevelNumber = String(searchParams.get("examLevelNumber") || "");
  const selectedExamCycleId = String(searchParams.get("examCycleId") || "");

  const tabsRequiringExamCourseContext = new Set(["question-bank", "paper-builder", "worksheets"]);
  const requiresExamCourseContext = tabsRequiringExamCourseContext.has(activeTab);

  const selectedExamCourse = useMemo(() => {
    return examCourses.find((course) => String(course.id) === selectedExamCourseId) || null;
  }, [examCourses, selectedExamCourseId]);

  const selectedExamCourseLevels = useMemo(() => {
    if (!selectedExamCourse) {
      return [];
    }
    return Array.isArray(selectedExamCourse.levels) ? selectedExamCourse.levels : [];
  }, [selectedExamCourse]);

  const selectedExamCourseLevel = useMemo(() => {
    return selectedExamCourseLevels.find((level) => String(level.levelNumber) === selectedExamLevelNumber) || null;
  }, [selectedExamCourseLevels, selectedExamLevelNumber]);

  const hasResolvedExamContext = Boolean(selectedExamCourse && selectedExamCourseLevel);

  const loadExamCourses = useCallback(async () => {
    setExamCoursesLoading(true);
    setExamCoursesError("");
    try {
      const data = await listExamCourses();
      setExamCourses(Array.isArray(data?.data?.items) ? data.data.items : []);
    } catch (err) {
      setExamCoursesError(getFriendlyErrorMessage(err) || "Failed to load exam courses.");
    } finally {
      setExamCoursesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!requiresExamCourseContext) {
      return;
    }
    void loadExamCourses();
  }, [requiresExamCourseContext, loadExamCourses]);

  useEffect(() => {
    if (!requiresExamCourseContext) {
      return;
    }
    if (!examCourses.length) {
      return;
    }

    const hasCourse = examCourses.some((course) => String(course.id) === selectedExamCourseId);
    const hasLevel = hasCourse
      ? examCourses
          .find((course) => String(course.id) === selectedExamCourseId)
          ?.levels?.some((level) => String(level.levelNumber) === selectedExamLevelNumber)
      : false;

    if (hasCourse && hasLevel) {
      return;
    }

    const fallbackCourse = hasCourse
      ? examCourses.find((course) => String(course.id) === selectedExamCourseId)
      : examCourses[0] || null;
    const fallbackLevel = fallbackCourse?.levels?.[0] || null;

    const next = new URLSearchParams(searchParams);
    if (fallbackCourse?.id) {
      next.set("examCourseId", String(fallbackCourse.id));
    } else {
      next.delete("examCourseId");
    }

    if (fallbackLevel?.levelNumber) {
      next.set("examLevelNumber", String(fallbackLevel.levelNumber));
    } else {
      next.delete("examLevelNumber");
    }

    setSearchParams(next, { replace: true });
  }, [
    requiresExamCourseContext,
    examCourses,
    selectedExamCourseId,
    selectedExamLevelNumber,
    searchParams,
    setSearchParams
  ]);

  const handleTabChange = useCallback((nextTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", nextTab);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleExamCourseChange = useCallback((nextCourseId) => {
    const next = new URLSearchParams(searchParams);
    if (nextCourseId) {
      next.set("examCourseId", String(nextCourseId));
      const nextCourse = examCourses.find((course) => String(course.id) === String(nextCourseId));
      const firstLevel = Array.isArray(nextCourse?.levels) ? nextCourse.levels[0] : null;
      if (firstLevel?.levelNumber) {
        next.set("examLevelNumber", String(firstLevel.levelNumber));
      } else {
        next.delete("examLevelNumber");
      }
    } else {
      next.delete("examCourseId");
      next.delete("examLevelNumber");
    }
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, examCourses]);

  const handleExamLevelChange = useCallback((nextLevelNumber) => {
    const next = new URLSearchParams(searchParams);
    if (nextLevelNumber) {
      next.set("examLevelNumber", String(nextLevelNumber));
    } else {
      next.delete("examLevelNumber");
    }
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleExamCycleChange = useCallback((nextCycleId) => {
    const next = new URLSearchParams(searchParams);
    if (nextCycleId) {
      next.set("examCycleId", String(nextCycleId));
    } else {
      next.delete("examCycleId");
    }
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const clearLegacyCourseContext = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("courseId");
    next.delete("levelNumber");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Superadmin Exam Workspace</h2>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
            Consolidated exam cycles, question bank, enrollment, paper planning, worksheets, and results.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SUPERADMIN_EXAM_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                className={isActive ? "button" : "button secondary"}
                style={{ width: "auto" }}
                onClick={() => handleTabChange(tab.key)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {hasLegacyCourseContext ? (
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Exam Context Notice</div>
          <div style={{ color: "var(--color-text-muted)" }}>
            No exam course context found for this exam cycle/course.
          </div>
          <div>
            <button className="button secondary" type="button" style={{ width: "auto" }} onClick={clearLegacyCourseContext}>
              Clear Invalid Course Context
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === "exam-cycles" ? <SuperadminExamCyclesWorkspacePanel routeHierarchyFilter="ALL" /> : null}

      {activeTab === "exam-courses" ? <SuperadminExamCoursesWorkspacePanel /> : null}

      {requiresExamCourseContext ? (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Exam Course Context</div>
          <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
            Select an exam course and level to continue.
          </div>
          {examCoursesError ? <div className="error">{examCoursesError}</div> : null}
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Exam Course
              <select
                className="input"
                value={selectedExamCourseId}
                onChange={(event) => handleExamCourseChange(event.target.value)}
                disabled={examCoursesLoading}
              >
                <option value="">Select exam course</option>
                {examCourses.map((course) => (
                  <option key={course.id} value={course.id}>{course.code} · {course.name}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Exam Level
              <select
                className="input"
                value={selectedExamLevelNumber}
                onChange={(event) => handleExamLevelChange(event.target.value)}
                disabled={examCoursesLoading || !selectedExamCourse}
              >
                <option value="">Select exam level</option>
                {selectedExamCourseLevels.map((level) => (
                  <option key={level.id} value={String(level.levelNumber)}>
                    Level {level.levelNumber} · {level.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ) : null}

      {activeTab === "question-bank" ? (
        hasResolvedExamContext ? (
          <SuperadminCourseLevelQuestionBankPage
            forcedCourseId={selectedExamCourse.id}
            forcedLevelNumber={selectedExamCourseLevel.levelNumber}
            hideNavigation
          />
        ) : (
          <div className="card" style={{ color: "var(--color-text-muted)" }}>
            Select an exam course and level to continue.
          </div>
        )
      ) : null}

      {activeTab === "paper-builder" ? (
        hasResolvedExamContext ? (
          <SuperadminPaperBuilderWorkspacePanel
            examCourse={selectedExamCourse}
            examCourseLevel={selectedExamCourseLevel}
            selectedExamCycleId={selectedExamCycleId}
            onExamCycleChange={handleExamCycleChange}
          />
        ) : (
          <div className="card" style={{ color: "var(--color-text-muted)" }}>
            Select an exam course and level to continue.
          </div>
        )
      ) : null}

      {activeTab === "worksheets" ? (
        hasResolvedExamContext ? (
          <SuperadminCourseLevelWorksheetsPage
            forcedCourseId={selectedExamCourse.id}
            forcedLevelNumber={selectedExamCourseLevel.levelNumber}
            hideNavigation
          />
        ) : (
          <div className="card" style={{ color: "var(--color-text-muted)" }}>
            Select an exam course and level to continue.
          </div>
        )
      ) : null}

      {activeTab === "enrollment" ? <SuperadminExamCyclesWorkspacePanel routeHierarchyFilter={routeHierarchyFilter} /> : null}

      {activeTab === "results" ? <SuperadminExamResultsControlCenterPage /> : null}
    </section>
  );
}

export { SuperadminExamCyclesPage };
