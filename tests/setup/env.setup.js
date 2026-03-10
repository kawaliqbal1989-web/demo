import "dotenv/config";

if (!process.env.DATABASE_URL_TEST) {
  throw new Error("DATABASE_URL_TEST must be set before running tests");
}

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

process.env.NODE_ENV = "test";
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX || "1000";
process.env.AUTH_RATE_LIMIT_WINDOW_MS = process.env.AUTH_RATE_LIMIT_WINDOW_MS || "60000";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test_access_secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test_refresh_secret";
process.env.JWT_ISSUER = process.env.JWT_ISSUER || "abacusweb-backend";
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE || "abacusweb-api";
