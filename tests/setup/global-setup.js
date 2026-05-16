import "dotenv/config";
import { execSync } from "node:child_process";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, env, { input } = {}) {
  execSync(command, {
    stdio: "inherit",
    env,
    ...(input ? { input } : {})
  });
}

function escapeShellArgument(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

function getBootstrapDatabaseUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  parsed.pathname = "/mysql";
  return parsed.toString();
}

function getDatabaseName(databaseUrl) {
  const parsed = new URL(databaseUrl);
  return parsed.pathname.replace(/^\//, "");
}

function buildCreateDatabaseSql(databaseName) {
  return `CREATE DATABASE IF NOT EXISTS \`${String(databaseName).replaceAll("`", "``")}\`;`;
}

function ensureDatabaseExists(databaseUrl, env) {
  const databaseName = getDatabaseName(databaseUrl);
  if (!databaseName) {
    return;
  }

  run(
    `npx prisma db execute --url ${escapeShellArgument(getBootstrapDatabaseUrl(databaseUrl))} --stdin`,
    env,
    {
      input: buildCreateDatabaseSql(databaseName)
    }
  );
}

async function runWithRetry(command, env, { retries = 3, retryDelayMs = 400 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      run(command, env);
      return;
    } catch (err) {
      lastError = err;

      const msg = String(err?.message || "");
      const stderrText = err?.stderr ? String(err.stderr) : "";
      const stdoutText = err?.stdout ? String(err.stdout) : "";
      const combinedText = `${msg}\n${stderrText}\n${stdoutText}`;
      const isPrismaGenerate = command.includes("prisma generate");
      const isPrismaDbPush = command.includes("prisma db push");
      const isWindowsRenameEperm = /EPERM: operation not permitted, rename/i.test(combinedText);
      const isMissingDatabase = /P1003/i.test(combinedText);

      // Windows sometimes fails to rename the query engine DLL during prisma generate due to file locking.
      // If the client is already generated, continuing is usually safe for tests.
      if (isPrismaGenerate && (isWindowsRenameEperm || process.platform === "win32")) {
        // eslint-disable-next-line no-console
        console.warn(
          "[jest globalSetup] prisma generate failed on Windows (likely query engine DLL lock); continuing (client likely already generated)"
        );
        return;
      }

      if (isPrismaDbPush && isMissingDatabase && env?.DATABASE_URL) {
        ensureDatabaseExists(env.DATABASE_URL, env);
      }

      if (attempt < retries) {
        await sleep(retryDelayMs);
        continue;
      }
    }
  }

  throw lastError;
}

export default async function globalSetup() {
  const testDatabaseUrl = process.env.DATABASE_URL_TEST;

  if (!testDatabaseUrl) {
    throw new Error("DATABASE_URL_TEST must be set to run tests");
  }

  const env = {
    ...process.env,
    DATABASE_URL: testDatabaseUrl
  };

  await runWithRetry("npx prisma generate", env);
  await runWithRetry("npx prisma db push --force-reset --accept-data-loss --skip-generate", env);
  await runWithRetry("node prisma/seed.js", env);
}
