import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

const kpiRateLimiter = rateLimit({
  windowMs: env.kpiRateLimitWindowMs,
  max: env.kpiRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.auth?.userId) {
      return `kpi:user:${req.auth.userId}`;
    }

    return `kpi:ip:${req.ip}`;
  },
  handler: (_req, res) => {
    if (typeof res.apiError === "function") {
      return res.apiError(429, "Too many KPI requests", "KPI_RATE_LIMITED");
    }

    return res.status(429).json({
      success: false,
      message: "Too many KPI requests",
      data: null,
      error_code: "KPI_RATE_LIMITED"
    });
  }
});

export { kpiRateLimiter };
