import { useState, useEffect, useCallback, memo } from "react";
import {
  getWaveStatus,
  toggleWave,
  getDeployInfo,
  getMigrationSequence,
} from "../services/releaseService";

/* ═══════════════════════════════════════════════════════════════════════════
 * DeployInfoCard — Shows environment, version, uptime, AI stats
 * ═══════════════════════════════════════════════════════════════════════════ */
const DeployInfoCard = memo(function DeployInfoCard({ info }) {
  if (!info) return null;
  return (
    <article className="release-deploy-card" role="region" aria-label="Deployment Information">
      <h3 className="release-section-title">🚀 Deployment Info</h3>
      <div className="release-deploy-grid">
        <div className="release-deploy-item">
          <span className="release-deploy-label">Version</span>
          <span className="release-deploy-value">{info.version}</span>
        </div>
        <div className="release-deploy-item">
          <span className="release-deploy-label">Environment</span>
          <span className="release-deploy-value release-deploy-env">{info.environment}</span>
        </div>
        <div className="release-deploy-item">
          <span className="release-deploy-label">Node.js</span>
          <span className="release-deploy-value">{info.node_version}</span>
        </div>
        <div className="release-deploy-item">
          <span className="release-deploy-label">Uptime</span>
          <span className="release-deploy-value">{formatUptime(info.uptime_seconds)}</span>
        </div>
        <div className="release-deploy-item">
          <span className="release-deploy-label">Gemini AI</span>
          <span className="release-deploy-value">
            {info.ai?.gemini_configured ? (
              <span className="release-badge release-badge--enabled">Configured</span>
            ) : (
              <span className="release-badge release-badge--disabled">Not configured</span>
            )}
          </span>
        </div>
        <div className="release-deploy-item">
          <span className="release-deploy-label">Waves Enabled</span>
          <span className="release-deploy-value">
            {info.waves?.enabled}/{info.waves?.total}
          </span>
        </div>
      </div>
      {info.ai?.narrative_stats && (
        <div className="release-ai-stats">
          <h4>AI Usage Stats</h4>
          <div className="release-deploy-grid">
            <div className="release-deploy-item">
              <span className="release-deploy-label">Total Calls</span>
              <span className="release-deploy-value">{info.ai.narrative_stats.totalCalls}</span>
            </div>
            <div className="release-deploy-item">
              <span className="release-deploy-label">Gemini Calls</span>
              <span className="release-deploy-value">{info.ai.narrative_stats.geminiCalls}</span>
            </div>
            <div className="release-deploy-item">
              <span className="release-deploy-label">Cache Hits</span>
              <span className="release-deploy-value">{info.ai.narrative_stats.cacheHits}</span>
            </div>
            <div className="release-deploy-item">
              <span className="release-deploy-label">Tokens Used</span>
              <span className="release-deploy-value">{info.ai.narrative_stats.totalTokens?.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </article>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
 * WaveCard — Individual release wave with toggle
 * ═══════════════════════════════════════════════════════════════════════════ */
const WAVE_ICONS = { wave1: "🏗️", wave2: "🎓", wave3: "📊", wave4: "⚡" };
const WAVE_COLORS = { wave1: "#3b82f6", wave2: "#10b981", wave3: "#f59e0b", wave4: "#8b5cf6" };

const WaveCard = memo(function WaveCard({ wave, onToggle, toggling }) {
  return (
    <article
      className={`release-wave-card ${wave.enabled ? "release-wave-card--enabled" : "release-wave-card--disabled"}`}
      role="region"
      aria-label={`${wave.name} release wave`}
      style={{ borderLeftColor: WAVE_COLORS[wave.key] || "var(--color-border)" }}
    >
      <div className="release-wave-header">
        <span className="release-wave-icon" aria-hidden="true">{WAVE_ICONS[wave.key] || "📦"}</span>
        <div className="release-wave-info">
          <h4 className="release-wave-name">{wave.name}</h4>
          <p className="release-wave-desc">{wave.description}</p>
        </div>
        <div className="release-wave-meta">
          <span className="release-wave-phases">
            Phases {wave.phases?.join(", ")}
          </span>
          <span className="release-wave-features">
            {wave.featureCount} features
          </span>
        </div>
        <label className="release-wave-toggle" aria-label={`Toggle ${wave.name}`}>
          <input
            type="checkbox"
            checked={wave.enabled}
            disabled={toggling}
            onChange={() => onToggle(wave.key, !wave.enabled)}
          />
          <span className="release-toggle-slider" />
        </label>
      </div>
      <div className="release-wave-status">
        {wave.enabled ? (
          <span className="release-badge release-badge--enabled">Active</span>
        ) : (
          <span className="release-badge release-badge--disabled">Disabled</span>
        )}
      </div>
    </article>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
 * MigrationTimeline — Migration sequence with wave grouping
 * ═══════════════════════════════════════════════════════════════════════════ */
const MigrationTimeline = memo(function MigrationTimeline({ migrations }) {
  if (!migrations?.length) return null;

  const grouped = {};
  for (const m of migrations) {
    if (!grouped[m.wave]) grouped[m.wave] = [];
    grouped[m.wave].push(m);
  }

  return (
    <div className="release-migration-timeline" role="region" aria-label="Migration Sequence">
      <h3 className="release-section-title">🗃️ Migration Sequence</h3>
      {Object.entries(grouped).map(([wave, items]) => (
        <div key={wave} className="release-migration-group">
          <h4 className="release-migration-wave" style={{ color: WAVE_COLORS[wave] }}>
            {WAVE_ICONS[wave]} {wave.toUpperCase()}
          </h4>
          <div className="release-migration-list">
            {items.map((m) => (
              <div key={m.order} className="release-migration-item">
                <span className="release-migration-order">#{String(m.order).padStart(2, "0")}</span>
                <span className="release-migration-file">{m.file}</span>
                <span className="release-migration-desc">{m.description}</span>
                <span className="release-migration-phase">Phase {m.phase}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ReleaseManagement — Main page component for superadmin
 * ═══════════════════════════════════════════════════════════════════════════ */
export function ReleaseManagement() {
  const [waves, setWaves] = useState([]);
  const [deployInfo, setDeployInfo] = useState(null);
  const [migrations, setMigrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [activeTab, setActiveTab] = useState("waves"); // waves | migrations | deploy

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [w, d, m] = await Promise.all([
        getWaveStatus(),
        getDeployInfo(),
        getMigrationSequence(),
      ]);
      setWaves(w);
      setDeployInfo(d);
      setMigrations(m?.migrations ?? []);
    } catch {
      // best effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggle = useCallback(async (waveKey, enabled) => {
    setToggling(true);
    try {
      await toggleWave(waveKey, enabled);
      setWaves((prev) =>
        prev.map((w) => (w.key === waveKey ? { ...w, enabled } : w))
      );
    } catch {
      // revert on failure
    } finally {
      setToggling(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="release-panel" role="region" aria-label="Release Management" aria-busy="true">
        <div className="release-header">
          <h2>📦 Release Management</h2>
        </div>
        <div className="release-loading">Loading release configuration...</div>
      </div>
    );
  }

  return (
    <div className="release-panel" role="region" aria-label="Release Management">
      <div className="release-header">
        <h2>📦 Release Management</h2>
        <p className="release-subtitle">
          Manage release waves, feature flags, and deployment verification
        </p>
      </div>

      <div className="release-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === "waves"}
          className={`release-tab ${activeTab === "waves" ? "release-tab--active" : ""}`}
          onClick={() => setActiveTab("waves")}
        >
          🌊 Release Waves
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "migrations"}
          className={`release-tab ${activeTab === "migrations" ? "release-tab--active" : ""}`}
          onClick={() => setActiveTab("migrations")}
        >
          🗃️ Migrations
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "deploy"}
          className={`release-tab ${activeTab === "deploy" ? "release-tab--active" : ""}`}
          onClick={() => setActiveTab("deploy")}
        >
          🚀 Deploy Info
        </button>
      </div>

      <div className="release-content" role="tabpanel">
        {activeTab === "waves" && (
          <div className="release-waves-grid">
            {waves.map((wave) => (
              <WaveCard
                key={wave.key}
                wave={wave}
                onToggle={handleToggle}
                toggling={toggling}
              />
            ))}
            {!waves.length && (
              <p className="release-empty">No release waves configured.</p>
            )}
          </div>
        )}

        {activeTab === "migrations" && (
          <MigrationTimeline migrations={migrations} />
        )}

        {activeTab === "deploy" && (
          <DeployInfoCard info={deployInfo} />
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ReleaseWaveSummary — Compact widget for SuperadminDashboard
 * ═══════════════════════════════════════════════════════════════════════════ */
export const ReleaseWaveSummary = memo(function ReleaseWaveSummary() {
  const [waves, setWaves] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWaveStatus()
      .then(setWaves)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  const enabled = waves.filter((w) => w.enabled).length;

  return (
    <article className="release-summary-card" role="region" aria-label="Release Wave Summary">
      <div className="release-summary-header">
        <span className="release-summary-icon" aria-hidden="true">📦</span>
        <h3 className="release-summary-title">Release Waves</h3>
        <span className="release-summary-count">
          {enabled}/{waves.length} active
        </span>
      </div>
      <div className="release-summary-waves">
        {waves.map((wave) => (
          <div
            key={wave.key}
            className={`release-summary-dot ${wave.enabled ? "release-summary-dot--on" : "release-summary-dot--off"}`}
            title={`${wave.name}: ${wave.enabled ? "Enabled" : "Disabled"}`}
            style={{ borderColor: WAVE_COLORS[wave.key] }}
          >
            <span aria-hidden="true">{WAVE_ICONS[wave.key]}</span>
          </div>
        ))}
      </div>
    </article>
  );
});

/* ── Helpers ── */
function formatUptime(seconds) {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
