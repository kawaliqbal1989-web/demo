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
      errorCode: "DATABASE_UNAVAILABLE1",
      message: "Database unavailable"
    };
  }

  if (code.startsWith("P10") || /Can\s*not\s*reach\s*database|ECONNREFUSED|Connection\s*refused/i.test(message)) {
    return {
      statusCode: 503,
      errorCode: "DATABASE_UNAVAILABLE2",
      message: "Database unavailable"
    };
  }

  return null;
}

function extractFailureFrame(stack) {
  const lines = String(stack || "").split("\n").map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (!line.startsWith("at ")) {
      continue;
    }

    const withFunction = line.match(/^at\s+(.+?)\s+\((.+):(\d+):(\d+)\)$/);
    if (withFunction) {
      return {
        functionName: withFunction[1],
        file: withFunction[2],
        line: Number(withFunction[3]),
        column: Number(withFunction[4])
      };
    }

    const withoutFunction = line.match(/^at\s+(.+):(\d+):(\d+)$/);
    if (withoutFunction) {
      return {
        functionName: null,
        file: withoutFunction[1],
        line: Number(withoutFunction[2]),
        column: Number(withoutFunction[3])
      };
    }
  }

  return {
    functionName: null,
    file: null,
    line: null,
    column: null
  };
}

function errorHandler(error, req, res, _next) {
  const prismaMapped = mapPrismaError(error);
  const status = prismaMapped?.statusCode || error.statusCode || 500;
  const originalMessage = String(error?.message || "Internal server error");
  const rawMessage = prismaMapped?.message || originalMessage;
  const message = env.isProduction && status >= 500 ? "Internal server error" : rawMessage;
  const errorCode = prismaMapped?.errorCode || error.errorCode || "INTERNAL_ERROR";
  const frame = extractFailureFrame(error?.stack);

  logger.error("request_failed", {
    message,
    originalMessage,
    stack: error?.stack || null,
    prismaCode: error?.code || null,
    route: req?.originalUrl || req?.path || null,
    function: frame.functionName,
    file: frame.file,
    line: frame.line,
    column: frame.column,
    query: req?.query || null,
    method: req?.method,
    path: req?.originalUrl,
    ip: req?.ip,
    userId: req?.auth?.userId || null,
    role: req?.auth?.role || null,
    tenantId: req?.auth?.tenantId || null,
    status,
    errorCode
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
