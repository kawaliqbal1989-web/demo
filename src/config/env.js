import dotenv from "dotenv";

dotenv.config(
  // process.env.DOTENV_CONFIG_PATH
  //   ? {
  //       path: process.env.DOTENV_CONFIG_PATH
  //     }
  //   : undefined
);

function requiredEnv(name) {
  const value = process.env[`${name}`];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return String(value).trim();
}

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

const env = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT || 4000),
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtIssuer: process.env.JWT_ISSUER,
  jwtAudience: process.env.JWT_AUDIENCE,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "20m",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  requestBodyLimit: process.env.REQUEST_BODY_LIMIT || "1mb",
  authRateLimitWindowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 900000),
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  corsAllowedOrigins: String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  kpiRateLimitWindowMs: Number(process.env.KPI_RATE_LIMIT_WINDOW_MS || 60000),
  kpiRateLimitMax: Number(process.env.KPI_RATE_LIMIT_MAX || 120),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  aiDailyLimit: Number(process.env.AI_DAILY_LIMIT || 30)
};

// Validate numeric config values
if (env.port < 1 || env.port > 65535) throw new Error("PORT must be between 1 and 65535");
if (env.authRateLimitMax < 1) throw new Error("AUTH_RATE_LIMIT_MAX must be > 0");
if (env.authRateLimitWindowMs < 1000) throw new Error("AUTH_RATE_LIMIT_WINDOW_MS must be >= 1000");
if (env.kpiRateLimitMax < 1) throw new Error("KPI_RATE_LIMIT_MAX must be > 0");
if (env.aiDailyLimit < 1) throw new Error("AI_DAILY_LIMIT must be > 0");

export { env };
