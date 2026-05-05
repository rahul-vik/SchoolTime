import { db, initDb } from "../server/db.js";
import { migrateTenantState } from "../server/services/tenantStateMigration.js";

function hasFlag(name) {
  return process.argv.includes(name);
}

function nowIso() {
  return new Date().toISOString();
}

async function main() {
  const dryRun = !hasFlag("--apply");
  await initDb();

  const rows = await db.all("SELECT org_id, state_json FROM tenant_state ORDER BY updated_at ASC");
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log(`[backfill] No tenant_state rows found. Mode: ${dryRun ? "dry-run" : "apply"}.`);
    return;
  }

  let scanned = 0;
  let changed = 0;
  let updated = 0;
  let invalid = 0;

  for (const row of rows) {
    scanned += 1;
    let parsed;
    try {
      parsed = JSON.parse(row.state_json || "{}");
    } catch {
      invalid += 1;
      console.warn(`[backfill] Skipping org ${row.org_id}: invalid JSON in tenant_state.`);
      continue;
    }

    const migrated = migrateTenantState(parsed);
    if (!migrated.changed) continue;
    changed += 1;

    if (!dryRun) {
      await db.run(
        "UPDATE tenant_state SET state_json = ?, updated_at = ? WHERE org_id = ?",
        JSON.stringify(migrated.state),
        nowIso(),
        row.org_id,
      );
      updated += 1;
    }
  }

  console.log(
    `[backfill] Done. mode=${dryRun ? "dry-run" : "apply"} scanned=${scanned} changed=${changed} updated=${updated} invalid=${invalid}`,
  );
  if (dryRun) {
    console.log("[backfill] Re-run with --apply to persist migrated tenant states.");
  }
}

main().catch((error) => {
  console.error("[backfill] Failed:", error?.message || error);
  process.exit(1);
});
