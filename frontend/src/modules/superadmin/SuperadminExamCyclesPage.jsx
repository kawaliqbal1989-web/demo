import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  listExamCycles,
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

function SuperadminExamCyclesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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

  const load = useCallback(async ({ limit: nextLimit = 20, offset: nextOffset = 0 } = {}) => {
    setLoading(true);
    setError("");
    try {
      const data = await listExamCycles({ limit: nextLimit, offset: nextOffset });
      setRows(data?.data?.items || []);
      setLimit(data?.data?.limit ?? nextLimit);
      setOffset(data?.data?.offset ?? nextOffset);
      setTotal(data?.data?.total ?? 0);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load exam cycles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load({ limit: 20, offset: 0 });
  }, [load]);

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

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Exam Cycles</h2>
        <div style={{ display: "flex", gap: 10 }}>

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
        <button className="button secondary" type="button" onClick={() => void load({ limit, offset })} style={{ width: "auto" }} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <strong>Feature Plan</strong>
        <div style={{ color: "var(--muted)" }}>Planned next features for exam-cycle governance:</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Lifecycle dashboard for each cycle with enrollment, practice, exam, and result checkpoints.</li>
          <li>Automated health checks to flag inconsistent states (for example published with no approved list).</li>
          <li>Expanded audit timeline showing approval and publish actors with timestamps.</li>
        </ul>
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
          { key: "resultStatus", header: "Result" },
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
