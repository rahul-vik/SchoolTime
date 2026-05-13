import test from "node:test";
import assert from "node:assert/strict";
import { migrateTenantState } from "../../server/services/tenantStateMigration.js";

test("migration prunes INCLUDE_ONLY allowedCells when period is off that weekday", () => {
  const { state, changed } = migrateTenantState({
    workingDays: ["MONDAY", "TUESDAY"],
    periodSlots: [
      { slotNumber: 1, slotType: "LESSON", label: "P1", activeWeekdays: ["TUESDAY"] },
      { slotNumber: 2, slotType: "LUNCH", label: "Lunch" },
    ],
    schedulingRules: [
      {
        id: "r1",
        ruleType: "INCLUDE_ONLY",
        subjectId: "s1",
        isActive: true,
        includeMode: "CUSTOM",
        divisionIds: ["d1"],
        divisionId: "d1",
        allowedCells: [
          { dayOfWeek: "MONDAY", slotNumber: 1 },
          { dayOfWeek: "TUESDAY", slotNumber: 1 },
        ],
      },
    ],
  });
  assert.equal(changed, true);
  const rule = state.schedulingRules.find((r) => r.id === "r1");
  assert.ok(rule);
  assert.equal(rule.allowedCells.length, 1);
  assert.equal(rule.allowedCells[0].dayOfWeek, "TUESDAY");
  assert.equal(rule.allowedCells[0].slotNumber, 1);
});

test("migration disables INCLUDE_ONLY CUSTOM when prune would remove every allowedCell", () => {
  const { state, changed } = migrateTenantState({
    workingDays: ["MONDAY", "TUESDAY"],
    periodSlots: [
      { slotNumber: 1, slotType: "LESSON", label: "P1" },
      { slotNumber: 2, slotType: "LESSON", label: "P2", activeWeekdays: ["TUESDAY"] },
    ],
    schedulingRules: [
      {
        id: "r-empty",
        ruleType: "INCLUDE_ONLY",
        subjectId: "s1",
        isActive: true,
        includeMode: "CUSTOM",
        divisionIds: ["d1"],
        divisionId: "d1",
        allowedCells: [{ dayOfWeek: "MONDAY", slotNumber: 2 }],
      },
    ],
  });
  assert.equal(changed, true);
  const rule = state.schedulingRules.find((r) => r.id === "r-empty");
  assert.ok(rule);
  assert.equal(rule.allowedCells.length, 0);
  assert.equal(rule.isActive, false);
});

test("migration disables PRESET_LAST_LESSON when last lesson slot is off on includeWeekday", () => {
  const { state, changed } = migrateTenantState({
    workingDays: ["FRIDAY", "TUESDAY"],
    periodSlots: [
      { slotNumber: 1, slotType: "LESSON", label: "P1" },
      { slotNumber: 2, slotType: "LESSON", label: "P2", activeWeekdays: ["TUESDAY"] },
    ],
    schedulingRules: [
      {
        id: "r-preset",
        ruleType: "INCLUDE_ONLY",
        subjectId: "s1",
        isActive: true,
        includeMode: "PRESET_LAST_LESSON",
        includeWeekday: "FRIDAY",
        divisionIds: ["d1"],
        divisionId: "d1",
        allowedCells: [],
      },
    ],
  });
  assert.equal(changed, true);
  const rule = state.schedulingRules.find((r) => r.id === "r-preset");
  assert.ok(rule);
  assert.equal(rule.isActive, false);
});

test("migration disables PRESET_LAST_LESSON when includeWeekday is not a working day", () => {
  const { state, changed } = migrateTenantState({
    workingDays: ["MONDAY", "TUESDAY"],
    periodSlots: [{ slotNumber: 1, slotType: "LESSON", label: "P1" }],
    schedulingRules: [
      {
        id: "r-bad-wd",
        ruleType: "INCLUDE_ONLY",
        subjectId: "s1",
        isActive: true,
        includeMode: "PRESET_LAST_LESSON",
        includeWeekday: "FRIDAY",
        divisionIds: ["d1"],
        divisionId: "d1",
        allowedCells: [],
      },
    ],
  });
  assert.equal(changed, true);
  assert.equal(state.schedulingRules[0].isActive, false);
});
