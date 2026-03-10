import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { LoadingState } from "../../components/LoadingState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  exportCompetitionResultsCsv,
  getCompetitionDetail,
  getCompetitionResults,
  publishCompetitionResults,
  unpublishCompetitionResults
} from "../../services/competitionsService";

function SuperadminCompetitionResultsPage() {
  const { competitionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);
  const [resultStatus, setResultStatus] = useState("");
  const [acting, setActing] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [detail, lb] = await Promise.all([
        getCompetitionDetail(competitionId),
        getCompetitionResults(competitionId)
      ]);

      setMeta(detail?.data || null);
      setResultStatus(String(lb?.data?.status || ""));
      const entries = Array.isArray(lb?.data?.leaderboard) ? lb.data.leaderboard : [];
      setRows(entries);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load competition results.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId]);

  const doExport = async () => {
    try {
      const blob = await exportCompetitionResultsCsv(competitionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `competition_${competitionId}_results.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to export CSV.");
    }
  };

  const canPublish = resultStatus !== "PUBLISHED";
  const canUnpublish = resultStatus === "PUBLISHED";

  const doPublish = async () => {
    if (acting || !canPublish) return;
    setConfirmAction("publish");
  };

  const doUnpublish = async () => {
    if (acting || !canUnpublish) return;
    setConfirmAction("unpublish");
  };

  const executeAction = async () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (!action) return;
    setActing(true);
    setError("");
    try {
      if (action === "publish") await publishCompetitionResults(competitionId);
      else await unpublishCompetitionResults(competitionId);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || `Failed to ${action} results.`);
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading competition results..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Competition Results</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {meta?.title || "Competition"} | Stage: <b>{meta?.workflowStage || "-"}</b> | Status: <b>{meta?.status || "-"}</b> | Result: <b>{resultStatus || "-"}</b>
          </div>
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

      <div className="card" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="button secondary" type="button" onClick={() => void load()} style={{ width: "auto" }}>
          Refresh
        </button>
        <button className="button secondary" type="button" onClick={() => void doExport()} style={{ width: "auto" }}>
          Export CSV
        </button>
        <div style={{ flex: 1 }} />
        <button className="button" type="button" onClick={() => void doPublish()} disabled={acting || !canPublish} style={{ width: "auto" }}>
          Publish
        </button>
        <button className="button secondary" type="button" onClick={() => void doUnpublish()} disabled={acting || !canUnpublish} style={{ width: "auto" }}>
          Unpublish
        </button>
        <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          Participants: {rows.length}
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        {!rows.length ? (
          <p style={{ margin: 0, color: "var(--color-text-muted)" }}>No leaderboard entries yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Rank</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Student</th>
                <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Accuracy</th>
                <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Completion Time (sec)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry, i) => (
                <tr key={entry.studentId || i}>
                  <td style={{ padding: "6px 8px" }}>{entry.rank ?? i + 1}</td>
                  <td style={{ padding: "6px 8px" }}>{entry.studentName || "-"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{entry.accuracy ?? "-"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{entry.completionTime ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction === "publish" ? "Publish Competition Results" : "Unpublish Competition Results"}
        message={confirmAction === "publish"
          ? "Publish results? After publishing, authorized roles can view results."
          : "Unpublish results? Non-superadmin roles will lose access."}
        confirmLabel={confirmAction === "publish" ? "Publish" : "Unpublish"}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => void executeAction()}
      />
    </section>
  );
}

export { SuperadminCompetitionResultsPage };
