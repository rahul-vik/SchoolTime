import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runTimetableEngine } from "../../server/engine.js";
import { validateTimetableRun } from "../../server/services/timetableValidationService.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "../fixtures/timetable/minimal-regression-tenant.json");

function countDistinctSlots(entries, divisionId, subjectId) {
  const nums = entries
    .filter((e) => e.divisionId === divisionId && e.subjectId === subjectId && !e.isFreePeriod)
    .map((e) => Number(e.slotNumber));
  return new Set(nums).size;
}

test("regression fixture: score, spread, and validation", () => {
  const tenant = JSON.parse(readFileSync(fixturePath, "utf8"));
  const out = runTimetableEngine(tenant);
  assert.ok(out.score >= 85, `expected score >= 85, got ${out.score}`);
  const mathSlots = countDistinctSlots(out.entries, "div-a", "sub-math");
  const mathScheduled = out.entries.filter((e) => e.divisionId === "div-a" && e.subjectId === "sub-math" && !e.isFreePeriod).length;
  if (mathScheduled >= 5) {
    assert.ok(mathSlots >= 2, `expected >= 2 distinct math slots when 5 scheduled, got ${mathSlots}`);
  }
  const validation = validateTimetableRun({ state: tenant, entries: out.entries, runId: "regression" });
  assert.ok(!validation.findings.some((f) => f.code === "INCLUDE_ONLY_VIOLATION"));
});
