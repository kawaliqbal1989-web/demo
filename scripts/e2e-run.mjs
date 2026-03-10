import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config(
  process.env.DOTENV_CONFIG_PATH
    ? {
        path: process.env.DOTENV_CONFIG_PATH
      }
    : undefined
);

function setDefaultEnv(name, value) {
  if (!process.env[name] || !String(process.env[name]).trim()) {
    process.env[name] = value;
  }
}

// Ensure backend (webServer) and E2E fixtures (Prisma) point to the same DB.
const effectiveDatabaseUrl =
  process.env.E2E_DATABASE_URL || process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;

if (effectiveDatabaseUrl) {
  process.env.E2E_DATABASE_URL = effectiveDatabaseUrl;
  process.env.DATABASE_URL = effectiveDatabaseUrl;
}

// Backend requires these; defaulting keeps local E2E runs simple.
setDefaultEnv("JWT_ACCESS_SECRET", "dev");
setDefaultEnv("JWT_REFRESH_SECRET", "dev");
setDefaultEnv("JWT_ISSUER", "dev");
setDefaultEnv("JWT_AUDIENCE", "dev");
setDefaultEnv("E2E_CLEANUP", "1");

const cliPath = path.join(process.cwd(), "node_modules", "@playwright", "test", "cli.js");
if (!fs.existsSync(cliPath)) {
  throw new Error(
    [
      "Playwright CLI not found.",
      "",
      "Fix:",
      "- Run `npm install`",
      `- Expected: ${cliPath}`
    ].join("\n")
  );
}

const args = process.argv.slice(2);
const finalArgs = args.length ? args : ["test"];

const child = spawn(process.execPath, [cliPath, ...finalArgs], {
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
