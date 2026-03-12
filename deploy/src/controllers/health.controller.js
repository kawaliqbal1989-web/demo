import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";

const startedAt = new Date().toISOString();

const getHealth = asyncHandler(async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.apiSuccess("ok", {
      status: "ok",
      db: "ok",
      timestamp: new Date().toISOString()
    });
  } catch (_err) {
    return res.apiError(503, "unhealthy", "HEALTHCHECK_DB_FAILED");
  }
});

const getReadiness = asyncHandler(async (_req, res) => {
  const checks = { db: "unknown" };
  let ready = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch {
    checks.db = "fail";
    ready = false;
  }

  const payload = {
    ready,
    checks,
    uptime_seconds: Math.floor(process.uptime()),
    started_at: startedAt,
    version: process.env.npm_package_version || "0.1.0",
    node: process.version,
    env: process.env.NODE_ENV || "development",
  };

  if (!ready) {
    return res.status(503).json({ status: "error", message: "Not ready", data: payload });
  }
  return res.apiSuccess("ready", payload);
});

export { getHealth, getReadiness };
