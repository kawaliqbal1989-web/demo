import { useNavigate } from "react-router-dom";

/* ─── Health Score Ring ──────────────────────────────────────────── */
function HealthScoreRing({ score, grade, size = 120 }) {
  if (score == null) return null;
  const r = (size - 12) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;
  const gradeColor =
    grade === "A" ? "var(--color-success)" :
    grade === "B" ? "var(--color-primary)" :
    grade === "C" ? "var(--color-warning)" :
    "var(--color-error)";

  return (
    <div className="health-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--color-border)" strokeWidth="8" />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={gradeColor} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="health-ring__inner">
        <span className="health-ring__score" style={{ color: gradeColor }}>{score}</span>
        <span className="health-ring__grade">{grade}</span>
      </div>
    </div>
  );
}

/* ─── Health Score Card (Center) ─────────────────────────────────── */
function HealthScoreCard({ health, loading }) {
  if (loading) {
    return (
      <div className="health-card card">
        <h3 className="health-card__title">🏥 Center Health</h3>
        <div className="health-card__loading">Calculating health score…</div>
      </div>
    );
  }
  if (!health) return null;

  const pillars = [
    { key: "attendance", label: "Attendance", icon: "📅", detail: `${health.pillars.attendance.rate}% rate` },
    { key: "academic", label: "Academic", icon: "📚", detail: `${health.pillars.academic.avgScore}% avg` },
    { key: "finance", label: "Finance", icon: "💰", detail: `${health.pillars.finance.overdueCount} overdue` },
    { key: "operations", label: "Operations", icon: "⚙️", detail: `${health.pillars.operations.teachers}T / ${health.pillars.operations.batches}B` },
  ];

  return (
    <div className="health-card card">
      <div className="health-card__header">
        <div>
          <h3 className="health-card__title">🏥 Center Health</h3>
          <span className="health-card__students">{health.studentCount} active students</span>
        </div>
        <HealthScoreRing score={health.total} grade={health.grade} />
      </div>
      <div className="health-card__pillars">
        {pillars.map((p) => {
          const pillar = health.pillars[p.key];
          return (
            <div key={p.key} className="health-card__pillar">
              <div className="health-card__pillar-header">
                <span>{p.icon} {p.label}</span>
                <span className="health-card__pillar-score">{pillar.score}/{pillar.max}</span>
              </div>
              <div className="health-card__pillar-bar">
                <div
                  className="health-card__pillar-fill"
                  style={{ width: `${(pillar.score / pillar.max) * 100}%` }}
                />
              </div>
              <span className="health-card__pillar-detail">{p.detail}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Teacher Workload Table ─────────────────────────────────────── */
function TeacherWorkloadCard({ teachers, loading }) {
  if (loading) {
    return (
      <div className="workload-card card">
        <h3>👩‍🏫 Teacher Workload</h3>
        <div className="workload-card__loading">Loading workload data…</div>
      </div>
    );
  }
  if (!teachers?.length) return null;

  const loadColors = {
    OVERLOADED: "var(--color-error)",
    HIGH: "var(--color-warning)",
    BALANCED: "var(--color-success)",
    IDLE: "var(--color-text-muted)",
  };

  return (
    <div className="workload-card card">
      <h3>👩‍🏫 Teacher Workload</h3>
      <div className="workload-card__list">
        {teachers.map((t) => (
          <div key={t.teacherId} className="workload-card__row">
            <div className="workload-card__name">{t.name}</div>
            <div className="workload-card__stats">
              <span>{t.students} students</span>
              <span>{t.batches} batches</span>
              <span>{t.sessions30d} sessions</span>
            </div>
            <span
              className="workload-card__badge"
              style={{ background: `color-mix(in srgb, ${loadColors[t.load]} 12%, transparent)`, color: loadColors[t.load] }}
            >
              {t.load}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Attendance Anomalies ───────────────────────────────────────── */
function AnomalyPanel({ anomalies, loading }) {
  if (loading) {
    return (
      <div className="anomaly-panel card">
        <h3>🔍 Attendance Anomalies</h3>
        <div className="anomaly-panel__loading">Scanning patterns…</div>
      </div>
    );
  }
  if (!anomalies?.length) {
    return (
      <div className="anomaly-panel card">
        <h3>🔍 Attendance Anomalies</h3>
        <div className="anomaly-panel__empty">
          <span>✅</span> No anomalies detected — attendance looks normal.
        </div>
      </div>
    );
  }

  const sevColor = { CRITICAL: "var(--color-error)", WARNING: "var(--color-warning)", INFO: "var(--color-primary)" };

  return (
    <div className="anomaly-panel card">
      <h3>🔍 Attendance Anomalies</h3>
      <div className="anomaly-panel__list">
        {anomalies.map((a, i) => (
          <div key={i} className="anomaly-panel__item" style={{ borderLeftColor: sevColor[a.severity] || "var(--color-border)" }}>
            <span className="anomaly-panel__icon">{a.icon}</span>
            <div className="anomaly-panel__body">
              <strong>{a.title}</strong>
              <p>{a.detail}</p>
            </div>
            <span
              className="anomaly-panel__sev"
              style={{ color: sevColor[a.severity], background: `color-mix(in srgb, ${sevColor[a.severity]} 10%, transparent)` }}
            >
              {a.severity}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Fee Collection Pulse ───────────────────────────────────────── */
function FeePulseCard({ pulse, loading }) {
  if (loading) {
    return (
      <div className="fee-pulse card">
        <h3>💰 Fee Collection Pulse</h3>
        <div className="fee-pulse__loading">Loading financials…</div>
      </div>
    );
  }
  if (!pulse) return null;

  const trendUp = pulse.trend !== null && pulse.trend >= 0;

  return (
    <div className="fee-pulse card">
      <h3>💰 Fee Collection Pulse</h3>
      <div className="fee-pulse__grid">
        <div className="fee-pulse__metric">
          <span className="fee-pulse__value">₹{pulse.collected30d.toLocaleString()}</span>
          <span className="fee-pulse__label">Collected (30d)</span>
          {pulse.trend !== null && (
            <span className={`fee-pulse__trend fee-pulse__trend--${trendUp ? "up" : "down"}`}>
              {trendUp ? "↑" : "↓"} {pulse.trendLabel} vs prior
            </span>
          )}
        </div>
        <div className="fee-pulse__metric">
          <span className="fee-pulse__value fee-pulse__value--danger">₹{pulse.overdueAmount.toLocaleString()}</span>
          <span className="fee-pulse__label">{pulse.overdueCount} Overdue</span>
        </div>
        <div className="fee-pulse__metric">
          <span className="fee-pulse__value fee-pulse__value--warning">₹{pulse.upcomingDueAmount.toLocaleString()}</span>
          <span className="fee-pulse__label">{pulse.upcomingDueCount} Due in 14 days</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Network Pulse (Franchise / BP / Superadmin) ────────────────── */
function NetworkPulseCard({ data, loading, roleLabel }) {
  if (loading) {
    return (
      <div className="network-pulse card">
        <h3>🌐 Network Pulse</h3>
        <div className="network-pulse__loading">Aggregating network data…</div>
      </div>
    );
  }
  if (!data) return null;

  const s = data.summary;

  return (
    <div className="network-pulse card">
      <div className="network-pulse__header">
        <h3>🌐 {roleLabel || "Network"} Pulse</h3>
        {s.networkHealthScore != null && (
          <HealthScoreRing score={s.networkHealthScore} grade={
            s.networkHealthScore >= 80 ? "A" : s.networkHealthScore >= 65 ? "B" : s.networkHealthScore >= 50 ? "C" : "D"
          } size={80} />
        )}
      </div>
      <div className="network-pulse__kpis">
        <div className="network-pulse__kpi">
          <span className="network-pulse__kpi-value">{s.centers}</span>
          <span className="network-pulse__kpi-label">Centers</span>
        </div>
        <div className="network-pulse__kpi">
          <span className="network-pulse__kpi-value">{s.students}</span>
          <span className="network-pulse__kpi-label">Students</span>
        </div>
        <div className="network-pulse__kpi">
          <span className="network-pulse__kpi-value">{s.teachers}</span>
          <span className="network-pulse__kpi-label">Teachers</span>
        </div>
        <div className="network-pulse__kpi">
          <span className="network-pulse__kpi-value">{s.attendanceRate ?? "—"}%</span>
          <span className="network-pulse__kpi-label">Attendance</span>
        </div>
        <div className="network-pulse__kpi">
          <span className="network-pulse__kpi-value">{s.avgScore ?? "—"}%</span>
          <span className="network-pulse__kpi-label">Avg Score</span>
        </div>
        <div className="network-pulse__kpi">
          <span className="network-pulse__kpi-value">{s.recentAdmissions}</span>
          <span className="network-pulse__kpi-label">New (30d)</span>
        </div>
      </div>
      {s.overdueCount > 0 && (
        <div className="network-pulse__alert">
          ⚠️ {s.overdueCount} overdue installments totaling ₹{s.overdueAmount.toLocaleString()}
        </div>
      )}
    </div>
  );
}

/* ─── Center Ranking Table ───────────────────────────────────────── */
function CenterRanking({ topCenters, bottomCenters, loading }) {
  if (loading) return null;
  if (!topCenters?.length && !bottomCenters?.length) return null;

  return (
    <div className="center-ranking card">
      <h3>🏆 Center Rankings</h3>
      <div className="center-ranking__grid">
        {topCenters?.length > 0 && (
          <div className="center-ranking__section">
            <h4 className="center-ranking__section-title center-ranking__section-title--top">Top Performers</h4>
            {topCenters.map((c, i) => (
              <div key={c.centerId} className="center-ranking__row">
                <span className="center-ranking__rank">#{i + 1}</span>
                <div className="center-ranking__info">
                  <span className="center-ranking__name">{c.name}</span>
                  <span className="center-ranking__code">{c.code}</span>
                </div>
                <div className="center-ranking__score">
                  <span style={{ color: c.grade === "A" ? "var(--color-success)" : "var(--color-primary)" }}>
                    {c.total}/100
                  </span>
                  <span className="center-ranking__grade">{c.grade}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {bottomCenters?.length > 0 && (
          <div className="center-ranking__section">
            <h4 className="center-ranking__section-title center-ranking__section-title--bottom">Needs Attention</h4>
            {bottomCenters.map((c, i) => (
              <div key={c.centerId} className="center-ranking__row">
                <span className="center-ranking__rank" style={{ color: "var(--color-error)" }}>⚠</span>
                <div className="center-ranking__info">
                  <span className="center-ranking__name">{c.name}</span>
                  <span className="center-ranking__code">{c.code}</span>
                </div>
                <div className="center-ranking__score">
                  <span style={{ color: c.grade === "D" || c.grade === "F" ? "var(--color-error)" : "var(--color-warning)" }}>
                    {c.total}/100
                  </span>
                  <span className="center-ranking__grade">{c.grade}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export {
  HealthScoreRing,
  HealthScoreCard,
  TeacherWorkloadCard,
  AnomalyPanel,
  FeePulseCard,
  NetworkPulseCard,
  CenterRanking,
};
