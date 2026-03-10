import express from "express";
import helmet from "helmet";
import cors from "cors";
import path from "path";
import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";
import { requestLogger } from "./middleware/request-logger.js";
import { responseFormatMiddleware } from "./middleware/response-format.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { errorHandler } from "./middleware/error-handler.js";
import { prisma } from "./lib/prisma.js";
import { verifyAccessToken } from "./utils/token.js";

const app = express();

const productionCorsAllowedOrigins = new Set(
  env.corsAllowedOrigins.length ? env.corsAllowedOrigins : ["http://localhost:5173", "http://127.0.0.1:5173"]
);

app.disable("x-powered-by");

if (env.isProduction) {
  app.set("trust proxy", 1);
}

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (!env.isProduction) {
        const ok = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/i.test(origin);
        return callback(null, ok);
      }

      return callback(null, productionCorsAllowedOrigins.has(origin));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-user-role",
      "x-user-id",
      "x-student-id",
      "x-partner-id",
      "x-franchise-id",
      "x-client-session",
      "x-client-session-id",
      // Allow idempotency keys from clients (used to make POST idempotent)
      "Idempotency-Key",
      "X-Idempotency-Key",
      "idempotency-key"
    ],
    credentials: true
  })
);
app.use(express.json({ limit: env.requestBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: env.requestBodyLimit }));

app.use(
  "/uploads",
  (_req, res, next) => {
    // Allow cross-origin embedding of uploaded assets (e.g. <img> in Vite dev server).
    // Helmet defaults CORP to same-origin, which blocks loading assets from :4000 into :5173.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  (req, res, next) => {
    // Certificate assets must be publicly accessible (used in print flows via <img> tags).
    // All other upload subdirectories require a valid JWT.
    const publicPrefixes = ["/certificate-"];
    const isPublic = publicPrefixes.some((p) => req.path.startsWith(p));
    if (isPublic) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required" });
    }
    try {
      verifyAccessToken(authHeader.slice(7));
      return next();
    } catch {
      return res.status(401).json({ message: "Invalid token" });
    }
  },
  express.static(path.join(process.cwd(), "uploads"))
);

app.use(responseFormatMiddleware);
app.use(requestLogger);

app.get("/health", (_req, res) => {
  res.apiSuccess("Service healthy", {
    status: "ok",
    uptime_seconds: Math.floor(process.uptime())
  });
});

app.get("/health/db", async (_req, res) => {
  try {
    // Lightweight query; avoids loading lots of data.
    await prisma.tenant.findFirst({ select: { id: true } });
    return res.apiSuccess("Database healthy", { status: "ok" });
  } catch (error) {
    return res.apiError(503, "Database unavailable", "DATABASE_UNAVAILABLE");
  }
});

app.use("/api", apiRouter);

// ---------------------------------------------------------------------------
// In production, serve the built React frontend from frontend/dist.
// All non-API routes fall through to index.html for client-side routing.
// ---------------------------------------------------------------------------
if (env.isProduction) {
  const frontendDist = path.join(process.cwd(), "frontend", "dist");
  app.use(express.static(frontendDist));

  // SPA catch-all: any GET that didn't match /api/* or a static file → index.html
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
