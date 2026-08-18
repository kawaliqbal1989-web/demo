import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { LoadingState } from "../../components/LoadingState";
import {
  exportCompetitionResultsCsv,
  getCompetitionResults
} from "../../services/competitionsService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function formatDateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

function CompetitionRoleResultsPage({ roleLabel, backPath }) {
  const { competitionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getCompetitionResults(competitionId);
      setResult(response?.data || null);
    } catch (err) {
      setResult(null);
      setError(
        getFriendlyErrorMessage(err) ||
          "Competition results could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, [competitionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await exportCompetitionResultsCsv(competitionId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `competition_${competitionId}_results.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(
        getFriendlyErrorMessage(err) || "Competition results export failed."
      );
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading Competition results..." />;
  }

  const levels = Array.isArray(result?.levels) ? result.levels : [];
  const rows = Array.isArray(result?.leaderboard) ? result.leaderboard : [];
  const groups = levels.length
    ? levels
    : rows.length
      ? [{ competitionCourseLevelId: "all", leaderboard: rows }]
      : [];

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div
        className="card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap"
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Competition Results</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {result?.competitionTitle || "Competition"} · {roleLabel} scope ·
            Published {formatDateTime(result?.resultPublishedAt)}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              color: "var(--color-text-muted)"
            }}
          >
            Only records allowed for your role are shown. Rank remains the
            published Competition-level rank.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="button secondary"
            type="button"
            onClick={() => void load()}
            style={{ width: "auto" }}
          >
            Refresh
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={exporting || Boolean(error)}
            onClick={() => void exportCsv()}
            style={{ width: "auto" }}
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(backPath)}
            style={{ width: "auto" }}
          >
            Back
          </button>
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>{error}</p>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10
            }}
          >
            <div className="card">
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Participation IDs
              </div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>
                {Number(result?.totalParticipants || 0)}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Completed
              </div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>
                {Number(result?.completedParticipants || 0)}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Result Status
              </div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                {result?.status || "—"}
              </div>
            </div>
          </div>

          {!groups.length ? (
            <div className="card">
              <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
                No published Competition result is available in your scope.
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div
                className="card"
                key={group.competitionCourseLevelId}
                style={{ overflowX: "auto" }}
              >
                <h3 style={{ marginTop: 0 }}>
                  {[
                    group.courseName || group.courseCode,
                    group.levelName ||
                      (group.levelRank ? `Level ${group.levelRank}` : null)
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Competition Results"}
                </h3>
                <div
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: 12,
                    marginBottom: 8
                  }}
                >
                  Participants: {group.totalParticipants ?? group.leaderboard.length}
                  {" · "}
                  Completed: {group.completedParticipants ?? 0}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "7px 8px" }}>Rank</th>
                      <th style={{ textAlign: "left", padding: "7px 8px" }}>Student</th>
                      <th style={{ textAlign: "left", padding: "7px 8px" }}>Admission No.</th>
                      <th style={{ textAlign: "left", padding: "7px 8px" }}>Type</th>
                      <th style={{ textAlign: "left", padding: "7px 8px" }}>Center</th>
                      <th style={{ textAlign: "left", padding: "7px 8px" }}>Teacher</th>
                      <th style={{ textAlign: "right", padding: "7px 8px" }}>Accuracy</th>
                      <th style={{ textAlign: "right", padding: "7px 8px" }}>Time (sec)</th>
                      <th style={{ textAlign: "left", padding: "7px 8px" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(group.leaderboard || []).map((entry, index) => (
                      <tr key={entry.participationId || `${entry.studentId}-${index}`}>
                        <td style={{ padding: "7px 8px" }}>{entry.rank ?? "—"}</td>
                        <td style={{ padding: "7px 8px" }}>{entry.studentName || "—"}</td>
                        <td style={{ padding: "7px 8px" }}>{entry.admissionNo || "—"}</td>
                        <td style={{ padding: "7px 8px" }}>
                          {entry.isTemporary ? "Temporary" : "Regular"}
                        </td>
                        <td style={{ padding: "7px 8px" }}>
                          {entry.centerName || entry.centerCode || "—"}
                        </td>
                        <td style={{ padding: "7px 8px" }}>
                          {entry.teacherName || "Center entry"}
                        </td>
                        <td style={{ padding: "7px 8px", textAlign: "right" }}>
                          {entry.accuracy ?? "—"}
                        </td>
                        <td style={{ padding: "7px 8px", textAlign: "right" }}>
                          {entry.completionTime ?? "—"}
                        </td>
                        <td style={{ padding: "7px 8px" }}>
                          {entry.status === "COMPLETED" ? "Completed" : "Not submitted"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </>
      )}
    </section>
  );
}

export { CompetitionRoleResultsPage };
