import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { logger } from "./lib/logger.js";
import { startAnalyticsJobScheduler } from "./services/analytics-job-runner.service.js";
import { startReportExportInfrastructure } from "./services/report-export-runner.service.js";

const server = app.listen(env.port, () => {
  logger.info("server_started", {
    port: env.port
  });
});

const analyticsScheduler = startAnalyticsJobScheduler({ loggerOverride: logger });
const reportExportInfrastructure = startReportExportInfrastructure({ loggerOverride: logger });

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info("shutdown_initiated", { signal });

  server.close(async () => {
    try {
      analyticsScheduler?.stop?.();
      reportExportInfrastructure?.stop?.();
      await prisma.$disconnect();
      logger.info("shutdown_completed", { signal });
      process.exit(0);
    } catch (error) {
      logger.error("shutdown_failed", {
        signal,
        error: error.message
      });
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error("shutdown_timeout", { signal });
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error("unhandled_rejection", { reason: String(reason) });
});

process.on("uncaughtException", (error) => {
  logger.error("uncaught_exception", { error: error.message });
  shutdown("UNCAUGHT_EXCEPTION");
});
