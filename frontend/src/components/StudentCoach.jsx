import { useNavigate } from "react-router-dom";

/* ─── Streak Bar ─────────────────────────────────────────────────── */
function StreakBar({ streaks }) {
  if (!streaks) return null;
  const att = streaks.attendance || {};
  const prac = streaks.practice || {};

  return (
    <div className="streak-bar">
      <div className="streak-bar__item">
        <span className="streak-bar__icon">🔥</span>
        <div className="streak-bar__info">
          <span className="streak-bar__value">{att.current || 0}</span>
          <span className="streak-bar__label">Attendance Streak</span>
        </div>
        {att.best > 0 && (
          <span className="streak-bar__best">Best: {att.best}</span>
        )}
      </div>
      <div className="streak-bar__divider" />
      <div className="streak-bar__item">
        <span className="streak-bar__icon">⚡</span>
        <div className="streak-bar__info">
          <span className="streak-bar__value">{prac.current || 0}</span>
          <span className="streak-bar__label">Practice Streak</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Daily Mission ──────────────────────────────────────────────── */
function DailyMission({ missions, loading }) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="daily-mission">
        <div className="daily-mission__header">
          <span className="daily-mission__title">🎯 Today's Missions</span>
        </div>
        <div className="daily-mission__loading">Loading missions...</div>
      </div>
    );
  }

  if (!missions?.length) return null;

  const completed = missions.filter((m) => m.completed).length;

  return (
    <div className="daily-mission">
      <div className="daily-mission__header">
        <span className="daily-mission__title">🎯 Today's Missions</span>
        <span className="daily-mission__progress">
          {completed}/{missions.length} done
        </span>
      </div>
      <div className="daily-mission__list">
        {missions.map((mission) => (
          <div
            key={mission.id}
            className={`daily-mission__card ${mission.completed ? "daily-mission__card--done" : ""}`}
          >
            <span className="daily-mission__card-icon">{mission.icon}</span>
            <div className="daily-mission__card-body">
              <div className="daily-mission__card-title">{mission.title}</div>
              <div className="daily-mission__card-desc">{mission.description}</div>
            </div>
            <div className="daily-mission__card-right">
              {mission.xp && !mission.completed && (
                <span className="daily-mission__xp">+{mission.xp} XP</span>
              )}
              {mission.completed ? (
                <span className="daily-mission__check">✅</span>
              ) : mission.actionUrl ? (
                <button
                  className="daily-mission__action-btn"
                  onClick={() => navigate(mission.actionUrl)}
                >
                  {mission.actionLabel || "Go"}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Weekly Plan ────────────────────────────────────────────────── */
function WeeklyPlan({ plan, loading }) {
  if (loading) {
    return (
      <div className="weekly-plan">
        <div className="weekly-plan__header">
          <span className="weekly-plan__title">📋 Weekly Plan</span>
        </div>
        <div className="weekly-plan__loading">Loading plan...</div>
      </div>
    );
  }

  if (!plan?.goals?.length) return null;

  return (
    <div className="weekly-plan">
      <div className="weekly-plan__header">
        <span className="weekly-plan__title">📋 Weekly Plan</span>
        <span className="weekly-plan__progress-badge">{plan.progress}%</span>
      </div>
      <div className="weekly-plan__bar-track">
        <div
          className="weekly-plan__bar-fill"
          style={{ width: `${plan.progress}%` }}
        />
      </div>
      <div className="weekly-plan__goals">
        {plan.goals.map((goal) => {
          const pct = goal.target > 0 ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0;
          return (
            <div
              key={goal.id}
              className={`weekly-plan__goal ${goal.completed ? "weekly-plan__goal--done" : ""}`}
            >
              <span className="weekly-plan__goal-icon">{goal.icon}</span>
              <div className="weekly-plan__goal-body">
                <div className="weekly-plan__goal-title">{goal.title}</div>
                <div className="weekly-plan__goal-bar-track">
                  <div
                    className="weekly-plan__goal-bar-fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <span className="weekly-plan__goal-count">
                {goal.current}/{goal.target}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Readiness Gauge ────────────────────────────────────────────── */
function ReadinessGauge({ readiness, loading }) {
  if (loading) return null;
  if (!readiness) return null;

  const items = [
    readiness.mockTest && { ...readiness.mockTest, key: "mockTest", title: "Mock Test" },
    readiness.competition && { ...readiness.competition, key: "competition", title: "Competition" },
    readiness.promotion && { ...readiness.promotion, key: "promotion", title: "Promotion" },
  ].filter(Boolean);

  if (items.length === 0) return null;

  return (
    <div className="readiness-gauge">
      <div className="readiness-gauge__title">📈 Readiness Scores</div>
      <div className="readiness-gauge__grid">
        {items.map((item) => {
          const color =
            item.score >= 80
              ? "var(--color-success)"
              : item.score >= 50
                ? "var(--color-warning)"
                : "var(--color-danger)";
          return (
            <div key={item.key} className="readiness-gauge__item">
              <div className="readiness-gauge__ring">
                <svg viewBox="0 0 80 80" width="80" height="80">
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke="var(--color-bg-badge)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke={color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - item.score / 100)}`}
                    style={{ transform: "rotate(-90deg)", transformOrigin: "center", transition: "stroke-dashoffset 0.6s ease" }}
                  />
                </svg>
                <span className="readiness-gauge__score">{item.score}%</span>
              </div>
              <div className="readiness-gauge__label">{item.title}</div>
              <div className="readiness-gauge__sublabel" style={{ color }}>
                {item.label}
              </div>
              {item.tip && (
                <div className="readiness-gauge__tip">{item.tip}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Milestone Card ─────────────────────────────────────────────── */
function MilestoneCard({ milestones, loading }) {
  if (loading) return null;
  if (!milestones) return null;

  const { earned = [], newlyEarned = [], nextHints = [] } = milestones;

  if (earned.length === 0 && nextHints.length === 0) return null;

  return (
    <div className="milestone-card">
      <div className="milestone-card__header">
        <span className="milestone-card__title">🏆 Milestones</span>
        <span className="milestone-card__count">{earned.length} earned</span>
      </div>

      {newlyEarned.length > 0 && (
        <div className="milestone-card__new">
          {newlyEarned.map((m) => (
            <div key={m.key} className="milestone-card__new-item">
              <span className="milestone-card__new-icon">{m.icon}</span>
              <span>New: {m.title}!</span>
            </div>
          ))}
        </div>
      )}

      <div className="milestone-card__grid">
        {earned.slice(0, 8).map((m) => (
          <div key={m.key} className="milestone-card__badge" title={m.description || m.title}>
            <span className="milestone-card__badge-icon">{m.icon}</span>
            <span className="milestone-card__badge-title">{m.title}</span>
          </div>
        ))}
      </div>

      {nextHints.length > 0 && (
        <div className="milestone-card__next">
          {nextHints.map((hint) => (
            <div key={hint.key} className="milestone-card__hint">
              <span>{hint.icon}</span>
              <div className="milestone-card__hint-body">
                <div className="milestone-card__hint-title">{hint.title}</div>
                <div className="milestone-card__hint-text">{hint.hint}</div>
                <div className="milestone-card__hint-bar-track">
                  <div
                    className="milestone-card__hint-bar-fill"
                    style={{ width: `${hint.progress}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Performance Explainer ──────────────────────────────────────── */
function PerformanceExplainer({ data, loading }) {
  if (loading) {
    return (
      <div className="perf-explainer">
        <div className="perf-explainer__title">🧠 Performance Analysis</div>
        <div className="perf-explainer__loading">Analyzing your performance...</div>
      </div>
    );
  }

  if (!data) return null;
  const { summary = [], strengths = [], improvements = [], tips = [] } = data;

  if (summary.length === 0 && strengths.length === 0 && improvements.length === 0) return null;

  return (
    <div className="perf-explainer">
      <div className="perf-explainer__title">🧠 Performance Analysis</div>

      {summary.map((s, i) => (
        <p key={i} className="perf-explainer__summary">{s}</p>
      ))}

      {strengths.length > 0 && (
        <div className="perf-explainer__section">
          <div className="perf-explainer__section-title">💪 Strengths</div>
          <ul className="perf-explainer__list">
            {strengths.map((s, i) => (
              <li key={i} className="perf-explainer__item perf-explainer__item--strength">{s}</li>
            ))}
          </ul>
        </div>
      )}

      {improvements.length > 0 && (
        <div className="perf-explainer__section">
          <div className="perf-explainer__section-title">🎯 Areas to Improve</div>
          <ul className="perf-explainer__list">
            {improvements.map((s, i) => (
              <li key={i} className="perf-explainer__item perf-explainer__item--improve">{s}</li>
            ))}
          </ul>
        </div>
      )}

      {tips.length > 0 && (
        <div className="perf-explainer__section">
          <div className="perf-explainer__section-title">💡 Tips</div>
          <ul className="perf-explainer__list">
            {tips.map((s, i) => (
              <li key={i} className="perf-explainer__item perf-explainer__item--tip">{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export { StreakBar, DailyMission, WeeklyPlan, ReadinessGauge, MilestoneCard, PerformanceExplainer };
