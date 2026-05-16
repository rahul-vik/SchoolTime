import { nowIso } from "./common.js";

/**
 * Backfill missing `timetable_runs.state_json` from current `tenant_state` so older runs
 * align period columns with entries (non-destructive; does not change entries/report).
 *
 * @param {{ all: Function; run: Function }} db
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function backfillTimetableRunStateJson(db, opts = {}) {
  const dryRun = opts.dryRun === true;
  const rows = await db.all(
    `SELECT r.id, r.org_id
     FROM timetable_runs r
     WHERE r.state_json IS NULL OR TRIM(r.state_json) = ''`,
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    return { scanned: 0, updated: 0, skipped: 0, dryRun };
  }

  let updated = 0;
  let skipped = 0;
  const stamp = nowIso();

  for (const row of rows) {
    const ts = await db.get("SELECT state_json FROM tenant_state WHERE org_id = ?", row.org_id);
    if (!ts?.state_json || String(ts.state_json).trim() === "") {
      skipped += 1;
      continue;
    }
    if (!dryRun) {
      await db.run("UPDATE timetable_runs SET state_json = ? WHERE id = ?", ts.state_json, row.id);
      updated += 1;
    } else {
      updated += 1;
    }
  }

  return { scanned: rows.length, updated, skipped, dryRun };
}
