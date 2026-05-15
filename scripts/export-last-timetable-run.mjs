/**
 * Export the most recent timetable_runs row to JSON under ./Results/
 * (alongside PDF exports) for offline review without querying the DB.
 *
 * Usage: npm run export:last-run
 * Requires: .env as for the API (DB_CLIENT, DATABASE_URL when postgres).
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb, db } from "../server/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function safeJsonParse(text, label) {
  if (text == null || text === "") return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    console.warn(`[export:last-run] Could not parse ${label}: ${e.message}`);
    return null;
  }
}

async function main() {
  process.chdir(ROOT);
  await initDb();

  const row = await db.get(
    `SELECT id, org_id, status, score, created_at, report_json, entries_json, state_json
     FROM timetable_runs
     ORDER BY created_at DESC
     LIMIT 1`,
  );

  if (!row) {
    console.error("[export:last-run] No rows in timetable_runs. Generate a timetable in the app first.");
    process.exit(1);
  }

  const resultsDir = path.join(ROOT, "Results");
  fs.mkdirSync(resultsDir, { recursive: true });

  const report = safeJsonParse(row.report_json, "report_json");
  const entries = safeJsonParse(row.entries_json, "entries_json");
  const sourceState = safeJsonParse(row.state_json, "state_json");

  const meta = {
    exportedAt: new Date().toISOString(),
    run: {
      id: row.id,
      org_id: row.org_id,
      status: row.status,
      score: row.score,
      created_at: row.created_at,
    },
  };

  const summary = { ...meta, report };
  const bundle = { ...meta, report, entries, sourceState };

  const datePart = String(row.created_at || "unknown").slice(0, 10);
  const archiveName = `SchoolTime-timetable-run-${datePart}-${row.id}.json`;

  const targets = [
    ["SchoolTime-last-run.json", bundle],
    ["SchoolTime-last-run-summary.json", summary],
    [archiveName, bundle],
  ];

  for (const [name, payload] of targets) {
    const dest = path.join(resultsDir, name);
    fs.writeFileSync(dest, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    const kb = Math.round(fs.statSync(dest).size / 1024);
    console.log(`[export:last-run] Wrote ${path.relative(ROOT, dest)} (${kb} KB)`);
  }

  const entryCount = Array.isArray(entries) ? entries.length : 0;
  console.log(`[export:last-run] Run ${row.id} · entries: ${entryCount} · status: ${row.status}`);
}

main().catch((err) => {
  console.error("[export:last-run]", err);
  process.exit(1);
});
