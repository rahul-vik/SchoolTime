/**
 * Pre-generate tenant diagnostics: rule contradictions, impossible INCLUDE_ONLY, optional unscheduled trace.
 *
 * Usage:
 *   npm run check:tenant
 *   npm run check:tenant -- --trace-unscheduled
 *   npm run check:tenant -- --file=Results/SchoolTime-last-run.json --trace-unscheduled
 *   npm run check:tenant -- --org=<orgId>
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb, db } from "../server/db.js";
import { migrateTenantState } from "../server/services/tenantStateMigration.js";
import { runTenantPreflightCheck, traceUnscheduledRows } from "../shared/tenantPreflightCheck.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const traceUnscheduled = args.includes("--trace-unscheduled");
const fileArg = args.find((a) => a.startsWith("--file="));
const orgArg = args.find((a) => a.startsWith("--org="));
const jsonOut = args.includes("--json");

function subjectName(state, subjectId) {
  const s = (state.subjects || []).find((x) => x.id === subjectId);
  if (!s) return subjectId;
  return s.code || s.name || subjectId;
}

async function loadFromDb(orgId) {
  await initDb();
  let oid = orgArg?.slice("--org=".length) || orgId;
  if (!oid) {
    const row = await db.get("SELECT org_id FROM tenant_state ORDER BY updated_at DESC LIMIT 1");
    oid = row?.org_id;
  }
  if (!oid) {
    throw new Error("No tenant_state row found. Pass --org=<id> or set up the app DB first.");
  }
  const tenantRow = await db.get("SELECT state_json FROM tenant_state WHERE org_id = ?", oid);
  if (!tenantRow?.state_json) throw new Error(`No tenant_state for org ${oid}`);
  const state = migrateTenantState(JSON.parse(tenantRow.state_json)).state;

  let entries = [];
  let unscheduled = [];
  let runMeta = null;

  if (traceUnscheduled) {
    const runRow = await db.get(
      `SELECT id, status, score, report_json, entries_json, state_json
       FROM timetable_runs WHERE org_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      oid,
    );
    if (!runRow) {
      console.warn("[check:tenant] No timetable_runs row — skipping unscheduled trace.");
    } else {
      runMeta = { id: runRow.id, status: runRow.status, score: runRow.score };
      const report = JSON.parse(runRow.report_json || "{}");
      entries = JSON.parse(runRow.entries_json || "[]");
      unscheduled = report.unscheduled || [];
    }
  }

  return { source: `db org ${oid}`, state, entries, unscheduled, runMeta };
}

function loadFromFile(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  const state = migrateTenantState(raw.sourceState || raw).state;
  const report = raw.report || {};
  return {
    source: path.relative(ROOT, abs),
    state,
    entries: raw.entries || [],
    unscheduled: report.unscheduled || [],
    runMeta: raw.run || null,
  };
}

function printPreflight(preflight, state) {
  console.log("\n--- Preflight (rules & INCLUDE_ONLY) ---");
  if (preflight.ok) {
    console.log("OK — no blocking rule contradictions or impossible fixed-placement rules.");
    return;
  }
  console.log(`Found ${preflight.errorCount} error(s):\n`);
  for (const issue of preflight.errors) {
    const sub = subjectName(state, issue.subjectId);
    console.log(`  [${issue.code}] ${sub}${issue.ruleId ? ` (rule ${issue.ruleId})` : ""}`);
    console.log(`    ${issue.message}`);
  }
}

function printTrace(trace, runMeta) {
  console.log("\n--- Unscheduled trace ---");
  if (runMeta) {
    console.log(`Run: ${runMeta.id || "?"} · status ${runMeta.status || "?"} · score ${runMeta.score ?? "?"}`);
  }
  console.log(`Total periods short: ${trace.totalPeriodsShort} across ${trace.rowCount} class–subject row(s)\n`);

  console.log("By subject (periods short):");
  for (const g of trace.bySubject) {
    console.log(`  ${g.subjectLabel}: ${g.periodsShort}`);
  }

  console.log("\nDetail (largest gaps first):");
  for (const r of trace.rows) {
    console.log(`\n  ${r.divisionLabel} · ${r.subjectLabel}`);
    console.log(`    Short ${r.periodsShort}/${r.periodsRequired} (scheduled ${r.periodsScheduled})`);
    if (r.eligibleTeachers.length) {
      console.log(`    Eligible teachers: ${r.eligibleTeachers.join(", ")}`);
    } else {
      console.log("    Eligible teachers: (none in scheduling scope)");
    }
    if (r.teachersScheduled.length) {
      console.log(`    Teachers used in timetable: ${r.teachersScheduled.join(", ")}`);
    }
    if (r.includeOnlyRules.length) {
      console.log(`    Fixed placement: ${r.includeOnlyRules.join("; ")}`);
    }
    for (const c of r.likelyCauses) {
      console.log(`    → ${c}`);
    }
  }
}

async function main() {
  process.chdir(ROOT);
  const bundle = fileArg ? loadFromFile(fileArg.slice("--file=".length)) : await loadFromDb();

  console.log(`[check:tenant] Source: ${bundle.source}`);

  const preflight = runTenantPreflightCheck(bundle.state);
  printPreflight(preflight, bundle.state);

  if (traceUnscheduled && bundle.unscheduled.length > 0) {
    const trace = traceUnscheduledRows(bundle.state, bundle.unscheduled, { entries: bundle.entries });
    if (jsonOut) {
      console.log(JSON.stringify({ preflight, trace }, null, 2));
    } else {
      printTrace(trace, bundle.runMeta);
    }
  } else if (traceUnscheduled) {
    console.log("\n--- Unscheduled trace ---\n(no unscheduled rows in report)");
  }

  if (!preflight.ok) process.exit(1);
}

main().catch((err) => {
  console.error("[check:tenant] Failed:", err.message);
  process.exit(1);
});
