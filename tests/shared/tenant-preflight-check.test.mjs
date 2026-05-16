import test from "node:test";
import assert from "node:assert/strict";
import {
  findSubjectSchedulingContradictions,
  findImpossibleIncludeOnlyRules,
  runTenantPreflightCheck,
  traceUnscheduledRows,
} from "../../shared/tenantPreflightCheck.js";

const periodSlots = [
  { slotNumber: 1, slotType: "LESSON", activeWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] },
  { slotNumber: 2, slotType: "LESSON", activeWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] },
  { slotNumber: 3, slotType: "LUNCH", activeWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] },
  { slotNumber: 4, slotType: "LESSON", activeWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] },
];
const workingDays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

test("findSubjectSchedulingContradictions detects exclude day vs fixed cell overlap", () => {
  const rules = [
    { id: "ex", subjectId: "sub1", ruleType: "EXCLUDE_DAY", isActive: true, dayOfWeekList: ["MONDAY"] },
    {
      id: "inc",
      subjectId: "sub1",
      ruleType: "INCLUDE_ONLY",
      isActive: true,
      divisionIds: ["div-a"],
      includeMode: "CUSTOM",
      allowedCells: [{ dayOfWeek: "MONDAY", slotNumber: 1 }],
    },
  ];
  const issues = findSubjectSchedulingContradictions("sub1", rules, periodSlots, workingDays);
  assert.ok(issues.some((i) => i.code === "RULE_CONTRADICTION_EXCLUDE_DAY_INCLUDE"));
});

test("findImpossibleIncludeOnlyRules flags CUSTOM with no valid cells", () => {
  const rules = [
    {
      id: "inc",
      subjectId: "sub1",
      ruleType: "INCLUDE_ONLY",
      isActive: true,
      divisionIds: ["div-a"],
      includeMode: "CUSTOM",
      allowedCells: [{ dayOfWeek: "SATURDAY", slotNumber: 1 }],
    },
  ];
  const issues = findImpossibleIncludeOnlyRules(rules, periodSlots, workingDays);
  assert.ok(issues.some((i) => i.code === "INCLUDE_ONLY_CUSTOM_NO_VALID_CELLS"));
});

test("runTenantPreflightCheck returns ok when no issues", () => {
  const state = {
    subjects: [{ id: "sub1", name: "Math", weeklyPeriods: 5, standardIds: ["st1"], mediumIds: ["m1"] }],
    schedulingRules: [],
    periodSlots,
    workingDays,
  };
  const r = runTenantPreflightCheck(state);
  assert.equal(r.ok, true);
});

test("traceUnscheduledRows enriches labels and flags missing teachers", () => {
  const state = {
    standards: [{ id: "st1", name: "4" }],
    divisions: [{ id: "div-a", name: "A", standardId: "st1", mediumId: "m1" }],
    subjects: [{ id: "sub1", name: "Art", code: "ART", weeklyPeriods: 2, standardIds: ["st1"], mediumIds: ["m1"] }],
    teachers: [],
    mediums: [{ id: "m1", name: "EN" }],
    schedulingRules: [],
    periodSlots,
    workingDays,
    teacherSubjects: [],
  };
  const trace = traceUnscheduledRows(state, [{ divisionId: "div-a", subjectId: "sub1", periodsRequired: 2, periodsScheduled: 0, periodsShort: 2 }]);
  assert.equal(trace.rowCount, 1);
  assert.equal(trace.rows[0].divisionLabel, "Std 4-A");
  assert.match(trace.rows[0].subjectLabel, /ART/);
  assert.ok(trace.rows[0].likelyCauses.some((c) => c.includes("No active teacher")));
});
