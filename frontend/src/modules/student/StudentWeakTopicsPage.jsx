import { useEffect, useState } from "react";
import { getStudentWeakTopics } from "../../services/studentPortalService";

function StudentWeakTopicsPage() {
  const [topics, setTopics] = useState([]);
  const [threshold, setThreshold] = useState(60);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    getStudentWeakTopics({ threshold })
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data;
        setTopics(Array.isArray(data) ? data : Array.isArray(data?.topics) ? data.topics : []);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load weak topics.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [threshold]);

  return (
    <div>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>⚠️ Weak Topics</h2>
          <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)" }}>Topics where your accuracy is below the threshold</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "var(--color-text-muted)" }} htmlFor="wt-threshold">Threshold</label>
          <input
            id="wt-threshold"
            type="range"
            min={30}
            max={90}
            step={5}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            style={{ width: 120 }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 36, textAlign: "center" }}>{threshold}%</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        {loading && <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>}
        {error && <p style={{ color: "#dc2626" }}>{error}</p>}
        {!loading && !error && topics.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 48 }}>🎉</div>
            <p style={{ color: "#16a34a", fontWeight: 600, marginTop: 8 }}>
              No weak topics! All your topics are above {threshold}% accuracy.
            </p>
          </div>
        )}
        {!loading && !error && topics.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {topics.map((t, i) => {
              const accuracy = t.accuracy != null ? Number(t.accuracy) : t.averageScore != null ? Number(t.averageScore) : 0;
              const barColor = accuracy < 30 ? "#dc2626" : accuracy < 50 ? "#d97706" : "#f59e0b";
              return (
                <div
                  key={t.topic || t.topicName || i}
                  style={{
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    flexWrap: "wrap"
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 700, color: barColor, minWidth: 48 }}>
                    {accuracy.toFixed(0)}%
                  </div>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.topic || t.topicName || "Unknown Topic"}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                      {t.totalAttempts || t.attempts || 0} attempts
                      {t.levelName ? ` · ${t.levelName}` : ""}
                    </div>
                  </div>
                  <div style={{ width: 160, minWidth: 120 }}>
                    <div style={{ background: "var(--color-bg-muted)", borderRadius: 6, height: 10, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${Math.min(accuracy, 100)}%`,
                          background: barColor,
                          height: "100%",
                          borderRadius: 6,
                          transition: "width 0.3s ease"
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export { StudentWeakTopicsPage };
