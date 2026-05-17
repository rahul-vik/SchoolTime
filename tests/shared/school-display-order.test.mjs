import test from "node:test";
import assert from "node:assert/strict";
import {
  sortDivisionsByStandardOrder,
  sortDivisionsHigherStandardFirst,
  sortStandardsAscending,
} from "../../shared/schoolDisplayOrder.js";

test("sortDivisionsHigherStandardFirst orders higher numeric standards before lower", () => {
  const standards = sortStandardsAscending([
    { id: "s1", name: "1", sortOrder: 1 },
    { id: "s8", name: "8", sortOrder: 2 },
    { id: "s12", name: "12", sortOrder: 3 },
  ]);
  const divisions = [
    { id: "d1a", standardId: "s1", name: "A" },
    { id: "d8a", standardId: "s8", name: "A" },
    { id: "d12a", standardId: "s12", name: "A" },
    { id: "d12b", standardId: "s12", name: "B" },
  ];
  const out = sortDivisionsHigherStandardFirst(divisions, standards);
  assert.deepEqual(
    out.map((d) => d.id),
    ["d12a", "d12b", "d8a", "d1a"],
  );
});

test("sortDivisionsHigherStandardFirst keeps division name order within a standard", () => {
  const standards = sortStandardsAscending([
    { id: "s2", name: "2", sortOrder: 99 },
    { id: "s1", name: "1", sortOrder: 1 },
  ]);
  const divisions = [
    { id: "dB", standardId: "s1", name: "B" },
    { id: "dA", standardId: "s1", name: "A" },
    { id: "d2", standardId: "s2", name: "A" },
  ];
  assert.deepEqual(
    sortDivisionsHigherStandardFirst(divisions, standards).map((d) => d.id),
    ["d2", "dA", "dB"],
  );
  assert.deepEqual(
    sortDivisionsByStandardOrder(divisions, standards).map((d) => d.id),
    ["dA", "dB", "d2"],
  );
});
