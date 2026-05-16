/**
 * Backfill timetable_runs.state_json from tenant_state for runs saved before state snapshots existed.
 *
 *   npm run migrate:timetable-run-state
 *   npm run migrate:timetable-run-state:apply
 */
import { db, initDb } from "../server/db.js";
import { backfillTimetableRunStateJson } from "../server/services/timetableRunStateBackfill.js";

const apply = process.argv.includes("--apply");

async function main() {
  await initDb();
  const result = await backfillTimetableRunStateJson(db, { dryRun: !apply });
  const mode = apply ? "apply" : "dry-run";
  console.log(
    `[timetable_runs] ${mode}: scanned=${result.scanned} wouldUpdate=${result.updated} skipped(no tenant_state)=${result.skipped}`,
  );
  if (!apply && result.updated > 0) {
    console.log("Re-run with --apply to persist.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
