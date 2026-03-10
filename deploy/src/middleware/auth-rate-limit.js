import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

function isLocalRequest(req) {
  const ip = String(req.ip || "");
  if (ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1") {
    return true;
  }

  // Best-effort fallback: some setups put localhost info in forwarded headers.
  const fwd = String(req.headers["x-forwarded-for"] || "");
  if (fwd.includes("127.0.0.1") || fwd.includes("::1")) {
    return true;
  }

  return false;
}

const authRateLimiter = rateLimit({
  windowMs: env.authRateLimitWindowMs,
  max: env.authRateLimitMax,
  skip: (req) => {
    // Developer experience: allow rapid login retries on localhost.
    if (!env.isProduction && isLocalRequest(req)) {
      return true;
    }
    return false;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    if (typeof res.apiError === "function") {
      return res.apiError(429, "Too many authentication requests", "AUTH_RATE_LIMITED");
    }

    return res.status(429).json({
      success: false,
      message: "Too many authentication requests",
      data: null,
      error_code: "AUTH_RATE_LIMITED"
    });
  }
});

export { authRateLimiter };
