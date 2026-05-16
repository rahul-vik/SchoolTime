/**
 * Pre-production gate: build, smoke, migrations (dry-run), and regression tests.
 * Safe for CI and local use before promoting develop → main.
 *
 * Usage:
 *   npm run prod:preflight
 *   node scripts/prod-deploy-preflight.mjs --strict-migrations
 *
 * --strict-migrations  exit 1 if tenant or timetable-run backfill would change rows
 *                      (use before deploy when you want zero pending migrations without API restart)
 */
import { execSync } from "node:child_process";
import { db, initDb } from "../server/db.js";
import { migrateAllPersistedTenantStates } from "../server/services/tenantStateMigrationRunner.js";
import { backfillTimetableRunStateJson } from "../server/services/timetableRunStateBackfill.js";

const strictMigrations = process.argv.includes("--strict-migrations");

function run(cmd) {
  console.log(`\n▶ ${cmd}\n`);
  execSync(cmd, { stdio: "inherit", shell: process.platform === "win32" });
}

function warn(msg) {
  console.warn(`\n⚠ ${msg}\n`);
}

async function checkPendingMigrations() {
  await initDb();
  const tenant = await migrateAllPersistedTenantStates(db, { dryRun: true });
  const runs = await backfillTimetableRunStateJson(db, { dryRun: true });

  console.log(
    `[preflight] tenant_state: scanned=${tenant.scanned} wouldChange=${tenant.changed} invalidJson=${tenant.invalid}`,
  );
  console.log(
    `[preflight] timetable_runs.state_json: scanned=${runs.scanned} wouldUpdate=${runs.updated} skipped=${runs.skipped}`,
  );

  const pending = Number(tenant.changed) > 0 || Number(runs.updated) > 0;
  if (pending) {
    warn(
      "Pending data migrations detected (dry-run). On deploy, the API applies these automatically at startup " +
        "(see docs/DEPLOYMENT.md). Optional manual apply: npm run migrate:all",
    );
    if (strictMigrations) {
      throw new Error("Strict migrations: pending tenant_state or timetable_runs updates.");
    }
  } else {
    console.log("[preflight] No pending tenant/run JSON migrations (dry-run).");
  }
}

async function main() {
  console.log("prod-deploy-preflight: starting…\n");

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 18) {
    throw new Error(`Node.js 18+ required (found ${process.version}).`);
  }

  run("npm run build");
  run("npm run smoke:prod");
  run("npm run test:backend:engine");
  run("npm run test:backend:validation");
  run("npm run test:shared");

  await checkPendingMigrations();

  console.log("\n▶ audit:security\n");
  try {
    run("npm run audit:security");
  } catch {
    warn("Security audit reported high+ issues — review before production deploy.");
  }

  console.log("\nprod-deploy-preflight: passed.");
  console.log(
    "Production reminders: back up server/data (or Postgres), set NODE_ENV=production, " +
      "strong JWT_SECRET, explicit CORS_ORIGIN, TIMETABLE_SOLVER=legacy unless CP_SAT_SOLVER_URL is live, " +
      "CREATOR_PORTAL_PASSWORD_HASH in prod. See docs/PRODUCTION_READINESS.md and docs/DEPLOYMENT.md.\n",
  );
}

main().catch((err) => {
  console.error("\nprod-deploy-preflight: FAILED —", err?.message || err);
  process.exit(1);
});
