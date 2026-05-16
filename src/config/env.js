import dotenv from "dotenv";

dotenv.config();

function normalizeEnvValue(value) {
  if (value === undefined || value === null) {
    return "";
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return "";
  }

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    return normalized.slice(1, -1).trim();
  }

  return normalized;
}

function requiredEnv(name) {
  const value = normalizeEnvValue(process.env[`${name}`]);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalEnv(name) {
  const value = normalizeEnvValue(process.env[`${name}`]);
  return value || undefined;
}

function envOrDefault(name, fallback) {
  const value = normalizeEnvValue(process.env[`${name}`]);
  return value || fallback;
}

function envFlag(name, fallback = false) {
  const value = normalizeEnvValue(process.env[`${name}`]);
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const nodeEnv = envOrDefault("NODE_ENV", "development");
const isProduction = nodeEnv === "production";

const env = {

  databaseUrl: requiredEnv("DATABASE_URL"),
  nodeEnv,
  isProduction,
  port: Number(envOrDefault("PORT", "4000")),
  jwtAccessSecret: requiredEnv("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: requiredEnv("JWT_REFRESH_SECRET"),
  jwtIssuer: optionalEnv("JWT_ISSUER"),
  jwtAudience: optionalEnv("JWT_AUDIENCE"),
  jwtAccessExpiresIn: envOrDefault("JWT_ACCESS_EXPIRES_IN", "20m"),
  jwtRefreshExpiresIn: envOrDefault("JWT_REFRESH_EXPIRES_IN", "7d"),
  requestBodyLimit: envOrDefault("REQUEST_BODY_LIMIT", "1mb"),
  authRateLimitWindowMs: Number(envOrDefault("AUTH_RATE_LIMIT_WINDOW_MS", "900000")),
  authRateLimitMax: Number(envOrDefault("AUTH_RATE_LIMIT_MAX", "20")),
  corsAllowedOrigins: envOrDefault("CORS_ALLOWED_ORIGINS", "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean) ,
  kpiRateLimitWindowMs: Number(envOrDefault("KPI_RATE_LIMIT_WINDOW_MS", "60000")),
  kpiRateLimitMax: Number(envOrDefault("KPI_RATE_LIMIT_MAX", "120")),
  analyticsSchedulerEnabled: envFlag("ANALYTICS_SCHEDULER_ENABLED", false),
  analyticsSchedulerRunOnStartup: envFlag("ANALYTICS_SCHEDULER_RUN_ON_STARTUP", false),
  analyticsSchedulerPollMs: Number(envOrDefault("ANALYTICS_SCHEDULER_POLL_MS", "300000")),
  analyticsSchedulerRunHourUtc: Number(envOrDefault("ANALYTICS_SCHEDULER_RUN_HOUR_UTC", "1")),
  analyticsSchedulerRunMinuteUtc: Number(envOrDefault("ANALYTICS_SCHEDULER_RUN_MINUTE_UTC", "15")),
  analyticsSchedulerLookbackDays: Number(envOrDefault("ANALYTICS_SCHEDULER_LOOKBACK_DAYS", "2")),
  reportExportWorkerEnabled: envFlag("REPORT_EXPORT_WORKER_ENABLED", false),
  reportExportWorkerRunOnStartup: envFlag("REPORT_EXPORT_WORKER_RUN_ON_STARTUP", true),
  reportExportWorkerPollMs: Number(envOrDefault("REPORT_EXPORT_WORKER_POLL_MS", "5000")),
  reportExportWorkerLeaseMs: Number(envOrDefault("REPORT_EXPORT_WORKER_LEASE_MS", "120000")),
  reportExportWorkerBatchSize: Number(envOrDefault("REPORT_EXPORT_WORKER_BATCH_SIZE", "2")),
  reportExportWorkerMaxAttempts: Number(envOrDefault("REPORT_EXPORT_WORKER_MAX_ATTEMPTS", "3")),
  reportExportWorkerRetryBackoffMs: Number(envOrDefault("REPORT_EXPORT_WORKER_RETRY_BACKOFF_MS", "30000")),
  reportExportArtifactRetentionHours: Number(envOrDefault("REPORT_EXPORT_ARTIFACT_RETENTION_HOURS", "24")),
  reportExportCleanupEnabled: envFlag("REPORT_EXPORT_CLEANUP_ENABLED", false),
  reportExportCleanupRunOnStartup: envFlag("REPORT_EXPORT_CLEANUP_RUN_ON_STARTUP", true),
  reportExportCleanupPollMs: Number(envOrDefault("REPORT_EXPORT_CLEANUP_POLL_MS", "300000")),
  reportExportSchedulerEnabled: envFlag("REPORT_EXPORT_SCHEDULER_ENABLED", false),
  reportExportSchedulerRunOnStartup: envFlag("REPORT_EXPORT_SCHEDULER_RUN_ON_STARTUP", true),
  reportExportSchedulerPollMs: Number(envOrDefault("REPORT_EXPORT_SCHEDULER_POLL_MS", "60000")),
  reportExportSlaQueuedMs: Number(envOrDefault("REPORT_EXPORT_SLA_QUEUED_MS", "60000")),
  reportExportSlaProcessingMs: Number(envOrDefault("REPORT_EXPORT_SLA_PROCESSING_MS", "300000")),
  reportExportOperationsWindowHours: Number(envOrDefault("REPORT_EXPORT_OPERATIONS_WINDOW_HOURS", "24")),
  reportExportOperationsRecentLimit: Number(envOrDefault("REPORT_EXPORT_OPERATIONS_RECENT_LIMIT", "12")),
  reportExportWorkerHeartbeatStaleMs: Number(envOrDefault("REPORT_EXPORT_WORKER_HEARTBEAT_STALE_MS", "180000")),
  reportExportSimulationMaxJobs: Number(envOrDefault("REPORT_EXPORT_SIMULATION_MAX_JOBS", "12")),
  reportExportRecoveryBatchSize: Number(envOrDefault("REPORT_EXPORT_RECOVERY_BATCH_SIZE", "10")),
  reportExportLeaseCandidateWindow: Number(envOrDefault("REPORT_EXPORT_LEASE_CANDIDATE_WINDOW", "16")),
  reportExportTenantConcurrencySoftLimit: Number(envOrDefault("REPORT_EXPORT_TENANT_CONCURRENCY_SOFT_LIMIT", "2")),
  productionGovernanceWindowHours: Number(envOrDefault("PRODUCTION_GOVERNANCE_WINDOW_HOURS", "72")),
  productionGovernanceRecentLimit: Number(envOrDefault("PRODUCTION_GOVERNANCE_RECENT_LIMIT", "8")),
  productionBackupRetentionDays: Number(envOrDefault("PRODUCTION_BACKUP_RETENTION_DAYS", "14")),
  productionFailoverPassScore: Number(envOrDefault("PRODUCTION_FAILOVER_PASS_SCORE", "80")),
  productionRecoveryReplayLimit: Number(envOrDefault("PRODUCTION_RECOVERY_REPLAY_LIMIT", "6")),
  productionSecurityMinSecretLength: Number(envOrDefault("PRODUCTION_SECURITY_MIN_SECRET_LENGTH", "32")),
  geminiApiKey: envOrDefault("GEMINI_API_KEY", ""),
  aiDailyLimit: Number(envOrDefault("AI_DAILY_LIMIT", "30"))
};

// Validate numeric config values
if (env.port < 1 || env.port > 65535) throw new Error("PORT must be between 1 and 65535");
if (env.authRateLimitMax < 1) throw new Error("AUTH_RATE_LIMIT_MAX must be > 0");
if (env.authRateLimitWindowMs < 1000) throw new Error("AUTH_RATE_LIMIT_WINDOW_MS must be >= 1000");
if (env.kpiRateLimitMax < 1) throw new Error("KPI_RATE_LIMIT_MAX must be > 0");
if (env.analyticsSchedulerPollMs < 1000) throw new Error("ANALYTICS_SCHEDULER_POLL_MS must be >= 1000");
if (env.analyticsSchedulerRunHourUtc < 0 || env.analyticsSchedulerRunHourUtc > 23) throw new Error("ANALYTICS_SCHEDULER_RUN_HOUR_UTC must be between 0 and 23");
if (env.analyticsSchedulerRunMinuteUtc < 0 || env.analyticsSchedulerRunMinuteUtc > 59) throw new Error("ANALYTICS_SCHEDULER_RUN_MINUTE_UTC must be between 0 and 59");
if (env.analyticsSchedulerLookbackDays < 1) throw new Error("ANALYTICS_SCHEDULER_LOOKBACK_DAYS must be > 0");
if (env.reportExportWorkerPollMs < 1000) throw new Error("REPORT_EXPORT_WORKER_POLL_MS must be >= 1000");
if (env.reportExportWorkerLeaseMs < 1000) throw new Error("REPORT_EXPORT_WORKER_LEASE_MS must be >= 1000");
if (env.reportExportWorkerBatchSize < 1) throw new Error("REPORT_EXPORT_WORKER_BATCH_SIZE must be > 0");
if (env.reportExportWorkerMaxAttempts < 1) throw new Error("REPORT_EXPORT_WORKER_MAX_ATTEMPTS must be > 0");
if (env.reportExportWorkerRetryBackoffMs < 0) throw new Error("REPORT_EXPORT_WORKER_RETRY_BACKOFF_MS must be >= 0");
if (env.reportExportArtifactRetentionHours < 1) throw new Error("REPORT_EXPORT_ARTIFACT_RETENTION_HOURS must be > 0");
if (env.reportExportCleanupPollMs < 1000) throw new Error("REPORT_EXPORT_CLEANUP_POLL_MS must be >= 1000");
if (env.reportExportSchedulerPollMs < 1000) throw new Error("REPORT_EXPORT_SCHEDULER_POLL_MS must be >= 1000");
if (env.reportExportSlaQueuedMs < 1000) throw new Error("REPORT_EXPORT_SLA_QUEUED_MS must be >= 1000");
if (env.reportExportSlaProcessingMs < 1000) throw new Error("REPORT_EXPORT_SLA_PROCESSING_MS must be >= 1000");
if (env.reportExportOperationsWindowHours < 1) throw new Error("REPORT_EXPORT_OPERATIONS_WINDOW_HOURS must be > 0");
if (env.reportExportOperationsRecentLimit < 1) throw new Error("REPORT_EXPORT_OPERATIONS_RECENT_LIMIT must be > 0");
if (env.reportExportWorkerHeartbeatStaleMs < 1000) throw new Error("REPORT_EXPORT_WORKER_HEARTBEAT_STALE_MS must be >= 1000");
if (env.reportExportSimulationMaxJobs < 1) throw new Error("REPORT_EXPORT_SIMULATION_MAX_JOBS must be > 0");
if (env.reportExportRecoveryBatchSize < 1) throw new Error("REPORT_EXPORT_RECOVERY_BATCH_SIZE must be > 0");
if (env.reportExportLeaseCandidateWindow < 1) throw new Error("REPORT_EXPORT_LEASE_CANDIDATE_WINDOW must be > 0");
if (env.reportExportTenantConcurrencySoftLimit < 1) throw new Error("REPORT_EXPORT_TENANT_CONCURRENCY_SOFT_LIMIT must be > 0");
if (env.productionGovernanceWindowHours < 1) throw new Error("PRODUCTION_GOVERNANCE_WINDOW_HOURS must be > 0");
if (env.productionGovernanceRecentLimit < 1) throw new Error("PRODUCTION_GOVERNANCE_RECENT_LIMIT must be > 0");
if (env.productionBackupRetentionDays < 1) throw new Error("PRODUCTION_BACKUP_RETENTION_DAYS must be > 0");
if (env.productionFailoverPassScore < 1 || env.productionFailoverPassScore > 100) throw new Error("PRODUCTION_FAILOVER_PASS_SCORE must be between 1 and 100");
if (env.productionRecoveryReplayLimit < 1) throw new Error("PRODUCTION_RECOVERY_REPLAY_LIMIT must be > 0");
if (env.productionSecurityMinSecretLength < 16) throw new Error("PRODUCTION_SECURITY_MIN_SECRET_LENGTH must be >= 16");
if (env.aiDailyLimit < 1) throw new Error("AI_DAILY_LIMIT must be > 0");

if (isProduction) {
  if (env.jwtAccessSecret === env.jwtRefreshSecret) {
    throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ in production");
  }
  if (env.jwtAccessSecret.length < env.productionSecurityMinSecretLength) {
    throw new Error(`JWT_ACCESS_SECRET must be at least ${env.productionSecurityMinSecretLength} characters in production`);
  }
  if (env.jwtRefreshSecret.length < env.productionSecurityMinSecretLength) {
    throw new Error(`JWT_REFRESH_SECRET must be at least ${env.productionSecurityMinSecretLength} characters in production`);
  }
  if (!env.corsAllowedOrigins.length || env.corsAllowedOrigins.includes("*")) {
    throw new Error("CORS_ALLOWED_ORIGINS must be explicitly configured in production");
  }
}

export { env };
