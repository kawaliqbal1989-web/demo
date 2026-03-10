import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";

function mapPrismaError(error) {
  const name = String(error?.name || "");
  const code = String(error?.code || "");
  const message = String(error?.message || "");

  // Prisma connection/auth issues often surface as initialization errors or P10xx codes.
  if (name.includes("PrismaClientInitializationError") || name.includes("PrismaClientRustPanicError")) {
    return {
      statusCode: 503,
      errorCode: "DATABASE_UNAVAILABLE",
      message: "Database unavailable"
    };
  }

  if (code.startsWith("P10") || /Can\s*not\s*reach\s*database|ECONNREFUSED|Connection\s*refused/i.test(message)) {
    return {
      statusCode: 503,
      errorCode: "DATABASE_UNAVAILABLE",
      message: "Database unavailable"
    };
  }

  return null;
}

function errorHandler(error, req, res, _next) {
  const prismaMapped = mapPrismaError(error);
  const status = prismaMapped?.statusCode || error.statusCode || 500;
  const rawMessage = prismaMapped?.message || error.message || "Internal server error";
  const message = env.isProduction && status >= 500 ? "Internal server error" : rawMessage;
  const errorCode = prismaMapped?.errorCode || error.errorCode || "INTERNAL_ERROR";

  logger.error("request_failed", {
    method: req?.method,
    path: req?.originalUrl,
    ip: req?.ip,
    userId: req?.auth?.userId || null,
    role: req?.auth?.role || null,
    tenantId: req?.auth?.tenantId || null,
    status,
    errorCode,
    message,
    ...(env.isProduction
      ? {}
      : {
          stack: error?.stack || null
        })
  });

  if (typeof res.apiError === "function") {
    return res.apiError(status, message, errorCode);
  }

  return res.status(status).json({
    success: false,
    message,
    data: null,
    error_code: errorCode
  });
}

export { errorHandler };
