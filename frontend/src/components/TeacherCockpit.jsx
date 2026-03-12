import { useNavigate } from "react-router-dom";

/* ─── Risk Summary Bar ───────────────────────────────────────────── */
function RiskSummaryBar({ summary }) {
  if (!summary) return null;
  return (
    <div className="risk-summary-bar">
      <div className="risk-summary-bar__item risk-summary-bar__item--danger">
        <span className="risk-summary-bar__count">{summary.atRisk}</span>
        <span className="risk-summary-bar__label">At Risk</span>
      </div>
      <div className="risk-summary-bar__item risk-summary-bar__item--warning">
        <span className="risk-summary-bar__count">{summary.attention}</span>
        <span className="risk-summary-bar__label">Attention</span>
      </div>
      <div className="risk-summary-bar__item risk-summary-bar__item--success">
        <span className="risk-summary-bar__count">{summary.healthy}</span>
        <span className="risk-summary-bar__label">Healthy</span>
      </div>
      <div className="risk-summary-bar__item">
        <span className="risk-summary-bar__count">{summary.total}</span>
        <span className="risk-summary-bar__label">Total</span>
      </div>
    </div>
  );
}

/* ─── At-Risk Queue ──────────────────────────────────────────────── */
function AtRiskQueue({ data, loading }) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="at-risk-queue card">
        <div className="at-risk-queue__header">
          <h3>🚨 At-Risk Students</h3>
        </div>
        <div className="at-risk-queue__loading">Analyzing student risk…</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="at-risk-queue card">
      <div className="at-risk-queue__header">
        <h3>🚨 At-Risk Students</h3>
        <RiskSummaryBar summary={data.summary} />
      </div>

      {data.items.length === 0 ? (
        <div className="at-risk-queue__empty">
          <span className="at-risk-queue__empty-icon">✅</span>
          <p>All students are healthy — great work!</p>
        </div>
      ) : (
        <div className="at-risk-queue__list">
          {data.items.map((student) => {
            const visibleIndicators = (Array.isArray(student.indicators) ? student.indicators : [])
              .filter((indicator) => isTriggeredIndicator(indicator))
              .slice(0, 3);

            return (
              <div
                key={student.studentId}
                className={`at-risk-queue__item at-risk-queue__item--${student.riskLevel.toLowerCase()}`}
                onClick={() => navigate(`/teacher/students/${student.studentId}`)}
              >
                <div className="at-risk-queue__student">
                  <span className="at-risk-queue__name">{student.name}</span>
                  <span className="at-risk-queue__meta">
                    {student.admissionNo} · {student.level}
                  </span>
                </div>

                <div className="at-risk-queue__indicators">
                  {visibleIndicators.map((indicator, index) => (
                    <span key={getIndicatorKey(indicator, index)} className="at-risk-queue__tag">
                      {formatIndicator(indicator)}
                    </span>
                  ))}
                </div>

                {student.topAction && (
                  <div className="at-risk-queue__action">
                    <span>{student.topAction.icon}</span>
                    <span>{student.topAction.label}</span>
                  </div>
                )}

                <div className={`at-risk-queue__badge at-risk-queue__badge--${student.riskLevel.toLowerCase()}`}>
                  {student.riskLevel === "AT_RISK" ? "High Risk" : "Attention"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function isTriggeredIndicator(indicator) {
  if (!indicator) return false;
  if (typeof indicator === "string") return true;
  return indicator.triggered !== false;
}

function getIndicatorKey(indicator, index) {
  if (typeof indicator === "string") return indicator;
  return indicator?.key || indicator?.label || `indicator-${index}`;
}

function formatIndicator(ind) {
  const map = {
    LOW_ATTENDANCE: "Low Attendance",
    DECLINING_SCORES: "Declining Scores",
    FEE_OVERDUE: "Fee Overdue",
    INACTIVE: "Inactive",
    PROMOTION_BLOCKED: "Promo Blocked",
    LOW_PRACTICE: "Low Practice",
  };

  if (typeof ind === "string") {
    return map[ind] || ind;
  }

  if (ind?.label) {
    return ind.label;
  }

  if (ind?.key) {
    return map[ind.key] || ind.key;
  }

  return "Indicator";
}

/* ─── Batch Heatmap ──────────────────────────────────────────────── */
function BatchHeatmap({ batches, loading }) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="batch-heatmap card">
        <div className="batch-heatmap__header">
          <h3>📊 Batch Health</h3>
        </div>
        <div className="batch-heatmap__loading">Loading batches…</div>
      </div>
    );
  }

  if (!batches?.length) return null;

  return (
    <div className="batch-heatmap card">
      <div className="batch-heatmap__header">
        <h3>📊 Batch Health</h3>
      </div>
      <div className="batch-heatmap__grid">
        {batches.map((batch) => (
          <div
            key={batch.batchId}
            className={`batch-heatmap__card batch-heatmap__card--${batch.health.toLowerCase()}`}
            onClick={() => navigate(`/teacher/batches/${batch.batchId}/roster`)}
          >
            <div className="batch-heatmap__name">{batch.batchName}</div>
            <div className="batch-heatmap__stats">
              <div className="batch-heatmap__stat">
                <span className="batch-heatmap__stat-value">{batch.studentCount}</span>
                <span className="batch-heatmap__stat-label">Students</span>
              </div>
              <div className="batch-heatmap__stat">
                <span className="batch-heatmap__stat-value">{batch.avgAttendance}%</span>
                <span className="batch-heatmap__stat-label">Attendance</span>
              </div>
              <div className="batch-heatmap__stat">
                <span className="batch-heatmap__stat-value">{batch.avgScore}%</span>
                <span className="batch-heatmap__stat-label">Avg Score</span>
              </div>
            </div>
            <div className="batch-heatmap__footer">
              <span className={`batch-heatmap__health batch-heatmap__health--${batch.health.toLowerCase()}`}>
                {batch.health === "GOOD" ? "✅ Good" : batch.health === "FAIR" ? "⚠️ Fair" : batch.health === "EMPTY" ? "— Empty" : "🔴 Poor"}
              </span>
              {batch.atRiskCount > 0 && (
                <span className="batch-heatmap__risk">{batch.atRiskCount} at risk</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Worksheet Recommendations ──────────────────────────────────── */
function WorksheetRecommendations({ items, loading }) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="ws-recommendations card">
        <div className="ws-recommendations__header">
          <h3>📝 Worksheet Recommendations</h3>
        </div>
        <div className="ws-recommendations__loading">Analyzing student data…</div>
      </div>
    );
  }

  if (!items?.length) return null;

  return (
    <div className="ws-recommendations card">
      <div className="ws-recommendations__header">
        <h3>📝 Worksheet Recommendations</h3>
        <span className="ws-recommendations__count">{items.length} suggestions</span>
      </div>
      <div className="ws-recommendations__list">
        {items.map((rec, i) => (
          <div
            key={`${rec.studentId}-${rec.type}-${i}`}
            className={`ws-recommendations__item ws-recommendations__item--${rec.priority.toLowerCase()}`}
          >
            <div className="ws-recommendations__icon">{rec.icon}</div>
            <div className="ws-recommendations__body">
              <div className="ws-recommendations__student">
                <span
                  className="ws-recommendations__name"
                  onClick={() => navigate(`/teacher/students/${rec.studentId}`)}
                >
                  {rec.name}
                </span>
                <span className="ws-recommendations__meta">{rec.level}</span>
              </div>
              <p className="ws-recommendations__reason">{rec.reason}</p>
              <p className="ws-recommendations__suggestion">{rec.suggestion}</p>
            </div>
            <span className={`ws-recommendations__priority ws-recommendations__priority--${rec.priority.toLowerCase()}`}>
              {rec.priority}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Intervention Suggestions ───────────────────────────────────── */
function InterventionPanel({ items, loading }) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="intervention-panel card">
        <div className="intervention-panel__header">
          <h3>💡 Action Items</h3>
        </div>
        <div className="intervention-panel__loading">Generating suggestions…</div>
      </div>
    );
  }

  if (!items?.length) {
    return (
      <div className="intervention-panel card">
        <div className="intervention-panel__header">
          <h3>💡 Action Items</h3>
        </div>
        <div className="intervention-panel__empty">
          <span>🎉</span>
          <p>No action items right now — everything looks good!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="intervention-panel card">
      <div className="intervention-panel__header">
        <h3>💡 Action Items</h3>
      </div>
      <div className="intervention-panel__list">
        {items.map((item) => (
          <div
            key={item.id}
            className={`intervention-panel__item intervention-panel__item--${item.type.toLowerCase()}`}
          >
            <span className="intervention-panel__icon">{item.icon}</span>
            <div className="intervention-panel__content">
              <strong className="intervention-panel__title">{item.title}</strong>
              <p className="intervention-panel__desc">{item.description}</p>
            </div>
            {item.actionLabel && item.actionUrl && (
              <button
                className="intervention-panel__btn"
                onClick={() => navigate(item.actionUrl)}
              >
                {item.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export { AtRiskQueue, BatchHeatmap, WorksheetRecommendations, InterventionPanel, RiskSummaryBar };
