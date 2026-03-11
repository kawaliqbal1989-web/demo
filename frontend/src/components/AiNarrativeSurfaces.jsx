import { useState, useEffect, useCallback, memo } from "react";
import {
  getStudentAiNarrative,
  getTeacherAiNarrative,
  getCenterAiNarrative,
  getFranchiseAiNarrative,
  getBpAiNarrative,
  getSuperadminAiNarrative,
} from "../services/aiNarrativeService";

/* ═══════════════════════════════════════════════════════════════════════════
 * Shared hook — fetches AI narrative for any role
 * ═══════════════════════════════════════════════════════════════════════════ */
function useAiNarrative(fetchFn) {
  const [narrative, setNarrative] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchFn()
      .then((data) => setNarrative(data))
      .catch((err) => setError(err?.response?.data?.error || err.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [fetchFn]);

  useEffect(() => { refresh(); }, [refresh]);
  return { narrative, loading, error, refresh };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * AiNarrativePanel — Shared display shell with AI branding
 * ═══════════════════════════════════════════════════════════════════════════ */
function AiNarrativePanel({ title, icon, narrative, loading, error, onRefresh, children }) {
  if (loading) {
    return (
      <article className="ai-narrative-panel ai-narrative-panel--loading" role="region" aria-label={title} aria-busy="true">
        <div className="ai-narrative-header">
          <span className="ai-narrative-icon" aria-hidden="true">{icon || "🤖"}</span>
          <h3 className="ai-narrative-title">{title}</h3>
          <span className="ai-narrative-badge" aria-hidden="true">AI</span>
        </div>
        <div className="ai-narrative-body" aria-label="Loading AI insights">
          <div className="ai-narrative-skeleton" aria-hidden="true">
            <div className="ai-skeleton-line ai-skeleton-line--long" />
            <div className="ai-skeleton-line ai-skeleton-line--medium" />
            <div className="ai-skeleton-line ai-skeleton-line--short" />
            <div className="ai-skeleton-line ai-skeleton-line--long" />
            <div className="ai-skeleton-line ai-skeleton-line--medium" />
          </div>
        </div>
      </article>
    );
  }

  if (error) {
    return (
      <article className="ai-narrative-panel ai-narrative-panel--error" role="alert" aria-label={title}>
        <div className="ai-narrative-header">
          <span className="ai-narrative-icon" aria-hidden="true">{icon || "🤖"}</span>
          <h3 className="ai-narrative-title">{title}</h3>
        </div>
        <div className="ai-narrative-body">
          <p className="ai-narrative-error">{error}</p>
          {onRefresh && <button className="ai-narrative-retry" onClick={onRefresh}>Retry</button>}
        </div>
      </article>
    );
  }

  return (
    <article className={`ai-narrative-panel ${narrative?.ai ? "ai-narrative-panel--ai" : "ai-narrative-panel--deterministic"}`} role="region" aria-label={title}>
      <div className="ai-narrative-header">
        <span className="ai-narrative-icon" aria-hidden="true">{icon || "🤖"}</span>
        <h3 className="ai-narrative-title">{title}</h3>
        {narrative?.ai && <span className="ai-narrative-badge" aria-label="AI generated content">AI Generated</span>}
        {!narrative?.ai && <span className="ai-narrative-badge ai-narrative-badge--rule" aria-label="Smart insights">Smart Insights</span>}
        {onRefresh && (
          <button className="ai-narrative-refresh" onClick={onRefresh} title="Refresh narrative" aria-label="Refresh AI narrative">↻</button>
        )}
      </div>
      {narrative?.summary && (
        <div className="ai-narrative-summary" role="heading" aria-level="4">{narrative.summary}</div>
      )}
      <div className="ai-narrative-body">
        {children}
      </div>
    </article>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * StudentAiCoach — AI Learning Coach for students
 * ═══════════════════════════════════════════════════════════════════════════ */
export const StudentAiCoach = memo(function StudentAiCoach() {
  const { narrative, loading, error, refresh } = useAiNarrative(getStudentAiNarrative);

  return (
    <AiNarrativePanel
      title="AI Learning Coach"
      icon="🧠"
      narrative={narrative}
      loading={loading}
      error={error}
      onRefresh={refresh}
    >
      {narrative && (
        <div className="ai-narrative-sections" aria-live="polite">
          {narrative.celebration && (
            <div className="ai-narrative-section ai-narrative-section--celebration">
              <div className="ai-narrative-section-icon" aria-hidden="true">🌟</div>
              <div className="ai-narrative-section-content">
                <h4>What You're Doing Well</h4>
                <p>{narrative.celebration}</p>
              </div>
            </div>
          )}
          {narrative.focus && (
            <div className="ai-narrative-section ai-narrative-section--focus">
              <div className="ai-narrative-section-icon" aria-hidden="true">🎯</div>
              <div className="ai-narrative-section-content">
                <h4>Your Focus Areas</h4>
                <p>{narrative.focus}</p>
              </div>
            </div>
          )}
          {narrative.motivation && (
            <div className="ai-narrative-section ai-narrative-section--motivation">
              <div className="ai-narrative-section-icon" aria-hidden="true">💪</div>
              <div className="ai-narrative-section-content">
                <p className="ai-narrative-motivation">{narrative.motivation}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </AiNarrativePanel>
  );
}
)

/* ═══════════════════════════════════════════════════════════════════════════
 * TeacherCopilot — AI Intervention Copilot for teachers
 * ═══════════════════════════════════════════════════════════════════════════ */
export const TeacherCopilot = memo(function TeacherCopilot() {
  const { narrative, loading, error, refresh } = useAiNarrative(getTeacherAiNarrative);

  return (
    <AiNarrativePanel
      title="Intervention Copilot"
      icon="🎓"
      narrative={narrative}
      loading={loading}
      error={error}
      onRefresh={refresh}
    >
      {narrative && (
        <div className="ai-narrative-sections" aria-live="polite">
          {narrative.overview && (
            <div className="ai-narrative-section ai-narrative-section--overview">
              <div className="ai-narrative-section-icon" aria-hidden="true">📊</div>
              <div className="ai-narrative-section-content">
                <h4>Cohort Overview</h4>
                <p>{narrative.overview}</p>
              </div>
            </div>
          )}
          {narrative.priorities && (
            <div className="ai-narrative-section ai-narrative-section--priorities">
              <div className="ai-narrative-section-icon" aria-hidden="true">⚡</div>
              <div className="ai-narrative-section-content">
                <h4>Priority Actions</h4>
                <p>{narrative.priorities}</p>
              </div>
            </div>
          )}
          {narrative.quickWin && (
            <div className="ai-narrative-section ai-narrative-section--quickwin">
              <div className="ai-narrative-section-icon" aria-hidden="true">🎯</div>
              <div className="ai-narrative-section-content">
                <h4>Quick Win</h4>
                <p>{narrative.quickWin}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </AiNarrativePanel>
  );
}
)

/* ═══════════════════════════════════════════════════════════════════════════
 * CenterAssistant — AI Operations Assistant for center managers
 * ═══════════════════════════════════════════════════════════════════════════ */
export const CenterAssistant = memo(function CenterAssistant() {
  const { narrative, loading, error, refresh } = useAiNarrative(getCenterAiNarrative);

  return (
    <AiNarrativePanel
      title="Operations Assistant"
      icon="🏢"
      narrative={narrative}
      loading={loading}
      error={error}
      onRefresh={refresh}
    >
      {narrative && (
        <div className="ai-narrative-sections" aria-live="polite">
          {narrative.health && (
            <div className="ai-narrative-section ai-narrative-section--health">
              <div className="ai-narrative-section-icon" aria-hidden="true">💚</div>
              <div className="ai-narrative-section-content">
                <h4>Center Health</h4>
                <p>{narrative.health}</p>
              </div>
            </div>
          )}
          {narrative.risks && (
            <div className="ai-narrative-section ai-narrative-section--risks">
              <div className="ai-narrative-section-icon" aria-hidden="true">⚠️</div>
              <div className="ai-narrative-section-content">
                <h4>Operational Risks</h4>
                <p>{narrative.risks}</p>
              </div>
            </div>
          )}
          {narrative.opportunity && (
            <div className="ai-narrative-section ai-narrative-section--opportunity">
              <div className="ai-narrative-section-icon" aria-hidden="true">💡</div>
              <div className="ai-narrative-section-content">
                <h4>Optimization Opportunity</h4>
                <p>{narrative.opportunity}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </AiNarrativePanel>
  );
}
)

/* ═══════════════════════════════════════════════════════════════════════════
 * NetworkAdvisor — AI Network Advisor for Franchise/BP
 * ═══════════════════════════════════════════════════════════════════════════ */
export const NetworkAdvisor = memo(function NetworkAdvisor({ role = "FRANCHISE" }) {
  const fetchFn = role === "BP" ? getBpAiNarrative : getFranchiseAiNarrative;
  const { narrative, loading, error, refresh } = useAiNarrative(fetchFn);
  const roleLabel = role === "BP" ? "Business Partner" : "Franchise";

  return (
    <AiNarrativePanel
      title={`${roleLabel} Network Advisor`}
      icon="🌐"
      narrative={narrative}
      loading={loading}
      error={error}
      onRefresh={refresh}
    >
      {narrative && (
        <div className="ai-narrative-sections" aria-live="polite">
          {narrative.snapshot && (
            <div className="ai-narrative-section ai-narrative-section--snapshot">
              <div className="ai-narrative-section-icon" aria-hidden="true">📈</div>
              <div className="ai-narrative-section-content">
                <h4>Network Snapshot</h4>
                <p>{narrative.snapshot}</p>
              </div>
            </div>
          )}
          {narrative.intervention && (
            <div className="ai-narrative-section ai-narrative-section--intervention">
              <div className="ai-narrative-section-icon" aria-hidden="true">🎯</div>
              <div className="ai-narrative-section-content">
                <h4>Where to Intervene</h4>
                <p>{narrative.intervention}</p>
              </div>
            </div>
          )}
          {narrative.growth && (
            <div className="ai-narrative-section ai-narrative-section--growth">
              <div className="ai-narrative-section-icon" aria-hidden="true">🚀</div>
              <div className="ai-narrative-section-content">
                <h4>Growth Opportunity</h4>
                <p>{narrative.growth}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </AiNarrativePanel>
  );
}
)

/* ═══════════════════════════════════════════════════════════════════════════
 * CommandCenterAi — AI Command Center for Superadmin
 * ═══════════════════════════════════════════════════════════════════════════ */
export const CommandCenterAi = memo(function CommandCenterAi() {
  const { narrative, loading, error, refresh } = useAiNarrative(getSuperadminAiNarrative);

  return (
    <AiNarrativePanel
      title="Command Center AI"
      icon="🛡️"
      narrative={narrative}
      loading={loading}
      error={error}
      onRefresh={refresh}
    >
      {narrative && (
        <div className="ai-narrative-sections" aria-live="polite">
          {narrative.health && (
            <div className="ai-narrative-section ai-narrative-section--platform">
              <div className="ai-narrative-section-icon" aria-hidden="true">🏗️</div>
              <div className="ai-narrative-section-content">
                <h4>Platform Health</h4>
                <p>{narrative.health}</p>
              </div>
            </div>
          )}
          {narrative.exceptions && (
            <div className="ai-narrative-section ai-narrative-section--exceptions">
              <div className="ai-narrative-section-icon" aria-hidden="true">🚨</div>
              <div className="ai-narrative-section-content">
                <h4>Exceptions & Urgent Items</h4>
                <p>{narrative.exceptions}</p>
              </div>
            </div>
          )}
          {narrative.recommendation && (
            <div className="ai-narrative-section ai-narrative-section--recommendation">
              <div className="ai-narrative-section-icon" aria-hidden="true">💡</div>
              <div className="ai-narrative-section-content">
                <h4>Strategic Recommendation</h4>
                <p>{narrative.recommendation}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </AiNarrativePanel>
  );
}
)
