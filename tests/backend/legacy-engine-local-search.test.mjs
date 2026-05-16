import test from "node:test";
import assert from "node:assert/strict";
import { runTimetableEngine } from "../../server/engine.js";
import {
  compareLexicographicObjective,
  computeLegacyObjective,
} from "../../server/legacyEngineLocalSearch.js";

test("compareLexicographicObjective prefers more scheduled then fewer shortages", () => {
  const better = { totalScheduled: 10, unscheduledShort: 0, softViolations: 2 };
  const worse = { totalScheduled: 9, unscheduledShort: 1, softViolations: 0 };
  assert.ok(compareLexicographicObjective(better, worse) > 0);
  assert.ok(compareLexicographicObjective(worse, better) < 0);
});

test("compareLexicographicObjective minimizes soft violations when scheduled equal", () => {
  const a = { totalScheduled: 8, unscheduledShort: 0, softViolations: 0 };
  const b = { totalScheduled: 8, unscheduledShort: 0, softViolations: 3 };
  assert.ok(compareLexicographicObjective(a, b) > 0);
});

test("computeLegacyObjective counts soft day and slot violations", () => {
  const objective = computeLegacyObjective({
    entries: [
      { divisionId: "d1", subjectId: "s1", dayOfWeek: "MONDAY", slotNumber: 1, isFreePeriod: false, slotType: "LESSON" },
    ],
    divisions: [{ id: "d1", standardId: "st", mediumId: "m" }],
    subjects: [
      {
        id: "s1",
        standardIds: ["st"],
        mediumIds: ["m"],
        weeklyPeriods: 1,
        divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
      },
    ],
    subjectAppliesToDivision: () => true,
    getDivisionSubjectLimits: () => ({ weeklyPeriods: 1, maxPerDay: 2 }),
    subjectAllocations: [],
    countSoftViolations: () => 2,
  });
  assert.equal(objective.totalScheduled, 1);
  assert.equal(objective.softViolations, 2);
});

test("local search can improve fill when enabled", () => {
  const med = "med-en";
  const std = "std-5";
  const periodSlots = [
    { slotNumber: 1, slotType: "LESSON", label: "P1" },
    { slotNumber: 2, slotType: "LESSON", label: "P2" },
    { slotNumber: 3, slotType: "LESSON", label: "P3" },
  ];
  const base = {
    divisions: [{ id: "d1", name: "1-A", standardId: std, mediumId: med }],
    subjects: [
      {
        id: "sub-a",
        name: "A",
        priorityWeight: 5,
        weeklyPeriods: 2,
        maxPerDay: 2,
        mediumIds: [med],
        standardIds: [std],
        divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
        divisionIncludeIds: [],
        divisionExcludeIds: [],
        divisionLimits: [],
      },
      {
        id: "sub-b",
        name: "B",
        priorityWeight: 1,
        weeklyPeriods: 2,
        maxPerDay: 2,
        mediumIds: [med],
        standardIds: [std],
        divisionScopeMode: "ALL_IN_SELECTED_CLASSES",
        divisionIncludeIds: [],
        divisionExcludeIds: [],
        divisionLimits: [],
      },
    ],
    teachers: [
      {
        id: "t1",
        mediumIds: [med],
        subjectIds: ["sub-a", "sub-b"],
        assignedDivisionIds: ["d1"],
        divisionSubjectExclusions: [],
        maxPerDay: 4,
        maxPerWeek: 20,
        freeMorningPeriods: 0,
        freeEveningPeriods: 0,
      },
    ],
    periodSlots,
    workingDays: ["MONDAY", "TUESDAY"],
    teacherSubjects: [],
    freePeriodRules: [],
    fixedSlots: [],
    subjectAllocations: [],
    schedulingRules: [],
    classTeacherPreferences: { enabled: false, schedulingMode: "STRICT" },
  };

  const without = runTimetableEngine({ ...base, legacyEngineOptions: { restarts: 1, localSearchIterations: 0 } });
  const withSearch = runTimetableEngine({
    ...base,
    legacyEngineOptions: { restarts: 1, localSearchIterations: 24 },
  });

  assert.ok(withSearch.report.objective);
  assert.equal(typeof withSearch.report.objective.softViolations, "number");
  const shortWithout = (without.report.unscheduled || []).reduce((s, u) => s + u.periodsShort, 0);
  const shortWith = (withSearch.report.unscheduled || []).reduce((s, u) => s + u.periodsShort, 0);
  assert.ok(shortWith <= shortWithout);
  assert.ok(withSearch.report.optimization?.localSearch?.iterations >= 0);
});
