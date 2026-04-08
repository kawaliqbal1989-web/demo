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
  geminiApiKey: envOrDefault("GEMINI_API_KEY", ""),
  aiDailyLimit: Number(envOrDefault("AI_DAILY_LIMIT", "30"))
};

// Validate numeric config values
if (env.port < 1 || env.port > 65535) throw new Error("PORT must be between 1 and 65535");
if (env.authRateLimitMax < 1) throw new Error("AUTH_RATE_LIMIT_MAX must be > 0");
if (env.authRateLimitWindowMs < 1000) throw new Error("AUTH_RATE_LIMIT_WINDOW_MS must be >= 1000");
if (env.kpiRateLimitMax < 1) throw new Error("KPI_RATE_LIMIT_MAX must be > 0");
if (env.aiDailyLimit < 1) throw new Error("AI_DAILY_LIMIT must be > 0");

export { env };
