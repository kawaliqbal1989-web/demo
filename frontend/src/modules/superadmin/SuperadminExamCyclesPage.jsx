import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

function SuperadminExamCyclesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ACTIVE");
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Exam Cycles</h2>
        <div style={{ display: "flex", gap: 10 }}>

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

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ color: "var(--muted)" }}>
          Total: {total}
        </div>
        <div style={{ color: "var(--muted)" }}>
          Showing: {rows.length}
        </div>
        <div style={{ flex: 1 }} />
        <label style={{ fontSize: 13, color: "var(--muted)" }}>Filter</label>
        <select
          className="input"
          value={filter}
          onChange={(event) => {
            const next = event.target.value;
            setFilter(next);
            setOffset(0);
          }}
          style={{ width: 180 }}
        >
          <option value="ACTIVE">Active</option>
          <option value="COMPLETED">Completed</option>
          <option value="ARCHIVED">Archived</option>
          <option value="ALL">All</option>
        </select>
        <button className="button secondary" type="button" onClick={() => void load({ limit, offset })} style={{ width: "auto" }} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <strong>Exam Cycle Health</strong>
        <div style={{ color: "var(--muted)" }}>
          {healthCycle ? `Cycle: ${healthCycle.name} (${healthCycle.code})` : "No cycle selected"}
        </div>
        {lifecycleHealth ? (
          <div style={{ display: "grid", gap: 6 }}>
            {[
              ["Enrollment Status", lifecycleHealth.enrollmentStatus],
              ["Assignment Status", lifecycleHealth.assignmentStatus],
              ["Exam Status", lifecycleHealth.examStatus],
              ["Result Status", lifecycleHealth.resultStatus],
              ["Certificate Status", lifecycleHealth.certificateStatus],
              ["Overall", lifecycleHealth.overall]
            ].map(([label, status]) => {
              const indicator = toHealthIndicator(status);
              return (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: indicator.dot, display: "inline-block" }} />
                  <span style={{ minWidth: 160 }}>{label}</span>
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
        emptyMessage={error ? "Unable to load exam cycles. Use Refresh to retry." : "No exam cycles found."}
        columns={[
          { key: "code", header: "Code" },
          { key: "name", header: "Name" },
          { key: "bpCode", header: "BP Code", render: (r) => r?.businessPartner?.code || "Unassigned" },
          { key: "bpName", header: "BP Name", render: (r) => r?.businessPartner?.name || "No business partner linked" },
          { key: "enrollment", header: "Enrollment", render: (r) => formatDateRange(r.enrollmentStartAt, r.enrollmentEndAt) },
          { key: "exam", header: "Exam Window", render: (r) => formatDateRange(r.examStartsAt, r.examEndsAt) },
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
              <div style={{ display: "flex", gap: 8 }}>
                <Link className="button secondary" style={{ width: "auto" }} to={`/superadmin/exam-cycles/${r.id}/pending`}>
                  Pending
                </Link>
                <Link className="button secondary" style={{ width: "auto" }} to={`/superadmin/exam-cycles/${r.id}/results`}>
                  Results
                </Link>
                <button
                  className="button secondary"
                  style={{ width: "auto" }}
                  type="button"
                  onClick={() => void showArchiveImpact(r)}
                  disabled={archiveImpactLoading}
                >
                  Archive Impact
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
                  onClick={() => void handleAuditCheck(r.id)}
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
        rows={rows}
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
