import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { InputDialog } from "../../components/InputDialog";
import { LoadingState } from "../../components/LoadingState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  getCompetitionDetail,
  forwardCompetitionRequest,
  rejectCompetitionRequest
} from "../../services/competitionsService";

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function SuperadminCompetitionPendingPage() {
  const { competitionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [item, setItem] = useState(null);
  const [acting, setActing] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [askReject, setAskReject] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getCompetitionDetail(competitionId);
      setItem(data?.data || null);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load competition.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId]);

  const doApprove = async () => {
    setConfirmApprove(false);
    setActing(true);
    setError("");
    try {
      await forwardCompetitionRequest(competitionId);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to approve competition.");
    } finally {
      setActing(false);
    }
  };

  const doReject = async (reason) => {
    const normalizedReason = String(reason || "").trim();
    if (!normalizedReason) {
      setError("Rejection reason is required.");
      return;
    }
    setAskReject(false);
    setActing(true);
    setError("");
    try {
      await rejectCompetitionRequest(competitionId, normalizedReason);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to reject competition.");
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading competition approval..." />;
  }

  const canApprove = item?.workflowStage === "SUPERADMIN_APPROVAL";

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Competition Pending</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Review and approve/reject like exam pending flow</div>
        </div>
        <button className="button secondary" type="button" onClick={() => navigate(-1)} style={{ width: "auto" }}>
          Back
        </button>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>{error}</p>
        </div>
      ) : null}

      {item ? (
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <div><b>Title:</b> {item.title}</div>
          <div><b>Level:</b> {item.level?.name || "-"}</div>
          <div><b>Node:</b> {item.hierarchyNode?.name || "-"}</div>
          <div><b>Stage:</b> {item.workflowStage}</div>
          <div><b>Status:</b> {item.status}</div>
          <div><b>Window:</b> {formatDateTime(item.startsAt)} to {formatDateTime(item.endsAt)}</div>
          <div><b>Enrolled:</b> {item.enrollments?.length || 0}</div>
        </div>
      ) : null}

      <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="button secondary" type="button" onClick={() => void load()} disabled={acting} style={{ width: "auto" }}>
          Refresh
        </button>
        <div style={{ flex: 1 }} />
        <button className="button" type="button" onClick={() => setConfirmApprove(true)} disabled={acting || !canApprove} style={{ width: "auto" }}>
          Approve
        </button>
        <button className="button secondary" type="button" onClick={() => setAskReject(true)} disabled={acting || !canApprove} style={{ width: "auto" }}>
          Reject
        </button>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Transition History</h3>
        {!item?.stageTransitions?.length ? (
          <p style={{ margin: 0, color: "var(--color-text-muted)" }}>No transitions yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>When</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Action</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>From → To</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>By</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {item.stageTransitions.map((t) => (
                <tr key={t.id}>
                  <td style={{ padding: "6px 8px" }}>{formatDateTime(t.createdAt)}</td>
                  <td style={{ padding: "6px 8px" }}>{t.action}</td>
                  <td style={{ padding: "6px 8px" }}>{t.fromStage} → {t.toStage}</td>
                  <td style={{ padding: "6px 8px" }}>{t.actedByUser?.email || t.actedByUser?.role || "-"}</td>
                  <td style={{ padding: "6px 8px" }}>{t.reason || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={confirmApprove}
        title="Approve Competition"
        message="Approve this competition and move it to APPROVED stage?"
        confirmLabel="Approve"
        onCancel={() => setConfirmApprove(false)}
        onConfirm={() => void doApprove()}
      />

      <InputDialog
        open={askReject}
        title="Reject Competition"
        message="Reject this competition back in workflow?"
        inputLabel="Reason"
        inputPlaceholder="Provide rejection reason"
        required
        confirmLabel="Reject"
        onCancel={() => setAskReject(false)}
        onConfirm={(val) => void doReject(val)}
      />
    </section>
  );
}

export { SuperadminCompetitionPendingPage };
