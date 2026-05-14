import test from "node:test";
import assert from "node:assert/strict";
import { sortWorkingDaysCanonical, WEEKDAY_CANONICAL_ORDER } from "../../shared/periodSlotDays.js";
import { normalizeTenantSchoolOrdering, sortStandardsAscending } from "../../shared/schoolDisplayOrder.js";

test("sortWorkingDaysCanonical orders Mon→Sun and dedupes", () => {
  assert.deepEqual(sortWorkingDaysCanonical(["FRIDAY", "MONDAY", "MONDAY", "WEDNESDAY"]), ["MONDAY", "WEDNESDAY", "FRIDAY"]);
  assert.equal(WEEKDAY_CANONICAL_ORDER[0], "MONDAY");
});

test("sortStandardsAscending prefers sortOrder then numeric name", () => {
  const out = sortStandardsAscending([
    { id: "b", name: "10", sortOrder: 3 },
    { id: "a", name: "2", sortOrder: 2 },
    { id: "c", name: "1", sortOrder: 1 },
  ]);
  assert.deepEqual(
    out.map((s) => s.id),
    ["c", "a", "b"],
  );
});

test("normalizeTenantSchoolOrdering reindexes sortOrder and sorts divisions", () => {
  const { standards, divisions, workingDays } = normalizeTenantSchoolOrdering({
    standards: [
      { id: "s2", name: "2", sortOrder: 99 },
      { id: "s1", name: "1", sortOrder: 1 },
    ],
    divisions: [
      { id: "dB", standardId: "s1", name: "B" },
      { id: "dA", standardId: "s1", name: "A" },
      { id: "d1", standardId: "s2", name: "A" },
    ],
    workingDays: ["FRIDAY", "TUESDAY"],
  });
  assert.deepEqual(
    standards.map((s) => ({ id: s.id, so: s.sortOrder })),
    [
      { id: "s1", so: 1 },
      { id: "s2", so: 2 },
    ],
  );
  assert.deepEqual(
    divisions.map((d) => d.id),
    ["dA", "dB", "d1"],
  );
  assert.deepEqual(workingDays, ["TUESDAY", "FRIDAY"]);
});
