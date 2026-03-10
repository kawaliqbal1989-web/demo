import { spawn } from "node:child_process";

const nodeBin = process.execPath;

const effectiveDatabaseUrl =
  process.env.E2E_DATABASE_URL || process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;

// Playwright's webServer runner expects this process to stay alive.
const child = spawn(nodeBin, ["src/server.js"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: process.env.PORT || "4000",
    ...(effectiveDatabaseUrl ? { DATABASE_URL: effectiveDatabaseUrl } : {})
  }
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
