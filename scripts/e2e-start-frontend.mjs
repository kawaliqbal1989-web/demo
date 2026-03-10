import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const nodeBin = process.execPath;
const frontendDir = fileURLToPath(new URL("../frontend/", import.meta.url));

const viteBin = path.join(frontendDir, "node_modules", "vite", "bin", "vite.js");

const child = spawn(nodeBin, [viteBin, "--port", "5173", "--strictPort"], {
  stdio: "inherit",
  cwd: frontendDir
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
