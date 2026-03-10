import { useEffect, useState } from "react";
import { LoadingState } from "../../components/LoadingState";
import { getStudentLeaderboard } from "../../services/studentPortalService";
import { generateLeaderboardPdf } from "../../utils/pdfExport";

function medal(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function StudentLeaderboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    getStudentLeaderboard()
      .then((res) => setData(res?.data?.data || null))
      .catch(() => setError("Failed to load leaderboard."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Loading leaderboard..." />;

  const board = data?.leaderboard || [];
  const top3 = board.slice(0, 3);
  const rest = board.slice(3);

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>🏆 Leaderboard</h2>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
            Top students in your center, ranked by average worksheet score.
          </div>
        </div>
        {board.length ? (
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto", fontSize: 12 }}
            onClick={() => {
              const doc = generateLeaderboardPdf({
                title: "Leaderboard",
                rows: board.map((s) => ({
                  rank: s.rank,
                  studentName: s.studentName,
                  avgScore: s.avgScore,
                  totalWorksheets: s.totalSubmissions
                }))
              });
              doc.save("Leaderboard.pdf");
            }}
          >
            📄 Export PDF
          </button>
        ) : null}
      </div>

      {error ? <div className="card" style={{ color: "#ef4444" }}>{error}</div> : null}

      {/* My rank card */}
      {data?.myRank ? (
        <div
          className="card"
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            background: "var(--color-bg-info-light)",
            border: "2px solid #2563eb",
            flexWrap: "wrap"
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 800 }}>{medal(data.myRank)}</div>
          <div>
            <div style={{ fontWeight: 700 }}>Your Rank: #{data.myRank}</div>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              Average Score: {data.myScore ?? "—"}% • Out of {data.totalStudents} students
            </div>
          </div>
        </div>
      ) : null}

      {/* Top 3 podium */}
      {top3.length >= 1 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: top3.length >= 3 ? "1fr 1fr 1fr" : `repeat(${top3.length}, 1fr)`,
            gap: 12,
            textAlign: "center"
          }}
        >
          {/* Reorder for podium: [2nd, 1st, 3rd] if 3 exist */}
          {(top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3).map((s) => (
            <div
              key={s.studentId}
              className="card"
              style={{
                padding: "16px 12px",
                background: s.isMe ? "var(--color-bg-info-light)" : undefined,
                border: s.isMe ? "2px solid #2563eb" : undefined,
                transform: s.rank === 1 ? "scale(1.05)" : undefined,
                boxShadow: s.rank === 1 ? "0 4px 16px rgba(37,99,235,.15)" : undefined
              }}
            >
              <div style={{ fontSize: 36 }}>{medal(s.rank)}</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>{s.studentName}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#2563eb", marginTop: 2 }}>
                {s.avgScore}%
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                {s.totalSubmissions} worksheet{s.totalSubmissions !== 1 ? "s" : ""}
              </div>
              {s.isMe ? <div style={{ fontSize: 11, color: "#2563eb", fontWeight: 700, marginTop: 2 }}>⭐ You</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Remaining list */}
      {rest.length ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>Rank</th>
                  <th>Student</th>
                  <th>Avg Score</th>
                  <th>Worksheets</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((s) => (
                  <tr
                    key={s.studentId}
                    style={{
                      background: s.isMe ? "var(--color-bg-info-light)" : undefined,
                      fontWeight: s.isMe ? 700 : undefined
                    }}
                  >
                    <td style={{ fontWeight: 700 }}>{medal(s.rank)}</td>
                    <td>
                      {s.studentName}
                      {s.isMe ? <span style={{ color: "#2563eb", marginLeft: 6, fontSize: 11 }}>⭐ You</span> : null}
                    </td>
                    <td>{s.avgScore}%</td>
                    <td>{s.totalSubmissions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {!board.length && !error ? (
        <div className="card muted" style={{ textAlign: "center" }}>
          No leaderboard data yet. Complete some worksheets to see rankings!
        </div>
      ) : null}
    </section>
  );
}

export { StudentLeaderboardPage };
