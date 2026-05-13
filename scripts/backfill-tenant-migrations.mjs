import { db, initDb } from "../server/db.js";
import { migrateAllPersistedTenantStates } from "../server/services/tenantStateMigrationRunner.js";

function hasFlag(name) {
  return process.argv.includes(name);
}

async function main() {
  const dryRun = !hasFlag("--apply");
  await initDb();

  const r = await migrateAllPersistedTenantStates(db, { dryRun });

  if (r.scanned === 0) {
    console.log(`[backfill] No tenant_state rows found. Mode: ${dryRun ? "dry-run" : "apply"}.`);
    return;
  }

  console.log(
    `[backfill] Done. mode=${dryRun ? "dry-run" : "apply"} scanned=${r.scanned} changed=${r.changed} updated=${r.updated} invalid=${r.invalid}`,
  );
  if (dryRun) {
    console.log("[backfill] Re-run with --apply to persist migrated tenant states.");
  }
}

main().catch((error) => {
  console.error("[backfill] Failed:", error?.message || error);
  process.exit(1);
});
