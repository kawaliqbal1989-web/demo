import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const nodeBin = process.execPath;
const frontendDir = fileURLToPath(new URL("../frontend/", import.meta.url));
const frontendPort = process.env.E2E_FRONTEND_PORT || "4173";
const backendPort = process.env.E2E_BACKEND_PORT || "4100";
const rawApiBaseUrl = process.env.E2E_API_BASE_URL || `http://127.0.0.1:${backendPort}`;
const apiBaseUrl = rawApiBaseUrl.endsWith("/api") ? rawApiBaseUrl : `${rawApiBaseUrl}/api`;

const viteBin = path.join(frontendDir, "node_modules", "vite", "bin", "vite.js");

const child = spawn(nodeBin, [viteBin, "--port", frontendPort, "--strictPort"], {
  stdio: "inherit",
  cwd: frontendDir,
  env: {
    ...process.env,
    VITE_API_BASE_URL: apiBaseUrl
  }
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
