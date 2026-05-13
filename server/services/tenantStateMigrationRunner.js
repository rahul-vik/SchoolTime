import { nowIso } from "./common.js";
import { migrateTenantState } from "./tenantStateMigration.js";

/**
 * Runs {@link migrateTenantState} on every `tenant_state` row and optionally persists changes.
 * Used on API startup (all environments, including production) and by `npm run migrate:tenant-state:backfill*`.
 *
 * @param {{ all: Function; run: Function }} db
 * @param {{ dryRun?: boolean }} [opts]
 * @returns {Promise<{ scanned: number; changed: number; updated: number; invalid: number; dryRun: boolean }>}
 */
export async function migrateAllPersistedTenantStates(db, opts = {}) {
  const dryRun = opts.dryRun === true;
  const rows = await db.all("SELECT org_id, state_json FROM tenant_state ORDER BY updated_at ASC");
  if (!Array.isArray(rows)) {
    return { scanned: 0, changed: 0, updated: 0, invalid: 0, dryRun };
  }

  let scanned = 0;
  let changed = 0;
  let updated = 0;
  let invalid = 0;
  const stamp = nowIso();

  for (const row of rows) {
    scanned += 1;
    let parsed;
    try {
      parsed = JSON.parse(row.state_json || "{}");
    } catch {
      invalid += 1;
      console.warn(`[tenant_state migration] Skipping org ${row.org_id}: invalid JSON in tenant_state.`);
      continue;
    }

    const migrated = migrateTenantState(parsed);
    if (!migrated.changed) continue;
    changed += 1;

    if (!dryRun) {
      await db.run(
        "UPDATE tenant_state SET state_json = ?, updated_at = ? WHERE org_id = ?",
        JSON.stringify(migrated.state),
        stamp,
        row.org_id,
      );
      updated += 1;
    }
  }

  return { scanned, changed, updated, invalid, dryRun };
}
