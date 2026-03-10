import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load .env for Prisma CLI invocations (does not override existing env vars).
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prismaCliEntrypoint = path.join(__dirname, "..", "node_modules", "prisma", "build", "index.js");

const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [prismaCliEntrypoint, ...args], {
  stdio: "inherit",
  env: process.env
});

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);
