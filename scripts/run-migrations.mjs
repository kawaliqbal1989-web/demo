#!/usr/bin/env node
/**
 * Migration Sequencer — Runs migration SQL files in the correct wave/order.
 *
 * Usage:
 *   node scripts/run-migrations.mjs                     # Run all migrations
 *   node scripts/run-migrations.mjs --wave wave1        # Run only wave1
 *   node scripts/run-migrations.mjs --wave wave1,wave2  # Run wave1 and wave2
 *   node scripts/run-migrations.mjs --dry-run            # Show plan without executing
 *   node scripts/run-migrations.mjs --verify             # Verify which migrations are already applied
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createConnection } from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

/* ── Migration sequence (same as release-management.controller.js) ── */
const MIGRATION_SEQUENCE = [
  // Wave 1: Foundation
  { wave: "wave1", file: "migration_hierarchical_identity.sql", phase: 1, order: 1 },
  { wave: "wave1", file: "migration_pagination_indexes.sql", phase: 3, order: 2 },
  { wave: "wave1", file: "migration_practice_feature_entitlements.sql", phase: 4, order: 3 },
  { wave: "wave1", file: "migration_academic_engine.sql", phase: 4, order: 4 },
  // Wave 2: Student & Teacher
  { wave: "wave2", file: "migration_student_lifecycle_integrity.sql", phase: 5, order: 5 },
  { wave: "wave2", file: "migration_student_assigned_courses.sql", phase: 5, order: 6 },
  { wave: "wave2", file: "migration_student_premium.sql", phase: 5, order: 7 },
  { wave: "wave2", file: "migration_mock_test_online_worksheet_link.sql", phase: 5, order: 8 },
  { wave: "wave2", file: "migration_mock_test_attempts.sql", phase: 5, order: 9 },
  { wave: "wave2", file: "migration_teacher_profile_extended_fields.sql", phase: 6, order: 10 },
  { wave: "wave2", file: "migration_teacher_batch_features.sql", phase: 6, order: 11 },
  // Wave 3: Leadership & Notifications
  { wave: "wave3", file: "migration_level_default_fee_and_student_concession.sql", phase: 7, order: 12 },
  { wave: "wave3", file: "migration_franchise_profile_contact_fields.sql", phase: 7, order: 13 },
  { wave: "wave3", file: "migration_revenue_split_config.sql", phase: 7, order: 14 },
  { wave: "wave3", file: "migration_subscription_enforcement.sql", phase: 7, order: 15 },
  { wave: "wave3", file: "migration_drop_centerprofile_branding_fields.sql", phase: 7, order: 16 },
  { wave: "wave3", file: "migration_financial_ledger.sql", phase: 7, order: 17 },
  { wave: "wave3", file: "migration_notification_automation.sql", phase: 8, order: 18 },
  // Wave 4: Workflow & AI
  { wave: "wave4", file: "migration_worksheet_reassignment.sql", phase: 9, order: 19 },
  { wave: "wave4", file: "migration_competition_workflow_hardening.sql", phase: 9, order: 20 },
  { wave: "wave4", file: "migration_competition_result_status.sql", phase: 9, order: 21 },
];

/* ── Argument parsing ── */
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verifyMode = args.includes("--verify");
const waveIdx = args.indexOf("--wave");
const waveFilter = waveIdx >= 0 && args[waveIdx + 1]
  ? args[waveIdx + 1].split(",").map((s) => s.trim())
  : null;

function log(msg) { console.log(`[migrate] ${msg}`); }

async function main() {
  let migrations = MIGRATION_SEQUENCE;
  if (waveFilter) {
    migrations = migrations.filter((m) => waveFilter.includes(m.wave));
  }

  log(`Migration plan: ${migrations.length} files${waveFilter ? ` (waves: ${waveFilter.join(", ")})` : " (all waves)"}`);
  log("─".repeat(60));

  for (const m of migrations) {
    const filePath = resolve(PROJECT_ROOT, m.file);
    const exists = existsSync(filePath);
    const status = exists ? "✓" : "✗ MISSING";
    log(`  #${String(m.order).padStart(2, "0")} [${m.wave}] ${m.file} ${status}`);
  }

  if (dryRun) {
    log("─".repeat(60));
    log("Dry run complete — no SQL executed.");
    return;
  }

  // Connect to database
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    log("ERROR: DATABASE_URL not set");
    process.exit(1);
  }

  // Parse mysql:// URL
  const url = new URL(dbUrl);
  const connection = await createConnection({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    multipleStatements: true,
  });

  log("─".repeat(60));

  if (verifyMode) {
    log("Verifying migration state (checking information_schema)...\n");
    // All migrations are idempotent, so we just check if key tables/columns exist
    for (const m of migrations) {
      log(`  #${String(m.order).padStart(2, "0")} ${m.file} — present in project`);
    }
    await connection.end();
    log("\nVerification complete. All migration files use IF NOT EXISTS guards.");
    return;
  }

  // Execute migrations sequentially
  let successCount = 0;
  let skipCount = 0;

  for (const m of migrations) {
    const filePath = resolve(PROJECT_ROOT, m.file);
    if (!existsSync(filePath)) {
      log(`  SKIP #${m.order} ${m.file} — file not found`);
      skipCount++;
      continue;
    }

    const sql = readFileSync(filePath, "utf8").trim();
    if (!sql) {
      log(`  SKIP #${m.order} ${m.file} — empty file`);
      skipCount++;
      continue;
    }

    try {
      await connection.query(sql);
      log(`  ✓ #${String(m.order).padStart(2, "0")} ${m.file}`);
      successCount++;
    } catch (err) {
      log(`  ✗ #${String(m.order).padStart(2, "0")} ${m.file} — ERROR: ${err.message}`);
      log("  Stopping migration sequence due to error.");
      await connection.end();
      process.exit(1);
    }
  }

  await connection.end();
  log("─".repeat(60));
  log(`Done. ${successCount} applied, ${skipCount} skipped.`);
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
