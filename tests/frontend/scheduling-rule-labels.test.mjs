import test from "node:test";
import assert from "node:assert/strict";
import {
  formatIncludeOnlyRuleLabel,
  formatClassList,
  formatWeekdayLabel,
} from "../../src/features/shared/schedulingRuleLabels.js";

const standards = [{ id: "s6", name: "6" }, { id: "s8", name: "8" }];
const divisions = [
  { id: "d6a", name: "A", standardId: "s6" },
  { id: "d8a", name: "A", standardId: "s8" },
  { id: "d8b", name: "B", standardId: "s8" },
];

test("formatWeekdayLabel uses friendly day names", () => {
  assert.equal(formatWeekdayLabel("THURSDAY"), "Thursday");
});

test("formatClassList hides raw division ids", () => {
  const text = formatClassList(["d6a", "d8a", "d1778664601735-5-0"], divisions, standards);
  assert.match(text, /Std 6 · Div A/);
  assert.match(text, /other class/);
  assert.doesNotMatch(text, /d1778664601735/);
});

test("formatIncludeOnlyRuleLabel for custom cell", () => {
  const text = formatIncludeOnlyRuleLabel(
    {
      includeMode: "CUSTOM",
      divisionIds: ["d6a", "d8a", "d8b"],
      allowedCells: [{ dayOfWeek: "THURSDAY", slotNumber: 6 }],
    },
    { divisions, standards },
  );
  assert.match(text, /Thursday, period 6/);
  assert.match(text, /Classes:/);
  assert.doesNotMatch(text, /Only in:/);
  assert.doesNotMatch(text, /THURSDAY slot/);
});
