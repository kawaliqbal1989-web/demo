/**
 * Feature Flag Service — Wave-based release gating
 *
 * Flags are organized into release waves. Each wave can be enabled/disabled
 * independently. Flags default to enabled in development and follow the
 * FEATURE_FLAGS env var in production.
 *
 * Env: FEATURE_FLAGS=wave1,wave2,wave3,wave4  (comma-separated list of enabled waves)
 * If FEATURE_FLAGS is not set, all waves default to enabled.
 */

/* ── Wave definitions ── */
const RELEASE_WAVES = {
  wave1: {
    name: "Foundation & Shell",
    description: "Design System V2, navigation, workflow simplification, intelligence platform",
    phases: [1, 2, 3, 4],
    features: [
      "design_system_v2",
      "breadcrumb_navigation",
      "page_headers",
      "data_table_v2",
      "command_palette",
      "insight_engine",
      "insight_panel",
    ],
  },
  wave2: {
    name: "Student & Teacher Intelligence",
    description: "Student premium experience, teacher intervention console, AI Learning Lab",
    phases: [5, 6],
    features: [
      "student_coach",
      "daily_missions",
      "weekly_plan",
      "streaks_milestones",
      "readiness_scores",
      "ai_learning_lab",
      "teacher_cockpit",
      "at_risk_queue",
      "batch_heatmap",
      "worksheet_recommendations",
      "intervention_suggestions",
    ],
  },
  wave3: {
    name: "Leadership Intelligence & Notifications",
    description: "Center/franchise/BP/superadmin intelligence, notification automation",
    phases: [7, 8],
    features: [
      "center_health_score",
      "teacher_workload",
      "attendance_anomalies",
      "fee_pulse",
      "network_pulse",
      "center_ranking",
      "notification_automation",
      "notification_preferences",
      "priority_notifications",
    ],
  },
  wave4: {
    name: "Workflow Hardening & AI Surfaces",
    description: "DataTable V3, bulk operations, approval queue, AI narratives, analytics",
    phases: [9, 10, 11],
    features: [
      "data_table_v3",
      "bulk_operations",
      "approval_queue",
      "saved_views",
      "ai_narrative_student",
      "ai_narrative_teacher",
      "ai_narrative_center",
      "ai_narrative_network",
      "ai_narrative_command_center",
      "recommendation_analytics",
      "ai_rate_limiting",
    ],
  },
};

/* ── State ── */
const enabledWaves = new Set();
let initialized = false;

function initFlags() {
  if (initialized) return;
  initialized = true;

  const envFlags = process.env.FEATURE_FLAGS;
  if (!envFlags) {
    // Default: all waves enabled
    Object.keys(RELEASE_WAVES).forEach((w) => enabledWaves.add(w));
  } else {
    envFlags
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .forEach((w) => enabledWaves.add(w));
  }
}

/* ── Public API ── */

function isWaveEnabled(waveKey) {
  initFlags();
  return enabledWaves.has(waveKey);
}

function isFeatureEnabled(featureName) {
  initFlags();
  for (const [waveKey, wave] of Object.entries(RELEASE_WAVES)) {
    if (wave.features.includes(featureName)) {
      return enabledWaves.has(waveKey);
    }
  }
  // Unknown features default to enabled
  return true;
}

function getWaveStatus() {
  initFlags();
  return Object.entries(RELEASE_WAVES).map(([key, wave]) => ({
    key,
    name: wave.name,
    description: wave.description,
    phases: wave.phases,
    featureCount: wave.features.length,
    enabled: enabledWaves.has(key),
  }));
}

function getFeatureStatus() {
  initFlags();
  const result = {};
  for (const [waveKey, wave] of Object.entries(RELEASE_WAVES)) {
    for (const feature of wave.features) {
      result[feature] = {
        wave: waveKey,
        waveName: wave.name,
        enabled: enabledWaves.has(waveKey),
      };
    }
  }
  return result;
}

function enableWave(waveKey) {
  initFlags();
  if (!RELEASE_WAVES[waveKey]) return false;
  enabledWaves.add(waveKey);
  return true;
}

function disableWave(waveKey) {
  initFlags();
  if (!RELEASE_WAVES[waveKey]) return false;
  enabledWaves.delete(waveKey);
  return true;
}

export {
  RELEASE_WAVES,
  isWaveEnabled,
  isFeatureEnabled,
  getWaveStatus,
  getFeatureStatus,
  enableWave,
  disableWave,
};
