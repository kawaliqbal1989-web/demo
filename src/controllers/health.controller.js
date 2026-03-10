import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";

const getHealth = asyncHandler(async (_req, res) => {
  try {
    // Lightweight DB ping for shared-hosting safety.
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

export { getHealth };
