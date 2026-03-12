/**
 * Release Management Controller — Wave status, feature flags, deployment info
 */
import { asyncHandler } from "../utils/async-handler.js";

/* ── Wave Status ── */
const handleGetWaveStatus = asyncHandler(async (_req, res) => {
  const { getWaveStatus } = await import("../services/feature-flags.service.js");
  const waves = getWaveStatus();
  return res.apiSuccess("ok", { waves });
});

/* ── Feature Status ── */
const handleGetFeatureStatus = asyncHandler(async (_req, res) => {
  const { getFeatureStatus } = await import("../services/feature-flags.service.js");
  const features = getFeatureStatus();
  return res.apiSuccess("ok", { features });
});

/* ── Toggle Wave (runtime only, not persisted across restarts) ── */
const handleToggleWave = asyncHandler(async (req, res) => {
  const { waveKey } = req.params;
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    return res.apiError(400, "enabled must be a boolean", "INVALID_BODY");
  }
  const { enableWave, disableWave } = await import("../services/feature-flags.service.js");
  const success = enabled ? enableWave(waveKey) : disableWave(waveKey);
  if (!success) {
    return res.apiError(404, `Unknown wave: ${waveKey}`, "WAVE_NOT_FOUND");
  }
  return res.apiSuccess(`Wave ${waveKey} ${enabled ? "enabled" : "disabled"}`, { waveKey, enabled });
});

/* ── Deployment Info ── */
const handleGetDeployInfo = asyncHandler(async (_req, res) => {
  const { getWaveStatus } = await import("../services/feature-flags.service.js");
  const { getNarrativeUsageStats } = await import("../services/ai-narrative.service.js");

  const waves = getWaveStatus();
  const enabledCount = waves.filter((w) => w.enabled).length;
  const aiStats = getNarrativeUsageStats();

  return res.apiSuccess("ok", {
    version: process.env.npm_package_version || "0.1.0",
    environment: process.env.NODE_ENV || "development",
    uptime_seconds: Math.floor(process.uptime()),
    node_version: process.version,
    waves: {
      total: waves.length,
      enabled: enabledCount,
      detail: waves,
    },
    ai: {
      gemini_configured: !!process.env.GEMINI_API_KEY,
      narrative_stats: aiStats,
    },
  });
});

/* ── Migration Sequence Info ── */
const MIGRATION_SEQUENCE = [
  // Wave 1: Foundation
  { wave: "wave1", file: "migration_hierarchical_identity.sql", phase: 1, order: 1, description: "AuthUser.username + hierarchical identity" },
  { wave: "wave1", file: "migration_pagination_indexes.sql", phase: 3, order: 2, description: "Pagination performance indexes" },
  { wave: "wave1", file: "migration_practice_feature_entitlements.sql", phase: 4, order: 3, description: "Practice feature entitlement system" },
  // Wave 1: Intelligence
  { wave: "wave1", file: "migration_academic_engine.sql", phase: 4, order: 4, description: "LevelRule, WorksheetTemplate, QuestionBank tables" },
  // Wave 2: Student & Teacher
  { wave: "wave2", file: "migration_student_lifecycle_integrity.sql", phase: 5, order: 5, description: "StudentLevelProgressionHistory immutable log" },
  { wave: "wave2", file: "migration_student_assigned_courses.sql", phase: 5, order: 6, description: "StudentAssignedCourse table" },
  { wave: "wave2", file: "migration_student_premium.sql", phase: 5, order: 7, description: "StudentMilestone table" },
  { wave: "wave2", file: "migration_mock_test_online_worksheet_link.sql", phase: 5, order: 8, description: "MockTest.worksheetId FK" },
  { wave: "wave2", file: "migration_mock_test_attempts.sql", phase: 5, order: 9, description: "MockTestAttempt table" },
  { wave: "wave2", file: "migration_teacher_profile_extended_fields.sql", phase: 6, order: 10, description: "TeacherProfile extended fields" },
  { wave: "wave2", file: "migration_teacher_batch_features.sql", phase: 6, order: 11, description: "WorksheetAssignment.dueDate + index" },
  // Wave 3: Leadership & Notifications
  { wave: "wave3", file: "migration_level_default_fee_and_student_concession.sql", phase: 7, order: 12, description: "Level fees + Student concessions" },
  { wave: "wave3", file: "migration_franchise_profile_contact_fields.sql", phase: 7, order: 13, description: "FranchiseProfile contact fields" },
  { wave: "wave3", file: "migration_revenue_split_config.sql", phase: 7, order: 14, description: "BusinessPartner.centerSharePercent" },
  { wave: "wave3", file: "migration_subscription_enforcement.sql", phase: 7, order: 15, description: "BusinessPartner.subscriptionStatus" },
  { wave: "wave3", file: "migration_drop_centerprofile_branding_fields.sql", phase: 7, order: 16, description: "Drop unused CenterProfile columns" },
  { wave: "wave3", file: "migration_financial_ledger.sql", phase: 7, order: 17, description: "FinancialTransaction immutable ledger" },
  { wave: "wave3", file: "migration_notification_automation.sql", phase: 8, order: 18, description: "Notification priority/category, NotificationPreference" },
  // Wave 4: Workflow & AI
  { wave: "wave4", file: "migration_worksheet_reassignment.sql", phase: 9, order: 19, description: "WorksheetReassignmentRequest table" },
  { wave: "wave4", file: "migration_competition_workflow_hardening.sql", phase: 9, order: 20, description: "Competition.rejectedAt workflow" },
  { wave: "wave4", file: "migration_competition_result_status.sql", phase: 9, order: 21, description: "Competition.resultStatus publish/unpublish" },
];

const handleGetMigrationSequence = asyncHandler(async (req, res) => {
  const { wave } = req.query;
  let result = MIGRATION_SEQUENCE;
  if (wave) {
    result = result.filter((m) => m.wave === wave);
  }
  return res.apiSuccess("ok", {
    total: result.length,
    migrations: result,
  });
});

export {
  handleGetWaveStatus,
  handleGetFeatureStatus,
  handleToggleWave,
  handleGetDeployInfo,
  handleGetMigrationSequence,
};
