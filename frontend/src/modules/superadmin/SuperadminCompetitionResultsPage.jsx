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
  const [levels, setLevels] = useState([]);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [completedParticipants, setCompletedParticipants] = useState(0);
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
      setLevels(Array.isArray(lb?.data?.levels) ? lb.data.levels : []);
      setTotalParticipants(Number(lb?.data?.totalParticipants || entries.length));
      setCompletedParticipants(Number(lb?.data?.completedParticipants || 0));
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load competition results.");
      setRows([]);
      setLevels([]);
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
          Participants: {totalParticipants} · Completed: {completedParticipants}
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {!rows.length ? (
          <div className="card"><p style={{ margin: 0, color: "var(--color-text-muted)" }}>No approved Competition participations yet.</p></div>
        ) : (
          (levels.length ? levels : [{ competitionCourseLevelId: "all", leaderboard: rows }]).map((group) => (
          <div className="card" key={group.competitionCourseLevelId} style={{ overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>
              {[group.courseName || group.courseCode, group.levelName || (group.levelRank ? `Level ${group.levelRank}` : null)].filter(Boolean).join(" · ") || "Competition Results"}
            </h3>
            <div style={{ color: "var(--color-text-muted)", fontSize: 12, marginBottom: 8 }}>
              Participants: {group.totalParticipants ?? group.leaderboard.length} · Completed: {group.completedParticipants ?? group.leaderboard.filter((entry) => entry.submissionId).length}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Rank</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Student</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Admission No.</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Type</th>
                <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Accuracy</th>
                <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Completion Time (sec)</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {group.leaderboard.map((entry, i) => (
                <tr key={entry.participationId || `${entry.studentId}-${i}`}>
                  <td style={{ padding: "6px 8px" }}>{entry.rank ?? "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{entry.studentName || "-"}</td>
                  <td style={{ padding: "6px 8px" }}>{entry.admissionNo || "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{entry.isTemporary ? "Temporary" : "Regular"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{entry.accuracy ?? "-"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{entry.completionTime ?? "-"}</td>
                  <td style={{ padding: "6px 8px" }}>{entry.status === "COMPLETED" ? "Completed" : "Not submitted"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          ))
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
