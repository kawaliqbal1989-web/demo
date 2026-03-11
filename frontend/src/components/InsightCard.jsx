import { useState, memo } from "react";
import { useNavigate } from "react-router-dom";
import { dismissInsight, actionInsight } from "../services/insightsService";

const SEVERITY_CONFIG = {
  CRITICAL: { icon: "🔴", accent: "var(--color-text-danger)", bg: "var(--color-bg-danger, #fef2f2)" },
  WARNING:  { icon: "🟡", accent: "var(--color-text-warning, #b45309)", bg: "var(--color-bg-warning, #fffbeb)" },
  INFO:     { icon: "🔵", accent: "var(--color-primary)", bg: "var(--color-bg-info, #eff6ff)" },
  SUCCESS:  { icon: "🟢", accent: "var(--color-text-success)", bg: "var(--color-bg-success, #f0fdf4)" },
};

const InsightCard = memo(function InsightCard({ insight, onDismiss }) {
  const navigate = useNavigate();
  const [dismissing, setDismissing] = useState(false);
  const config = SEVERITY_CONFIG[insight.severity] || SEVERITY_CONFIG.INFO;

  const handleAction = async () => {
    try {
      await actionInsight(insight.id);
    } catch { /* best-effort */ }
    if (insight.actionUrl) navigate(insight.actionUrl);
  };

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await dismissInsight(insight.id);
      onDismiss?.(insight.id);
    } catch {
      setDismissing(false);
    }
  };

  return (
    <div className="insight-card" style={{ borderLeftColor: config.accent, background: config.bg }} role="article" aria-label={`${insight.severity} insight: ${insight.title}`}>
      <div className="insight-card__icon" aria-hidden="true">{config.icon}</div>
      <div className="insight-card__body">
        <div className="insight-card__title">{insight.title}</div>
        <div className="insight-card__message">{insight.message}</div>
        <div className="insight-card__actions">
          {insight.actionLabel && insight.actionUrl ? (
            <button type="button" className="insight-card__action-btn" onClick={handleAction}>
              {insight.actionLabel} →
            </button>
          ) : null}
          <button
            type="button"
            className="insight-card__dismiss-btn"
            onClick={handleDismiss}
            disabled={dismissing}
          >
            {dismissing ? "…" : "Dismiss"}
          </button>
        </div>
      </div>
    </div>
  );
});

const InsightPanel = memo(function InsightPanel({ insights, onDismiss, loading }) {
  if (loading) {
    return (
      <div className="insight-panel">
        <div className="insight-panel__header">
          <h3 className="insight-panel__title">🧠 Insights</h3>
        </div>
        <div className="insight-card" style={{ opacity: 0.5 }}>
          <div className="insight-card__body">
            <div className="insight-card__message">Analyzing your data...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!insights?.length) return null;

  return (
    <div className="insight-panel" role="region" aria-label="Insights and Recommendations">
      <div className="insight-panel__header">
        <h3 className="insight-panel__title">🧠 Insights & Recommendations</h3>
        <span className="insight-panel__count" aria-label={`${insights.length} insights`}>{insights.length}</span>
      </div>
      <div className="insight-panel__list" aria-live="polite">
        {insights.map((ins) => (
          <InsightCard key={ins.id} insight={ins} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  );
});

export { InsightCard, InsightPanel };
